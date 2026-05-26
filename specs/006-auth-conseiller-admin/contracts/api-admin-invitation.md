# Contrat — `POST /admin/users` + `POST /api/auth/admin-invitation-accept`

**User Story** : US7 — Création d'un admin (P2)
**FR couverts** : FR-029, FR-030, FR-031, FR-032

## Endpoint 1 — `POST /admin/users` (invitation par un admin existant)

### Auth

Authentifié + `@RequireRole('admin')` (RoleGuard 002a) + `@UseGuards(StepUpGuard)` (step-up MFA exigé, FR-024 pattern).

Header obligatoire : `Idempotency-Key: <uuid-v4>` (consommé par interceptor Redis 001).

### Payload requête

```typescript
{
  targetEmail: string,    // email du futur admin
  // Pas de firstName/lastName ici — l'invité les saisira en cliquant le lien.
}
```

### Réponses

#### Succès

```http
HTTP/1.1 202 Accepted

{
  "status": "ok",
  "invitationId": "uuid",
  "expiresAt": "ISO8601"
}
```

#### Erreur — courriel cible déjà associé à un compte (conseiller ou admin)

```http
HTTP/1.1 409 Conflict

{ "code": "TARGET_EMAIL_ALREADY_REGISTERED" }
```

Cas applicable si `targetEmail` correspond à un `AuthUser` existant, quel que soit son rôle. Aucun *upgrade* implicite conseiller → admin n'est supporté (cf. H6 review). Pour promouvoir un conseiller en admin, un opérateur doit d'abord supprimer le compte conseiller via la procédure Loi 25 (feature 023) puis ré-inviter le même email.

#### Erreur — invité a déjà une invitation active

```http
HTTP/1.1 409 Conflict

{ "code": "INVITATION_ALREADY_ACTIVE", "expiresAt": "ISO8601" }
```

#### Erreur — admin tente d'inviter son propre email

```http
HTTP/1.1 400 Bad Request

{ "code": "SELF_INVITATION_FORBIDDEN" }
```

### Side effects (cas succès)

- INSERT `auth_admin_invitation_tokens` { targetEmail, inviterUserId=actor.id, jwtNonce, expiresAt=NOW()+72h }.
- INSERT `auth_outbox_emails` { templateKind=admin_invitation, recipientUserId=NULL, recipientEmail=targetEmail, payload={token, inviterName} }.
- INSERT `auth_audit_events` { eventType=admin_invitation_sent, actorUserId=inviter, targetUserId=NULL, metadata={ targetEmail, invitationId, idempotencyKey } }.

---

## Endpoint 2 — flow Accept côté Server Action Next.js (refonte C1)

**Architecture revue post-review C1** : la création de session Auth.js v5 ne peut pas être faite par un endpoint NestJS pur. Le flow Accept est orchestré par une **Server Action Next.js** (`apps/web/src/app/admin/accepter-invitation/[token]/actions.ts`) qui coordonne :

1. **Validation pure du token** côté NestJS via `POST /api/auth/admin-invitation/validate` (idempotent, ne mute rien) — retourne `{ valid: true, targetEmail }` ou `{ valid: false, code: 'INVALID_OR_EXPIRED_TOKEN' }`.
2. **Création du user + account + consommation du token** côté NestJS via `POST /api/auth/admin-invitation/consume` — atomique en transaction.
3. **Ouverture de session** côté Next.js via `signIn('credentials', { email: targetEmail, password })` qui re-vérifie le password (le user vient juste d'être créé avec le password de l'invité) et crée le cookie de session Auth.js v5.
4. **Redirect** côté Server Action vers `/admin/mfa/enroll`.

### Étape 1 — `POST /api/auth/admin-invitation/validate`

