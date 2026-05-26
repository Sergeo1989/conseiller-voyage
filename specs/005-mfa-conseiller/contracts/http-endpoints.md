# Contrat HTTP : endpoints MFA (`apps/api`)

Tous les endpoints sont préfixés `/api/mfa` (router NestJS), montés sur
Fastify ca-central-1. Authentification via `AuthGuard` (cookie session
Auth.js v5) sauf indication. Toutes les entrées sont validées par Zod.

---

## Enrôlement

### `POST /api/mfa/enroll/start`

Démarre un flow d'enrôlement TOTP. Génère un secret TOTP, le chiffre,
crée un `MfaSecret` avec `enabledAt = null` et retourne le QR code (SVG)
+ secret texte copiable + 10 codes de récupération en clair (UNIQUE
moment où ils sont visibles côté serveur).

- **Auth** : `AuthGuard` (user authentifié)
- **Rate limit** : bucket `enroll_start`, **10 starts max par heure**
  par user (P1-1, anti-DoS). Au-delà → `429 RATE_LIMITED`.
- **Body** :
  ```typescript
  { enrollmentRequestId: string /* UUID v4 client-généré */ }
  ```
- **Response 200** :
  ```typescript
  {
    qrCodeSvg: string,        // SVG inline
    secretBase32: string,     // pour saisie manuelle
    backupCodes: string[],    // 10 codes clairs XXXX-XXXX-XX (one-shot)
    enrollmentRequestId: string,
    expiresAt: string         // ISO 8601, 15 min après création
  }
  ```
- **Sémantique de supersede** (P0-1 — révision design) : un nouvel
  appel **invalide tout `MfaSecret` pendant** (`enabledAt IS NULL`) de
  ce user et en crée un nouveau. Les anciens backup codes affichés
  cessent d'être valides — l'UX côté `apps/web` DOIT prévenir
  l'utilisateur avec un confirm dialog si un secret pendant existe déjà
  (`409 PENDING_ENROLLMENT_EXISTS` retourné en mode `?dryRun=true` ; si
  l'utilisateur confirme, retry sans `dryRun` exécute le supersede).
  L'`enrollmentRequestId` sert uniquement à tracer un essai pour
  l'audit, **pas** à fournir une idempotence cryptographique
  impossible.
- **Atomicité** : la suppression des secrets pendants et l'insertion du
  nouveau s'exécutent dans une seule transaction Postgres (cf.
  `data-model.md` § Concurrence n°3).
- **Erreurs** :
  - `409 ALREADY_ENROLLED` : l'utilisateur a déjà un `MfaSecret` actif
    (`enabledAt IS NOT NULL`). Doit passer par US6 (device change) ou
    US4 (reset admin).
  - `409 PENDING_ENROLLMENT_EXISTS` (uniquement avec `?dryRun=true`) :
    un secret pendant existe ; le frontend doit demander confirmation
    avant retry.
  - `429 RATE_LIMITED` : limite de 10/h dépassée.

### `POST /api/mfa/enroll/confirm`

Active définitivement le secret TOTP après vérification du premier code.

- **Auth** : `AuthGuard`
- **Body** :
  ```typescript
  {
    enrollmentRequestId: string,
    totpCode: string,  // ^[0-9]{6}$
    backupCodesAcknowledged: true  // FR-006
  }
  ```
- **Response 200** :
  ```typescript
  { enabled: true, enabledAt: string }
  ```
- **Side effects** :
  - `MfaSecret.enabledAt = NOW()`
  - `AuthSession.mfaVerifiedAt = NOW()` pour la session courante
  - `MfaAuditEvent { eventType: 'mfa_enrolled', actorUserId = targetUserId = user.id }`
- **Erreurs** :
  - `400 INVALID_TOTP` : code TOTP refusé
  - `400 BACKUP_CODES_NOT_ACKNOWLEDGED` : checkbox FR-006 non cochée
  - `404 ENROLLMENT_NOT_FOUND` : `enrollmentRequestId` inconnu

---

## Vérification au login

### `POST /api/mfa/verify`

Vérifie un code TOTP saisi sur l'écran post-login (avant accès au tableau
de bord).

- **Auth** : `AuthGuard`, exige `MfaSecret.enabledAt IS NOT NULL`
- **Body** :
  ```typescript
  { totpCode: string }
  ```
- **Response 200** :
  ```typescript
  { verifiedAt: string }
  ```
- **Side effects** :
  - `AuthSession.mfaVerifiedAt = NOW()` pour la session courante
  - `MfaSecret.lastUsedAt = NOW()`
  - `MfaAuditEvent { eventType: 'mfa_login_verified' }`
- **Erreurs** :
  - `400 INVALID_TOTP` : code refusé. Incrémente le bucket `login_totp`.
  - `429 LOCKED` : 5 échecs en 5 min → verrouillage 15 min (FR-013).
    Side effect : `MfaAuditEvent { eventType: 'mfa_login_locked' }` +
    courriel notification.

