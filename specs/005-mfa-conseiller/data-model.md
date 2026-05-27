# Modèle de données : MFA conseiller (feature 005)

**Date** : 2026-05-25 · **Plan** : [plan.md](plan.md) · **Recherche** : [research.md](research.md)

Toutes les nouvelles tables vivent dans le schéma Prisma multi-file
`packages/db/prisma/schema/mfa.prisma`. Elles s'intègrent à
`packages/db/prisma/schema/auth.prisma` (livré par 001) via la relation
`userId → auth_users.id`.

---

## Vue d'ensemble

```text
auth_users (existant)
    │
    ├─── 1:0..1 ──── mfa_secrets
    │                    │
    │                    └── 1:N ──── mfa_backup_codes
    │
    └─── 1:N ──── mfa_audit_events (en tant que targetUserId ou actorUserId)

mfa_rate_limit_buckets  (table de support, pas de FK)
```

---

## Entités

### `MfaSecret` — table `mfa_secrets`

Représente la méthode TOTP active d'un utilisateur. Au MVP, au plus un
secret TOTP par user. L'entité est extensible pour `kind = 'passkey'`
ultérieurement.

```prisma
model MfaSecret {
  id              String        @id @default(uuid()) @db.Uuid
  userId          String        @db.Uuid
  kind            MfaSecretKind @default(totp)
  // Chiffré AES-256-GCM (R2). Format : version || iv || ciphertext || tag, Base64.
  encryptedSecret String        @db.Text
  // Métadonnées d'enrôlement
  enrolledAt      DateTime      @default(now())
  enabledAt       DateTime?     // null tant que premier code TOTP non vérifié
  lastUsedAt      DateTime?     // mis à jour à chaque vérification réussie
  // UUID généré côté web pour traçabilité d'un essai d'enrôlement.
  // NB : pas idempotent au sens strict (cf. règles métier ci-dessous).
  enrollmentRequestId String    @unique @db.Uuid
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  user        AuthUser           @relation(fields: [userId], references: [id], onDelete: Cascade)
  backupCodes MfaBackupCode[]

  @@index([userId])
  @@map("mfa_secrets")
}

// Index partiel (Postgres) — un seul secret ENABLED par user à la fois.
// Plusieurs `MfaSecret` avec `enabledAt = null` peuvent coexister
// transitoirement (avant supersede par /enroll/start). Le partial index
// est créé en SQL pur via la migration :
//   CREATE UNIQUE INDEX mfa_secrets_one_enabled_per_user
//     ON mfa_secrets (userId) WHERE enabledAt IS NOT NULL;

enum MfaSecretKind {
  totp
  // Reserved for future expansion (Principe VIII Open/Closed):
  // passkey
}
```

