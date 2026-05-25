# Phase 1 — Data Model : Module Intake

**Branch**: `002-voyageur-intake` | **Date**: 2026-05-25 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

## Vue d'ensemble

5 entités principales + 1 enum :

```
VoyageurContact ──(1..N)──> VoyageurBrief ──(1..N)──> MagicLinkToken
                                  │
                                  └──(1..N)──> IntakeAuditEntry
                                  └──(N..M)──> ConseillerCompliance (référence faible)
```

`IntakeOutboxEntry` est sa propre table indépendante (pattern outbox).

Tous les IDs sont UUID v4 (`@db.Uuid`), cohérent avec la migration 001
(`20260525045010_align_auth_ids_on_uuid`).

---

## Entity: VoyageurBrief

Le brief structuré soumis par un voyageur. **Immuable** post-vérification
email (anti-manipulation scoring matching feature 003).

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID v4 | PK, `@default(uuid()) @db.Uuid` | Identifiant unique brief |
| `voyageurContactId` | UUID v4 | FK → VoyageurContact, NOT NULL | Coordonnées |
| `status` | enum `BriefStatus` | NOT NULL, default `pending_verification` | Voir transitions ci-bas |
| `submittedAt` | DateTime | NOT NULL | Timestamp soumission étape 5 |
| `verifiedAt` | DateTime | nullable | Timestamp clic magic link |
| `expiresAt` | DateTime | NOT NULL | submittedAt + 90j (FR-024) |
| `consentGivenAt` | DateTime | NOT NULL | Loi 25 (FR-010) |
| `erasureRequestedAt` | DateTime | nullable | FR-022 |
| `anonymizedAt` | DateTime | nullable | FR-023 effacement complété |
| `destinations` | JSON array | NOT NULL | `[{country: 'IT', region?: 'Toscane'}, ...]` multi-stop (FR-002) |
| `departureDate` | Date | NOT NULL | FR-003 |
| `returnDate` | Date | NOT NULL | > departureDate |
| `datesFlexible` | Boolean | NOT NULL, default false | FR-003 |
| `datesFlexibilityDays` | Int | nullable, 1-30 si flexible | FR-003 |
| `adultsCount` | Int | NOT NULL, ≥ 1 | FR-004 |
| `childrenAges` | JSON array | NOT NULL, default [] | `[5, 8, 12]` (FR-004) |
| `infantsCount` | Int | NOT NULL, default 0 | FR-004 |
| `budgetRange` | enum `TravelBudget` | NOT NULL | < 2k / 2-5k / 5-10k / 10-20k / 20k+ (FR-005) |
| `budgetNote` | String? | nullable, ≤ 500 chars | Précision libre (FR-005) |
| `conseillerLanguage` | enum `ConseillerLanguage` | NOT NULL | fr / en / es / other (FR-006) |
| `conseillerLanguageOther` | String? | nullable, ISO 639-1 2 chars si other | R8 |
| `speciality` | enum `TravelSpeciality` | NOT NULL | 11 valeurs (FR-007) |
| `specialityOther` | String? | nullable, ≤ 200 chars si autre | R7 |
| `familiarity` | enum `TravelFamiliarity` | NOT NULL | first_big / occasional / experienced (FR-008) |
| `clientIp` | String? | nullable, masked /24 | Audit anti-spam, pas affiché |
| `userAgent` | String? | nullable, ≤ 500 chars | Audit |
| `idempotencyKey` | String? | nullable, unique | Anti-double-submit (FR-018) |
| `createdAt` | DateTime | NOT NULL, default now() | |
| `updatedAt` | DateTime | NOT NULL | |

**Indexes** :
- `voyageurContactId` (FK lookup)
- `status, expiresAt` (DataRetentionSweepJob scan)
- `idempotencyKey` UNIQUE WHERE NOT NULL
- `verifiedAt, status` (admin file non-matché)

**Transitions de statut** (enum `BriefStatus`) :
```
pending_verification ──(magic link cliqué)──> active
pending_verification ──(magic link expiré J+7)──> expired_unverified
active ──(matched par 003)──> matched
active ──(J+90 sans devis)──> expired
active ──(voyageur supprime)──> deleted
matched ──(voyageur supprime)──> deleted
(tout) ──(admin anonymise via sweep)──> anonymized (PII null)
```

