# Modèle de données — Auth conseiller + admin (006)

**Phase** : 1
**Plan parent** : [plan.md](plan.md)
**Recherche** : [research.md](research.md)
**Date** : 2026-05-26

Ce document décrit les entités, transitions d'état et migrations Prisma de la feature 002. Le modèle étend le schéma existant `auth.prisma` (AuthUser, AuthAccount, AuthSession, AuthVerificationToken) sans le casser.

---

## Vue d'ensemble

```text
AuthUser (existant)
  ├── AuthAccount (existant + colonne password_hash ajoutée)
  │     [provider='credentials', providerAccountId=email, password_hash=bcrypt]
  ├── AuthSession (existant, durée 30j glissants)
  ├── EmailVerificationToken (NOUVEAU)
  ├── PasswordResetToken (NOUVEAU)
  ├── AdminInvitationToken (NOUVEAU)
  ├── AuthAuditEvent (NOUVEAU, immuable)
  └── (relations 002a MfaSecret, MfaAuditEvent, MfaOutboxEmail conservées)

LoginLockoutBucket (NOUVEAU, table à clé composite, sans relation explicite à AuthUser)

AuthOutboxEmail (NOUVEAU — équivalent fonctionnel de mfa_outbox_emails pour les
                 templates auth_email_verification, auth_password_reset, etc.)
```

---

## Modifications du schéma existant

### `AuthAccount` — ajout de la colonne `password_hash`

```prisma
model AuthAccount {
  // … colonnes existantes (id, userId, type, provider, providerAccountId, etc.)
  password_hash     String?  // NOUVEAU — bcrypt cost 11 sur SHA-256(plaintext), NULL pour comptes non-credentials
  // … relations existantes
}
```

**Invariants DB** :

```sql
-- Un compte credentials DOIT avoir un password_hash.
ALTER TABLE auth_accounts
  ADD CONSTRAINT credential_password_required
    CHECK (provider != 'credentials' OR password_hash IS NOT NULL);

-- Un compte credentials DOIT avoir providerAccountId = email (cf. M1 / C4 de la review).
-- providerAccountId est déjà NOT NULL par schéma.
```

**Index** (déjà existant) : `@@unique([provider, providerAccountId])` couvre le lookup login (email → account).

**Note sur le pré-hash SHA-256 + bcrypt** (cf. C2 de la review architecte) :
La valeur stockée dans `password_hash` est `bcrypt(base64(sha256(plaintext)), cost=11)`.
- Le pré-hash SHA-256 produit toujours 32 octets (44 chars en base64), bien sous la limite 72-byte de bcrypt → support transparent de mots de passe longs ou riches en multi-octets UTF-8.
- bcrypt cost 11 (vs 12 dans le plan initial) : compromis avec la performance de `bcryptjs` pur-JS sur Fargate t4g ARM. Détail dans `research.md` R3b.

### `AuthUser` — ajout de relations vers les nouveaux tokens et outbox

**Note H7 review** : pas de relation vers `auth_audit_events`. La table d'audit est volontairement déconnectée des FK pour résoudre la contradiction Principe IX (audit immuable) × Principe II (effacement Loi 25) — voir section `AuthAuditEvent` ci-dessous + ADR-0012.

```prisma
model AuthUser {
  // … colonnes existantes (id, email, emailVerified, name, image, role, ...)
  
  // NOUVELLES relations (002)
  emailVerificationTokens EmailVerificationToken[]
  passwordResetTokens     PasswordResetToken[]
  authOutboxEmails        AuthOutboxEmail[]
  adminInvitationsSent    AdminInvitationToken[]   @relation("AdminInviter")
  // PAS de relation `authAuditEvents*` — cf. H7 review + ADR-0012
  
  // … relations existantes MFA (002a) conservées
}
```

**Partial unique index sur `auth_users.email`** (cf. C4 / M1 de la review) :

Le schéma existant déclare `email String? @unique` (héritage Auth.js v5 pour permettre des comptes OAuth sans email). Postgres autorise plusieurs `NULL` dans une colonne unique simple. Pour cette feature, on **renforce l'unicité non-NULL** :

```sql
-- Migration : remplacer l'unique simple par un index partiel.
DROP INDEX IF EXISTS "auth_users_email_key";
CREATE UNIQUE INDEX "auth_users_email_unique_not_null"
  ON "auth_users"("email")
  WHERE "email" IS NOT NULL;
```

