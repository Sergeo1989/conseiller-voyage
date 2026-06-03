# Data Model — Matching scoring conseiller × brief

**Phase** : 1 (Design)
**Date** : 2026-05-31
**Branch** : `008-matching-scoring`

Schéma DB du module `matching`. 3 tables nouvelles + extensions de contraintes. Pattern multi-fichier Prisma (`prismaSchemaFolder` preview) — fichier dédié `packages/db/prisma/schema/matching.prisma`.

## Vue d'ensemble

```text
┌─────────────────────────────┐         ┌────────────────────────────────┐
│ matching_results            │         │ matching_result_entries        │
│ (un par briefId actif)      │ 1──N    │ (0-3 entrées par result)       │
├─────────────────────────────┤         ├────────────────────────────────┤
│ id                          │◄────────│ matchingResultId               │
│ briefId           FK→intake │         │ position (1|2|3)               │
│ status            enum      │         │ conseillerId      FK→profil    │
│ matchedCount                │         │ scoreBrut         decimal(5,4) │
│ algorithmVersion            │         │ scoreFinal        decimal(5,4) │
│ suggestedConseillerId       │         │ scoreComponents   JSONB        │
│ boostApplied      bool      │         │ boosted           bool         │
│ computedAt                  │         │ createdAt                      │
│ supersededAt                │         └────────────────────────────────┘
│ supersededByMatchingResultId│
│ createdAt                   │
└─────────────────────────────┘
              │
              │ many-to-one (audit linkage)
              ▼
┌─────────────────────────────┐
│ matching_audit_entries      │
│ (append-only trigger)       │
├─────────────────────────────┤
│ id                          │
│ briefId           FK?       │  (nullable post-anonymisation Loi 25)
│ matchingResultId  FK?       │
│ eventType         enum      │
│ payload           JSONB     │  (no PII)
│ idempotencyKey    text?     │
│ correlationId     text?     │
│ occurredAt                  │
└─────────────────────────────┘

┌─────────────────────────────┐
│ matching_outbox_entries     │  (table outbox dédiée — R7 research)
│ (consumed by Outbox publisher 003 extension)
├─────────────────────────────┤
│ id                          │
│ eventType         enum      │
│ payload           JSONB     │
│ idempotencyKey    text      │
│ publishedAt       timestamp?│
│ createdAt                   │
└─────────────────────────────┘
```

---

## 1. `matching_results`

**Rôle** : trace d'un calcul de matching pour un brief, à un instant donné. Une entrée par briefId actif. Multiples possibles si re-matching admin (chaînés via `supersededByMatchingResultId`).

### Champs

| Champ | Type | Contraintes | Note |
|---|---|---|---|
| `id` | UUID v4 | PK | Généré par UuidGenerator (Principe VI testable). |
| `briefId` | UUID | FK → `voyageur_briefs.id` ON DELETE SET NULL, nullable post-anonymisation Loi 25 | Indexé. Unique sur `briefId` WHERE `supersededAt IS NULL` (idempotence FR-004). |
| `status` | enum `MatchingStatus` | NOT NULL | `ok` (3 entries) / `partial` (1-2 entries) / `empty` (0 entries). |
| `matchedCount` | smallint | NOT NULL, CHECK BETWEEN 0 AND 3 | Doublon dérivable du count des entries, mais matérialisé pour requêtes admin rapides. |
| `algorithmVersion` | text | NOT NULL | Format `vMAJOR.MINOR` (ex. `v1.0`). Bumpé via ADR à chaque changement de pondération. |
| `suggestedConseillerId` | UUID | FK → `conseiller_profiles.id`, nullable | Conseiller pointé par cookie `cv_suggested` au moment de la soumission du brief (007). NULL si cookie absent/invalide. |
| `boostApplied` | bool | NOT NULL DEFAULT false | True si le boost a effectivement modifié le score d'un conseiller éligible. |
| `computedAt` | timestamptz | NOT NULL | Horodatage du calcul (injecté via Clock port, testable). |
| `supersededAt` | timestamptz | nullable | Set lors d'un re-matching admin (FR-016). |
| `supersededByMatchingResultId` | UUID | FK self, nullable | Chaîne vers le nouveau résultat. |
| `createdAt` | timestamptz | NOT NULL DEFAULT now() | Audit DB. |

### Index

```sql
CREATE UNIQUE INDEX idx_matching_results_brief_active
  ON matching_results (briefId)
  WHERE supersededAt IS NULL AND briefId IS NOT NULL;
-- garantit FR-004 idempotence stricte

CREATE INDEX idx_matching_results_status_partial
  ON matching_results (status, computedAt DESC)
  WHERE status IN ('partial', 'empty');
-- alimente file admin US5 extension de 008
```

