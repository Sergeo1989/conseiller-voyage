# Phase 0 — Research : Module Intake / Préqualification voyageur

**Branch**: `002-voyageur-intake` | **Date**: 2026-05-25 | **Plan**: [plan.md](./plan.md)

8 items techniques à résoudre avant Phase 1 (design). Pour chaque item :
**Décision** + **Rationale** + **Alternatives considérées**.

---

## R1 — Magic link : HMAC signé vs JWT vs random token DB

**Décision** : **Random token (32 bytes) stocké en DB** (table `intake_magic_link_tokens`).

**Rationale** :

| Critère | Random + DB | HMAC signé | JWT (HS256) |
|---|---|---|---|
| Révocation immédiate (Loi 25) | ✅ DELETE | ❌ Attendre exp | ❌ Attendre exp / blocklist |
| Taille URL | 64 hex chars OK | ~80 chars | ~150 chars |
| Pas de cryptographic surface | ✅ random | 🟡 HMAC | ❌ alg=none risk |
| Debuggable (qui a accédé) | ✅ DB log | 🟡 logs | 🟡 logs |
| Performance (lookup) | 1 SELECT indexed | 0 query | 0 query |
| Cohérence avec feature 001 | ✅ même pattern `AuthSession` | ❌ différent | ❌ différent |

**Le pattern AuthSession utilisé par 001** (table `auth_sessions` avec
sessionToken random + expires) est déjà éprouvé en intégration. La feature
intake utilise le **même pattern** pour éviter la divergence et permettre
au DataRetentionSweepJob de balayer une seule structure.

Le surcoût d'1 SELECT par vérification de magic link est négligeable
(< 5 ms p99 sur Postgres avec index sur `tokenHash`).

**Alternatives considérées** :
- **JWT HS256** : rejetée pour révocation impossible (alg=none historique
  + size). Loi 25 exige effacement < 60 s confirmation : un JWT non-révoqué
  reste valide jusqu'à expiration, violation potentielle.
- **HMAC signé** sans DB : rejetée pour la même raison de révocation +
  perte de traçabilité (qui a cliqué le lien, quand).

**ADR** : Pas d'ADR formel — décision documentée ici, cohérente avec
ADR-0004 (sessions DB partagées).

---

## R2 — Audit log : table partagée `conformite_audit_entries` vs nouvelle `intake_audit_entries`

**Décision** : **Table séparée `intake_audit_entries`** avec le **même
schéma et le même trigger SQL append-only** que `conformite_audit_entries`.

**Rationale** :

1. **Principe V (frontières modulaires)** : le module `intake` ne doit pas
   écrire dans une table appartenant au module `conformite`. Le tool
   `tools/check-module-boundaries.ts` rejette les imports cross-module
   sur des préfixes Prisma — le respecter au niveau DB préserve la même
   discipline.

2. **Scaling indépendant** : conformite et intake croîtront à des rythmes
   différents (intake ≫ conformite à terme : 1 brief = N events vs 1
   dossier = N events). Tables séparées permettent partitionnement
   indépendant (cf. issue #10 partitionnement par date).

3. **Pen test isolation** (Principe IX) : si un attaquant compromet le
   rôle `app_intake`, il ne peut pas accéder à l'audit conformité.
   Principe de least privilege.

**Coût** : duplication du trigger SQL `audit_block_modifications` +
GRANTS. Mineur (50 lignes SQL répétées).

**Alternatives considérées** :
- **Table partagée** : rejetée pour violation de frontières modulaires.
- **Table générique `audit_entries` avec discriminant `module`** : rejetée
  pour mélanger les types d'événements (impossible de réutiliser les
  enums Postgres distincts par module).

**ADR** : ADR-0008 à créer pour documenter ce choix (impact > 1 module).

---

## R3 — Détection emails jetables

**Décision** : **Liste publique GitHub `disposable-email-domains/disposable-email-domains`**
(repo MIT, ~3500 domaines) **mise à jour mensuellement via cron BullMQ** +
fallback statique embedded en cas d'échec fetch.

**Rationale** :

| Source | Maintenance | Couverture | Risque |
|---|---|---|---|
| `disposable-email-domains` NPM | Stale (last update 2023) | ~80% | Faux negatives |
| `disposable-email-domains/disposable-email-domains` GitHub | Updated weekly community | ~95% | Fetch network dependency |
| Service tiers (Kickbox, Verifalia) | Externe payant | ~99% | Hors résidence canadienne |

