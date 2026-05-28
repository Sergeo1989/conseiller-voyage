# Phase 1 — HTTP Contracts : Module Intake

**Branch**: `002-voyageur-intake` | **Date**: 2026-05-25 (révisé 2026-05-28 post-clarify Q1-Q5) | **Plan**: [plan.md](../plan.md) | **Data Model**: [data-model.md](../data-model.md)

10 endpoints HTTP côté NestJS + 6 Server Actions Next.js + 4 outbox events.

Convention :
- Tous les endpoints retournent JSON
- Validation Zod via `ZodValidationPipe` (réutilisée 001)
- Auth via cookie magic link (`__Host-cv.intake.token` prod, `cv.intake.session` dev) — pas Auth.js
- Erreurs FR-CA par défaut, EN si `Accept-Language: en` ou Server Action depuis `/en/`
- Rate-limit annoté par endpoint
- `Idempotency-Key` header optionnel sur POST sensibles

---

## 1. Public Voyageur Endpoints

### POST `/api/intake/briefs`

**Description** : Crée un brief en statut `pending_verification` et envoie le magic link de vérification email.

**Auth** : aucune (endpoint public anonyme).
**Rate-limit** : `3/24h/email`, `5/24h/IP` (FR-019, FR-020).
**Idempotency** : `Idempotency-Key` header scoped par email.

**Request body (Zod `SubmitBriefSchema`)** :
```ts
{
  destinations: [{ country: string; region?: string }],         // FR-002
  departureDate: string (ISO 8601 date),                        // FR-003
  returnDate: string (ISO 8601 date),                           // > departureDate
  datesFlexible: boolean,
  datesFlexibilityDays?: number (1..30 si flexible),
  adultsCount: number (≥ 1),
  childrenAges: number[],                                        // FR-004
  infantsCount: number (default 0),
  budgetRange: TravelBudget,                                     // FR-005
  budgetNote?: string (≤ 500 chars),
  conseillerLanguage: ConseillerLanguage,                        // FR-006
  conseillerLanguageOther?: string (ISO 639-1 2 chars),
  speciality: TravelSpeciality,                                  // FR-007
  specialityOther?: string (≤ 200 chars),
  familiarity: TravelFamiliarity,                                // FR-008
  contact: {
    email: string (email valide),                                // FR-009
    firstName: string (1..100 chars),
    lastName: string (1..100 chars),
    phone?: string (libre, normalisé serveur),
    postalCode?: string (format canadien)
  },
  consentGiven: boolean (must be true)                           // FR-010
}
```

**Réponses** :
- `201 Created` :
  ```json
  { "briefId": "uuid", "status": "pending_verification", "emailSent": true }
  ```
  Note FR-013a (Q1) : si SES échoue (5xx/throttle/timeout), retour reste `201` avec `emailSent: false` ;
  l'envoi est enqueué BullMQ retry exponentiel (5 tentatives, 30s → 30min).
