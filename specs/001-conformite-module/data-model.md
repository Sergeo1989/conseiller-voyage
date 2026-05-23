# Data Model — Module Conformité

**Date** : 2026-05-22

Modèle de données du module conformité : entités du domaine, schéma Prisma
proposé, machine d'état du statut conseiller, contraintes d'intégrité.

---

## Entités du domaine (couche `domain/entities/`)

Les entités du domaine sont des classes TypeScript pures, sans annotation
Prisma, sans dépendance NestJS. Elles encapsulent les invariants métier.

### `ConseillerCompliance`

Agrégat racine. Représente l'état de conformité agrégé d'un conseiller.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `ConseillerComplianceId` (VO, UUID v4) | Unique |
| `conseillerId` | `ConseillerId` (clé étrangère vers module identité) | Unique, indexé |
| `status` | `ConformiteStatus` (VO, enum) | `pending` / `verified` / `suspended` / `revoked` |
| `lastVerifiedAt` | `Date \| null` | Mis à jour à chaque calcul `→ verified` |
| `lastStatusChangeAt` | `Date` | Pour l'invalidation cache (R3) |
| `consentToProcessGivenAt` | `Date \| null` | Loi 25 — date du consentement explicite (FR-016) |
| `erasureRequestedAt` | `Date \| null` | Loi 25 — date de demande d'effacement (FR-017) |
| `anonymizedAt` | `Date \| null` | Si effacement traité ; bloque toute futur écriture |

