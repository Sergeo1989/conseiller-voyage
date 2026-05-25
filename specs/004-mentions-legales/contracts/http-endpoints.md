# HTTP Endpoints — Mentions légales

**Date** : 2026-05-25 (révisé post-review)

Cette feature introduit **deux** endpoints HTTP authentifiés :

1. `POST /api/me/legal/accept` — déclaration d'acceptation d'une CGU.
2. `GET /api/me/legal/version-status` — consultation de l'état des
   versions acceptées vs courantes (consommé par le middleware Next.js).

Les 5 pages publiques restent statiques SSG sans backend.

---

## POST `/api/me/legal/accept`

**Description** : un conseiller authentifié déclare son acceptation de la
version courante d'un document légal (typiquement `cgu_b2b` au signup ou
après ré-acceptation obligatoire suite à un bump de version).

**Auth** : Auth.js session cookie (livré en 001). RBAC :
`role IN ('conseiller', 'admin')`.

**Headers obligatoires** :

- `X-Requested-By: web` (CSRF — middleware livré en 001).
- `Idempotency-Key: <uuid>` (interceptor livré en 001).
- `Content-Type: application/json`

### Request body (Zod)

```typescript
const AcceptCguB2bBodySchema = z
  .object({
    documentType: z.literal('cgu_b2b'),  // au MVP, seul cgu_b2b est acceptable via cet endpoint
    documentVersion: z.number().int().positive(),
  })
  .strict();
```

### Réponses

| Code | Body | Sémantique |
|---|---|---|
| **201 Created** | `{ acceptanceId: string, acceptedAt: string ISO }` | Nouvelle acceptance insérée |
| **200 OK** | `{ acceptanceId: string, acceptedAt: string ISO, idempotent: true }` | Acceptance existante retournée (rejeu idempotent) |
| **400 Bad Request** | `{ error: 'validation_failed', issues: ZodIssue[] }` | Payload invalide |
| **401 Unauthorized** | `{ error: 'unauthenticated' }` | Pas de session |
| **403 Forbidden** | `{ error: 'rbac_denied' }` | Role pas conseiller ni admin |
| **404 Not Found** | `{ error: 'document_not_found' }` | (documentType, documentVersion) inexistant |
| **409 Conflict** | `{ error: 'document_superseded', currentVersion: number }` | Version pointée est supersédée — client doit refetch la version courante |
| **503 Service Unavailable** | `{ error: 'db_unavailable' }` | DB primaire HS, retry recommandé |

### Exemple

```http
POST /api/me/legal/accept HTTP/1.1
Cookie: __Host-cv.session.token=abc...
X-Requested-By: web
Idempotency-Key: 6b6f5e2a-8c3a-4f7b-9d8e-1a2b3c4d5e6f
Content-Type: application/json

{ "documentType": "cgu_b2b", "documentVersion": 3 }
```

```http
HTTP/1.1 201 Created
Content-Type: application/json
Set-Cookie: __Host-cv.legal-version=<base64url-payload>.<hmac>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300

{ "acceptanceId": "...", "acceptedAt": "2026-05-25T14:32:11Z" }
```

La réponse `Set-Cookie` rafraîchit immédiatement le cookie de cache
côté middleware — le conseiller peut accéder à son tableau de bord
sans round-trip supplémentaire.

### Coexistence des deux mécanismes d'idempotence

| Mécanisme | Niveau | Détection |
|---|---|---|
| Contrainte unique DB `(subjectId, documentType, documentVersion)` | Métier | Empêche 2 acceptances pour le même couple, même via 2 requêtes HTTP différentes |
| Header `Idempotency-Key` (interceptor 001) | HTTP | Empêche un rejeu exact de la même requête (réseau, retry client) |

**Comportement combiné** :

- Première requête avec `Idempotency-Key: K` → INSERT, 201, cache la
  réponse par `K`.
- Rejeu de la même requête (même `Idempotency-Key`, même payload) → 200,
  retourne la réponse cachée (interceptor 001).
- Nouvelle requête (autre `Idempotency-Key`) avec même
  `(documentType, documentVersion)` → 200 idempotent, retourne
  l'acceptance existante (mécanisme DB).
- Nouvelle requête (autre `Idempotency-Key`) avec **payload différent**
  pour le même `Idempotency-Key` → 422 (interceptor 001 détecte le
  payload mismatch).

---

## GET `/api/me/legal/version-status`

**Description** : consommé par le middleware Next.js de vérification de
version. Lecture seule, pas idempotent au sens HTTP (chaque appel
re-lit la BD).

**Auth** : Auth.js session cookie. RBAC :
`role IN ('conseiller', 'admin')`.

