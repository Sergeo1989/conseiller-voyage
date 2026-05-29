# ADR-0018 — Magic link voyageur : random token DB (pas JWT, pas HMAC signé)

**Date** : 2026-05-29
**Statut** : accepté
**Décideurs** : équipe technique, équipe sécurité
**Spec lié** : [002-voyageur-intake/spec.md](../../specs/002-voyageur-intake/spec.md), FR-013, FR-014, FR-014a
**Plan lié** : [002-voyageur-intake/plan.md](../../specs/002-voyageur-intake/plan.md), Phase 0 — R1

---

## Contexte

Le module intake authentifie le voyageur via un **magic link** envoyé
par courriel (pas de compte permanent). Trois schémas sont possibles
pour le token :

| Schéma | Révocation immédiate (Loi 25) | Taille URL | Surface crypto | Debuggable | Performance |
|---|---|---|---|---|---|
| **Random token DB** (SHA-256 hash) | ✅ DELETE | 64 hex chars OK | ✅ random | ✅ DB log | 1 SELECT indexed |
| **JWT HS256** | ❌ Attendre exp / blocklist | ~150 chars | ❌ alg=none historique | 🟡 logs | 0 query |
| **HMAC signé sans DB** | ❌ Attendre exp | ~80 chars | 🟡 HMAC | 🟡 logs | 0 query |

Le critère décisif est la **révocation immédiate** exigée par la Loi 25 :
un voyageur qui demande l'effacement doit pouvoir invalider tous ses
tokens en moins de 60 secondes (SC-008). Un JWT non-révoqué reste valide
jusqu'à expiration, ce qui violerait le délai.

Le second critère est la **cohérence avec 001** : le pattern AuthSession
(table `auth_sessions` avec `sessionToken` random + `expires`) est déjà
éprouvé en intégration et un single mecanisme de session simplifie
l'opérationnel.

## Décision

Utiliser un **random token (32 bytes hex, soit 64 caractères)** stocké
en `SHA-256(token)` dans la table `intake_magic_link_tokens`. Le token
clair existe **uniquement** dans :

1. Le courriel envoyé via SES (transit chiffré).
2. La query string du magic link (transit chiffré HTTPS).
3. Le cookie de session `__Host-cv.intake.token` posé post-vérification
   (transit chiffré HTTPS + flags `HttpOnly`, `Secure`, `SameSite=Lax`).

Le token clair n'est **jamais** persisté côté serveur : si un attaquant
dump la DB, les hashes ne suffisent pas pour usurper une identité.

Le hash utilise SHA-256 sans sel (le token random est lui-même 32 bytes
d'entropie cryptographique — pas besoin de sel anti-rainbow). La
comparaison serveur utilise `crypto.timingSafeEqual` pour empêcher les
timing attacks (cf. `magic-link-token.entity.ts`).

## Conséquences

### Positives

1. **Révocation immédiate** : `DELETE FROM intake_magic_link_tokens
   WHERE briefId = ?` invalide tous les tokens d'un brief en < 60s.
   Conforme SC-008 par construction.
2. **Cohérence interne** : même pattern que `auth_sessions` (001) → un
   seul modèle mental pour les futurs développeurs.
3. **Audit complet** : chaque clic est traçable via
   `consumedAt`/`tokenHash`, utile pour les enquêtes d'incident.
4. **Aucun secret externe** : pas de clé HMAC à rotationner (sauf
   défense en profondeur ADR-0019).

### Négatives

1. **1 SELECT par vérification** : ~5 ms p99 sur Postgres avec index sur
   `tokenHash`. Négligeable vu le débit cible (100 briefs/h pic).
2. **DB devient point de panne critique** : si la DB tombe, aucun
   voyageur ne peut vérifier son email. Atténuation : RDS Multi-AZ
   (ADR-0005), RPO 24h, RTO 4h.

### Conséquences sur l'opérationnel

- Le job `IntakeMagicLinkRetryJob` (T133) gère le retry SES en cas
  d'échec ; il ne touche pas le token DB (déjà créé en transaction).
- La table `intake_magic_link_tokens` est purgée par
  `IntakeBriefExpirationSweepJob` (T131) — cleanup tokens expirés > 30j.

---

## Variante envisagée mais rejetée : HMAC signé en complément

Une option était d'ajouter une **signature HMAC** au token (token =
`<random>.<signature>`) pour empêcher la falsification de l'URL côté
client. Rejetée parce que :

- Le random 32 bytes est déjà imprévisible (probabilité de collision
  ≈ 2^-256).
- La DB est la source de vérité — un attaquant qui forge une URL avec
  un token valide arrive sur un lookup DB qui ne retourne rien → 401.
- Ajouter le HMAC double la complexité crypto sans bénéfice
  démontrable.

Le secret HMAC `INTAKE_MAGIC_LINK_SECRET` est néanmoins conservé pour
le futur (cf. `apps/api/src/env.ts` + `docs/runbooks/intake-secrets-rotation.md`)
— il pourra être réintroduit si une analyse de menace future le
justifie.

## Références

- ADR-0004 — Sessions DB partagées
- ADR-0008 — Anonymisation Loi 25 hash salé immutable
- specs/002-voyageur-intake/research.md R1
- specs/002-voyageur-intake/data-model.md `MagicLinkToken`
