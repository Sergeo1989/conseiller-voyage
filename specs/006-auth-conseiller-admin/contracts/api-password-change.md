# Contrat — `POST /api/auth/password-change`

**User Story** : US6 — Changement de mot de passe authentifié (P2)
**FR couverts** : FR-023 à FR-026

## Auth

Authentifié (AuthGuard 002a) + step-up MFA frais si MFA actif (StepUpGuard 002a).

## Payload requête

```typescript
{
  currentPassword: string,
  newPassword: string,           // soumis à validatePasswordPolicy()
  newPasswordConfirmation: string, // doit être strictement === newPassword
}
```

## Réponses

### Succès

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "message": "Votre mot de passe a été changé. Les autres sessions actives ont été déconnectées.",
  "sessionsRevokedCount": <number>  // hors session courante
}
```

### Erreur mot de passe actuel incorrect

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "code": "INVALID_CURRENT_PASSWORD" }
```

Compteur de lockout `account` incrémenté (réutilise le même bucket que le login).

### Erreur nouveau mot de passe identique à l'ancien

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{ "code": "PASSWORD_REUSE" }
```

### Erreur politique mot de passe

```http
HTTP/1.1 400 Bad Request

{ "code": "VALIDATION_FAILED", "errors": [...] }
```

### Erreur step-up MFA exigé (intercepté par StepUpGuard avant le use case)

```http
HTTP/1.1 401 Unauthorized

{ "code": "STEP_UP_REQUIRED" }
```

Le frontend ouvre le modal step-up (composant existant 002a), récupère le code TOTP, le valide, puis ré-essaie la requête.

## Side effects (cas succès)

Transaction Postgres atomique :

1. `bcrypt.compare(base64(sha256(currentPassword)), currentHash)` — si false → 401 + incrément bucket login_account.
2. `bcrypt.compare(base64(sha256(newPassword)), currentHash)` — si true → 400 PASSWORD_REUSE.
3. UPDATE `auth_accounts` SET `password_hash = bcrypt(base64(sha256(newPassword)), cost=11)` WHERE `userId = ?` AND `provider='credentials'`.
4. DELETE `auth_sessions` WHERE `userId = ?` AND `sessionToken != currentSessionToken` (FR-025 — autres sessions).
5. DELETE `auth_login_lockout_buckets` WHERE `kind='login_account'` AND `accountId=userId` (clean lockout).
6. INSERT `auth_outbox_emails` { templateKind=password_changed, payload={firstName, changedAt} }.
7. INSERT `auth_audit_events` { eventType=password_changed_self, targetUserId, actorIp, metadata={ sessionsRevokedCount } }.

## Tests d'intégration

- ✅ Change nominal (current valide + new conforme + MFA frais) → 200 + UPDATE + DELETE autres sessions + audit + outbox confirmation
- ✅ Current invalide → 401 INVALID_CURRENT_PASSWORD + bucket account incrémenté
- ✅ 5e échec current → 423 ACCOUNT_LOCKED + audit login_locked
- ✅ New = current → 400 PASSWORD_REUSE
- ✅ New < 12 chars → 400 VALIDATION_FAILED
- ✅ MFA actif et pas de step-up frais → 401 STEP_UP_REQUIRED (avant le use case)
- ✅ Session courante préservée, autres révoquées (vérifier sessionsRevokedCount = sessions du user - 1)
