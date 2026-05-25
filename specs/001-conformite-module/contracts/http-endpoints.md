# Contrats HTTP — Module Conformité

**Préfixe d'API** : `/api/conformite/...`. Pas de versioning `/v1/` au MVP
— ces routes sont consommées exclusivement par Server Actions Next.js
internes (même équipe, même déploiement). Le versioning URI est réservé aux
APIs publiques tierces (cf. constitution, *API versioning*).

**Authentification** : tous les endpoints exigent une session valide via
`AuthGuard` qui lit la table `auth_sessions` (sessions Auth.js v5, cf.
[ADR-0004](../../../docs/adr/0004-auth-session-db-partagee.md)). Le RBAC est
vérifié au niveau du cas d'usage (couche application), pas du contrôleur
(Principe IX).

**Validation** : tous les payloads d'entrée passent par un pipe NestJS Zod
avec un schéma partagé dans `packages/shared/conformite/schemas.ts`. Aucun
`class-validator` (cohérence Stack canonique v2.1.0).

**Idempotence** : tous les `POST` mutant l'état acceptent un header
`Idempotency-Key` (UUID v4) ; le serveur persiste la réponse 7 jours et
rejoue à l'identique pour la même clé (Principe X).

## Défenses transversales (Principe IX)

Appliquées **à toutes les routes** par middleware NestJS global, sauf
mention contraire.

### Protection CSRF (B6 du review résolu — cf. [research.md R11](../research.md))

Deux mécanismes combinés :

1. **Cookie de session strict** : `__Host-cv.session.token` avec
   `SameSite=Lax`, `Secure`, `HttpOnly`, `Path=/`. Empêche les requêtes
   cross-site simples (formulaires HTML, image tags) d'envoyer le cookie
   sans pré-vol CORS.
2. **Header obligatoire** sur toute mutation : `X-Requested-By: web`. Le
   middleware `CsrfProtectionMiddleware` rejette avec `403 Forbidden` toute
   requête `POST/PUT/DELETE/PATCH` sans ce header. Les Server Actions
   Next.js l'ajoutent par défaut via un wrapper `apiClient` partagé.

### En-têtes HTTP par défaut (cf. constitution Principe IX)

Tous les endpoints retournent (via Helmet équivalent Fastify) :

- `Content-Security-Policy: default-src 'self'; ...` (configuration globale)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Les endpoints qui rendent un document ajoutent :
- `Content-Disposition: attachment; filename="..."` (cf. recherche R5 —
  pas de prévisualisation inline).

### Rate limiting global

Géré par `@nestjs/throttler` avec backing Redis (partagé entre instances
horizontales si scaling). Voir section *Rate limiting* en bas de ce
document.

---

## Endpoints conseiller

### `POST /api/v1/conformite/me/submissions`

Soumission d'un dossier (US1, FR-001, FR-002, FR-016, FR-021).

**Acteur** : `conseiller` authentifié (MFA non obligatoire pour la soumission,
mais le module identité décide).

**Body** (multipart/form-data) :

```ts
SubmitDossierRequestSchema = z.object({
  consentGiven: z.literal(true),
  certificates: z.array(z.object({
    province: z.enum(['QC', 'ON']),
    certificateNumber: z.string().min(1).max(50),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    documentUploadId: z.string().uuid(),    // référence à un upload S3 préalable
  })).min(1).max(2),
  affiliations: z.array(z.object({
    agencyName: z.string().min(1).max(200),
    agencyPermitNumber: z.string().min(1).max(50),
    agencyProvince: z.enum(['QC', 'ON']),
    proofUploadId: z.string().uuid(),
    role: z.string().max(100).optional(),
    activeSince: z.string().datetime().optional(),
  })).min(1).max(5),
});
```

**Réponses** :
- `201 Created` — `{ submissionId, status: 'pending' }`.
- `400` — validation Zod échouée (détail des erreurs en FR-CA).
- `409` — soumission active déjà en cours.
- `429` — rate limit (5 soumissions / heure / conseiller).