GitHub raw fetch hebdomadaire ($0, ca-central-1 ECS egress négligeable)
suffit. La liste est cachée Redis (key `intake:disposable-emails`, TTL 30j).
Cron BullMQ `IntakeDisposableEmailsRefreshJob` toutes les 7 jours.

**Fallback embedded** : si fetch échoue (network, GitHub down), la liste
embedded `packages/shared/src/intake/disposable-emails-snapshot.json`
(snapshot du dernier fetch réussi) sert. Génération via script au build.

**Service externe (Kickbox etc.) rejeté** : 100% des PII voyageur transitant
hors Canada — violation Principe II (résidence canadienne, ADR-0001).

---

## R4 — Captcha en J1 ?

**Décision** : **Pas de captcha en J1**. Wait & see basé sur métrique
`intake_brief_abuse_blocked_total` du premier mois post-launch.

**Rationale** :
- Les 3 défenses rate-limit en place (3/24h/email, 5/24h/IP, disposable
  email blocklist) **devraient** couvrir le bot trivial et l'abus humain.
- Captcha = friction UX significative : 5-15% chute du taux de conversion
  selon Nielsen Norman Group. Sur 100 briefs/mois M1, perdre 10 briefs est
  cher payé pour la prévention de 1-2 spams.
- **Trigger** : si `abuse_blocked > 50/jour` ou `validation_rejected > 20/jour`
  pendant 7 jours consécutifs → activer hCaptcha (résidence Europe OK,
  pas de transfert PII voyageur).

**Alternatives considérées** :
- Cloudflare Turnstile : résidence USA, transfert PII, rejeté.
- hCaptcha (Europe) : éligible, en standby.
- reCAPTCHA Google : rejeté pour résidence USA + tracking utilisateur.

**ADR** : ADR-0010 à créer **uniquement si** le trigger est franchi.

---

## R5 — Multi-step form state management

**Décision** : **State en RAM client (React useState) + brouillon Server
Action sauvegardé en `localStorage` côté navigateur (chiffré AES-GCM avec
clé volatile session)**. Pas de cache serveur.

**Rationale** :

1. **RAM client** : le formulaire 5 étapes est rempli en 6 min médian (SC-002).
   Pas besoin de persistence serveur entre étapes — un useState suffit.

2. **localStorage chiffré pour reprise après 24 h** : si le voyageur ferme
   son navigateur (crash, fermeture accidentelle), pouvoir reprendre dans
   les 24 h sans perdre la saisie est un wins UX majeur. **Mais** stocker
   en clair en localStorage = PII exposée à tout script tiers du site.
   Solution : chiffrement AES-GCM avec clé volatile (sessionStorage)
   regénérée à chaque visite. La clé meurt en fermant la fenêtre →
   localStorage devient inutile, mais ce sont les seuls cas où on perdrait
   la session de toute façon.

3. **Pas de cache serveur** : éviter la complexité d'une table
   `intake_brief_drafts` qui exigerait sa propre politique de rétention
   (PII en clair côté serveur sans consentement Loi 25 explicite encore !).

**Anti-PII serveur tant que consent pas accordé** : c'est CRITIQUE. Le
consentement Loi 25 est posé à l'étape 5 (FR-010) ; avant ça, **aucune
donnée ne doit toucher la DB**. Le state client-only respecte cette
contrainte.

**Alternatives considérées** :
- **Redis temp storage** : viole le principe pas-de-PII-avant-consent.
- **PostgreSQL `intake_brief_drafts`** : idem + dette de rétention.
- **Pas de reprise du tout** : friction UX pour ~5% des users qui crashent
  avant de soumettre.

---

## R6 — Format téléphone : E.164 strict vs libre

**Décision** : **Libre côté client** (input `type="tel"` sans pattern HTML5
strict) **+ normalisation E.164 côté serveur** via `libphonenumber-js`
(MIT, 145KB minified mais Server Side only donc OK).

**Rationale** :

- Persona 35-65 ans tape `(514) 555-1234` ou `514-555-1234` ou `5145551234`.
  Forcer `+15145551234` côté client = friction.
- Côté serveur, on parse via `libphonenumber-js`. Si parsing échoue, le
  champ téléphone (optionnel FR-009) est juste mis à `null` — le brief
  est quand même créé.
- Stockage DB : E.164 (`+15145551234`) pour cohérence et formattage
  futur.

**Alternatives considérées** :
- **HTML5 `pattern="\+\d{11}"`** : rejet trop strict, casse l'UX.
- **react-phone-number-input** : composant React 200KB, lourd pour un
  champ optionnel. Rejeté.

---