`pending_verification → active` est la **seule** transition qui publie
`voyageur.brief.activated` sur l'outbox (consommé par 003).

---

## Entity: VoyageurContact

Les coordonnées du voyageur **isolées** des données de voyage (PII
séparée, audit Loi 25 plus simple — supprimer le contact supprime toutes
ses PII en cascade).

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `email` | String | NOT NULL, lowercase, ≤ 254 chars (RFC 5321) | FR-009 |
| `firstName` | String? | nullable post-anonymisation, ≤ 100 chars | FR-009 |
| `lastName` | String? | nullable post-anonymisation, ≤ 100 chars | FR-009 |
| `phone` | String? | nullable E.164 (libphonenumber-js R6), ≤ 20 chars | FR-009 |
| `postalCode` | String? | nullable, format canadien `^[A-Z]\d[A-Z] ?\d[A-Z]\d$` | FR-009 |
| `briefsCount24h` | Int | NOT NULL, default 0 | Compteur rate-limit (FR-019) |
| `briefsCount24hWindowStart` | DateTime | nullable | Fenêtre glissante |
| `createdAt` | DateTime | NOT NULL | |
| `updatedAt` | DateTime | NOT NULL | |

**Indexes** :
- `email` UNIQUE — un email = un contact, peut avoir N briefs (FR-018)

**Post-anonymisation Loi 25** : `firstName`, `lastName`, `phone`,
`postalCode` → `NULL`. `email` est **conservé hashé** (`emailHash =
SHA-256(email_lowercase)`) pour éviter les re-soumissions immédiates
post-effacement sans réintroduire le PII. Choix : nullifier l'email
clair, stocker emailHash dans une nouvelle colonne `emailHashAfterErasure`.

---

## Entity: MagicLinkToken