**Checklist OWASP** :
- A01 Broken Access Control : cas d'usage vérifie `requestedBy.role === 'conseiller'` ET que `requestedBy.id` correspond au dossier en cours de création.
- A03 Injection : Zod + Prisma (aucun SQL brut).
- A04 Insecure Design : consentement explicite (FR-016) obligatoire (`consentGiven: true`).
- A05 Security Misconfig : pas de stack trace en réponse erreur.
- A07 Auth Failures : `AuthGuard` + session valide.
- A08 Software & Data Integrity Failures : upload via URL signée + vérification MIME côté serveur après upload.

---

### `POST /api/conformite/me/upload-urls`

Demande d'URLs signées S3 pour téléverser des documents avant la soumission.
Persiste un `UploadIntent` par fichier (B2 du review résolu — cf.
[data-model.md `UploadIntent`](../data-model.md) et
[research.md R8](../research.md)).

**Body** :

```ts
RequestUploadUrlsSchema = z.object({
  files: z.array(z.object({
    purpose: z.enum(['certificat', 'preuve_affiliation']),
    contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/heic']),
    contentLength: z.number().int().positive().max(5 * 1024 * 1024), // 5 MB
  })).min(1).max(5),
});
```

**Réponse** : `200 OK`

```ts
{
  uploads: Array<{
    uploadId: string;                // UUID v4, persisté en DB (UploadIntent.id)
    presignedUrl: string;            // URL S3 PUT, expire en 5 minutes
    expiresAt: string;               // ISO datetime
    requiredHeaders: Record<string, string>;
  }>;
}
```

**Comportement serveur** :
1. Pour chaque fichier demandé, crée un `UploadIntent` en DB avec
   `purpose`, `expectedContentType`, `expectedContentLength`, `objectKey` (`conformite/{conseillerId}/{uploadId}`).
2. Génère l'URL signée S3 PUT (durée 5 min).
3. Retourne `uploadId` (= UploadIntent.id).

**Validation au POST de submission** : à la création de submission,
`SubmitDossierUseCase` vérifie chaque `uploadId` référencé :
- Existe dans `conformite_upload_intents`.
- `conseillerComplianceId == requestedBy`.
- `expiresAt > NOW()`.
- `consumedAt IS NULL` (puis marqué consumed dans la même transaction).
- HEAD S3 confirme `Content-Type` et `Content-Length` correspondent au
  `UploadIntent`.

**Rejet** : `uploadId` inconnu, expiré, déjà consommé, ou propriété d'un
autre conseiller → `403 Forbidden`. Empêche la forge d'`uploadId` (B2 du
review).

---

### `GET /api/v1/conformite/me`

Vue du dossier conseiller (US5, FR-013).

**Réponse** : `200 OK` — dossier complet du conseiller authentifié,
incluant : statut courant, certificats avec dates d'expiration,
affiliations actives, historique d'événements (paginé, 20 derniers
événements + lien `nextPageToken`).

---

### `POST /api/v1/conformite/me/erasure-request`

Demande d'effacement Loi 25 (FR-017).

**Body** :

```ts
ErasureRequestSchema = z.object({
  confirmation: z.literal('I_UNDERSTAND_THIS_IS_IRREVERSIBLE'),
});
```