### `POST /api/mfa/verify-backup-code`

Vérifie un code de récupération en lieu et place du TOTP (FR-010).

- **Auth** : `AuthGuard`, exige `MfaSecret.enabledAt IS NOT NULL`
- **Body** :
  ```typescript
  { backupCode: string }
  ```
- **Response 200** :
  ```typescript
  {
    verifiedAt: string,
    remainingCount: number,
    warnLowCodes: boolean    // true si < 3 restants (FR-012)
  }
  ```
- **Consommation atomique** (P0-5) : le use case DOIT marquer le code
  consommé via un `UPDATE mfa_backup_codes SET usedAt = NOW() WHERE id
  = $matched AND usedAt IS NULL RETURNING id`. Si `rowCount === 0`
  (race perdue), traiter comme `INVALID_BACKUP_CODE`. Cf. `data-model.md`
  § Concurrence n°2 et test `backup-code-concurrency.test.ts`.
- **Side effects** :
  - `MfaBackupCode.usedAt = NOW()` sur le code matched (atomique)
  - `AuthSession.mfaVerifiedAt = NOW()`
  - `MfaAuditEvent { eventType: 'mfa_backup_code_consumed', method: 'backup_code' }`
- **Erreurs** :
  - `400 INVALID_BACKUP_CODE` : code refusé OU course concurrente perdue
    (indistinguable côté client, par design). Bucket `login_totp`
    incrémenté.
  - `429 LOCKED` : même politique que `/verify`.

---

## Step-up

### `POST /api/mfa/step-up`

Re-authentifie l'utilisateur en cours de session pour autoriser une
action sensible (FR-017 / FR-018).

- **Auth** : `AuthGuard`
- **Body** :
  ```typescript
  {
    totpCode: string,
    intendedAction: string  // libellé fonctionnel pour audit (« accept_lead », « approve_dossier », etc.)
  }
  ```
- **Response 200** :
  ```typescript
  { verifiedAt: string }
  ```
- **Side effects** :
  - `AuthSession.mfaVerifiedAt = NOW()`
  - `MfaAuditEvent { eventType: 'mfa_stepup_verified', metadata: { intendedAction } }`
- **Erreurs** :
  - `400 INVALID_TOTP` : incrémente le bucket `stepup_totp` (par
    session, pas par user, cf. edge case spec).
  - `401 SESSION_KILLED` : 3 échecs consécutifs dans la même session →
    invalidation session + courriel FR-020a + audit
    `mfa_stepup_session_killed`.

---

## Auto-service utilisateur

### `POST /api/mfa/regenerate-backup-codes`

Régénère un nouveau lot de 10 codes ; invalide l'ancien lot (FR-014,
FR-015). Exige step-up préalable (cf. FR-017 enrichie).

- **Auth** : `AuthGuard` + `StepUpGuard` (session MFA-frais)
- **Body** :
  ```typescript
  { idempotencyKey: string /* UUID v4 */ }
  ```
- **Response 200** :
  ```typescript
  { backupCodes: string[] /* 10 codes clairs one-shot */ }
  ```
- **Side effects** :
  - DELETE des anciens codes du `mfaSecretId` cible
  - INSERT des 10 nouveaux codes hashés
  - `MfaAuditEvent { eventType: 'mfa_backup_codes_regenerated_self' }`

### `POST /api/mfa/change-device/start`

Démarre le changement de device self-service (US6). Re-authentifie sur
mot de passe + (TOTP ancien OU backup code).

- **Auth** : `AuthGuard` + `MfaSecret.enabledAt IS NOT NULL`
- **Body** :
  ```typescript
  {
    password: string,
    secondFactor:
      | { kind: 'totp'; code: string }
      | { kind: 'backup_code'; code: string },
    enrollmentRequestId: string  // UUID v4 pour le nouveau secret
  }
  ```
- **Response 200** : même payload que `/enroll/start` (QR + secret +
  nouveaux backup codes).
- **Side effects** :
  - Vérification mot de passe (via Auth.js hash compare, hors-scope
    002 → délégation)
  - Vérification du second facteur via le port approprié
  - **Suppression atomique** de l'ancien `MfaSecret` + cascade backup
    codes
  - **DELETE FROM auth_sessions WHERE userId = ? AND sessionToken != ?**
    (révoque toutes les sessions sauf la courante, FR-015b)
  - Création du nouveau `MfaSecret` avec `enabledAt = null`
  - `MfaAuditEvent { eventType: 'mfa_device_changed_self', method }`
  - Courriel transactionnel FR-015e
- **Erreurs** :
  - `401 INVALID_CREDENTIALS` : mot de passe refusé
  - `400 INVALID_SECOND_FACTOR` : code refusé

Le flow d'activation utilise ensuite `/enroll/confirm` comme pour un
enrôlement initial.

### `GET /api/mfa/me/summary`

Retourne un résumé non sensible de l'état MFA, **sans step-up**. Utilisé
par la page `/parametres/mfa` au mount pour décider d'afficher
l'invitation au step-up.