**Invariants métier** :
- `status === 'verified'` ⇒ `lastVerifiedAt` non null.
- `anonymizedAt` non null ⇒ aucune écriture acceptée (sauf entrée d'audit).
- `consentToProcessGivenAt` est obligatoire avant toute soumission.

### `Certificat`

Document de conformité provincial.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `CertificatId` (UUID) | Unique |
| `conseillerComplianceId` | `ConseillerComplianceId` | FK |
| `province` | `Province` (VO, enum `QC` / `ON`) | — |
| `certificateNumber` | `string` | Non vide ; format provincial ; pseudonymisable |
| `issuedAt` | `Date` | — |
| `expiresAt` | `Date` | > `issuedAt` |
| `documentObjectKey` | `string` | Clé S3, format `conformite/{conseillerId}/cert-{uuid}` |
| `submittedAt` | `Date` | — |
| `decision` | `enum 'approved' \| 'refused' \| 'pending'` | — |
| `decisionAt` | `Date \| null` | Non null si decision ≠ pending |
| `decisionByAdminId` | `string \| null` | FK vers identité, non null si decision ≠ pending |
| `refusalReason` | `string \| null` | Minimum 20 caractères si decision = refused |
| `supersededBy` | `CertificatId \| null` | Si remplacé par un renouvellement |

**Invariants** :
- Si `decision === 'refused'` → `refusalReason` non null + ≥ 20 caractères.
- Un seul `Certificat` par `(conseillerId, province)` avec `decision === 'approved'` et `supersededBy === null`.

### `Affiliation`

Déclaration d'affiliation à une agence titulaire de permis.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `AffiliationId` (UUID) | Unique |
| `conseillerComplianceId` | `ConseillerComplianceId` | FK |
| `agencyName` | `string` | Texte libre, max 200 caractères |
| `agencyPermitNumber` | `PermitNumber` (VO, normalized) | Format dépend de la province ; **clé canonique de regroupement** (FR-015, clarif Q1) |
| `agencyProvince` | `Province` | `QC` (OPC) ou `ON` (TICO) |
| `proofObjectKey` | `string` | Clé S3 |
| `submittedAt` | `Date` | — |
| `decision` | `enum 'approved' \| 'refused' \| 'pending'` | — |
| `decisionAt` | `Date \| null` | — |
| `decisionByAdminId` | `string \| null` | — |
| `refusalReason` | `string \| null` | ≥ 20 chars si refused |
| `role` | `string \| null` | Optionnel |
| `activeSince` | `Date \| null` | Date d'effet de l'affiliation |
| `activeUntil` | `Date \| null` | Si fin d'affiliation déclarée |
| `inactivatedBy` | `enum 'conseiller' \| 'permit_revocation' \| 'admin' \| null` | Raison d'inactivation |
| `inactivatedAt` | `Date \| null` | — |

**Invariants** :
- Au moins une `Affiliation` `decision === 'approved'` et `inactivatedAt === null` pour qu'un `ConseillerCompliance` soit `verified`.

### `PermitRevocation`

Déclaration d'un retrait de permis par un admin (FR-015).

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `PermitRevocationId` (UUID) | Unique |
| `agencyPermitNumber` | `PermitNumber` | Indexé |
| `agencyProvince` | `Province` | — |
| `revokedAt` | `Date` | — |
| `declaredByAdminId` | `string` | FK identité |
| `reason` | `string` | ≥ 20 chars |
| `unique constraint` | `(agencyPermitNumber, agencyProvince)` | Idempotent — une seule entrée par couple |

### `AuditEntry`

Journal d'audit append-only (R2). Une entrée par événement.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `AuditEntryId` (UUID) | Unique |
| `conseillerComplianceId` | `ConseillerComplianceId \| null` | Null pour événements globaux (ex: déclaration retrait permis) |
| `eventType` | `enum AuditEventType` | Voir liste ci-dessous |
| `actorId` | `string \| null` | FK identité ; null pour événements système |
| `actorRole` | `enum 'conseiller' \| 'admin' \| 'system'` | — |
| `payload` | `Json` | Payload structuré, pseudonymisé si nécessaire |
| `occurredAt` | `Date` | Horodatage immutable |
| `idempotencyKey` | `string \| null` | Pour rejeter les rejeux |
| `correlationId` | `string \| null` | Pour tracer une chaîne d'événements |

**`AuditEventType`** :
- `dossier.submitted`
- `dossier.approved`
- `dossier.refused`
- `certificat.renewed`
- `affiliation.added`
- `affiliation.deactivated`
- `status.changed_to_verified`
- `status.changed_to_suspended`
- `status.changed_to_revoked`
- `expiration.reminder_sent_60d` / `_30d` / `_7d`
- `expiration.auto_suspended`
- `permit.revoked_by_admin`
- `permit.cascade_applied`
- `erasure.requested`
- `erasure.completed`
- `admin.viewed_dossier`
- `admin.viewed_document`

### Value Objects (couche `domain/value-objects/`)

- **`ConformiteStatus`** — enum `pending` / `verified` / `suspended` / `revoked` avec méthodes `isVerified()`, `isFinal()`.
- **`Province`** — enum `QC` / `ON`.
- **`PermitNumber`** — chaîne normalisée (trim, uppercase, format provincial). Constructeur valide le format selon la province.
- **`ConseillerId`**, **`ConseillerComplianceId`**, **`CertificatId`**, **`AffiliationId`**, **`PermitRevocationId`**, **`AuditEntryId`** — UUID v4 typés.

---

## Machine d'état du statut conformité

Source : spec, *Entités clés > Statut de conformité du conseiller* (après clarification Q2).

```text
                 soumission                              approbation
   (vide) ─────────────────────► [pending] ──────────────────────► [verified]
                                    ▲                                 │
                                    │                                 │
                                    │ refus (reste pending)           │ expiration auto
                                    │ re-soumission                   │ ou perte d'affiliation
                                    │                                 ▼
                                    │                            [suspended]
                                    │                                 │
                                    │ nouvelle soumission             │ renouvellement
                                    │ complète                        │ approuvé
                                    │                                 │
                                    │                                 ▼
                                    │                            [verified]
                                    │
                                    │                       ┌─── révocation admin ───┐
                                    │                       │                        │
                                    │                       ▼                        ▼
                                    └──────────────[verified]                  [suspended]
                                                       │                            │
                                                       └────────┬───────────────────┘
                                                                ▼
                                                          [revoked]  (état FINAL)
```

Transitions autorisées (implémentées dans `domain/services/is-transition-allowed.ts`, fonction pure testée TDD) :

| De | Vers | Cas |
|---|---|---|
| (vide) | `pending` | Soumission initiale |
| `pending` | `pending` | Refus admin (reste en file) |
| `pending` | `verified` | Approbation admin |
| `verified` | `suspended` | Expiration auto OU perte d'affiliation (cascade FR-015) |
| `verified` | `revoked` | Révocation admin |
| `suspended` | `verified` | Renouvellement approuvé OU nouvelle affiliation approuvée |
| `suspended` | `revoked` | Révocation admin |
| `revoked` | `pending` | Nouvelle soumission complète (état précédent ignoré, repart à zéro) |

Toute autre transition **DOIT** être rejetée par `isTransitionAllowed`.

---

## Schéma Prisma proposé

Fichier cible : `apps/api/prisma/schema.prisma` (extrait du module conformité).

```prisma
// ============================================================
// Module Conformité — schéma Prisma
// ============================================================

enum Province {
  QC
  ON
}

enum ConformiteStatus {
  pending
  verified
  suspended
  revoked
}

enum SubmissionDecision {
  pending
  approved
  refused
}

enum AffiliationInactivationReason {
  conseiller
  permit_revocation
  admin
}

enum ActorRole {
  conseiller
  admin
  system
}

model ConseillerCompliance {
  id                          String              @id @default(uuid()) @db.Uuid
  conseillerId                String              @unique @db.Uuid
  status                      ConformiteStatus    @default(pending)
  lastVerifiedAt              DateTime?
  lastStatusChangeAt          DateTime            @default(now())
  consentToProcessGivenAt     DateTime?
  erasureRequestedAt          DateTime?
  anonymizedAt                DateTime?

  certificats                 Certificat[]
  affiliations                Affiliation[]
  auditEntries                AuditEntry[]

  @@index([status])
  @@index([lastStatusChangeAt])
  @@map("conformite_conseiller_compliances")
}

model Certificat {
  id                       String                  @id @default(uuid()) @db.Uuid
  conseillerComplianceId   String                  @db.Uuid
  conseillerCompliance     ConseillerCompliance    @relation(fields: [conseillerComplianceId], references: [id], onDelete: Restrict)
  province                 Province
  certificateNumber        String
  issuedAt                 DateTime
  expiresAt                DateTime
  documentObjectKey        String
  submittedAt              DateTime                @default(now())
  decision                 SubmissionDecision      @default(pending)
  decisionAt               DateTime?
  decisionByAdminId        String?                 @db.Uuid
  refusalReason            String?
  supersededById           String?                 @db.Uuid
  supersededBy             Certificat?             @relation("CertificatSuperseding", fields: [supersededById], references: [id])
  superseding              Certificat[]            @relation("CertificatSuperseding")

  @@index([conseillerComplianceId, province])
  @@index([expiresAt])
  @@map("conformite_certificats")
}

model Affiliation {
  id                       String                            @id @default(uuid()) @db.Uuid
  conseillerComplianceId   String                            @db.Uuid
  conseillerCompliance     ConseillerCompliance              @relation(fields: [conseillerComplianceId], references: [id], onDelete: Restrict)
  agencyName               String                            @db.VarChar(200)
  agencyPermitNumber       String
  agencyProvince           Province
  proofObjectKey           String
  submittedAt              DateTime                          @default(now())
  decision                 SubmissionDecision                @default(pending)
  decisionAt               DateTime?
  decisionByAdminId        String?                           @db.Uuid
  refusalReason            String?
  role                     String?
  activeSince              DateTime?
  activeUntil              DateTime?
  inactivatedBy            AffiliationInactivationReason?
  inactivatedAt            DateTime?

  @@index([agencyPermitNumber, agencyProvince])    // clé de regroupement FR-015
  @@index([conseillerComplianceId])
  @@map("conformite_affiliations")
}

model PermitRevocation {
  id                  String     @id @default(uuid()) @db.Uuid
  agencyPermitNumber  String
  agencyProvince      Province
  revokedAt           DateTime   @default(now())
  declaredByAdminId   String     @db.Uuid
  reason              String

  @@unique([agencyPermitNumber, agencyProvince])
  @@index([revokedAt])
  @@map("conformite_permit_revocations")
}

model AuditEntry {
  id                       String                @id @default(uuid()) @db.Uuid
  conseillerComplianceId   String?               @db.Uuid
  conseillerCompliance     ConseillerCompliance? @relation(fields: [conseillerComplianceId], references: [id], onDelete: Restrict)
  eventType                String                // enum applicatif validé par Zod
  actorId                  String?               @db.Uuid
  actorRole                ActorRole
  payload                  Json
  occurredAt               DateTime              @default(now())
  idempotencyKey           String?
  correlationId            String?

  // Index principal pour consultation par conseiller, du plus récent au plus ancien
  @@index([conseillerComplianceId, occurredAt(sort: Desc)])
  @@index([eventType, occurredAt(sort: Desc)])
  @@index([idempotencyKey], map: "audit_idempotency_key")
  @@map("conformite_audit_entries")
}
```

### Migrations Prisma — protection append-only de `conformite_audit_entries`

Une migration SQL supplémentaire **DOIT** être ajoutée immédiatement après
la création de la table :

```sql
-- 0001_audit_append_only.sql

CREATE OR REPLACE FUNCTION conformite_audit_block_modifications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TG_OP=% rejected', TG_OP;
END;
$$;

CREATE TRIGGER trg_conformite_audit_block_updates
  BEFORE UPDATE OR DELETE ON conformite_audit_entries
  FOR EACH ROW EXECUTE FUNCTION conformite_audit_block_modifications();

-- Restriction de privilège côté rôle applicatif (défense en profondeur)
REVOKE UPDATE, DELETE ON conformite_audit_entries FROM app_conformite;
```

---

## Index et performance

Indices critiques :
- `conformite_conseiller_compliances(conseillerId)` — lookup par identité.
- `conformite_conseiller_compliances(status)` — file admin filtrée.
- `conformite_certificats(expiresAt)` — job quotidien d'expiration (FR-008, FR-009).
- `conformite_affiliations(agencyPermitNumber, agencyProvince)` — cascade FR-015.
- `conformite_audit_entries(conseillerComplianceId, occurredAt DESC)` — consultation historique (FR-013).
- `conformite_audit_entries(idempotencyKey)` — détection de rejeu.

---

## Volumétrie estimée année 1

| Table | Lignes anticipées |
|---|---|
| `conformite_conseiller_compliances` | 500 |
| `conformite_certificats` | 750 (1,5 par conseiller en moyenne pour CCV + TICO) |
| `conformite_affiliations` | 600 (multi-affiliation rare) |
| `conformite_permit_revocations` | < 20 |
| `conformite_audit_entries` | ~30 000 (50/conseiller incluant rappels et événements système) |

Total < 5 MB de données structurées. Aucun enjeu de partitioning hors
`conformite_audit_entries` qui sera partitionné par année à partir de la
3ᵉ année (≈ 100 000 lignes par an).

---

## Entités additionnelles (blockers B1, B2, B5 du review résolus)

### `OutboxEntry` — pattern outbox transactionnel (B1)

Garantit la livraison at-least-once des événements de domaine
(`ConformiteStatusChanged`, `PermitRevoked`, etc.) malgré les crashes
process. Écrite **dans la même transaction Prisma** que la mutation métier
qui la déclenche. Cf. [research.md R7](./research.md#r7).

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `OutboxEntryId` (UUID v4) | Unique. Sert d'identifiant d'événement côté consommateur. |
| `eventType` | `string` | Ex. `conformite.status.changed`, `conformite.permit.revoked`. |
| `payload` | `Json` | Conforme aux schémas Zod par `eventType` ; pseudonymisé selon R10. |
| `createdAt` | `Date` | Horodatage transactionnel. |
| `publishedAt` | `Date \| null` | Null jusqu'au succès de publication. |
| `attempts` | `int` | Incrémenté à chaque tentative ; dead-letter au-delà de 10. |
| `nextAttemptAt` | `Date \| null` | Backoff exponentiel : 5s, 30s, 5min, 30min, 4h. |
| `lastError` | `string \| null` | Trace du dernier échec. |

Index : `(publishedAt IS NULL, nextAttemptAt)` pour le scan worker.

```prisma
model OutboxEntry {
  id            String    @id @default(uuid()) @db.Uuid
  eventType     String
  payload       Json
  createdAt     DateTime  @default(now())
  publishedAt   DateTime?
  attempts      Int       @default(0)
  nextAttemptAt DateTime?
  lastError     String?

  @@index([publishedAt, nextAttemptAt])
  @@map("conformite_outbox")
}
```

Le worker `OutboxPublisherWorker` (couche `infrastructure/jobs/`) :
1. Sélectionne les rows `publishedAt IS NULL AND (nextAttemptAt IS NULL OR nextAttemptAt < NOW())` ordonnées par `createdAt ASC`, limit 100.
2. Pour chaque, publie via `ConformiteEventPublisher`.
3. Sur succès : `UPDATE` `publishedAt = NOW()`.
4. Sur échec : incrémente `attempts`, calcule `nextAttemptAt` (backoff), enregistre `lastError`. Au-delà de 10 tentatives, alerte ops.

### `UploadIntent` — registre des intentions d'upload (B2)

Empêche la forge de `uploadId` lors des soumissions de dossier. Persiste
chaque URL signée PUT S3 émise avec son propriétaire et ses contraintes.
Cf. [research.md R8](./research.md#r8).

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `UploadIntentId` (UUID v4) | Identifiant utilisé comme `uploadId` côté client. |
| `conseillerComplianceId` | `ConseillerComplianceId` | FK propriétaire. |
| `purpose` | `enum 'certificat' \| 'preuve_affiliation'` | Pour validation contextuelle. |
| `expectedContentType` | `enum 'application/pdf' \| 'image/jpeg' \| 'image/png' \| 'image/heic'` | Conformité FR-021. |
| `expectedContentLength` | `int` | Limite 5 MB (FR-021). |
| `objectKey` | `string` | Clé S3 finale (préfixe `conformite/{conseillerId}/`). |
| `createdAt` | `Date` | — |
| `expiresAt` | `Date` | `createdAt + 5 min`. |
| `consumedAt` | `Date \| null` | Set à NOW() au moment de la création de submission. |

Index : `(conseillerComplianceId, createdAt DESC)`, `(expiresAt)` pour cleanup.

```prisma
model UploadIntent {
  id                      String   @id @default(uuid()) @db.Uuid
  conseillerComplianceId  String   @db.Uuid
  conseillerCompliance    ConseillerCompliance @relation(fields: [conseillerComplianceId], references: [id], onDelete: Restrict)
  purpose                 String   // enum applicatif
  expectedContentType     String
  expectedContentLength   Int
  objectKey               String
  createdAt               DateTime @default(now())
  expiresAt               DateTime
  consumedAt              DateTime?

  @@index([conseillerComplianceId, createdAt(sort: Desc)])
  @@index([expiresAt])
  @@map("conformite_upload_intents")
}
```

Use case associé : `RequestUploadUrlsUseCase` (couche application) — crée
N intents + N URLs signées en une seule transaction.

Use case mis à jour : `SubmitDossierUseCase` — vérifie chaque `uploadId`
référencé :
1. Existe en DB.
2. Appartient au `conseillerId` connecté.
3. `expiresAt > NOW()`.
4. `consumedAt IS NULL`.
5. HEAD S3 confirme `Content-Type` et `Content-Length` corrects.
6. `UPDATE consumedAt = NOW()` dans la même transaction que la création de submission.

Job de cleanup quotidien `UploadIntentCleanupJob` :
- Supprime les rows où `expiresAt < NOW() - 7 days AND consumedAt IS NULL`.
- Supprime l'objet S3 associé via API (lifecycle S3 policy en backup).

---

## Règles de pseudonymisation du payload `AuditEntry` (B5)

Cf. [research.md R10](./research.md#r10) pour la justification.

**Règle stricte** : la colonne `payload` (`Json`) de
`conformite_audit_entries` **NE PEUT JAMAIS** contenir, comme clé directe
ou imbriquée :

- `email`, `emailAddress`, `mail`
- `phone`, `phoneNumber`, `telephone`
- `firstName`, `lastName`, `fullName`, `name` (sauf nom d'agence qui est
  une entité commerciale, pas une personne)
- `address`, `street`, `postalCode`, `zipCode`
- Tout champ texte libre saisi par l'utilisateur (brief, motif, etc.)
  contenant potentiellement des nominatifs

**Ce qui est autorisé** dans `payload` :
- Références par UUID (`conseillerComplianceId`, `submissionId`, etc.)
- Énumérations / valeurs structurées (`previousStatus`, `newStatus`, `province`, `decision`)
- Horodatages, durées, compteurs
- Identifiants techniques (`agencyPermitNumber` — la clé canonique d'agence n'est pas un identifiant de personne)

**Schémas Zod par `eventType`** définis dans
`apps/api/src/modules/conformite/application/audit/payload-schemas.ts`.
Exemple :

```ts
export const StatusChangedPayloadSchema = z.object({
  previousStatus: z.enum(['pending', 'verified', 'suspended', 'revoked']),
  newStatus:     z.enum(['pending', 'verified', 'suspended', 'revoked']),
  cause: z.enum(['admin_approval', 'admin_refusal', 'admin_revocation',
                 'certificate_expiration', 'permit_cascade', 'renewal']),
}).strict(); // .strict() rejette toute clé non listée

export type AuditPayloadByEvent = {
  'status.changed_to_verified':  z.infer<typeof StatusChangedPayloadSchema>;
  'status.changed_to_suspended': z.infer<typeof StatusChangedPayloadSchema>;
  // etc.
};
```

**Test CI dédié** vérifie qu'aucun appel à `AuditLogWriter.write()` ne
passe un payload contenant les clés interdites — fail-fast à la compilation
grâce au type strict + test d'invariant sur le `payload` au runtime.
