# Contrat : Événements d'audit MFA

Référence canonique des types d'événements écrits dans `mfa_audit_events`.
Le champ `metadata` JSON est libre ; sa structure est figée par type
ci-dessous.

---

## `mfa_enrollment_started`

Émis au début d'un flow d'enrôlement (POST `/enroll/start`).

- `actorUserId` = `targetUserId` = user qui s'enrôle
- `actorIp` : IP abrégée
- `metadata`:
  ```json
  { "enrollmentRequestId": "<uuid>" }
  ```

## `mfa_enrolled`

Émis après confirmation du premier code TOTP.

- `actorUserId` = `targetUserId` = user
- `actorIp`
- `method`: `totp`
- `metadata`:
  ```json
  { "enrollmentRequestId": "<uuid>", "backupCodesGenerated": 10 }
  ```

## `mfa_enrollment_cancelled`

Émis si l'utilisateur abandonne l'enrôlement (timeout 15 min après
`start` ou navigation hors flow). Peut être détecté par job cron qui
purge les `MfaSecret.enabledAt IS NULL` âgés de > 15 min.

- `actorUserId` = `targetUserId` = user
- `metadata`:
  ```json
  { "enrollmentRequestId": "<uuid>", "reason": "timeout" | "user_cancel" }
  ```

---

## `mfa_login_verified`

Vérification TOTP ou backup code au login post-mdp.

- `actorUserId` = `targetUserId` = user
- `actorIp`
- `method`: `totp` | `backup_code`

## `mfa_login_failed`

Échec d'une tentative TOTP/backup au login.

- `actorUserId` = null (l'auteur n'est pas authentifié à ce stade — la
  validation se fait sur un session token valide mais sans MFA frais)
- `targetUserId` = user dont le code est échoué
- `actorIp`
- `method`: `totp` | `backup_code`
- `metadata`:
  ```json
  { "attemptsInWindow": 3, "windowDurationSec": 300 }
  ```

## `mfa_login_locked`

Émis quand un user atteint 5 échecs en 5 min — lockout 15 min.

- `targetUserId` = user verrouillé
- `metadata`:
  ```json
  { "lockedUntil": "<iso>", "durationSec": 900 }
  ```

## `mfa_login_unlocked`

Émis quand le bucket expire et que le user peut retenter. Job cron ou
calcul à la volée au prochain check.

- `targetUserId` = user
- `metadata`:
  ```json
  { "previousLockEndedAt": "<iso>" }
  ```

---

## `mfa_stepup_verified`

Step-up TOTP réussi pour une action sensible.

- `actorUserId` = `targetUserId` = user
- `actorIp`
- `method`: `totp`
- `metadata`:
  ```json
  { "intendedAction": "accept_lead" | "..." }
  ```

## `mfa_stepup_failed`

Échec dans un modal step-up.

- `actorUserId` = `targetUserId` = user (l'attaquant potentiel agit sur
  la session du user)
- `actorIp`
- `metadata`:
  ```json
  {
    "intendedAction": "accept_lead",
    "attemptsInModal": 2
  }
  ```

## `mfa_stepup_session_killed`

3 échecs consécutifs dans un même modal step-up. Le courriel
transactionnel FR-020a est envoyé.

- `targetUserId` = user
- `actorIp`
- `metadata`:
  ```json
  {
    "intendedAction": "accept_lead",
    "sessionId": "<session_uuid>",
    "notificationSent": true
  }
  ```

---

## `mfa_backup_code_consumed`

Émis quand un backup code est utilisé pour un login (déjà couvert par
`mfa_login_verified` avec `method: 'backup_code'`, mais on émet aussi
cet événement spécifique pour faciliter le filtrage et l'alerting).

- `targetUserId` = user
- `actorIp`
- `metadata`:
  ```json
  {
    "remainingCount": 7,
    "batchId": "<uuid>",
    "position": 4
  }
  ```

## `mfa_backup_codes_regenerated_self`

User régénère ses propres backup codes (FR-014).

- `actorUserId` = `targetUserId` = user
- `actorIp`
- `metadata`:
  ```json
  {
    "previousBatchId": "<uuid>",
    "newBatchId": "<uuid>",
    "consumedCodesInPreviousBatch": 3
  }
  ```

## `mfa_backup_codes_warning_low`

Émis quand `remainingCount` passe de 3 → 2 (bannière déclenchée FR-012).
Au plus 1 par batch.

- `targetUserId` = user
- `metadata`:
  ```json
  { "remainingCount": 2, "batchId": "<uuid>" }
  ```

---

## `mfa_device_changed_self`

US6 — changement de device self-service.

- `actorUserId` = `targetUserId` = user
- `actorIp`
- `method`: `totp` | `backup_code` (second facteur utilisé)
- `metadata`:
  ```json
  {
    "previousMfaSecretId": "<uuid>",
    "newEnrollmentRequestId": "<uuid>",
    "sessionsRevokedCount": 3
  }
  ```

---

## `mfa_reset_by_admin`

US4 — reset MFA par un admin.

- `actorUserId` = admin acteur
- `targetUserId` = user reset
- `targetRole`: `conseiller` | `admin`
- `actorIp` : IP de l'admin
- `justification` : texte intégral (≥ 20 chars, FR-023)
- `metadata`:
  ```json
  {
    "previousMfaSecretId": "<uuid>",
    "sessionsRevokedCount": 1,
    "warningDisplayedLastAdmin": false,
    "idempotencyKey": "<uuid>"
  }
  ```

Note : `warningDisplayedLastAdmin = true` quand `targetRole = 'admin'`
ET le compteur d'admins actifs valait 2 avant l'action (FR-026b).

---

## `mfa_secret_anonymized`

Émis lors d'un effacement Loi 25 (feature 023 future). Le `MfaSecret` et
les `MfaBackupCode` sont supprimés, et un événement résiduel rompt
l'identité dans le journal d'audit (cohérent avec le pattern 004
ADR-0008).

- `actorUserId` = null (job système ou admin)
- `targetUserId` = null (anonymisé)
- `metadata`:
  ```json
  {
    "anonymizedSubjectHash": "<sha256-hex>",
    "previousMfaSecretId": "<uuid>",
    "deletedBackupCodesCount": 7
  }
  ```

---

## Garanties cross-event

- Tous les événements sont écrits avec `occurredAt = NOW()` côté BD —
  jamais avec une valeur supplied par l'app.
- Aucun événement ne contient le secret TOTP en clair, le code TOTP
  saisi, ou un backup code en clair, dans aucun champ.
- L'IP source (`actorIp`) est **abrégée** à l'insertion via le port
  `IpMaskerPort` partagé avec 004.
- La table est append-only (cf. data-model.md, triggers Postgres).

---

## Évolution future

Si on ajoute passkey/WebAuthn (out-of-scope MVP), de nouveaux types
seront ajoutés :
- `mfa_passkey_enrolled`
- `mfa_passkey_verified`
- `mfa_passkey_removed`

Sans casser les consommateurs existants (enum Postgres extensible).