- **Auth** : `AuthGuard`
- **Response 200** :
  ```typescript
  {
    enabled: boolean,
    enrolledAt: string | null
  }
  ```

### `GET /api/mfa/me/details`

Détails complets sensibles (compteurs précis, dernière utilisation).
Exige une session « MFA frais ».

- **Auth** : `AuthGuard` + `StepUpGuard` (FR-017)
- **Response 200** :
  ```typescript
  {
    enabled: boolean,
    enrolledAt: string | null,
    lastUsedAt: string | null,
    backupCodesRemaining: number,
    warnLowCodes: boolean,
    batchId: string | null
  }
  ```

**Note (P1-4 review)** : la séparation summary/details résout le
chicken-and-egg « il faut savoir qu'on est enrôlé avant de pouvoir
faire step-up », tout en gardant les détails sensibles (compteur de
codes, batch ID utile à un attaquant pour cibler une régénération)
derrière le step-up.

---

## Reset MFA admin

### `POST /api/mfa/admin/reset`

Un admin réinitialise le MFA d'un utilisateur cible (conseiller ou autre
admin), conformément à US4.

- **Auth** : `AuthGuard` + `RoleGuard('admin')` + `StepUpGuard`
- **Body** :
  ```typescript
  {
    targetUserId: string,        // UUID
    justification: string,       // min(20).max(1000)
    idempotencyKey: string       // UUID v4
  }
  ```
- **Headers** : `Idempotency-Key: <UUID>` (header HTTP, valeur identique
  au champ body).
- **Idempotence avec binding payload** (P1-2) : la clé d'idempotence est
  stockée côté serveur (`idempotency_keys` table partagée avec 001) avec
  le hash SHA-256 du `(targetUserId || justification)`. Un replay avec
  la même clé mais un payload différent → `409 IDEMPOTENCY_KEY_CONFLICT`.
  Un replay avec la même clé et même payload → retourne la réponse
  cachée (TTL 24h). Empêche un attaquant de réutiliser une clé valide
  capturée pour reset un autre utilisateur.
- **Response 200** :
  ```typescript
  { resetAt: string }
  ```
- **Side effects** :
  - DELETE du `MfaSecret` cible (cascade backup codes)
  - DELETE de toutes les sessions de la cible (FR-024a)
  - DELETE des buckets `mfa_rate_limit_buckets` avec `sessionId` dans
    les sessions supprimées (P0-3, cohérence des compteurs step-up)
  - `MfaAuditEvent { eventType: 'mfa_reset_by_admin', actorUserId, targetUserId, targetRole, justification }`
  - Courriel transactionnel FR-026 à la cible
  - Invalidation du cache `cv_active_admins_total` si `targetRole === 'admin'`
- **Erreurs** :
  - `400 SELF_RESET_FORBIDDEN` : `targetUserId === actorUserId` (FR-022a)
  - `400 INVALID_JUSTIFICATION` : `< 20` caractères
  - `404 TARGET_NOT_FOUND` : utilisateur cible introuvable
  - `409 TARGET_NOT_ENROLLED` : la cible n'a pas de MFA actif (rien à
    reset)
  - `409 IDEMPOTENCY_KEY_CONFLICT` : clé déjà utilisée avec un payload
    différent

### `GET /api/admin/active-admins-count`

Compteur d'admins actifs (FR-026a).

- **Auth** : `AuthGuard` + `RoleGuard('admin')`
- **Response 200** :
  ```typescript
  { activeAdminsCount: number }
  ```
- Cache 60 s côté serveur (R10).

---

## Observabilité

### `GET /api/mfa/health`

Sonde de santé.

- **Auth** : aucune (endpoint interne ECS health check)
- **Response 200** :
  ```typescript
  {
    crypto: 'ok' | 'fail',     // déchiffrement test vector
    db: 'ok' | 'fail',         // ping Prisma
    rateLimit: 'ok' | 'fail'   // accès table mfa_rate_limit_buckets
  }
  ```
- **Response 503** si l'une des checks échoue.

---

## Schémas Zod partagés

Tous dans `packages/mfa/src/schemas.ts`, exportés et importés par les
contrôleurs NestJS ainsi que les Server Actions Next.js :

```typescript
export const TotpCodeSchema = z.string().regex(/^[0-9]{6}$/);
export const BackupCodeSchema = z.string().regex(
  /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{2}$/
);
export const JustificationSchema = z.string().min(20).max(1000);
export const UuidV4Schema = z.string().uuid();
export const IntendedActionSchema = z.enum([
  'accept_lead', 'reject_lead', 'read_brief', 'export_data',
  'modify_notif_settings', 'delete_account',
  'approve_dossier', 'reject_dossier', 'suspend_advisor',
  'revoke_advisor', 'declare_license_withdrawal',
  'reset_advisor_mfa', 'read_audit_log',
  'regenerate_backup_codes', 'manage_mfa_settings',
]);
```
