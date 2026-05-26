# Recherche technique : MFA conseiller (feature 005)

**Date** : 2026-05-25 · **Plan** : [plan.md](plan.md)

Toutes les questions « NEEDS CLARIFICATION » du plan sont résolues
ci-dessous. Chaque décision suit le format **Décision / Rationale /
Alternatives**.

---

## R1 — Bibliothèque TOTP RFC 6238

**Décision** : `otplib@^12`.

**Rationale** :
- Bibliothèque dédiée TOTP/HOTP la plus utilisée de l'écosystème Node
  (≈ 1 M téléchargements/semaine), maintenue activement.
- API minimaliste : `authenticator.generate(secret)`, `.verify({ token,
  secret })`, `.keyuri(label, issuer, secret)` pour construire l'URL
  `otpauth://` du QR code.
- Fenêtre de validation configurable (notre choix : ±1 pas = ±30 s, cf.
  FR-009) via `authenticator.options = { window: 1 }`.
- Zéro dépendance native, pas d'`node-gyp`, pas de souci ECS Fargate.
- Le secret Base32 généré est conforme à la norme : 160 bits par défaut,
  ajustable à 256 bits si besoin futur.

**Alternatives considérées** :
- **`@auth/core` TOTP natif** : Auth.js v5 expose un provider TOTP mais
  l'API est encore en bêta et oriente vers un flow magic-link plutôt que
  TOTP applicatif. Manque la verification primitive pour notre besoin de
  step-up custom.