### Contraintes

- **CHECK** `matchedCount = 0 ⇔ status = 'empty'`
- **CHECK** `matchedCount BETWEEN 1 AND 2 ⇔ status = 'partial'`
- **CHECK** `matchedCount = 3 ⇔ status = 'ok'`
- **CHECK** `(supersededAt IS NULL) = (supersededByMatchingResultId IS NULL)` (les deux nullables ensemble).
- **Trigger Postgres** `matching_results_anonymise_cascade` : AFTER UPDATE sur `voyageur_briefs` quand `status` passe à `anonymized` → set `briefId = NULL`, `suggestedConseillerId = NULL` (ADR-0023).

### Cycle de vie

```
        ┌─────────────┐
        │   created   │  (PerformMatchingUseCase succeeds, append)
        └──────┬──────┘
               │
               │ (admin TriggerRematch, append nouveau MR, ancien superseded)
               ▼
        ┌─────────────┐
        │ superseded  │  (supersededAt set, supersededByMatchingResultId set)
        └─────────────┘
               │
               │ (brief anonymisé Loi 25, trigger Postgres)
               ▼
        ┌─────────────┐
        │ anonymised  │  (briefId → NULL, suggestedConseillerId → NULL, scoreComponents redacted)
        └─────────────┘

JAMAIS de UPDATE direct sur status, matchedCount, scoreComponents (append-only via insert-only pattern + trigger BEFORE UPDATE qui rejette toute modification non whitelistée).
```

---

## 2. `matching_result_entries`

**Rôle** : une entrée du top 3 pour un `MatchingResult`. 0 à 3 entries par MR.

### Champs

| Champ | Type | Contraintes | Note |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `matchingResultId` | UUID | FK → `matching_results.id` ON DELETE CASCADE, NOT NULL | Indexé. |
| `position` | smallint | NOT NULL, CHECK IN (1, 2, 3) | Position triée par scoreFinal décroissant. |
| `conseillerId` | UUID | FK → `conseiller_profiles.id`, NOT NULL | Indexé pour reverse lookup (« mes affectations » dans 012). |
| `scoreBrut` | decimal(5, 4) | NOT NULL, CHECK BETWEEN 0.0000 AND 1.0000 | Score avant boost. |
| `scoreFinal` | decimal(5, 4) | NOT NULL, CHECK BETWEEN 0.0000 AND 1.1000 | Score après boost (≤ +10 %, FR-011). |
| `scoreComponents` | JSONB | NOT NULL | `{ destination: 0.85, geo: 0.60, speciality: 0.90, familiarity: 0.40 }` — re-redacted à `{"redacted":"loi25"}` post-anonymisation cascade. |
| `boosted` | bool | NOT NULL DEFAULT false | True si scoreFinal > scoreBrut (boost appliqué à ce conseiller). |
| `createdAt` | timestamptz | NOT NULL DEFAULT now() | |

### Index

```sql
CREATE UNIQUE INDEX idx_matching_result_entries_position
  ON matching_result_entries (matchingResultId, position);
-- pas de doublon position 1/2/3 par MR

CREATE INDEX idx_matching_result_entries_conseiller
  ON matching_result_entries (conseillerId, createdAt DESC);
-- alimente vue « mes affectations » côté 012
```

### Contraintes

- **CHECK** `scoreFinal >= scoreBrut` (boost ne peut que monter, FR-012).
- **CHECK** `scoreFinal <= scoreBrut * 1.10` (boost ≤ +10 %, FR-011 — invariant testé SC-004).
- **CHECK** `(boosted = true) ⇒ (scoreFinal > scoreBrut)`.
- Pas de trigger spécifique — les entries sont créées en batch dans la transaction du MR parent, jamais modifiées (append-only par construction).

---

## 3. `matching_audit_entries`

**Rôle** : trace append-only de chaque opération matching (calcul, replay ignoré, re-matching, anonymisation). Séparée de `matching_results` pour ne pas surcharger la table principale et garantir 7 ans de rétention conformité.

### Champs