Token signé temporaire (J+7) pour vérifier l'email + consulter le brief.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `briefId` | UUID v4 | FK → VoyageurBrief, NOT NULL ON DELETE CASCADE | |
| `tokenHash` | String | NOT NULL, UNIQUE | SHA-256 du token (le clear text n'est jamais persisté) |
| `purpose` | enum `MagicLinkPurpose` | NOT NULL | `verify_email` / `view_brief_status` |
| `expiresAt` | DateTime | NOT NULL | createdAt + 7j (FR-013) |
| `consumedAt` | DateTime | nullable | Premier clic |
| `createdAt` | DateTime | NOT NULL | |

**Indexes** :
- `tokenHash` UNIQUE
- `briefId, purpose, consumedAt` (lookup voyageur clique)
- `expiresAt` (cleanup job)

**Le token clair n'est JAMAIS en DB** : seul `tokenHash = SHA-256(token)`.
Le token clair n'existe que dans l'email envoyé + le query string du
magic link. Empêche un dump DB de réutiliser les tokens.

**Comparaison timing-safe** : `crypto.timingSafeEqual(buf(tokenHash),
buf(sha256(claimedToken)))` côté serveur pour empêcher timing attacks.

---

## Entity: IntakeAuditEntry

Audit log append-only de toutes les actions sur les briefs.

**Trigger SQL identique à 001** (R2) : INSERT autorisé, UPDATE/DELETE/TRUNCATE
bloqués via `intake_audit_block_modifications()` function + 2 triggers
(row-level + statement-level).

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `voyageurBriefId` | UUID v4? | nullable (post-anonymisation) | FK soft (pas de FK formelle pour permettre anonymisation indep) |
| `voyageurContactId` | UUID v4? | nullable post-anonymisation | |
| `eventType` | String | NOT NULL, ≤ 100 chars | `intake.brief.submitted`, `intake.brief.verified`, `intake.brief.deleted`, `intake.brief.expired`, `intake.admin.pushed_manual` |
| `actorRole` | enum `ActorRole` | NOT NULL | `voyageur` / `admin` / `system` |
| `actorId` | UUID v4? | nullable si system | FK soft vers auth_users.id |
| `occurredAt` | DateTime | NOT NULL, default now() | |
| `payload` | JSON | NOT NULL | Validation Zod via `IntakePayloadSchema` (T030 équivalent) |
| `idempotencyKey` | String? | nullable, unique | Anti-replay |
| `correlationId` | UUID v4? | nullable | Lien parent-child (ex: admin push depuis brief) |

**Indexes** :
- `voyageurBriefId, occurredAt DESC` (audit history voyageur)
- `eventType, occurredAt DESC` (analytics)
- `idempotencyKey` UNIQUE WHERE NOT NULL

**Privileges** : rôle `app_intake` reçoit `SELECT, INSERT` uniquement
sur cette table. `UPDATE, DELETE, TRUNCATE` REVOKE + bloqués par triggers
(défense en profondeur).

---

## Entity: IntakeOutboxEntry

Pattern outbox pour publier les événements transactionnellement avec les
mutations brief. Drainé par `OutboxPublisherJob` (réutilise le job 001
en ajoutant intake comme source).

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `eventType` | String | NOT NULL | `voyageur.brief.activated`, `.deleted`, `.expired` |
| `payload` | JSON | NOT NULL | Validation Zod par event type |
| `createdAt` | DateTime | NOT NULL | |
| `publishedAt` | DateTime? | nullable | Set par le publisher |
| `attempts` | Int | NOT NULL, default 0 | |
| `nextAttemptAt` | DateTime? | nullable | Backoff exponentiel |
| `lastError` | String? | nullable, ≤ 1000 chars | Pour debugging |

**Indexes** :
- `publishedAt, nextAttemptAt, attempts` (drain query, identique 001)

---

## Enums Postgres

```sql
CREATE TYPE "BriefStatus" AS ENUM (
  'pending_verification',
  'active',
  'matched',
  'expired_unverified',
  'expired',
  'deleted',
  'anonymized'
);

CREATE TYPE "TravelBudget" AS ENUM (
  'under_2k',
  'between_2k_5k',
  'between_5k_10k',
  'between_10k_20k',
  'above_20k'
);

CREATE TYPE "TravelSpeciality" AS ENUM (
  'croisiere',
  'aventure_outdoor',
  'lune_de_miel',
  'famille_avec_enfants',
  'mobilite_reduite',
  'multigenerationnel',
  'culturel_historique',
  'luxe',
  'road_trip',
  'voyage_affaires',
  'autre'
);

CREATE TYPE "TravelFamiliarity" AS ENUM (
  'first_big_trip',
  'occasional_traveler',  -- 1-3 voyages internationaux
  'experienced_traveler'  -- 4+ voyages
);

CREATE TYPE "ConseillerLanguage" AS ENUM (
  'fr',
  'en',
  'es',
  'other'
);

CREATE TYPE "MagicLinkPurpose" AS ENUM (
  'verify_email',
  'view_brief_status'
);

-- ActorRole défini par 001 (réutilisé) — ne PAS recréer en migration intake
```

---

## Value Objects (côté domaine TypeScript pur)

- `TravelBudget` : alias du enum Prisma + helper `formatBudgetRange(locale)`
- `TravelSpeciality` : alias + helper `formatSpeciality(locale)`
- `TravelFamiliarity` : alias + helper `formatFamiliarity(locale)`
- `DatesFlexibility` : `{ flexible: false } | { flexible: true, days: 1..30 }`
- `PostalCodeCanadian` : branded string regex `^[A-Z]\d[A-Z] ?\d[A-Z]\d$`
- `EmailNormalized` : branded string lowercase + trim + max 254 chars
- `PhoneE164` : branded string format `\+\d{8,15}` (post-normalisation)
- `VoyageurBriefId` : branded UUID v4
- `MagicLinkTokenId` : branded UUID v4

---

## Migration Prisma (sketch)

Fichier : `packages/db/prisma/schema/intake.prisma`

Pattern identique à `conformite.prisma` (multi-fichier schema, `@@map` pour
nommage snake_case côté SQL, `@db.Uuid` partout).

Tables :
- `intake_voyageur_briefs`
- `intake_voyageur_contacts`
- `intake_magic_link_tokens`
- `intake_audit_entries` (avec trigger append-only à recréer par migration séparée)
- `intake_outbox` (peut être unifié avec `conformite_outbox` mais R2 dit séparer)

**Migration 001 intake init** (à créer en T-XXX) :
- CREATE TYPE x6
- CREATE TABLE x5
- CREATE INDEX x12 (FK + recherche)
- CREATE FUNCTION intake_audit_block_modifications
- CREATE TRIGGER (row-level + statement-level pour TRUNCATE — leçon de 001)
- GRANT SELECT, INSERT ON intake_* TO app_intake (least privilege)
- REVOKE UPDATE, DELETE ON intake_audit_entries FROM app_intake (défense en profondeur)