- **Implémentation manuelle (HMAC-SHA1 + RFC 4226 HOTP + dérivation
  TOTP)** : conforme Principe VI (logique pure testable), mais ~150
  lignes de code crypto que je devrais re-tester contre les vecteurs RFC
  ; otplib les a déjà. Si une vuln théorique apparaît dans otplib (peu
  probable, c'est de la crypto bien rodée), on garde l'option de migrer
  vers une impl manuelle puisque tout passe par le port
  `TotpValidatorPort`.

**Décision encodée dans ADR-0011** au moment de l'implémentation.

---

## R2 — Chiffrement du secret TOTP au repos

**Décision** : **AES-256-GCM via `node:crypto` natif**, KEK (key
encryption key) résolue au démarrage du process depuis AWS Secrets Manager
en prod / fichier `.env.development` local.

**Rationale** :
- AES-256-GCM est le standard NIST de chiffrement authentifié (AEAD), avec
  GMAC intégré qui détecte toute altération du ciphertext. Indispensable
  pour stocker un secret cryptographique en BD.
- Format de stockage proposé : `version_byte || iv (12 bytes) || ciphertext
  || auth_tag (16 bytes)`, encodé Base64 pour la colonne Postgres `bytea`
  ou `text`. Version byte = `0x01` permet de roter la KEK plus tard sans
  casser les lignes existantes.
- IV (nonce) généré aléatoirement par `crypto.randomBytes(12)` à chaque
  chiffrement. Jamais réutilisé.
- Pas de nouvelle dépendance : Node `crypto` est dans la lib standard,
  audité par le core team.
- La KEK est un buffer 32 bytes (256 bits) base64-encodé en variable
  d'env. Dérivation depuis Secrets Manager au démarrage, jamais loggué.

**Alternatives considérées** :
- **`libsodium-wrappers` (XChaCha20-Poly1305)** : aussi sûr que AES-GCM,
  mais ajoute une dépendance native non triviale et une surface
  supplémentaire. Pas de gain pratique sur un secret de 160 bits stocké
  en BD.
- **Chiffrement applicatif via pgcrypto Postgres** : déléguerait la
  crypto à la DB, mais le secret traverserait la frontière app↔DB en
  clair (les requêtes paramétrées seraient des bind values
  non chiffrés). Mauvaise défense en profondeur.
- **KMS AWS pour chiffrer/déchiffrer chaque lecture** : sécurité accrue
  (clé jamais en mémoire process), mais latence +30-50 ms par
  déchiffrement TOTP. Inacceptable pour le SLO p95 < 800 ms cumulé avec
  Prisma + middleware. Reportable à une feature ultérieure si on
  industrialise une rotation forte (envelope encryption).

**Décision encodée dans ADR-0010**.

---

## R3 — Rate limiting des tentatives TOTP

**Décision** : **compteur Postgres dédié** dans une table
`mfa_rate_limit_buckets`, indexée par `(userId, kind)`. Pas de Redis
spécifiquement pour 005.

**Rationale** :
- 50-500 conseillers × 10 logins/jour = ≤ 5 000 vérifications TOTP/jour.
  La charge est négligeable pour Postgres ; le surcoût Redis n'est pas
  justifié.
- Cohérent avec le principe « idempotence en BD » déjà adopté par 001 et
  004. Une seule source de vérité (Postgres) facilite la rétro-analyse
  d'incident.
- Le bucket est nettoyé par un job cron périodique (`DELETE WHERE
  windowEndsAt < NOW() - INTERVAL '7 days'`) — pas de pression à long
  terme.
- BullMQ + Redis existent déjà dans la stack canonique pour les jobs
  asynchrones (futurs courriels, notifications), pas pour le rate limit
  synchrone.

**Alternatives considérées** :
- **Redis `INCR` + `EXPIRE`** : pattern classique et performant, mais
  ajoute une dépendance critique pour un débit aussi modeste. Si Redis
  HS, on perd la sécurité du rate limit ; avec Postgres, on a la même
  garantie ACID que le reste.
- **Compteur en mémoire process (LRU map)** : impossible — plusieurs
  pods ECS, état partagé requis.

---

## R4 — Génération du QR code

**Décision** : **`qrcode@^1.5` côté serveur**, rendu en SVG embedded
inline dans la page Next.js (RSC).

**Rationale** :
- Le QR est généré côté serveur dans le Server Component d'enrôlement.
  Pas de calcul lourd côté client, pas d'API publique exposée, le secret
  TOTP en clair ne quitte jamais le serveur via une route web (il est
  affiché dans la même réponse HTML que le QR).
- `qrcode` produit du SVG (vectoriel, accessible, scalable) ou du PNG.
  On choisit **SVG** pour le contraste et la scalabilité (WCAG 2.1 AA).
- L'attribut `<svg role="img" aria-labelledby="qr-title qr-desc">`
  permet d'attacher un titre/description pour les lecteurs d'écran ; le
  secret texte copiable à côté (FR-034) reste l'alternative principale.

**Alternatives considérées** :
- **`qrcode.react` côté Client Component** : forcerait à transmettre le
  secret TOTP en clair via les props sérialisées, traversant le RSC →
  Client boundary. Risque de fuite dans des DevTools / extension
  navigateur compromise. Refusé.
- **API serveur dédiée `GET /api/mfa/qr-code/:enrollmentId`** : ajoute
  un endpoint stateful (enrollment provisoire en BD avant confirmation),
  complexifie le flow. Pas nécessaire pour le débit attendu.

---

## R5 — Hashing des backup codes

**Décision** : **bcryptjs avec cost = 12** (cost factor).

**Rationale** :
- bcrypt est conçu pour le hashing de mots de passe et codes courts,
  résistant aux attaques par GPU dans une mesure raisonnable.
- Cost 12 = ~250 ms de calcul sur un CPU x86 moderne — acceptable pour
  une vérification rare (≤ 1× par session via backup code) et
  suffisamment coûteux pour décourager le brute force sur un dump BD.
- `bcryptjs` (pure JS) plutôt que `bcrypt` natif : évite `node-gyp` et
  les builds natifs dans Docker Fargate. Performance suffisante au débit
  attendu.

**Alternatives considérées** :
- **argon2id (`@node-rs/argon2` ou `argon2`)** : algorithme moderne
  vainqueur du Password Hashing Competition 2015. Recommandé par OWASP
  depuis 2023. Sera privilégié si on industrialise une nouvelle feature
  d'auth ultérieurement, mais pour 005 le coût d'ajout d'une dépendance
  native ne se justifie pas par rapport à bcryptjs qui est déjà bien
  rodé. Documenté comme amélioration future dans ADR-0011 si besoin.
- **SHA-256 + sel** : refusé, trop rapide à brute-forcer sur un GPU
  moderne (~10^10 hashes/s).
- **PBKDF2** : possible mais bcrypt fait pareil en plus court à
  paramétrer.

---

## R6 — Intégration Auth.js v5 pour le flow MFA

**Décision** : **redirection middleware + Server Action de vérification**
sans modifier les callbacks Auth.js core.

**Rationale** :
- Auth.js v5 (NextAuth) gère le mot de passe / magic-link / OAuth. Le
  TOTP n'est pas un provider mais une **étape supplémentaire après**
  l'authentification du facteur primaire.
- Pattern proposé :
  1. User saisit courriel + mdp → Auth.js crée une session avec
     `mfaVerifiedAt = null` (déjà géré par le schéma 001).
  2. Le `mfaEnrollmentGuard` Next.js middleware lit la session, voit
     que `user.role === 'conseiller' && conformite.status === 'verified'
     && !mfaEnabled` → redirige vers `/mfa/enroll`.
  3. Si MFA enrôlé mais `mfaVerifiedAt === null` (pas encore vérifié
     dans cette session) → redirige vers `/mfa/verify` après login.
  4. Le user saisit le code TOTP, la Server Action
     `verifyTotpAction()` appelle l'API NestJS qui valide le code et met
     à jour `mfaVerifiedAt = NOW()`.
  5. Redirection vers le tableau de bord.
- Pas de custom Credentials Provider — Auth.js reste responsable du
  facteur primaire ; le second facteur vit en dehors.

**Alternatives considérées** :
- **Auth.js TOTP Provider expérimental** : encore alpha en 2026-05, API
  pas figée, pas de support officiel des backup codes ni de step-up
  intra-session. Pas mature pour notre cas.
- **Custom Credentials Provider qui demande mdp + TOTP en une fois** :
  bloque le pattern UX standard (login d'abord, TOTP après), moins
  familier pour les utilisateurs. Refusé.
- **JWT + claims TOTP** : on est en session DB (ADR-0004), pas de JWT.

---

## R7 — Invalidation des sessions actives sur reset/device change

**Décision** : **`DELETE FROM auth_sessions WHERE userId = ?`** Prisma
direct, exécuté dans le même use case que le reset/device change.

**Rationale** :
- La session Auth.js v5 est stockée en BD (ADR-0004). Supprimer la ligne
  invalide instantanément le cookie côté serveur : la prochaine requête
  authentifiée renvoie 401.
- Pour le device change self-service (FR-015b), on **conserve la session
  courante** (celle qui exécute le changement) pour permettre à
  l'utilisateur de finir le ré-enrôlement — la requête fournit le
  `sessionToken` via cookie, on l'exclut du DELETE :
  `DELETE FROM auth_sessions WHERE userId = ? AND sessionToken != ?`.
- Pour le reset admin (FR-024a), on supprime **toutes** les sessions de
  la cible sans exception — l'admin agit depuis sa propre session, pas
  affectée.
- Pas besoin de pub/sub temps réel : la révocation est lazy au prochain
  appel HTTP.

**Alternatives considérées** :
- **Flag `revokedAt` sur AuthSession + nettoyage différé** : laisse les
  lignes en BD pour audit. Mais 001 ne traite déjà pas l'audit de
  session ; la fenêtre 7 jours d'expiration par défaut nettoie de toute
  façon. Inutile pour 005.
- **JWT versioning (incrémenter un `sessionVersion` sur l'utilisateur,
  comparer à chaque requête)** : nécessite de migrer Auth.js vers JWT
  + ajout d'un middleware version-check à chaque appel. Sur-ingénierie
  pour notre besoin.

---

## R8 — Audit log append-only

**Décision** : **triggers Postgres** sur `mfa_audit_events`,
**mêmes patterns que 004** (ADR-0008) :
- Trigger `BEFORE UPDATE` qui `RAISE EXCEPTION 'mfa_audit_events is
  append-only'`.
- Trigger `BEFORE DELETE` idem.
- `REVOKE TRUNCATE ON mfa_audit_events FROM PUBLIC, app_identite,
  cv_app_role` pour empêcher l'esquive par `TRUNCATE`.

**Rationale** :
- Pattern éprouvé sur la feature 004 (`legal_acceptances`,
  `legal_acceptance_anonymizations`). On réutilise tel quel pour
  cohérence opérationnelle.
- Les triggers sont des DDL Prisma exécutés via la migration
  `20260526000001_init_mfa_immutability/migration.sql`. Tests
  d'intégration Testcontainers vérifient que les UPDATE/DELETE/TRUNCATE
  échouent (au moins 6 tests, comme 004).
- Le rôle Postgres applicatif `app_identite` (créé par 001) hérite de
  toutes ces contraintes, on ne grant pas plus.

**Alternatives considérées** :
- **Append-only enforcé en couche application** : non. Une SQL injection
  ou un bug applicatif suffirait à corrompre l'audit. La défense en BD
  est strictement supérieure.
- **Event store séparé (EventStoreDB, Kafka)** : sur-ingénierie totale
  pour le volume attendu (~5 000 événements/mois).

---

## R9 — Architecture du modal step-up

**Décision** : **Client Component Modal** (`<Dialog>` Radix UI) qui
intercepte le clic sur l'action sensible, POST vers Server Action
`stepUpAction()`, sur succès continue le flow originel.

**Rationale** :
- Pattern Next.js 15 idiomatique avec App Router + Server Actions :
  - Le bouton « Accepter le lead » est un Client Component qui appelle
    d'abord une Server Action `checkSessionFreshness()`.
  - Si fresh → exécute l'action sensible directement.
  - Si non fresh → ouvre le modal (state local React).
  - Le modal contient un `<TotpInput>` et un bouton « Valider » qui
    appelle `stepUpAction(code)`. Sur succès, `mfaVerifiedAt` est
    rafraîchi côté serveur ET l'action sensible originelle est exécutée
    dans la foulée (passage du payload original au composant via
    closure).
- Pas de navigation, pas de perte de contexte → UX fluide. Conforme à
  FR-019 (interruptible : `<Dialog onOpenChange>` permet de fermer sans
  redirect).
- Fallback `/mfa/step-up` (page entière) pour les navigateurs sans JS ou
  scénarios où le modal n'a pas pu monter (rare, mais accessibilité +
  graceful degradation).

**Alternatives considérées** :
- **Page dédiée `/mfa/step-up?return=/leads/123/accept`** : casse le
  contexte (l'utilisateur revient sur une autre URL, perd l'état non
  persisté). Moins UX-friendly.
- **Modal route (parallel route Next.js)** : plus complexe à mettre en
  place, moins flexible pour passer le payload de l'action originelle.
  Reportable à une refonte future si on industrialise plus de step-ups.

---

## R10 — Compteur d'admins actifs (FR-026a)

**Décision** : **requête à la volée + cache 60 s en mémoire process**,
exposée via métrique Prometheus + endpoint admin
`GET /api/admin/active-admins-count`.

**Rationale** :
- Volume admin négligeable (2-5). Requête `SELECT COUNT(*) FROM
  auth_users JOIN mfa_secrets ON ... WHERE role = 'admin' AND mfa_secrets.enabled
  AND auth_users.deleted_at IS NULL` triviale.
- Cache 60 s suffit pour éviter de marteler la BD à chaque scrape
  Prometheus (15 s par défaut → 4 hit/min, cache absorbe).
- L'alerte « < 2 admins actifs » est gérée par Grafana sur la métrique
  Prometheus, pas par l'application. C'est l'observabilité Principe VII
  qui en a la responsabilité.

**Alternatives considérées** :
- **Vue matérialisée Postgres** : sur-ingénierie pour 5 lignes.
- **Job cron qui écrit un compteur dans une table** : ajoute une source
  de vérité différée pouvant diverger de la réalité. Refusé.

---

## Synthèse

| ID | Sujet | Choix |
|---|---|---|
| R1 | Lib TOTP | `otplib@^12` |
| R2 | Chiffrement secret | AES-256-GCM Node crypto, KEK Secrets Manager |
| R3 | Rate limit | Compteur Postgres dédié, pas Redis |
| R4 | QR code | `qrcode@^1.5` serveur, SVG inline |
| R5 | Hash backup codes | `bcryptjs@^2.4` cost 12 |
| R6 | Auth.js intégration | Middleware Next + Server Actions, pas de custom provider |
| R7 | Invalidation sessions | `DELETE FROM auth_sessions WHERE userId = ?` direct |
| R8 | Audit append-only | Triggers Postgres comme 004 |
| R9 | Modal step-up | Client Modal Radix + Server Action `stepUpAction()` |
| R10 | Compteur admins | Requête + cache 60 s, expo Prometheus |

Aucune question ouverte. Tous les choix sont concrets, alignés avec la
constitution v2.2.0 et la stack canonique. Les ADR-0010 et ADR-0011
formaliseront R2 et R1 respectivement au moment de l'implémentation.
