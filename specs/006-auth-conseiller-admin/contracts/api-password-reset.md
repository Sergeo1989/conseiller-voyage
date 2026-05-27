# Contrat — `POST /api/auth/password-reset-request` + `POST /api/auth/password-reset`

**User Story** : US5 — Réinitialisation de mot de passe oublié (P2)
**FR couverts** : FR-017 à FR-022

## Endpoint 1 — `POST /api/auth/password-reset-request`

### Auth

Public. Rate-limit indirect : max 3 tokens actifs par compte (vérifié avant INSERT, FR-022).

### Payload requête

```typescript
{ email: string }
```

### Réponses

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "status": "ok",
  "message": "Si ce courriel existe, vous recevrez un courriel avec un lien pour réinitialiser votre mot de passe."
}
```

Réponse identique que l'email existe ou non — anti-énumération FR-018.

### Side effects (cas où l'email existe)

- Lookup `auth_users` WHERE `email = ?`.
- COUNT `auth_password_reset_tokens` actifs (consumedAt=NULL AND invalidatedAt=NULL AND expiresAt > NOW()) pour ce userId.
- Si count ≥ 3 : SKIP silencieusement, INSERT audit `password_reset_throttled`. Retourne 202.
- Sinon : INSERT `auth_password_reset_tokens` { userId, jwtNonce, expiresAt=NOW()+1h, requestIpHash=sha256(actorIp) }.
- INSERT `auth_outbox_emails` { templateKind=password_reset, payload={token, firstName} }.
- INSERT `auth_audit_events` { eventType=password_reset_requested, targetUserId, actorIp }.

### Side effects (cas anti-énumération — email inexistant)

- Dummy bcrypt + Dummy lookup pour chronométrage constant.
- INSERT audit `password_reset_requested_unknown_user` { actorIp, metadata={ emailHash } }.

---

## Endpoint 2 — `POST /api/auth/password-reset`

### Auth

Public (le token JWT prouve la possession initiale du compte).

### Payload requête

```typescript
{
  token: string,           // JWT HS256 reçu par email
  newPassword: string,     // soumis à validatePasswordPolicy()
}
```

### Réponses

#### Succès

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "message": "Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.",
  "sessionsRevokedCount": <number>
}
```

#### Erreur token invalide / expiré / consommé / invalidé

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{ "code": "INVALID_OR_EXPIRED_TOKEN" }
```

#### Erreur politique mot de passe

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "code": "VALIDATION_FAILED",
  "errors": [{ "field": "newPassword", "code": "PASSWORD_TOO_SHORT" | ... }]
}
```

### Side effects (cas succès)

Une transaction Postgres atomique :

1. Vérif JWT signature + purpose=`password_reset` + exp > NOW.
2. Lookup `auth_password_reset_tokens` WHERE `jwtNonce = ?` AND `consumedAt IS NULL` AND `invalidatedAt IS NULL` AND `expiresAt > NOW()`. Si non trouvé → 400.
3. UPDATE `auth_accounts` SET `password_hash = bcrypt(base64(sha256(newPassword)), cost=11)` WHERE `userId = ?` AND `provider = 'credentials'`.
4. UPDATE `auth_password_reset_tokens` SET `consumedAt = NOW()` WHERE `id = ?` (one-shot).
5. UPDATE `auth_password_reset_tokens` SET `invalidatedAt = NOW()` WHERE `userId = ?` AND `id != consumedTokenId` AND `consumedAt IS NULL` (invalide les autres tokens actifs).
6. DELETE `auth_sessions` WHERE `userId = ?` AND (`sessionToken` IS NULL OR `sessionToken != currentSessionToken`) — préserve la session courante si la requête vient d'un utilisateur connecté (cas rare : reset depuis un onglet ayant une session active, cf. M7 review). Si le caller n'envoie pas de cookie de session valide pour ce user, **toutes** les sessions sont supprimées (cas nominal — reset depuis un appareil non connecté).
7. DELETE `auth_login_lockout_buckets` WHERE `kind = 'login_account'` AND `accountId = userId` (clean lockout).
8. INSERT `auth_outbox_emails` { templateKind=password_changed, payload={firstName, changedAt} }.
9. INSERT `auth_audit_events` { eventType=password_reset_completed, targetUserId, actorIp, metadata={ sessionsRevokedCount, tokenId } }.

### Idempotence

Naturelle via le one-shot du token. Une 2ᵉ tentative avec le même token = 400 INVALID_OR_EXPIRED_TOKEN.

---

## Tests d'intégration

### Endpoint 1

- ✅ Email existant → 202 + INSERT token + outbox + audit
- ✅ Email inexistant → 202 + dummy bcrypt + audit unknown_user (pas d'outbox)
- ✅ 4ᵉ requête sur même compte avec 3 actifs → 202 silencieux + audit throttled
- ✅ Chronométrage existant vs inexistant : écart-type < 50 ms (SC-007)

### Endpoint 2

- ✅ Token valide + nouveau mot de passe conforme → 200 + UPDATE password + DELETE sessions + invalide autres tokens + audit + outbox confirmation
- ✅ Token déjà consommé → 400 INVALID_OR_EXPIRED_TOKEN
- ✅ Token expiré (> 1h) → 400
- ✅ Token avec purpose='email_verification' (cross-purpose) → 400
- ✅ Token avec signature invalide → 400
- ✅ Nouveau mot de passe identique à l'ancien → 400 (refusé par politique post-vérification du hash actuel)
- ✅ Nouveau mot de passe trop court → 400 VALIDATION_FAILED
- ✅ Reset déclenche DELETE sessions du même user (vérifier via session courante éventuellement révoquée)