**Auth** : Public (le token JWT prouve l'invitation).

**Payload** :

```typescript
{ token: string }
```

**Réponse succès** :

```http
HTTP/1.1 200 OK

{ "valid": true, "targetEmail": "admin2@test.local", "invitationId": "uuid" }
```

**Réponse erreur** :

```http
HTTP/1.1 400 Bad Request

{ "valid": false, "code": "INVALID_OR_EXPIRED_TOKEN" }
```

**Side effects** : aucun. Lookup pur.

### Étape 2 — `POST /api/auth/admin-invitation/consume`

**Auth** : Public (le token est l'authentification).

**Header obligatoire** : `Idempotency-Key: <uuid-v4>` (consommé par interceptor Redis).

**Payload** :

```typescript
{
  token: string,
  firstName: string,
  lastName: string,
  password: string,    // validé par packages/auth-domain/password-policy.ts
  acceptedTerms: true,
  acceptedPrivacyPolicy: true,
}
```

**Réponse succès** :

```http
HTTP/1.1 200 OK

{
  "status": "ok",
  "userId": "uuid",
  "email": "admin2@test.local"
}
```

La Server Action Next.js récupère `userId` + `email` pour enchaîner sur `signIn('credentials', ...)`.

**Réponse erreur token** :

```http
HTTP/1.1 400 Bad Request

{ "code": "INVALID_OR_EXPIRED_TOKEN" }
```

**Réponse erreur politique** :

```http
HTTP/1.1 400 Bad Request

{ "code": "VALIDATION_FAILED", "errors": [...] }
```

**Side effects (cas succès)** — transaction atomique :

1. Vérif JWT signature + `purpose='admin_invitation'` + exp > NOW.
2. Lookup `auth_admin_invitation_tokens` WHERE `jwtNonce = ?` AND `consumedAt IS NULL` AND `expiresAt > NOW()`.
3. Re-vérif que `targetEmail` (lu dans le token DB) n'est toujours pas dans `auth_users` (course condition : un autre admin a peut-être créé le compte entre l'invitation et l'acceptation). Si présent → 409 `TARGET_EMAIL_ALREADY_REGISTERED`.
4. INSERT `auth_users` { id=newUuid, email=targetEmail, role='admin', emailVerified=NOW() (preuve par le lien email), name=`${firstName} ${lastName}` }.
5. INSERT `auth_accounts` { provider='credentials', providerAccountId=targetEmail, password_hash=bcrypt(sha256(password), cost=11) }.
6. UPDATE `auth_admin_invitation_tokens` SET `consumedAt = NOW()`, `createdAuthUserId = newUuid`.
7. INSERT `auth_audit_events` { eventType=`admin_invitation_consumed`, actorUserId=invitation.inviterUserId, targetUserId=newUuid, actorEmailHash=sha256(invitation.inviterEmail-via-FK), targetEmailHash=sha256(targetEmail), metadata={ invitationId } }.
8. INSERT `auth_audit_events` { eventType=`admin_created_by_admin`, actorUserId=invitation.inviterUserId, targetUserId=newUuid, ... } — événement complémentaire pour audit Loi 25 (trace explicite de la création par un admin).

### Étape 3 — `signIn()` côté Server Action

Server Action `acceptInvitation(formData)` :

```typescript
// apps/web/src/app/admin/accepter-invitation/[token]/actions.ts
async function acceptInvitation(formData: FormData) {
  const token = ...;
  const data = signupSchema.parse(...);

  // Étape 2 : créer le compte côté API
  const consumeRes = await fetch(`${API_URL}/api/auth/admin-invitation/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ token, ...data }),
  });
  if (!consumeRes.ok) {
    const err = await consumeRes.json();
    return { error: err.code };
  }
  const { email } = await consumeRes.json();

  // Étape 3 : ouvrir la session Auth.js
  await signIn('credentials', {
    email,
    password: data.password,
    redirect: false,
  });

  // Étape 4 : redirect vers MFA enroll
  redirect('/admin/mfa/enroll');
}
```

`signIn()` côté Next.js déclenche le callback `authorize` qui appelle `POST /api/auth/login` — le user vient d'être créé, le password est valide, la session s'ouvre normalement.

---

## Tests d'intégration

### Endpoint 1 (POST /admin/users)

- ✅ Invitation nominale par admin existant + StepUp frais → 202 + INSERT invitation + outbox + audit `admin_invitation_sent`
- ✅ Invitation par non-admin → 403 (RoleGuard intercepte)
- ✅ Invitation sans step-up → 401 STEP_UP_REQUIRED
- ✅ Invitation pour email d'un user existant (conseiller OU admin) → **409 TARGET_EMAIL_ALREADY_REGISTERED**
- ✅ Invitation par admin pour son propre email → 400 SELF_INVITATION_FORBIDDEN
- ✅ 2ᵉ invitation pour même email avec invitation active → 409 INVITATION_ALREADY_ACTIVE
- ✅ Idempotency-Key même payload → réponse cachée (audit pas dupliqué)
- ✅ Email normalisé via `normalizeEmail()` côté serveur (cf. R9) — `Maxime@Test.local` matché contre `maxime@test.local`

### Endpoint 2a (POST /api/auth/admin-invitation/validate)

- ✅ Token valide → 200 { valid: true, targetEmail, invitationId }
- ✅ Token expiré → 400 INVALID_OR_EXPIRED_TOKEN (sans side effect)
- ✅ Token déjà consommé → 400 INVALID_OR_EXPIRED_TOKEN
- ✅ Token signature invalide → 400
- ✅ Token avec purpose autre que admin_invitation → 400 (anti-cross-purpose)

### Endpoint 2b (POST /api/auth/admin-invitation/consume)

- ✅ Acceptation nominale → 200 + INSERT user/account + UPDATE token consumed + 2 events audit
- ✅ Token expiré (> 72h) → 400
- ✅ Token déjà consommé → 400
- ✅ Mot de passe trop court → 400 VALIDATION_FAILED
- ✅ Mot de passe contient l'email → 400 (politique R3 + R9)
- ✅ Course condition : email occupé entre invitation et accept → 409 TARGET_EMAIL_ALREADY_REGISTERED
- ✅ Idempotency-Key même payload → réponse cachée (pas de doublon INSERT)
- ✅ Le nouvel admin a `mfaSecrets=[]`, redirection forcée /admin/mfa/enroll au premier login (cohérent FR-031)

### Server Action côté Next.js

- ✅ Test Playwright e2e : flow complet validate → consume → signIn → redirect /admin/mfa/enroll
- ✅ Erreur API propagée à l'UI (token expiré → message FR-CA « Cette invitation a expiré, contactez l'administrateur qui vous a invité »)