**Règles métier** :
- **Au plus un `MfaSecret` actif par user** — appliqué par un **index
  partiel Postgres** `WHERE enabledAt IS NOT NULL`. Les enregistrements
  pendants (`enabledAt IS NULL`, en cours d'enrôlement) peuvent coexister
  transitoirement.
- `enabledAt = null` tant que l'utilisateur n'a pas confirmé son premier
  code TOTP (FR-003).
- **Supersede sémantique sur `/enroll/start`** : un nouvel appel à
  `POST /api/mfa/enroll/start` supprime atomiquement tout `MfaSecret`
  existant avec `enabledAt IS NULL` pour ce `userId` avant d'INSERT un
  nouveau secret. Cela résout le problème d'idempotence : on ne peut PAS
  re-fabriquer les codes de récupération clairs après un retry réseau
  (ils ne sont stockés que sous forme bcrypt), donc on assume que chaque
  appel génère un nouveau lot ; le client doit avertir l'utilisateur via
  UX si un nouvel appel est déclenché ("vos anciens codes seront
  invalidés"). L'unique index partiel ci-dessus garantit qu'on n'écrase
  jamais un secret déjà `enabledAt IS NOT NULL`.
- Un reset MFA (US4) ou un device change (US6) **supprime la ligne**
  (`DELETE`), pas de soft-delete : le but est l'oubli cryptographique
  immédiat. La trace de l'événement vit dans `mfa_audit_events`.
- Cascade `onDelete: Cascade` sur le user : un effacement Loi 25 du
  user supprime automatiquement son secret TOTP (FR-040).

---

### `MfaBackupCode` — table `mfa_backup_codes`

Représente l'un des 10 codes de récupération générés à l'enrôlement (ou à
la régénération FR-014). Hashés bcrypt cost ≥ 12 (FR-039).

```prisma
model MfaBackupCode {
  id           String       @id @default(uuid()) @db.Uuid
  mfaSecretId  String       @db.Uuid
  // bcrypt hash du code clair (60 chars). Jamais le clair.
  codeHash     String       @db.Text
  // Identifiant du lot de génération — permet la régénération atomique (FR-015).
  batchId      String       @db.Uuid
  // Position dans le lot (1-10), affichée à l'utilisateur pour numérotation visuelle.
  position     Int
  generatedAt  DateTime     @default(now())
  // Mis à jour lors de la consommation (FR-011). null = code non consommé.
  usedAt       DateTime?
  createdAt    DateTime     @default(now())

  mfaSecret    MfaSecret    @relation(fields: [mfaSecretId], references: [id], onDelete: Cascade)

  @@unique([mfaSecretId, batchId, position])
  @@index([batchId])
  @@index([mfaSecretId, usedAt])
  @@map("mfa_backup_codes")
}
```

**Règles métier** :
- Un lot de 10 codes a un `batchId` commun ; la régénération (FR-015)
  crée un nouveau `batchId` et supprime atomiquement tous les codes de
  l'ancien batch.
- `position ∈ [1..10]` strict (validation Zod côté écriture).
- Cascade `onDelete: Cascade` sur `MfaSecret` : suppression du secret →
  suppression des backup codes (FR-040, FR-024).
- Le compteur « codes restants » (FR-012) est calculé par
  `COUNT(*) WHERE mfaSecretId = ? AND usedAt IS NULL`.

---

### `MfaAuditEvent` — table `mfa_audit_events`

Journal append-only de tous les événements MFA opérationnels (FR-030,
FR-031). **Triggers Postgres** empêchent UPDATE/DELETE/TRUNCATE (cf. R8
et 0008-anonymisation-loi25-hash-sale-immutable.md).

```prisma
model MfaAuditEvent {
  id            String           @id @default(uuid()) @db.Uuid
  eventType     MfaEventType
  // Acteur de l'événement (peut être nul pour les événements système
  // comme expiration de tentatives).
  actorUserId   String?          @db.Uuid
  // Utilisateur affecté par l'événement.
  targetUserId  String?          @db.Uuid
  // Type de cible — permet de distinguer reset conseiller / reset admin
  // (FR-025).
  targetRole    AuthRole?
  // IP source abrégée (IPv4 /24, IPv6 /48) — cohérent ADR-0008.
  actorIp       String?          @db.VarChar(45)
  // Méthode utilisée pour les events de verification (TOTP vs backup).
  method        MfaVerifyMethod?
  // Justification texte libre pour les events admin (FR-023, ≥ 20 chars).
  justification String?          @db.Text
  // Métadonnées additionnelles (action sensible tentée pour step-up,
  // fenêtre d'échecs pour rate limit, etc.).
  metadata      Json?
  occurredAt    DateTime         @default(now())
  // Pas de updatedAt — la table est strictement append-only.

  actor         AuthUser?        @relation("MfaAuditActor", fields: [actorUserId], references: [id], onDelete: SetNull)
  target        AuthUser?        @relation("MfaAuditTarget", fields: [targetUserId], references: [id], onDelete: SetNull)

  @@index([targetUserId, occurredAt])
  @@index([actorUserId, occurredAt])
  @@index([eventType, occurredAt])
  @@map("mfa_audit_events")
}

enum MfaEventType {
  // Enrôlement et activation
  mfa_enrolled
  mfa_enrollment_started
  mfa_enrollment_cancelled

  // Vérifications
  mfa_login_verified
  mfa_login_failed
  mfa_login_locked       // 5 échecs en 5 min, lockout 15 min
  mfa_login_unlocked

  // Step-up
  mfa_stepup_verified
  mfa_stepup_failed
  mfa_stepup_session_killed  // 3 échecs → session révoquée + notif courriel

  // Backup codes
  mfa_backup_code_consumed
  mfa_backup_codes_regenerated_self  // FR-014 par l'utilisateur
  mfa_backup_codes_warning_low       // < 3 codes restants

  // Device change self-service (FR-015a)
  mfa_device_changed_self

  // Reset admin (FR-022)
  mfa_reset_by_admin

  // Loi 25
  mfa_secret_anonymized              // post-effacement compte
}

enum MfaVerifyMethod {
  totp
  backup_code
}
```

**Règles métier** :
- `onDelete: SetNull` sur acteur et cible : si un user est supprimé
  (effacement Loi 25), l'événement reste mais l'identité est rompue
  (cohérent avec la table d'audit conformité de 001 et l'ADR-0008 de
  004).
- `occurredAt` immuable : il n'y a pas de `updatedAt`, et le trigger BD
  empêche tout `UPDATE`.
- Le champ `metadata` JSON est volontairement libre pour absorber les
  variations entre types d'événements ; il est documenté par type dans
  `contracts/events.md`.

**Triggers Postgres** (migration
`20260526000001_init_mfa_immutability/migration.sql`) :

```sql
-- Append-only enforcement
CREATE OR REPLACE FUNCTION mfa_audit_events_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'mfa_audit_events is append-only: UPDATE not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mfa_audit_events_block_update
  BEFORE UPDATE ON mfa_audit_events
  FOR EACH ROW EXECUTE FUNCTION mfa_audit_events_block_update();

CREATE OR REPLACE FUNCTION mfa_audit_events_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'mfa_audit_events is append-only: DELETE not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mfa_audit_events_block_delete
  BEFORE DELETE ON mfa_audit_events
  FOR EACH ROW EXECUTE FUNCTION mfa_audit_events_block_delete();

-- Empêcher l'esquive par TRUNCATE pour tous les rôles applicatifs.
-- Wrappé en DO + format() pour compatibilité shadow DB Prisma migrate
-- dev (pattern établi par feature 004, migration 20260525180002).
REVOKE TRUNCATE ON mfa_audit_events FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_identite') THEN
    EXECUTE format('REVOKE TRUNCATE ON %I FROM %I', 'mfa_audit_events', 'app_identite');
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cv_app_role') THEN
    EXECUTE format('REVOKE TRUNCATE ON %I FROM %I', 'mfa_audit_events', 'cv_app_role');
  END IF;
END $$;
```

---

### `MfaRateLimitBucket` — table `mfa_rate_limit_buckets`

Compteur de tentatives pour le rate limiting Postgres (R3).

```prisma
model MfaRateLimitBucket {
  id              String           @id @default(uuid()) @db.Uuid
  userId          String           @db.Uuid
  kind            MfaRateLimitKind
  // Scope de session : non-null pour les buckets de step-up (1 bucket
  // par session, FR-020 edge case), null pour les buckets par-user
  // (login, enroll, device change).
  sessionId       String?          @db.Uuid
  windowStartedAt DateTime         @default(now())
  windowEndsAt    DateTime
  attempts        Int              @default(0)
  lockedUntil     DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  // Postgres traite chaque NULL comme distinct, donc on a en fait :
  //   - login_totp : 1 row par (userId, 'login_totp', NULL)
  //   - stepup_totp : 1 row par (userId, 'stepup_totp', sessionId)
  //   - enroll_start : 1 row par (userId, 'enroll_start', NULL)
  //   - device_change : 1 row par (userId, 'device_change', NULL)
  // L'unique constraint avec colonne NULL est convertie en INDEX UNIQUE
  // partial via SQL pur dans la migration pour gérer proprement les
  // semantics NULL :
  //   CREATE UNIQUE INDEX mfa_rate_limit_buckets_per_session
  //     ON mfa_rate_limit_buckets (userId, kind, sessionId)
  //     WHERE sessionId IS NOT NULL;
  //   CREATE UNIQUE INDEX mfa_rate_limit_buckets_per_user
  //     ON mfa_rate_limit_buckets (userId, kind)
  //     WHERE sessionId IS NULL;
  @@index([windowEndsAt])    // pour le job de cleanup
  @@index([userId, kind])    // lookup au régime nominal
  @@map("mfa_rate_limit_buckets")
}

enum MfaRateLimitKind {
  login_totp       // 5 échecs en 5 min → lockout 15 min (FR-013). sessionId = NULL (scope user).
  stepup_totp      // 3 échecs dans un modal → session killed (FR-020). sessionId = courant.
  enroll_start     // 10 starts en 1 h max (anti-DoS, P1-1 review). sessionId = NULL.
  device_change    // 5 échecs en 10 min pour éviter brute-force du second facteur. sessionId = NULL.
}
```

**Règles métier** :
- Pas append-only — c'est de l'état opérationnel transitoire, pas un
  log.
- Le `userId` n'a pas de FK explicite ici (perf : on évite un join sur
  `auth_users` à chaque check) — `onDelete: NoAction` est suffisant
  puisque les buckets expirés sont nettoyés par job cron.
- Job cron périodique (`pg_cron` ou job applicatif quotidien) supprime
  les buckets dont `windowEndsAt < NOW() - INTERVAL '7 days'`.
- `stepup_totp` est **scope-par-session** : un attaquant qui consomme
  les 3 tentatives dans sa session ne bloque PAS les sessions légitimes
  du même user dans d'autres onglets/devices. Lors d'un `DELETE FROM
  auth_sessions WHERE userId = ?` (reset admin / device change), un
  trigger applicatif (PAS BD) supprime aussi les buckets `stepup_totp`
  des sessions disparues.

---

## Transitions d'état

### Cycle de vie d'un `MfaSecret`

```text
[créé par EnrollTotpUseCase, enabledAt=null]
    │
    │ user confirme premier code TOTP (US1)
    ▼
[enabledAt=NOW, lastUsedAt=NOW]
    │
    │ utilisations normales (login, step-up) → mise à jour lastUsedAt
    │
    ├─── reset admin (US4) ────────────┐
    │                                   │
    ├─── device change (US6) ──────────┤
    │                                   │
    └─── effacement Loi 25 (futur) ────┘
                                        │
                                        ▼
                                    [DELETE]
```

### Cycle de vie d'un `MfaBackupCode`

```text
[généré dans batch B1, position 1..10, usedAt=null]
    │
    │ consommé lors d'un login backup (FR-011)
    ▼
[usedAt=NOW]
    │
    │ régénération (FR-015) → tous les codes de B1 supprimés, B2 créé
    │   OU
    │ device change / reset → tous les codes supprimés via cascade
    ▼
[DELETE]
```

---

## Validation & contraintes au-delà du schéma

Implémentées dans `packages/mfa/src/schemas.ts` (Zod) consommé par
`apps/api` et `apps/web` :

- `enrollmentRequestId` : UUID v4 strict.
- Code TOTP saisi : exactement 6 chiffres `^[0-9]{6}$`.
- Backup code saisi : format `^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$`
  (alphabet sans 0, O, 1, I, L pour éviter les confusions visuelles ;
  10 caractères significatifs, casse forcée en majuscules à la
  normalisation côté client et au stockage).
- Justification reset admin (FR-023) : `min(20).max(1000)` caractères.
- IP source abrégée stockée : transformée par `packages/legal`
  `maskIpAddress()` réutilisé (livré par 004 — dépendance acceptée
  puisque c'est une utilité pure réutilisable). Si 004 n'est pas merged
  au moment de 005, on copie la fonction dans `packages/mfa/`
  temporairement avec note de dédoublonnage à supprimer post-merge.

---

## Concurrence et atomicité

Trois opérations critiques exigent une atomicité explicite au niveau BD
pour éviter des race conditions exploitables.

### 1. Incrément du compteur de rate limit (P0-2)

Deux requêtes parallèles pour le même `(userId, kind, sessionId)` ne
doivent pas pouvoir lire `attempts=4`, incrémenter chacune à 5, et
écrire 5 (perte de l'une des deux incrémentations).

**Pattern atomique en une seule requête SQL** (utilisé par
`MfaRateLimiter.recordAttempt()`) :

```sql
INSERT INTO mfa_rate_limit_buckets
  (id, "userId", kind, "sessionId", "windowStartedAt", "windowEndsAt", attempts)
VALUES
  (gen_random_uuid(), $1, $2, $3, NOW(), NOW() + $4::interval, 1)
ON CONFLICT (...)  -- index unique sur (userId, kind, sessionId)
DO UPDATE SET
  attempts    = mfa_rate_limit_buckets.attempts + 1,
  lockedUntil = CASE
    WHEN mfa_rate_limit_buckets.attempts + 1 >= $5
    THEN NOW() + $6::interval
    ELSE mfa_rate_limit_buckets.lockedUntil
  END,
  updatedAt   = NOW()
WHERE mfa_rate_limit_buckets."windowEndsAt" > NOW()  -- pas d'incrément sur bucket expiré
RETURNING attempts, lockedUntil;
```

Si le `WHERE` exclut la ligne (bucket expiré), on fait un second INSERT
... ON CONFLICT pour démarrer une fenêtre fraîche. Encapsulé dans un
helper du repository, jamais en deux requêtes séparées côté
application.

### 2. Consommation atomique d'un backup code (P0-5)

Deux requêtes parallèles soumettant le même code clair ne doivent pas
pouvoir réussir toutes les deux.

**Pattern** :

1. `SELECT id, codeHash FROM mfa_backup_codes WHERE mfaSecretId = $1
   AND usedAt IS NULL` — récupère les candidats.
2. Pour chaque candidat : `await bcrypt.compare(submitted, codeHash)`.
3. Sur match : `UPDATE mfa_backup_codes SET usedAt = NOW() WHERE id =
   $matchedId AND usedAt IS NULL RETURNING id;`
4. Si `rowCount === 0` (l'autre requête a gagné la course) → traiter
   comme code invalide, incrémenter le bucket.
5. Si `rowCount === 1` → succès.

Cette implémentation est obligatoire pour `VerifyBackupCodeUseCase`. Un
test d'intégration Testcontainers (`backup-code-concurrency.test.ts`)
DOIT vérifier que 2 requêtes parallèles ne consomment pas le même code
deux fois.

### 3. Supersede d'un `MfaSecret` pendant (P0-1)

À `/enroll/start`, l'opération doit être atomique :

```typescript
await prisma.$transaction(async (tx) => {
  await tx.mfaSecret.deleteMany({
    where: { userId, enabledAt: null }
  });
  return tx.mfaSecret.create({
    data: { userId, encryptedSecret, enrollmentRequestId, ... }
  });
});
```

Combiné avec l'index partiel `WHERE enabledAt IS NOT NULL`, cela
garantit qu'on ne supprime jamais un secret déjà actif et qu'on ne crée
jamais deux secrets pending en parallèle (la seconde transaction
attendra le verrou puis verra que la première a déjà DELETE/INSERT).

---

## Migration Prisma

**Ordre** :
1. `20260526000000_init_mfa/migration.sql` — création des tables
   `mfa_secrets`, `mfa_backup_codes`, `mfa_audit_events`,
   `mfa_rate_limit_buckets` et des enums.
2. `20260526000001_init_mfa_immutability/migration.sql` — triggers
   append-only sur `mfa_audit_events` + REVOKE TRUNCATE.

**Rollback** : DROP TABLE en ordre inverse. Aucun impact sur le schéma
`auth.prisma` (aucune ALTER TABLE sur les tables existantes).

**Shadow DB compat** : les `REVOKE` sont wrappés dans des `DO $$ ... END
$$` avec vérification d'existence du rôle (pattern établi par 004,
migration 20260525180002).

---

## Index et performance

Tous les accès chauds passent par les index suivants (estimés couvrir
99 % des requêtes au volume cible) :
- `mfa_secrets(userId)` : recherche par user au login → constant time.
- `mfa_backup_codes(mfaSecretId, usedAt)` : compter codes restants
  (FR-012), trouver un code non consommé à vérifier → constant time.
- `mfa_audit_events(targetUserId, occurredAt)` : historique d'un user.
- `mfa_audit_events(eventType, occurredAt)` : agrégats par type pour
  observabilité.
- `mfa_rate_limit_buckets(userId, kind)` UNIQUE : lookup direct du
  bucket actif d'un user.

Aucun table scan au régime nominal. Test d'EXPLAIN ANALYZE prévu dans
les tests d'intégration (assertions `executionTime < 50 ms` sur des
fixtures à 500 conseillers).
