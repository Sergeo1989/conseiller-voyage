# Contrat — `POST /api/auth/signup`

**User Story** : US1 — Inscription conseiller self-service (P1)
**FR couverts** : FR-001 à FR-006, FR-013, FR-033 à FR-038

## Auth

Public (pas de session requise). Rate-limit 10 requêtes/h/IP (bucket Postgres `signup`).

## Payload requête

```typescript
// Zod schema dans packages/auth-domain/src/dtos/signup.dto.ts
// IMPORTANT (cf. M5 review) : ce schéma contient UNIQUEMENT des validations
// synchrones pures (longueur, regex, présence). Les validations
// asynchrones (uniqueness DB, complexité dépendante du contexte) restent
// côté serveur. Pas de .refine() asynchrone partagé front/back.
{
  email: string,            // valide RFC 5321, normalisé via normalizeEmail() côté serveur (R9)
  password: string,         // soumis à validatePasswordPolicy() — pure fn, partagée
  firstName: string,        // 2..50 chars
  lastName: string,         // 2..50 chars
  acceptedTerms: true,      // strict true — sinon refus 400
  acceptedPrivacyPolicy: true, // strict true — sinon refus 400
}
```

## Réponses

### Succès (compte créé OU déjà existant — anti-énumération)

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "status": "ok",
  "message": "Si ce courriel n'est pas déjà utilisé, vous recevrez un courriel de vérification dans les prochaines minutes."
}
```

Note : 202 (et pas 201) parce que l'effet final dépend du drainage outbox 003.

### Erreur validation (mot de passe faible, email mal formé, CGU non cochées)

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "code": "VALIDATION_FAILED",
  "errors": [
    { "field": "password", "code": "PASSWORD_TOO_SHORT", "message": "Le mot de passe doit contenir au moins 12 caractères." },
    { "field": "acceptedTerms", "code": "TERMS_NOT_ACCEPTED" }
  ]
}
```

### Erreur rate-limit IP

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
Content-Type: application/json

{ "code": "RATE_LIMIT_EXCEEDED" }
```

## Side effects (cas compte créé)

- INSERT `auth_users` { email, role='conseiller', emailVerified=NULL, ... }
- INSERT `auth_accounts` { provider='credentials', providerAccountId=normalizeEmail(email), password_hash=bcrypt(base64(sha256(password)), cost=11) }
- INSERT `auth_email_verification_tokens` { userId, jwtNonce, expiresAt=NOW()+24h }
- INSERT `auth_outbox_emails` { templateKind=email_verification, payload={token, firstName, ...} }
- INSERT `auth_audit_events` { eventType=signup, targetUserId=newUserId, actorIp=abridged }

## Side effects (cas anti-énumération — compte existe déjà)

- AUCUNE création.
- INSERT `auth_audit_events` { eventType=signup, targetUserId=existingUserId, metadata={ "duplicate_attempt": true } }
- Pas d'INSERT outbox (pour ne pas spammer).
- Chronométrage compensé par dummy bcrypt sur un hash sentinelle pour rendre le délai indistinguable du cas succès (SC-007).

## Idempotence

Non-idempotent par nature (création), mais 2× même payload = 2× réponse identique 202. Pas de `Idempotency-Key` header requis.

## Tests d'intégration

- ✅ Signup nominal → 202 + INSERT user + token + outbox
- ✅ Signup avec email déjà utilisé → 202 indistinguable (pas d'INSERT user) + audit duplicate
- ✅ Mot de passe < 12 caractères → 400 VALIDATION_FAILED
- ✅ CGU non cochées → 400 TERMS_NOT_ACCEPTED
- ✅ Mot de passe contient l'email → 400 PASSWORD_CONTAINS_EMAIL
- ✅ Mot de passe contient le prénom → 400 PASSWORD_CONTAINS_FIRSTNAME
- ✅ 11ᵉ signup depuis même IP en 1h → 429 RATE_LIMIT_EXCEEDED
- ✅ Chronométrage compte existant vs inexistant → écart-type < 50 ms (SC-007)