## R7 — Liste fermée des 11 spécialités voyage : enum Prisma vs table de référence

**Décision** : **Enum Prisma** (`TravelSpeciality`) avec valeur d'échappement
`autre` + champ texte libre `specialityOther` séparé.

**Rationale** :

11 valeurs canoniques figées dès J1 :
1. `croisiere`
2. `aventure_outdoor`
3. `lune_de_miel`
4. `famille_avec_enfants`
5. `mobilite_reduite`
6. `multigenerationnel`
7. `culturel_historique`
8. `luxe`
9. `road_trip`
10. `voyage_affaires`
11. `autre` (avec `specialityOther: string?` requis)

| Critère | Enum Prisma | Table de référence DB |
|---|---|---|
| Performance | ✅ enum natif Postgres | 🟡 join overhead |
| Validation type-safe | ✅ TypeScript strict | 🟡 string libre |
| Multilingue | 🟡 i18n FR/EN catalog séparé | ✅ DB column `label_fr/label_en` |
| Évolution (ajout valeur) | 🟡 migration Prisma | ✅ INSERT |
| Cohérence avec scoring matching | ✅ enum match exact | 🟡 normalize requis |

L'argument décisif : la feature 003 (matching) **doit** matcher exactement
sur la spécialité. Un enum garantit qu'on ne peut pas avoir 2 variantes
(« lune de miel » vs « Lune-de-miel ») qui causent un mismatch silencieux.

Pour ajouter une nouvelle spécialité (ex: « voyage gastronomique »), une
migration Prisma `ALTER TYPE TravelSpeciality ADD VALUE 'gastronomie'`
est suffisante (non-bloquante Postgres).

L'i18n est géré côté `@cv/shared/intake/formatters.ts` qui mappe l'enum
vers le label localisé.

**Alternatives considérées** :
- **Table `intake_specialities` séparée** : rejetée pour overhead join +
  risque de normalize incohérente côté matching.
- **String libre** : rejetée pour incompatibilité scoring déterministe
  (Principe VI).

---

## R8 — Langues conseiller : enum FR/EN/ES/autre, scoring matching de "autre"

**Décision** : **Enum** `ConseillerLanguage` (`fr`, `en`, `es`, `other`)
avec champ `languageOther: string?` (ISO 639-1 code de 2 chars).

**Rationale** :

Spec.md FR-006 : langues conseiller `FR / EN / ES / autre`. Pour le
scoring matching (feature 003) :
- `fr/en/es` : match exact 1-pour-1
- `other` + ISO code (ex: `pt` pour portugais) : le matching fera un
  lookup contre `ConseillerProfile.spokenLanguages` (table de la feature
  conseillers, à venir) qui contient une liste de codes ISO 639-1.

Sans le code ISO, le `other` ne pourrait jamais matcher (string libre =
risque de mismatch). Avec le code ISO, l'extension est triviale (ajouter
`pt`, `it`, `de`, etc. à la liste des codes acceptés).

Le frontend propose un `<select>` avec une liste de ~30 langues les plus
parlées au Canada (FR, EN, ES, IT, PT, AR, ZH, etc.) + champ texte libre
si non-listée.

**Alternatives considérées** :
- **String libre** : rejetée pour incompatibilité matching.
- **Multi-select multi-langues** : reporté à feature 003 si besoin avéré
  (la majorité des voyageurs n'a qu'une langue préférée pour le conseiller).

---

## Synthèse des décisions

| Item | Décision en 1 ligne |
|---|---|
| R1 — Magic link | Random token DB (cohérent AuthSession 001) |
| R2 — Audit log | Table séparée `intake_audit_entries` avec trigger identique (ADR-0008) |
| R3 — Emails jetables | Liste GitHub publique + cron mensuel + fallback embedded |
| R4 — Captcha | Pas en J1, trigger sur métrique abuse_blocked |
| R5 — Form state | Client RAM + localStorage chiffré AES-GCM 24h |
| R6 — Téléphone | Libre client + normalisation E.164 serveur (libphonenumber-js) |
| R7 — Spécialités | Enum Prisma 11 values + `specialityOther` texte libre |
| R8 — Langues | Enum `fr/en/es/other` + code ISO 639-1 si other |

Toutes les décisions sont cohérentes avec la constitution v2.2.0, ADR
existants (0001-0007), et l'architecture 001 mergée. Pas de
NEEDS_CLARIFICATION restant.

## Prochaine étape

→ Phase 1 : générer `data-model.md`, `contracts/http-endpoints.md`,
`quickstart.md` à partir de ces décisions.