| Champ | Type | Contraintes | Note |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `briefId` | UUID | FK → `voyageur_briefs.id` ON DELETE SET NULL, nullable post-anonymisation | Indexé. |
| `matchingResultId` | UUID | FK → `matching_results.id` ON DELETE SET NULL, nullable | Référence vers le MR concerné si applicable. |
| `eventType` | enum `MatchingAuditEventType` | NOT NULL | Valeurs : `matching.computed`, `matching.empty`, `matching.partial`, `matching.replay_ignored`, `matching.recomputed`, `matching.all_matches_revoked_detected`, `matching.conseiller_address_missing`. |
| `payload` | JSONB | NOT NULL | Données techniques **sans PII** : `candidatesCount`, `verifiedCount`, `languageFilteredCount`, `durationMs`, `algorithmVersion`, etc. |
| `idempotencyKey` | text | nullable | Reuse de la clé d'idempotence si l'event source en avait une. |
| `correlationId` | text | nullable | Tracing distributed — propagé depuis le brief activé. |
| `occurredAt` | timestamptz | NOT NULL | Horodatage métier. |

### Trigger append-only

```sql
CREATE TRIGGER matching_audit_entries_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON matching_audit_entries
FOR EACH STATEMENT
EXECUTE FUNCTION raise_append_only_error('matching_audit_entries');
-- pattern hérité de 001 / 008 — bloque tout UPDATE/DELETE/TRUNCATE
```

### Index

```sql
CREATE INDEX idx_matching_audit_brief_occurred
  ON matching_audit_entries (briefId, occurredAt DESC);

CREATE INDEX idx_matching_audit_event_type
  ON matching_audit_entries (eventType, occurredAt DESC);
```

### Rétention

7 ans (audit conformité). Archivage cold storage chiffré post-rétention via job `data-retention-sweep` (constitution *Cycle de vie et rétention des données*).

---

## 4. `matching_outbox_entries`

**Rôle** : table outbox dédiée matching (cf. R7 research). Consommée par le worker `OutboxPublisherJob` (extension de feature 003 — tâche Phase 8 polish).

### Champs

| Champ | Type | Contraintes | Note |
|---|---|---|---|
| `id` | UUID v4 | PK | |
| `eventType` | enum `MatchingOutboxEventType` | NOT NULL | `voyageur.brief.matched`, `voyageur.brief.partially_matched`, `voyageur.brief.unmatched`, `voyageur.brief.all_matches_revoked`. |
| `payload` | JSONB | NOT NULL | Schémas Zod stricts dans `packages/shared/src/matching/schemas.ts`. |
| `idempotencyKey` | text | UNIQUE, NOT NULL | Format `matching:<briefId>:<eventType>:<algorithmVersion>` — empêche doublon de publication. |
| `publishedAt` | timestamptz | nullable | NULL = en attente, NOT NULL = publié par le worker. |
| `createdAt` | timestamptz | NOT NULL DEFAULT now() | |

### Index

```sql
CREATE INDEX idx_matching_outbox_pending
  ON matching_outbox_entries (createdAt ASC)
  WHERE publishedAt IS NULL;
-- alimente le scan du worker (oldest first)
```

### Pas de trigger append-only

Contrairement aux 3 tables précédentes, l'outbox accepte un UPDATE de `publishedAt NULL → NOT NULL` par le worker. C'est le SEUL UPDATE autorisé. Trigger conditionnel à ajouter en migration :

```sql
CREATE TRIGGER matching_outbox_publish_only
BEFORE UPDATE ON matching_outbox_entries
FOR EACH ROW
EXECUTE FUNCTION reject_unless_publishing();
-- raise si OLD.publishedAt IS NOT NULL OR NEW.publishedAt IS NULL OR NEW.* changes any other field
```

---

## 5. Modèles read (in-memory, immutables, hors DB)

Le domaine consomme des **snapshots immutables** assemblés par l'adapter avant l'appel de la fonction pure. Aucune persistence directe.

### `BriefSnapshot`

```typescript
type BriefSnapshot = Readonly<{
  briefId: VoyageurBriefId;                  // pour persistence aval, pas pour scoring
  destinations: ReadonlyArray<Readonly<{ country: string; region?: string }>>;
  conseillerLanguage: 'fr' | 'en';           // filtre dur Q3
  speciality: TravelSpeciality;              // enum from 008
  familiarity: TravelFamiliarity;            // enum from 008
  voyageurFsa: FsaCode | null;               // dérivé du postalCode 008
  suggestedConseillerId: ConseillerId | null; // depuis cookie cv_suggested
}>;
```

### `ConseillerSnapshot`