**Headers obligatoires** : `Cookie` (session). Pas de CSRF (GET).
Pas de `Idempotency-Key` (lecture).

### Réponse

```typescript
{
  accepted: number | null,   // dernière version cgu_b2b acceptée par le user, null si jamais accepté
  current: number,           // version active actuelle (max effective)
  status: 'up_to_date' | 'outdated' | 'never_accepted',
}
```

| Code | Body | Sémantique |
|---|---|---|
| **200 OK** | (voir ci-dessus) | Lecture réussie. Set-Cookie `__Host-cv.legal-version` rafraîchi. |
| **401 Unauthorized** | `{ error: 'unauthenticated' }` | Pas de session |
| **403 Forbidden** | `{ error: 'rbac_denied' }` | Role pas conseiller ni admin |
| **503 Service Unavailable** | `{ error: 'db_unavailable' }` | DB primaire HS |

### Rate limiting

Le rate limiter global applique **30 requêtes / minute / utilisateur**
(plus généreux que l'endpoint POST — c'est une lecture qui peut être
appelée par le middleware sur plusieurs requêtes successives multi-tab).

Le cookie HMAC TTL 5 min réduit le besoin d'appeler ce endpoint à
~12 appels / heure / utilisateur en moyenne.

---

## Checklist OWASP Top 10 — POST `/api/me/legal/accept`

| OWASP | Vérification | Statut |
|---|---|---|
| **A01 Broken Access Control** | RBAC vérifié en couche application (`requestedBy.role IN ('conseiller', 'admin')`) avant tout autre traitement. AuthGuard NestJS livré en 001. | ✅ |
| **A02 Cryptographic Failures** | Session cookie `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`. TLS imposé via HSTS (livré en 001). | ✅ |
| **A03 Injection** | Zod côté serveur. Aucun SQL brut — Prisma exclusivement. | ✅ |
| **A04 Insecure Design** | Idempotence par contrainte unique DB, pas dépendante du code app. Append-only trigger sur la table empêche modification post-création. | ✅ |
| **A05 Security Misconfiguration** | Headers sécurité globaux (CSP strict, X-Content-Type-Options, etc.) livrés en 001. Aucun nouveau header introduit. | ✅ |
| **A06 Vulnerable Components** | Dépendances scannées par `pnpm audit` + Snyk CI (livré en 001), seuil CVSS ≥ 7 bloquant. | ✅ |
| **A07 Authentication Failures** | Auth.js v5 sessions DB partagées (ADR-0004). Pas de password storage local. Rate limiting via @nestjs/throttler livré en 001 (10 req/min/user sur cet endpoint suffisant). | ✅ |
| **A08 Software & Data Integrity** | Acceptances append-only via trigger PostgreSQL. Checksum SHA-256 des MDX vérifié au build. | ✅ |
| **A09 Logging & Monitoring** | Endpoint trace via OTel (livré en 001). Métriques Prometheus `legal_acceptances_total{type, version}`. Alertes Grafana WARN si > 10 ré-acceptations en attente > 7 j. | ✅ |
| **A10 SSRF** | Pas d'appel externe initié par cet endpoint. | N/A |

---

## Rate limiting

Le rate limiter global (@nestjs/throttler, livré en 001) applique
**10 requêtes / minute / utilisateur** sur cet endpoint. Suffisant : un
conseiller ne devrait jamais appeler plus de 1×/signup + 1×/bump de
version.

---

## Pas d'endpoint pour le voyageur

Le voyageur **n'appelle pas** cet endpoint. Ses acceptations sont créées
par le module 002-voyageur-intake via le port public
`LegalAcceptanceFacade.acceptForBrief()` (cf.
[legal-acceptance.port.md](./legal-acceptance.port.md)) — appel interne
au backend, pas exposé HTTP.

Raison : le voyageur est anonyme jusqu'à la confirmation magic-link. Son
identifiant logique est le `briefId`, qui est créé en même temps que les
acceptances, donc une transaction Prisma unique côté serveur est la
seule manière propre. Exposer un endpoint HTTP impliquerait un round-trip
client supplémentaire et un état intermédiaire fragile.

---

## Pas d'endpoint pour les 5 pages publiques

Les 5 pages (`/mentions-legales`, `/cgu-voyageur`, `/cgu-conseiller`,
`/confidentialite`, `/comment-ca-marche`) sont rendues statiquement (SSG)
par Next.js et servies depuis CloudFront. Aucun appel backend au
chargement. C'est l'intérêt du SSG (Principe XII) — survit même si l'app
backend est complètement HS.