Sémantique : un email NULL reste autorisé (n'importe combien de comptes OAuth sans email peuvent coexister) ; un email NOT NULL est strictement unique. Côté Prisma, on conserve `@unique` pour la lisibilité du modèle ; la migration manuelle ci-dessus remplace l'index sous-jacent. Documenter dans `prisma/schema/auth.prisma` en commentaire.

---

## Nouvelles entités

### 1. `EmailVerificationToken`

Lien à usage unique de vérification d'email après signup.

```prisma
model EmailVerificationToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  // jwtNonce = même valeur que le claim `nonce` du JWT signé envoyé par email.
  // Sert d'idempotency key one-shot (DELETE de la ligne = invalidation du JWT).
  jwtNonce  String    @unique
  createdAt DateTime  @default(now())
  expiresAt DateTime  // créé à NOW() + 24h
  consumedAt DateTime?  // NULL tant que pas utilisé, NOT NULL après consommation

  user AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt]) // pour le purge job (différé feature 022)
  @@map("auth_email_verification_tokens")
}
```

**Cycle de vie** :

```text
[INSERT, consumedAt=NULL] → [UPDATE consumedAt=NOW()] → [purge job 30j post-consumption]
                       \→  [purge job 30j post-expiry]
```

### 2. `PasswordResetToken`

Lien à usage unique de réinitialisation de mot de passe (TTL 1h, clarification Q1).

```prisma
model PasswordResetToken {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @db.Uuid
  jwtNonce    String    @unique
  createdAt   DateTime  @default(now())
  expiresAt   DateTime  // NOW() + 1h
  consumedAt  DateTime?
  invalidatedAt DateTime?  // NULL ou NOW() si un autre reset l'a invalidé (rate-limit 3 actifs)
  // requestIpHash retiré (cf. M3 review — redondant avec auth_audit_events.actorIp).

  user AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, consumedAt, invalidatedAt]) // pour rate-limit count actifs
  @@index([expiresAt])
  @@map("auth_password_reset_tokens")
}
```

**Invariant rate-limit** (appliqué en use case, pas en DB) :

```sql
-- Avant chaque INSERT, count <= 3 :
SELECT COUNT(*) FROM auth_password_reset_tokens
WHERE userId = $1 AND consumedAt IS NULL AND invalidatedAt IS NULL AND expiresAt > NOW();
```

Si count == 3, l'INSERT est ignoré silencieusement (cf. FR-022).

### 3. `AdminInvitationToken`

Lien à usage unique pour qu'un admin invité choisisse son mot de passe (TTL 72h).

```prisma
model AdminInvitationToken {
  id                String   @id @default(uuid()) @db.Uuid
  // Email du nouvel admin invité, normalisé via normalizeEmail() (cf. H8 / research R9).
  targetEmail       String
  inviterUserId     String   @db.Uuid
  jwtNonce          String   @unique
  createdAt         DateTime @default(now())
  expiresAt         DateTime // NOW() + 72h
  consumedAt        DateTime?
  // À la consommation, on crée AuthUser + AuthAccount (role=admin, password choisi par invité).
  createdAuthUserId String?  @db.Uuid // populated post-consumption pour traçabilité

  // Relation inviter — onDelete: SetNull pour permettre l'effacement Loi 25 du compte
  // de l'invitant tout en préservant la trace que l'invitation a existé (cf. H3 review).
  inviter AuthUser? @relation("AdminInviter", fields: [inviterUserId], references: [id], onDelete: SetNull)

  @@index([targetEmail])
  @@index([expiresAt])
  @@map("auth_admin_invitation_tokens")
}
```

**Pré-vérifications côté `InviteAdminUseCase`** (cf. H6 de la review) :

Avant d'INSERT une ligne, le use case vérifie :

1. `targetEmail` n'existe **pas du tout** dans `auth_users.email` → sinon retourne **`TARGET_EMAIL_ALREADY_REGISTERED`** (HTTP 409). Aucun *upgrade* implicite conseiller → admin n'est supporté pour des raisons d'audit + de cohérence Loi 25.
2. `targetEmail` n'a **pas déjà** d'invitation active (consumedAt IS NULL AND expiresAt > NOW()) → sinon retourne **`INVITATION_ALREADY_ACTIVE`** avec le `expiresAt` existant en payload.
3. L'invitant (`inviterUserId`) n'invite pas son propre email → retourne `SELF_INVITATION_FORBIDDEN`.

### 4. `AuthAuditEvent` — sans FK Prisma (résolution H7 + ADR-0012)

Journal immuable des événements d'authentification. **Append-only** via triggers Postgres (pattern 001 + 002a).

**Choix architectural critique** : pour éviter une contradiction structurelle entre **Principe IX** (audit immuable, triggers Postgres rejetant UPDATE/DELETE/TRUNCATE) et **Principe II** (effacement Loi 25 doit pouvoir supprimer un `AuthUser`), cette table ne pose **AUCUNE FK Prisma** vers `auth_users`. Les colonnes `actorUserId` et `targetUserId` sont des UUID nus (Postgres `Uuid`), sans relation ni cascade.

Conséquences :
- Effacement Loi 25 d'un user (DELETE FROM auth_users WHERE id = ?) ne déclenche aucun UPDATE sur `auth_audit_events` → les triggers `BEFORE UPDATE` ne bloquent pas l'effacement.
- Une trace d'audit référence un `actorUserId` qui peut pointer vers un user supprimé — le lookup retournera 0 row, mais la trace de l'événement reste intacte.
- L'**identifiabilité corrélée** (pendant que le user existe) est préservée via une colonne `actorEmailHash` qui contient `sha256(actorEmail)` au moment de l'événement. Le hash est irréversible côté attaquant, mais permet de corréler tous les événements d'un même utilisateur connu de l'auditeur interne.

ADR à livrer : `docs/adr/0012-audit-vs-loi-25-no-fk-policy.md`.

```prisma
model AuthAuditEvent {
  id              String              @id @default(uuid()) @db.Uuid
  eventType       AuthAuditEventType
  // UUID nu, pas de FK — voir note H7 ci-dessus.
  actorUserId     String?             @db.Uuid
  targetUserId    String?             @db.Uuid
  // Hash SHA-256 (base64) du courriel de l'acteur/cible au moment de l'événement.
  // Permet la corrélation des events d'un même user connu, sans persister le PII clair.
  actorEmailHash  String?             @db.VarChar(64)
  targetEmailHash String?             @db.VarChar(64)
  actorIp         String?             // IP abrégée /24 ou /48 via actor-ip.util.ts
  occurredAt      DateTime            @default(now())
  metadata        Json                // détails contextuels (raison échec, etc.)

  @@index([targetUserId, occurredAt(sort: Desc)])
  @@index([targetEmailHash, occurredAt(sort: Desc)]) // pour corrélation post-effacement
  @@index([eventType, occurredAt(sort: Desc)])
  @@map("auth_audit_events")
}

enum AuthAuditEventType {
  signup
  email_verified
  login_success
  login_failed
  login_locked
  logout
  password_reset_requested
  password_reset_completed
  password_changed_self
  password_change_failed
  admin_bootstrap
  admin_invitation_sent
  admin_invitation_consumed   // remplace le doublon avec admin_created_by_admin (cf. N2)
  admin_created_by_admin      // gardé pour clarté audit Loi 25
}
```

**Triggers append-only** (migration séparée — pattern 001 + 002a) :

```sql
CREATE OR REPLACE FUNCTION reject_auth_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_events est append-only — TG_OP=% rejeté', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_audit_events_no_update
  BEFORE UPDATE ON auth_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_auth_audit_mutation();

CREATE TRIGGER auth_audit_events_no_delete
  BEFORE DELETE ON auth_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_auth_audit_mutation();

CREATE TRIGGER auth_audit_events_no_truncate
  BEFORE TRUNCATE ON auth_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_auth_audit_mutation();
```

**Rétention** : 7 ans (obligation légale, FR-037). Pas de purge automatique côté 002. À la feature 022 (retention sweep), un job archive les events > 7 ans vers stockage froid puis les supprime (la suppression devra emprunter la **procédure exceptionnelle** documentée dans `docs/runbooks/auth-rollback.md` qui DROP temporairement les triggers).

**Procédure de rollback / archivage** (cf. C7 de la review) : `docs/runbooks/auth-rollback.md` documente l'ordre `DROP TRIGGER ... → opération exceptionnelle (DELETE / DROP TABLE) → recréer trigger`. Cette procédure exige une approbation à 4 yeux + audit hors-table avant exécution.

### 5. `LoginLockoutBucket` — colonnes UUID + Bytea typées (H2)

Compteur d'échecs de connexion pour le double bucket (par-compte + par-IP). Réutilise le pattern atomique INSERT ON CONFLICT de 002a.

**Choix de typage colonne** (cf. H2 de la review) : au lieu de `accountKey String?` qui stockerait un UUID en texte (comparaisons lentes sur index), on utilise des colonnes typées Postgres avec invariant XOR :

```prisma
model LoginLockoutBucket {
  id              String              @id @default(uuid()) @db.Uuid
  kind            LoginLockoutKind    // 'login_account' ou 'login_ip' (cf. naming M4 ci-dessous)
  accountId       String?             @db.Uuid    // populated si kind='login_account', NULL sinon
  ipHash          Bytes?              @db.ByteA   // 32 octets SHA-256(actorIp abrégé) si kind='login_ip', NULL sinon
  failureCount    Int                 @default(1)
  windowStartAt   DateTime            @default(now())
  lastFailureAt   DateTime            @default(now())

  @@unique([kind, accountId, ipHash], map: "login_lockout_key_unique")
  @@index([windowStartAt(sort: Desc)])
  @@map("auth_login_lockout_buckets")
}

enum LoginLockoutKind {
  login_account
  login_ip
}
```

**Invariant XOR via CHECK Postgres** (migration manuelle) :

```sql
ALTER TABLE auth_login_lockout_buckets
  ADD CONSTRAINT login_lockout_key_xor CHECK (
    (kind = 'login_account' AND accountId IS NOT NULL AND ipHash IS NULL)
    OR
    (kind = 'login_ip' AND accountId IS NULL AND ipHash IS NOT NULL)
  );
```

**Naming `login_account` / `login_ip`** (cf. M4 de la review) : préfixe `login_` retenu pour extensibilité future (si la même table accueille un jour `signup_ip` ou autre). Le coût est négligeable et l'extension naturelle.

**Pattern atomique** (use case) — adapté aux colonnes typées :

```typescript
// Pour kind='login_account' :
await prisma.$executeRaw`
  INSERT INTO auth_login_lockout_buckets (id, kind, "accountId", "ipHash", "failureCount", "windowStartAt", "lastFailureAt")
  VALUES (gen_random_uuid(), 'login_account', ${userId}::uuid, NULL, 1, NOW(), NOW())
  ON CONFLICT (kind, "accountId", "ipHash") DO UPDATE SET
    "failureCount" = CASE
      WHEN auth_login_lockout_buckets."windowStartAt" < NOW() - INTERVAL '15 minutes'
      THEN 1
      ELSE auth_login_lockout_buckets."failureCount" + 1
    END,
    "windowStartAt" = CASE
      WHEN auth_login_lockout_buckets."windowStartAt" < NOW() - INTERVAL '15 minutes'
      THEN NOW()
      ELSE auth_login_lockout_buckets."windowStartAt"
    END,
    "lastFailureAt" = NOW()
  RETURNING "failureCount", "windowStartAt";
`;

// Pour kind='login_ip' : idem avec ipHash=sha256(actorIp_abridged), interval '1 hour'.
```

**Seuils** :
- `kind='login_account'` : fenêtre 15 min, threshold=5 → si `failureCount >= 5` → bloque.
- `kind='login_ip'` : fenêtre 1 h, threshold=20 → si `failureCount >= 20` → bloque.

Sur **succès de login**, le bucket `login_account` du user est supprimé (`DELETE WHERE kind='login_account' AND accountId = ?`). Le bucket `login_ip` reste (il protège les autres comptes).

### 6. `AuthOutboxEmail`

Table d'outbox pour les courriels transactionnels (vérification, reset, confirmation, invitation admin). Drainée par feature 003 (worker SES). Pattern identique à `mfa_outbox_emails` de 002a.

**Rétention** (cf. H4 de la review) : la table contient des données personnelles dans son `payload` (firstName, email cible). Politique :

- Le worker SES (feature 003) **supprime** la ligne dès envoi confirmé (idempotent, status SES `Sent` ou erreur permanente).
- Pour les erreurs transitoires (rate-limit, panne SES), le row reste avec `attempts` incrémenté + `lastError` rempli ; backoff exponentiel jusqu'à 5 tentatives sur 24h.
- Au-delà de 24h sans envoi réussi, la ligne est archivée vers un cold storage (S3 audit) puis supprimée — Loi 25 ne tolère pas un payload PII vivant indéfiniment.
- Le job de purge / archive vit dans la **feature 022 retention sweep**, pas dans 002. En attendant 022, le worker 003 supprime à l'envoi (le seul chemin nominal).

```prisma
model AuthOutboxEmail {
  id                String              @id @default(uuid()) @db.Uuid
  recipientUserId   String?             @db.Uuid  // NULL pour invitation admin (targetEmail seul)
  recipientEmail    String              // toujours rempli pour permettre le drainage sans jointure
  templateKind      AuthEmailTemplate
  payload           Json                // données pour le template (token, nom, etc.)
  createdAt         DateTime            @default(now())
  sentAt            DateTime?           // NULL tant que pas drainé, NOT NULL après envoi SES
  attempts          Int                 @default(0)
  lastError         String?             @db.Text

  recipientUser AuthUser? @relation(fields: [recipientUserId], references: [id], onDelete: SetNull)

  @@index([sentAt, createdAt]) // index pour le worker SES (003)
  @@map("auth_outbox_emails")
}

enum AuthEmailTemplate {
  email_verification
  password_reset
  password_changed
  admin_invitation
}
```

---

## Transitions d'état du compte (`AuthUser`)

```text
                              ┌──────────────────────────┐
                              │   visiteur anonyme       │
                              └────────┬─────────────────┘
                                       │ POST /api/auth/signup
                                       ▼
              ┌──────────────────────────────────────────┐
              │  AuthUser créé, role=conseiller,         │
              │  emailVerified=NULL                      │
              │  AuthAccount{provider='credentials',     │
              │    password_hash=bcrypt(...)}            │
              │  + EmailVerificationToken émis           │
              │  + AuthOutboxEmail{template:email_verif} │
              └────────┬─────────────────────────────────┘
                       │ GET /api/auth/verify-email?token=...
                       ▼
              ┌──────────────────────────────────────────┐
              │  emailVerified=NOW()                     │
              │  conformiteStatus=pending (001)          │
              │  pas de MFA encore                       │
              └────────┬─────────────────────────────────┘
                       │ Tunnel conformité (feature 001)
                       │ Documents soumis, validés.
                       ▼
              ┌──────────────────────────────────────────┐
              │  conformiteStatus=verified (001)         │
              │  pas de MFA encore                       │
              └────────┬─────────────────────────────────┘
                       │ Login → redirect /mfa/enroll (FR-010)
                       ▼
              ┌──────────────────────────────────────────┐
              │  MfaSecret created+enabled (002a)         │
              │  Compte conseiller pleinement actif      │
              └──────────────────────────────────────────┘

ADMIN (chemin parallèle) :

  bootstrap CLI →  AuthUser{role=admin, emailVerified=NOW, mfaSecrets=[]}  
                 + AuthAccount{provider='credentials', password_hash=bcrypt(...)}
                 + AuthAuditEvent{type='admin_bootstrap', actorUserId=NULL}
                                       │
                                       │ Premier login → redirect /admin/mfa/enroll (FR-011)
                                       ▼
                              MfaSecret created+enabled (002a)
                              Compte admin pleinement actif
```

**Invariants** :

1. Un `AuthUser` ne peut pas avoir `mfaSecrets[].enabledAt IS NOT NULL` ET `emailVerified IS NULL` simultanément. Garanti par le redirect post-login (FR-010/011) qui exige `emailVerified` avant `/mfa/enroll`.
2. Un `AuthUser` avec `role='admin'` est créé soit par bootstrap CLI, soit par invitation admin-par-admin. Jamais par self-service signup (FR-001 limite signup à `role='conseiller'`).
3. La colonne `auth_accounts.password_hash` est NOT NULL pour les rows `provider='credentials'` (contrainte CHECK).

---

## Migrations Prisma

Trois migrations sur le pattern 002a + 001 :

### Migration 1 — `20260527000000_init_auth_credentials`

- ALTER `auth_accounts` ADD COLUMN `password_hash TEXT NULL`.
- CREATE CHECK constraint `credential_password_required`.
- CREATE TABLE `auth_email_verification_tokens`.
- CREATE TABLE `auth_password_reset_tokens`.
- CREATE TABLE `auth_admin_invitation_tokens`.
- CREATE TABLE `auth_audit_events` + enum `AuthAuditEventType`.
- CREATE TABLE `auth_login_lockout_buckets` + enum `LoginLockoutKind`.
- CREATE TABLE `auth_outbox_emails` + enum `AuthEmailTemplate`.

### Migration 2 — `20260527000001_auth_audit_immutability`

- CREATE FUNCTION `reject_auth_audit_mutation()`.
- CREATE TRIGGERS sur `auth_audit_events` (UPDATE/DELETE/TRUNCATE).

### Migration 3 — `20260527000002_auth_credentials_grants`

- Pattern DO + format() pour shadow DB compat (P1-7 de 002a, bug_026).
- GRANT `SELECT, INSERT, UPDATE, DELETE` sur les 6 nouvelles tables au rôle `app_conformite` (réutilisation pragmatique, à séparer en `app_identite` plus tard).
- GRANT sur les enums Postgres également.

---

## Index résumé

| Table | Index | Justification |
|---|---|---|
| `auth_users` | `email WHERE email IS NOT NULL` (partial unique, manuel) | Anti-doublon credentials sans bloquer OAuth NULL |
| `auth_accounts` | `@@unique([provider, providerAccountId])` (existant) | Lookup login email→account O(log n) |
| `auth_email_verification_tokens` | `userId`, `expiresAt` | Lookup par user, purge |
| `auth_password_reset_tokens` | `(userId, consumedAt, invalidatedAt)`, `expiresAt` | Rate-limit count actifs, purge |
| `auth_admin_invitation_tokens` | `targetEmail`, `expiresAt` | Lookup par invité, purge |
| `auth_audit_events` | `(targetUserId, occurredAt DESC)`, `(targetEmailHash, occurredAt DESC)`, `(eventType, occurredAt DESC)` | Audit timeline par user vivant, par hash post-effacement, par type |
| `auth_login_lockout_buckets` | `@@unique([kind, accountId, ipHash])`, `windowStartAt DESC` | Atomic upsert, purge |
| `auth_outbox_emails` | `(sentAt, createdAt)` | Worker SES scan |

---

## Validation et règles métier

Au-delà des contraintes DB, voici les invariants appliqués en couche application :

1. **Politique mot de passe** (`packages/auth-domain/src/password-policy.ts`) :
   - Longueur ≥ 12.
   - Au moins 1 minuscule, 1 majuscule, 1 chiffre, 1 symbole.
   - Refus si contient l'email ou le prénom (insensible casse).
2. **Token validation** (`packages/auth-domain/src/single-use-tokens.ts`) :
   - Vérification signature JWT HS256.
   - Vérification `purpose` correspond au flow.
   - Vérification `exp > now`.
   - Lookup DB du `nonce` → ligne existe ET `consumedAt IS NULL` ET `expiresAt > NOW()` ET (pour reset) `invalidatedAt IS NULL`.
3. **Anti-énumération** : voir R5 — dummy bcrypt sur compte inexistant.
4. **Lockout** : voir R4 — atomic upsert Postgres avec fenêtres glissantes.

---

## Effacement Loi 25 (feature 023, hors scope direct)

Quand `EraseUserDataUseCase` (023) est invoqué pour un userId :

1. `DELETE FROM auth_users WHERE id = ?` → cascade automatique vers :
   - `auth_accounts` (CASCADE)
   - `auth_sessions` (CASCADE)
   - `auth_email_verification_tokens` (CASCADE)
   - `auth_password_reset_tokens` (CASCADE)
   - `auth_outbox_emails` (CASCADE — note H4 : déjà drainée par 003)
2. `auth_admin_invitation_tokens.inviterUserId` est mis à NULL via `onDelete: SetNull` (cf. H3). La trace de l'invitation existe encore avec le `targetEmail` ; pour l'effacement strict, 023 fait aussi un UPDATE explicite `SET targetEmail = '<deleted>', payload = '{}'` sur les invitations émises par ou pour ce user.
3. **`auth_audit_events` reste intact** — pas de FK, pas de cascade, pas de UPDATE. Les `actorUserId` / `targetUserId` deviennent des UUID orphelins (lookup retourne 0 row), mais la trace de l'événement et ses métadonnées hashées (`actorEmailHash`, `targetEmailHash`) restent. Conforme au Principe IX (audit immuable) ET au Principe II (PII clair effacé). Voir ADR-0012.

---

## Cohérence avec 001 et 002a

- `AuthUser.role` (enum `AuthRole { voyageur, conseiller, admin }`) existe déjà — pas de changement.
- `AuthUser.emailVerified` (DateTime?) existe déjà via Auth.js v5 schema — pas de changement.
- `conformiteStatus` est posé par la feature 001 sur une autre table (pas sur `auth_users`). Le redirect post-login (FR-010) le lit via `ConformiteQueryPort`.
- `mfaSecrets[]` (002a) reste tel quel. La logique de redirect post-login MFA gating (FR-010/011/012) consomme les ports déjà câblés.

Aucune migration de breaking change. Toutes les nouvelles colonnes/tables sont additives.