```typescript
type ConseillerSnapshot = Readonly<{
  conseillerId: ConseillerId;
  languages: ReadonlyArray<'fr' | 'en'>;     // pour filtre dur langue
  specialities: ReadonlyArray<TravelSpeciality>;
  destinations: ReadonlyArray<Readonly<{ country: string; regions?: ReadonlyArray<string> }>>;
  experienceTier: 'mentor' | 'pair' | 'pair_expert';  // mapping vers familiarity
  fsa: FsaCode | null;                       // dérivé adresse profil 007 OU fallback siège 001
}>;
```

### `FsaCentroidTable` (statique embedded)

```typescript
type FsaCentroidTable = ReadonlyMap<FsaCode, Readonly<{ lat: number; lng: number; province: ProvinceCode }>>;
// ~1 622 entrées, chargé au boot du module (singleton DI), zéro I/O au moment du calcul
```

### `WeightsConfig`

```typescript
type WeightsConfig = Readonly<{
  destination: number;     // 0.35 (ADR-0020 v1.0)
  geo: number;             // 0.25
  speciality: number;      // 0.25
  familiarity: number;     // 0.15
}>;
// invariant : sum = 1.0 (vérifié au boot)
```

### `ScoreComponents` (sortie fonction pure)

```typescript
type ScoreComponents = Readonly<{
  destination: number;     // 0.0 - 1.0
  geo: number;
  speciality: number;
  familiarity: number;
}>;
// scoreBrut = ∑(component × weight) ∈ [0.0, 1.0]
```

---

## 6. Enums Prisma

```prisma
enum MatchingStatus {
  ok           // top 3 complet
  partial      // 1 ou 2 entries
  empty        // 0 entries
}

enum MatchingAuditEventType {
  matching_computed
  matching_empty
  matching_partial
  matching_replay_ignored
  matching_recomputed
  matching_all_matches_revoked_detected
  matching_conseiller_address_missing
}

enum MatchingOutboxEventType {
  voyageur_brief_matched
  voyageur_brief_partially_matched
  voyageur_brief_unmatched
  voyageur_brief_all_matches_revoked
}
```

> Conversion snake_case ⇄ kebab-case côté outbox publisher : `voyageur_brief_matched` (enum DB) → `voyageur.brief.matched` (event bus). Mapping centralisé dans `packages/shared/src/matching/event-names.ts`.

---

## 7. Migrations Prisma à créer

3 migrations append-only :

1. `2026XXXX_init_matching` — création des 4 tables, enums, indexes, contraintes CHECK.
2. `2026XXXX_matching_audit_append_only` — trigger append-only sur `matching_audit_entries` + rôle DB `app_matching` least privilege (lecture sur `voyageur_briefs` + `conseiller_profiles` + `conformite_compliances` ; écriture sur `matching_*`). Grants cross-module documentés dans la migration.
3. `2026XXXX_matching_anonymisation_cascade` — trigger Postgres `AFTER UPDATE` sur `voyageur_briefs` qui cascade au matching (ADR-0023).

Pattern hérité de 008 — déjà éprouvé.

---

## Cohérence avec spec.md

| Élément spec | Modèle data |
|---|---|
| `MatchingResult` (Key Entities spec) | Table `matching_results` |
| `MatchingResultEntry` | Table `matching_result_entries` |
| `MatchingAuditEntry` | Table `matching_audit_entries` |
| Plafond 3 (FR-005, SC-003) | CHECK `matchedCount BETWEEN 0 AND 3` + CHECK `position IN (1,2,3)` + UNIQUE `(matchingResultId, position)` |
| Idempotence briefId (FR-004) | UNIQUE INDEX `idx_matching_results_brief_active` |
| Filtre verified (FR-006) | Pas en DB direct — appliqué dans `PrismaConseillerSnapshotReader` via `ConformiteQueryPort` |
| Append-only (FR-003) | Triggers Postgres `matching_audit_entries_append_only` + pattern insert-only sur `matching_results` (jamais d'UPDATE applicatif) |
| Anonymisation Loi 25 cascade (Loi 25 + assumption) | Trigger Postgres `matching_results_anonymise_cascade` (ADR-0023) |
| Boost ≤ +10 % (FR-011) | CHECK `scoreFinal <= scoreBrut * 1.10` |
| `suggestedConseillerId` figé au moment de la soumission (FR-010) | Colonne sur `matching_results`, NULLABLE, source = cookie HMAC consumé à la soumission par 008 (à propager via brief snapshot) |
| 4 events outbox distincts (FR-014 + FR-019 + Q5 clarify) | Enum `MatchingOutboxEventType` avec 4 valeurs |
| Versioning algorithme (assumption) | Colonne `algorithmVersion` sur `matching_results` |

Toutes les FR concernées par les data du spec sont matérialisées.
