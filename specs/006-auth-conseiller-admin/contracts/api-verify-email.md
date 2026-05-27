# Contrat — `GET /api/auth/verify-email?token=<jwt>` + `POST /api/auth/verify-email/resend`

**User Story** : US3 — Vérification de courriel (P1)
**FR couverts** : FR-005, FR-014 à FR-016

## Endpoint 1 — `GET /api/auth/verify-email?token=<jwt>`

### Auth

Public (le token lui-même prouve la possession du courriel).

### Payload requête

```http
GET /api/auth/verify-email?token=eyJhbGciOiJIUzI1NiJ9...
```

### Réponses

#### Succès

```http
HTTP/1.1 302 Found
Location: /connexion?verified=1
```

Côté UI, la page de connexion affiche un bandeau « Votre courriel a été vérifié, vous pouvez vous connecter. »

#### Erreur token expiré, invalide, ou déjà consommé

```http
HTTP/1.1 302 Found
Location: /verifier-email/erreur
```

La page d'erreur explique en FR-CA et propose un bouton « Renvoyer un courriel » qui appelle l'endpoint 2.

### Side effects

- Lookup `auth_email_verification_tokens` WHERE `jwtNonce = ?` AND `consumedAt IS NULL` AND `expiresAt > NOW()`.
- Si trouvé : `UPDATE auth_users SET emailVerified = NOW() WHERE id = userId`. `UPDATE auth_email_verification_tokens SET consumedAt = NOW()`. INSERT audit `email_verified`.
- Si non trouvé : pas de side effect. Redirect vers page d'erreur.

---

## Endpoint 2 — `POST /api/auth/verify-email/resend`

### Auth

Public (l'utilisateur n'est pas encore connecté). Rate-limit 3 envois/h/compte (bucket Postgres `email_verification_resend`).

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
  "message": "Si ce courriel existe et n'est pas déjà vérifié, un nouveau courriel de vérification vous sera envoyé."
}
```

Réponse identique que l'email existe ou non, ou qu'il soit déjà vérifié.

### Side effects (cas où l'email existe et n'est pas vérifié)

- Lookup `auth_users` WHERE `email = ?` AND `emailVerified IS NULL`.
- INSERT nouveau `auth_email_verification_tokens` (TTL 24h).
- INSERT `auth_outbox_emails` { templateKind=email_verification, payload={token, firstName} }.
- ATOMIC UPSERT bucket `email_verification_resend` (+1 ou reset si fenêtre expirée).

### Erreur rate-limit

```http
HTTP/1.1 202 Accepted (silencieusement ignoré côté API pour ne pas révéler l'état)
```

L'audit `email_verification_resend_throttled` est tout de même enregistré côté serveur pour traçabilité.

---

## UX countdown 60s (clarification Q1 + M8 review)

Le bouton « Renvoyer » côté UI (`<ResendCountdownButton />`) :

1. Au chargement de la page `/verifier-email` ou `/verifier-email/erreur`, le countdown démarre à 60s.
2. `aria-disabled="true"` + `aria-live="polite"` annonce « Renvoyer dans 60 secondes » puis chaque seconde.
3. À 0, bouton réactivé. Au clic, appel Server Action `resendVerificationEmail(email)` qui POST sur l'endpoint 2. Au moment du clic, le composant écrit `sessionStorage.setItem('resend_last_at', Date.now())` pour persister le moment du dernier envoi.
4. **Au reload de la page (cf. M8)** : le composant lit `sessionStorage.getItem('resend_last_at')` au mount. Si la dernière demande date de < 60s, le countdown reprend depuis le reste (`60 - (Date.now() - lastAt) / 1000`). Évite l'UX confuse « ça recommence à 60s à chaque F5 ».
5. Après 2 renvois sans vérification effective, affichage d'un lien « contacter le support » sous le bouton.

**Rappel** : la vraie défense contre le spam d'outbox est le rate-limit Postgres `email_verification_resend` (FR-015 : max 3/h/compte). Le countdown front est juste un nudge UX. Si l'utilisateur efface manuellement `sessionStorage`, il peut cliquer plus tôt, mais le serveur refusera silencieusement (réponse 202 identique).

---

## Tests d'intégration

- ✅ GET avec token valide → 302 /connexion?verified=1 + emailVerified=NOW + audit
- ✅ GET avec token déjà consommé → 302 /verifier-email/erreur, pas d'effet
- ✅ GET avec token expiré (> 24h) → 302 /verifier-email/erreur
- ✅ GET avec token signature invalide → 302 /verifier-email/erreur
- ✅ POST resend pour un email non vérifié → 202 + nouveau token + outbox
- ✅ POST resend pour un email déjà vérifié → 202 (silencieux, pas d'outbox)
- ✅ POST resend pour un email inexistant → 202 (silencieux, pas d'outbox)
- ✅ 4ᵉ POST resend dans la même heure → 202 silencieux + audit throttled