- `400 Bad Request` : validation Zod fail (FR-011)
- `429 Too Many Requests` — **deux codes distincts** (Q2 clarify + FR-019/020/020a, ordre d'éval **email-first, IP-second**) :
  - `EMAIL_RATE_LIMIT_EXCEEDED` (FR-019) :
    ```json
    {
      "code": "EMAIL_RATE_LIMIT_EXCEEDED",
      "retryAfter": 43200,
      "message": "Vous avez soumis 3 briefs sur cette adresse en 24 h. Réessayez dans X heures ou utilisez une autre adresse courriel."
    }
    ```
    Header HTTP `Retry-After: 43200` également présent (RFC 7231).
  - `RATE_LIMIT_EXCEEDED` (FR-020) — body **neutre** anti-énumération bot :
    ```json
    {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Votre demande ne peut être traitée actuellement, veuillez réessayer plus tard."
    }
    ```
    **Pas** de `retryAfter` (anti-énumération), **pas** de header `Retry-After`.
- `409 Conflict` : Idempotency-Key déjà utilisée pour un autre payload
- `422 Unprocessable Entity` : email jetable détecté (FR-021)
  ```json
  { "code": "DISPOSABLE_EMAIL_DETECTED", "message": "Cette adresse semble temporaire. ..." }
  ```

---

### POST `/api/intake/briefs/verify`

**Description** : Active un brief via le magic link token. Publie l'événement `voyageur.brief.activated` sur l'outbox.

**Auth** : aucune (token est dans le body).
**Rate-limit** : `60/heure/IP`.

**Request body** :
```ts
{ token: string }
```

**Réponses** :
- `200 OK` :
  ```json
  { "briefId": "uuid", "status": "active", "expiresAt": "ISO 8601" }
  ```
  **Set-Cookie (FR-014a)** :
  - Prod HTTPS : `__Host-cv.intake.token=<opaque_session_token>; Max-Age=604800; HttpOnly; Secure; SameSite=Lax; Path=/`
  - Dev HTTP : `cv.intake.session=<opaque_session_token>; Max-Age=604800; HttpOnly; SameSite=Lax; Path=/`
  - **Rolling renewal (Q5 clarify)** : chaque visite ultérieure à une route protégée par ce cookie (GET `/api/intake/briefs/:briefId`, GET `/api/intake/briefs/by-email`) **DOIT** rejouer le `Set-Cookie` avec un `Max-Age=604800` recalculé à partir de l'instant de la réponse. 7 jours d'inactivité → cookie expire → l'utilisateur doit demander un nouveau magic link via `/api/intake/briefs/:id/resend-magic-link`. Implémenté côté NestJS via `RollingSessionCookieInterceptor` (cf. tasks.md C2).
- `400 Bad Request` : token mal formé
- `401 Unauthorized` : token expiré ou déjà consommé
- `410 Gone` : brief déjà anonymisé

---

### POST `/api/intake/briefs/:briefId/resend-magic-link`

**Description** : Renvoie un nouveau magic link si l'ancien a expiré.

**Auth** : aucune (l'utilisateur n'a plus de session, juste l'email).
**Rate-limit** : `5/heure/IP` + `3/24h/email`.

**Request body** :
```ts
{ email: string }
```

**Réponses** :
- `202 Accepted` : nouveau lien envoyé (réponse identique même si brief n'existe pas, pour éviter l'énumération d'emails)
- `429 Too Many Requests`

---

### GET `/api/intake/briefs/:briefId`

**Description** : Récupère le résumé d'un brief pour la page récap.

**Auth** : cookie `__Host-cv.intake.token` correspondant au briefId, OU `__Host-cv.session.token` admin.
**Rate-limit** : `60/min/IP`.
**Rolling renewal** : si auth via cookie voyageur, la réponse 200 **DOIT** rejouer `Set-Cookie` avec `Max-Age=604800` (FR-014a, Q5 clarify, `RollingSessionCookieInterceptor`).

**Réponses** :
- `200 OK` :
  ```json
  {
    "briefId": "uuid",
    "status": "active",
    "submittedAt": "ISO 8601",
    "verifiedAt": "ISO 8601",
    "expiresAt": "ISO 8601",
    "destinations": [...],
    "departureDate": "...",
    "returnDate": "...",
    "datesFlexible": false,
    "groupComposition": { "adults": 2, "children": [8, 12], "infants": 0 },
    "budgetRange": "between_5k_10k",
    "conseillerLanguage": "fr",
    "speciality": "lune_de_miel",
    "familiarity": "experienced_traveler",
    "matchedConseillersCount": 0
  }
  ```
  Set-Cookie : rolling renewal (voir ci-dessus).
- `401 Unauthorized` : pas de cookie valide (cookie absent OU expiré post-7j d'inactivité)
- `404 Not Found` : briefId inexistant
- `410 Gone` : brief anonymisé

---

### GET `/api/intake/briefs/by-email`

**Description** : Liste les briefs actifs du même email (page "Voir mes autres briefs", FR-017).

**Auth** : cookie `__Host-cv.intake.token` valide (extrait le contactId du token).
**Rate-limit** : `30/min/IP`.
**Rolling renewal** : la réponse 200 **DOIT** rejouer `Set-Cookie` avec `Max-Age=604800` (FR-014a, Q5 clarify, `RollingSessionCookieInterceptor`).

**Réponses** :
- `200 OK` :
  ```json
  {
    "briefs": [
      { "briefId": "uuid", "status": "active", "destinations": [...], "expiresAt": "..." },
      ...
    ]
  }
  ```
  Set-Cookie : rolling renewal (voir ci-dessus).
- `401 Unauthorized` : cookie absent OU expiré post-7j d'inactivité.

---

### POST `/api/intake/briefs/:briefId/erasure-request`

**Description** : Demande l'effacement du brief (Loi 25 FR-022, FR-023). Confirmation par typage exact.

**Auth** : cookie `__Host-cv.intake.token` correspondant au briefId.
**Rate-limit** : `5/24h/email`.

**Request body (Zod `ErasureRequestBriefSchema`)** :
```ts
{ confirmation: 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE' }
```
(constante FR-CA réutilisée de l'erasure conseiller 001, déjà exportée par `@cv/shared/conformite`)

**Réponses** :
- `200 OK` :
  ```json
  { "status": "pending", "message": "...", "estimatedCompletionSeconds": 60 }
  ```
- `400 Bad Request` : confirmation incorrecte
- `404 Not Found`
- `409 Conflict` : déjà supprimé

---

### POST `/api/intake/voyageur/erase-all-data`

**Description** : Demande l'effacement **global** — contact + tous les briefs du voyageur (FR-022a, Q4 clarify). Confirmation par typage exact d'une phrase distincte de FR-022.

**Auth** : cookie `__Host-cv.intake.token` valide (dérive `contactId`).
**Rate-limit** : `2/24h/contact` (suffisant — opération irréversible).
**Rolling renewal** : NON applicable (opération destructive ; ne pas étendre la session).

**Request body (Zod `ErasureRequestAllSchema`)** :
```ts
{
  confirmation: 'JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES',
  acknowledgedBriefCount: number  // doit matcher le nombre de briefs actifs côté serveur (anti-stale UI)
}
```

**Réponses** :
- `200 OK` :
  ```json
  {
    "status": "pending",
    "contactId": "uuid",
    "briefsAffectedCount": 3,
    "message": "Vos données seront effacées dans la minute. Une confirmation vous sera envoyée par courriel à <email>.",
    "estimatedCompletionSeconds": 60
  }
  ```
  Set-Cookie : `__Host-cv.intake.token=; Max-Age=0; Path=/` (révocation immédiate de la session ; le voyageur n'a plus rien à consulter).
- `400 Bad Request` : confirmation incorrecte OU `acknowledgedBriefCount` ne matche pas le nombre réel (l'UI doit re-fetch et re-confirmer)
- `401 Unauthorized` : pas de cookie
- `409 Conflict` : effacement déjà en cours pour ce contact

Émet l'événement `voyageur.brief.deleted` pour **chaque** brief affecté (réutilise le payload existant) + entrée audit dédiée `intake.contact.erase_all_requested`.

---

## 2. Admin Endpoints

### GET `/api/intake/admin/unmatched`

**Description** : File des briefs actifs depuis > 4h sans aucun conseiller notifié (FR-026).

**Auth** : `AuthGuard` + `role === 'admin'`.
**Rate-limit** : `100/min/admin`.

**Query params** :
```ts
{ page?: number (default 1), pageSize?: number (default 20, max 100) }
```

**Réponses** :
- `200 OK` :
  ```json
  {
    "items": [
      {
        "briefId": "uuid",
        "submittedAt": "...",
        "verifiedAt": "...",
        "destinations": [...],
        "speciality": "...",
        "conseillerLanguage": "...",
        "reasonUnmatched": "no_conseiller_match_speciality_language"
      }
    ],
    "totalCount": 12,
    "page": 1,
    "pageSize": 20
  }
  ```

---

### GET `/api/intake/admin/briefs/:briefId`

**Description** : Détail complet d'un brief pour examen admin avant push manuel.

**Auth** : admin.

**Réponses** : 200 avec tous les champs (incluant PII contact pour faciliter le push manuel).

---

### POST `/api/intake/admin/briefs/:briefId/push-manual`

**Description** : Pousse manuellement un brief à un conseiller spécifique (FR-027).

**Auth** : admin.

**Request body** :
```ts
{
  conseillerComplianceId: string (uuid),  // FK vers ConformiteCompliance 001
  reason: string (20..500 chars)           // FR-028 motif obligatoire
}
```

**Réponses** :
- `200 OK` : audit entry créée, événement `voyageur.brief.pushed_manual` publié
- `400 Bad Request` : conseiller non-vérifié (lookup via `ConformiteQueryFacade`)
- `404 Not Found`

---

## 3. Server Actions Next.js (Web)

Les Server Actions sont les **front-end de** l'API NestJS. Elles font la
même validation Zod côté serveur + forward au NestJS via `apiClient`.

| Server Action | Page d'origine | Endpoint NestJS appelé |
|---|---|---|
| `submitBriefAction(formData)` | `/voyage/nouveau` | POST `/api/intake/briefs` |
| `verifyMagicLinkAction(token)` | `/voyage/[token]` | POST `/api/intake/briefs/verify` |
| `resendMagicLinkAction(email)` | `/voyage/lien-expire` | POST `/api/intake/briefs/:id/resend-magic-link` |
| `requestBriefErasureAction(briefId, confirmation)` | `/voyage/[token]` (form effacement) | POST `/api/intake/briefs/:id/erasure-request` |
| `eraseAllVoyageurDataAction(confirmation, ackCount)` (FR-022a, Q4) | `/voyage/mes-donnees/effacer-tout` | POST `/api/intake/voyageur/erase-all-data` |
| `adminPushBriefManualAction(briefId, conseillerId, reason)` | `/admin/intake/[briefId]` | POST `/api/intake/admin/briefs/:id/push-manual` |

Chaque Server Action :
1. Parse + valide via Zod (1ère couche)
2. Récupère le cookie session voyageur ou admin
3. Forward à l'API NestJS via `apiClient` (réutilisé 001) avec header
   `X-Requested-By: web` (CSRF middleware) + `Idempotency-Key` UUID
4. Mappe la réponse vers un `Result<T, Error>` consommable par le React
5. Pas de revalidatePath car les briefs sont en lecture seule post-creation

---

## 4. Outbox Events publiés

| Event Type | Payload |
|---|---|
| `voyageur.brief.activated` | `{ briefId, voyageurContactId, speciality, conseillerLanguage, ... (les 9 dimensions sans PII contact identifiantes) }` |
| `voyageur.brief.deleted` | `{ briefId, deletedAt, reason: 'voyageur_request' \| 'expired' \| 'admin_purge' }` |
| `voyageur.brief.expired` | `{ briefId, expiredAt, hadMatchedConseillers: boolean }` |
| `voyageur.brief.pushed_manual` | `{ briefId, conseillerComplianceId, adminActorId, reason, correlationId }` |

Consommateurs prévus :
- Feature 003 (matching) : `activated` → calcule top 3 conseillers
- Feature 004 (devis) : `pushed_manual` → ouvre une intent devis côté conseiller
- Feature SEO (003 ou 016) : `activated` → enrichit le graph relationnel pour le SEO long-tail
- Loi 25 audit : tous → conservés anonymisés

---

## 5. Headers HTTP standards

Hérités de la config Helmet 001 :
- `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, etc.

Nouveaux pour intake :
- `Cookie: __Host-cv.intake.token` (prod HTTPS) ou `cv.intake.session` (dev HTTP) — séparé du cookie session admin/conseiller
- `Idempotency-Key: <uuid>` requis sur les POST sensibles
- `X-Requested-By: web|mobile-app|admin-cli` requis sur les mutations (CSRF protection)
