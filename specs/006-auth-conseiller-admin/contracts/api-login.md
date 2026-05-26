# Contrat — `POST /api/auth/login`

**User Story** : US2 — Connexion conseiller + admin (P1)
**FR couverts** : FR-007 à FR-013b, FR-033, FR-034

## Auth

Public. Rate-limit double bucket :
- `account` : 5 échecs / 15 min / userId
- `ip` : 20 échecs / 1 h / IP abrégée

## Mode d'appel

Cet endpoint est consommé **par le callback `authorize` du provider Credentials Auth.js v5** côté `apps/web` (server-to-server). Il est aussi accessible directement pour les tests d'intégration.

## Payload requête

```typescript
{
  email: string,     // normalized lowercase
  password: string,  // plaintext, jamais loggé
}
```

## Réponses

### Succès

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "userId": "uuid",
  "role": "conseiller" | "admin",
  "redirect": "/conseiller" | "/mfa/verify" | "/mfa/enroll" | "/admin/mfa/enroll" | "/verifier-email"
}
```

**Logique de `redirect`** :
- `emailVerified IS NULL` → `/verifier-email`
- `mfaSecrets[].enabledAt IS NOT NULL` (MFA actif) → `/mfa/verify` (le caller doit ensuite vérifier le TOTP avant ouvrir la session, héritage 002a)
- `role='conseiller'` ET `conformiteStatus='verified'` (lu via `ConformiteQueryPort`) ET pas de MFA → `/mfa/enroll`
- `role='admin'` ET pas de MFA → `/admin/mfa/enroll` (US5 002a)
- Sinon → `/conseiller` (ou `/admin` pour admin avec MFA)

### Erreur identifiants invalides

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "code": "INVALID_CREDENTIALS" }
```

Réponse identique pour : email inexistant, mot de passe incorrect, compte désactivé. Anti-énumération obligatoire (FR-008).

### Erreur lockout

```http
HTTP/1.1 423 Locked
Retry-After: <seconds>
Content-Type: application/json

{ "code": "ACCOUNT_LOCKED", "reason": "account_threshold" | "ip_threshold" }
```

`Retry-After` = nombre de secondes restantes dans la fenêtre du bucket.

**UX côté `/connexion`** (cf. M2 review) : le composant `<LoginForm />` lit le header `Retry-After` et affiche un countdown lisible avec `aria-live="polite"` :

> Trop de tentatives. Réessayez dans **14 min 32 s** (countdown actif).

Le countdown se met à jour chaque seconde côté client. À 0, le formulaire se réactive. Pattern accessible identique au `<ResendCountdownButton />` (verify-email).

## Side effects (cas succès)

- DELETE `auth_login_lockout_buckets` WHERE `kind='login_account'` AND `accountId=userId` (reset compteur compte sur succès — le bucket IP reste).
- INSERT `auth_audit_events` { eventType=`login_success`, targetUserId, targetEmailHash=sha256(normalizedEmail), actorIp=abridged, metadata={} }.
  **Note C3** : pas de `sessionTokenHash` dans metadata — au moment de cet INSERT, la session Auth.js v5 n'a pas encore été créée (le callback `authorize` retourne juste l'objet User ; Auth.js crée le cookie après).
- Le cookie de session Auth.js v5 est créé/rafraîchi **après** par le caller (Next.js) — pas par cet endpoint NestJS.

**Cookie en dev** (cf. H5) : le préfixe `__Host-` requiert `Secure=true`, incompatible avec `http://localhost`. Configuration `apps/web/src/auth.ts` :
```typescript
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === 'production'
      ? '__Host-cv.session.token'
      : 'cv.session.token',
    options: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  },
},
```

## Side effects (cas échec INVALID_CREDENTIALS)

- ATOMIC UPSERT `auth_login_lockout_buckets` { kind=`login_account`, accountId=userId } (+1 ou reset si fenêtre expirée). Skip si `userId` inconnu (compte inexistant — mais le bucket IP est incrémenté).
- ATOMIC UPSERT `auth_login_lockout_buckets` { kind=`login_ip`, ipHash=sha256(actorIp_abridged) } (+1 ou reset).
- INSERT `auth_audit_events` { eventType=`login_failed`, targetUserId=userId-or-null, targetEmailHash=sha256(normalizedEmail), actorIp, metadata={ reason: 'INVALID_PASSWORD' | 'UNKNOWN_USER' } }.
- Dummy bcrypt sur compte inexistant pour chronométrage constant.

## Lookup DB unifié (cf. C6 + R5)

Le use case utilise une **seule requête SQL** pour récupérer le user ET son hash de mot de passe, peu importe si le compte existe ou non :

```sql
SELECT auth_users.id, auth_users.role, auth_users."emailVerified", auth_accounts.password_hash
FROM auth_users
LEFT JOIN auth_accounts
  ON auth_accounts."userId" = auth_users.id
  AND auth_accounts.provider = 'credentials'
WHERE auth_users.email = $1
LIMIT 1;
```

- Compte existe : 1 row avec `password_hash` populated.
- Compte n'existe pas : 0 row.

Dans les deux cas, exactement 1 roundtrip DB → pas de fuite de timing par roundtrip supplémentaire. Le use case enchaîne ensuite avec `bcrypt.compare(prehash(plaintext), row?.password_hash ?? DUMMY_HASH)` pour finir le chronométrage constant.

## Side effects (cas lockout déclenché)

- INSERT `auth_audit_events` { eventType=login_locked, targetUserId-or-null, actorIp, metadata={ reason: 'account_threshold' | 'ip_threshold' } }

## Tests d'intégration

- ✅ Login nominal conseiller verified non-MFA → 200 + redirect=/mfa/enroll
- ✅ Login nominal conseiller verified MFA actif → 200 + redirect=/mfa/verify
- ✅ Login nominal admin sans MFA → 200 + redirect=/admin/mfa/enroll
- ✅ Login email non vérifié → 200 + redirect=/verifier-email
- ✅ Login mauvais mot de passe → 401 INVALID_CREDENTIALS + bucket account incrémenté
- ✅ Login email inexistant → 401 INVALID_CREDENTIALS + bucket IP incrémenté (chronométrage constant)
- ✅ 5e échec compte → 423 ACCOUNT_LOCKED reason=account_threshold + audit login_locked
- ✅ 20e échec IP en 1h → 423 ACCOUNT_LOCKED reason=ip_threshold (même si comptes différents)
- ✅ Login succès reset bucket account
- ✅ Login succès NE reset PAS bucket IP (protège autres comptes)
- ✅ Chronométrage compte existant vs inexistant : écart-type < 50 ms (SC-007)