**Réponse** : `202 Accepted` — l'effacement est traité de manière asynchrone
(job BullMQ `EraseConseillerDataJob` qui anonymise profil + documents et
journalise l'événement). Le journal d'audit est conservé 7 ans.

---

## Endpoints admin

### `GET /api/v1/conformite/admin/queue`

File de revue paginée (FR-003).

**Query params** :

```ts
QueueQuerySchema = z.object({
  status: z.enum(['pending', 'verified', 'suspended', 'revoked']).default('pending'),
  page: z.number().int().min(1).default(1),
  pageSize: z.literal(20),
});
```

**Réponse** : `200 OK`

```ts
{
  items: Array<{
    submissionId: string;
    conseillerId: string;
    submittedAt: string;
    status: ConformiteStatus;
    certificatesCount: number;
    affiliationsCount: number;
  }>;
  totalCount: number;
  page: number;
  pageSize: 20;
}
```

**RBAC** : `requestedBy.role === 'admin'`.

---

### `GET /api/v1/conformite/admin/submissions/{submissionId}`

Détail d'une soumission pour revue (US1).

**Réponse** : `200 OK` — contenu complet + URLs signées GET 5 minutes pour
visualiser les documents (Content-Disposition: attachment forcé — R5).

---

### `POST /api/v1/conformite/admin/submissions/{submissionId}/approve`

Approbation d'une soumission (US1, FR-004).

**Body** :

```ts
ApproveSchema = z.object({
  comment: z.string().max(500).optional(),
});
```

**Réponse** : `200 OK` — déclenche `ApproveDossierUseCase` qui :
1. Marque la soumission `approved`.
2. Recalcule le statut conformité du conseiller via `computeConformiteStatus`.
3. Publie l'événement `ConformiteStatusChanged` si transition.
4. Émet une notification (via `NotificationPort`).
5. Journalise dans `AuditEntry`.

**RBAC + Audit** : `requestedBy.role === 'admin'`, `requestedBy.id` enregistré comme `actorId`.

---

### `POST /api/v1/conformite/admin/submissions/{submissionId}/refuse`

Refus d'une soumission (FR-004).

**Body** :

```ts
RefuseSchema = z.object({
  reason: z.string().min(20).max(2000),  // FR-004 exige ≥ 20 chars
});
```

**Réponse** : `200 OK`.

---

### `POST /api/v1/conformite/admin/conseillers/{conseillerId}/revoke`

Révocation manuelle (US4, FR-010).

**Body** :

```ts
RevokeSchema = z.object({
  reason: z.string().min(20).max(2000),
});
```

**Réponse** : `200 OK`. Déclenche `RevokeConseillerUseCase`.

---

### `POST /api/v1/conformite/admin/permits/revoke`

Déclaration de retrait de permis (FR-015).

**Body** :

```ts
PermitRevokeSchema = z.object({
  agencyPermitNumber: z.string().min(1).max(50),
  agencyProvince: z.enum(['QC', 'ON']),
  reason: z.string().min(20).max(2000),
});
```

**Réponse** : `200 OK` avec compteur :

```ts
{
  permitRevocationId: string;
  affectedConseillerCount: number;     // # conseillers dont l'affiliation devient inactive
  conseillerSuspensionCount: number;   // # conseillers basculés en suspended
}
```

Cas d'usage `DeclarePermitRevokedUseCase` :
1. Insère `PermitRevocation` (unique sur `(permitNumber, province)` — idempotent).
2. Pour chaque `Affiliation` correspondante, met `inactivatedBy = 'permit_revocation'`, `inactivatedAt = now`.
3. Recalcule `ConformiteStatus` de chaque conseiller affecté.
4. Publie les événements `ConformiteStatusChanged` impactés.
5. Journalise un `permit.revoked_by_admin` + un `permit.cascade_applied` par conseiller affecté.

---

### `GET /api/v1/conformite/admin/conseillers/{conseillerId}/audit`

Journal d'audit consultable par admin (FR-012).

**Query params** : pagination cursor-based (event count peut être grand).

**Réponse** : `200 OK` — entrées en ordre antichronologique, sans
modification possible (lecture seule).

---

## Endpoints système (interne, pas exposés publiquement)

Ces endpoints sont uniquement appelés par BullMQ workers ou des admins root.
Protégés par un secret partagé (`X-Internal-Token`) ou exécutés dans le même
process via injection directe (sans HTTP).

- `POST /api/v1/conformite/_system/expiration-sweep` — lance le job
  quotidien (FR-008, FR-009).
- `POST /api/v1/conformite/_system/replay-event/{auditEntryId}` — uniquement
  pour debugging incident (audit log d'accès consigné).

---

## En-têtes HTTP par défaut (Principe IX)

Tous les endpoints retournent :

- `Content-Security-Policy: default-src 'self'; ...` (configuration globale Helmet)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Les endpoints qui rendent un document ajoutent :
- `Content-Disposition: attachment; filename="..."` (R5 — pas de prévisualisation inline).

---

## Rate limiting

| Endpoint | Limite |
|---|---|
| `POST /me/submissions` | 5 / heure / conseiller |
| `POST /me/upload-urls` | 20 / heure / conseiller |
| `POST /admin/permits/revoke` | 5 / heure / admin |
| `GET /admin/queue` | 60 / minute / admin |
| Tous les autres | 100 / minute / utilisateur (défaut Nest @nestjs/throttler) |

Implémentation : `@nestjs/throttler` avec backing Redis (partagé entre instances horizontales si scaling out).
