# Contract — Endpoints HTTP + Server Actions

**Routes Next.js App Router** (apps/web) et **routes NestJS** (apps/api).
Toutes les routes utilisateur sont en FR-CA (Principe IV).

---

## Routes publiques (anonymes)

### `GET /conseiller/<slug>` — Page publique conseiller

- **Rendu** : Next.js SSG avec ISR on-demand (cf. R4). `generateStaticParams`
  énumère les slugs `pret` au build, `revalidatePath` invalide à chaque
  transition.
- **Headers spécifiques** :
  - `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400` (filet
    de sécurité en cas d'event listener HS).
  - Métadonnées Open Graph + Schema.org `Person` minimal (cf. plan
    Principe XII).
- **Comportement** :
  - Lecture via `LirePageProfilPubliqueUseCase`.
  - Si retour `null` → `notFound()` Next.js → 404 `not-found.tsx` partagé.
- **CTA unique** : `<a href="/intake?suggested=<conseillerId>">Décrivez votre projet</a>` (FR-008).
- **Sections** :
  - Hero : photo + nom affiché + titre.
  - Biographie.
  - Spécialités, langues, zones d'expertise.
  - Certifications visibles (lues via conformité).
  - Section pédagogique « Pourquoi je ne peux pas contacter ce conseiller directement ? » (FR-009).
  - CTA bas de page (répétition).

### `GET /sitemap.xml` — Sitemap dynamique des profils publiables

- **Rendu** : Next.js `app/sitemap.ts` (route segment) — calculé au build
  + ISR 1 h.
- **Format** : XML standard `urlset` :

```xml
<url>
  <loc>https://conseiller-voyage.ca/conseiller/marie-dupont</loc>
  <lastmod>2026-05-20T14:30:00Z</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.7</priority>
</url>
```

- **Lecture** : `ProfilPublicReader.lireSlugsPubliables()` (cf.
  profil-public.port.md).

### `GET /not-found` (page 404 partagée) — anti-énumération

- **Rendu** : Next.js `app/not-found.tsx`, **statique** (pas de variables).
- **Status HTTP** : `404 Not Found`.
- **Body** : identique pour TOUS les cas non-visibles (slug inexistant,
  profil masqué, etc.). Aucun message différenciant.
- **Headers** : standard (pas de `X-*` indiquant la raison du 404).
- **Test d'invariant** : `tools/check-anti-enum-profile.ts` (cf. plan)
  vérifie en CI que les 5 cas 404 produisent un corps HTTP identique.

### `GET /intake?suggested=<id>` — Intake avec param `suggested`

- **Comportement** : middleware Next.js extrait le paramètre, valide,
  pose le cookie HMAC `cv_suggested`, redirect 302 vers `/intake`
  (URL propre). Cf. `intake-suggested-middleware.md`.
- **Page `/intake` elle-même** : sera implémentée par feature 008. Pour
  005, le middleware existe mais la page peut rester un placeholder.

---

## Routes authentifiées conseiller

Toutes derrière `(conseiller)` layout group avec middleware auth + MFA
+ CGU + (optionnel) RoleGuard `conseiller`.

### `GET /conseiller` — Dashboard

- **Rendu** : RSC. Lit `LireProfilPriveUseCase` + données conformité.
- **Widgets** :
  - Conformité : statut + date d'expiration prochaine (< 60 j).
  - Profil : statut + lien édition + raison masquage admin si applicable.
  - Leads : placeholder « Bientôt disponible — feature 012 » avec lien
    vers la roadmap.
  - Facturation : placeholder « Bientôt disponible — feature 006-007 ».
  - Avertissements persistants (FR-012, FR-012a) en haut de page.

### `GET /conseiller/profil` — Édition profil

- **Rendu** : RSC + Server Actions.
- **Formulaire** : react-hook-form + Zod (`EditerProfilDto`) + shadcn
  components.
- **Server Action `editerProfil`** : consomme `EditerProfilUseCase`.
- **Server Action `uploaderPhoto`** : consomme `UploaderPhotoUseCase`.
  Upload via `<input type="file">` POST multipart, traité côté serveur
  (pas d'exposition de credentials S3 au client).

### `GET /conseiller/profil/apercu` — Aperçu public

- **Rendu** : même composant que la page publique, mais consomme
  `PrevisualiserProfilUseCase` pour récupérer `payloadPublic +
  bandeauApercu`.
- **Si `bandeauApercu` non-nul** : `<div role="alert">` jaune en haut
  de page avec liste des champs manquants (FR-013).

---

## Routes authentifiées admin

Derrière `(admin)` layout group avec auth + MFA + RoleGuard `admin`.
Intégrées à la console conformité existante (feature 001) — onglet
« Profils ».

### `GET /admin/profils` — Liste des profils (modération)

- **Rendu** : RSC. Lit tous les profils avec leur statut +
  prochaine action possible.
- **Filtres** : par statut (`tous` | `incomplet` | `pret` | `masque_admin`).
- **Recherche** : par nom légal (lu via conformité) ou slug.

### `GET /admin/profils/<id>` — Détail + actions

- **Rendu** : RSC.
- **Sections** : profil rendu en lecture seule, historique des audits
  modération, actions disponibles (« Retirer photo », « Masquer profil »,
  « Rétablir »).
- **Server Actions** :
  - `retirerPhotoAdmin` → `RetirerPhotoAdminUseCase` (raison obligatoire ≥ 10
    chars).
  - `masquerProfilAdmin` → `MasquerProfilAdminUseCase` (raison obligatoire).
  - `retablirProfilAdmin` → `RetablirProfilAdminUseCase` (raison optionnelle).
- **Modale de confirmation** Radix Dialog avec focus trap (Principe XI).

---

## Routes API REST (NestJS) — appelées par les Server Actions

Hébergées sur `apps/api`, consommées principalement par les Server Actions
Next.js (auth via cookie session partagée). Pas d'API publique exposée à
des tiers (les Server Actions assurent l'authn).

### `POST /api/profil` — Édition (conseiller authentifié)

- **Auth** : `@UseGuards(AuthGuard, RoleGuard('conseiller'), CguGuard)`.
- **Body** : `EditerProfilDto` (Zod).
- **Réponses** (mapping `Result<EditerProfilSuccess, EditerProfilError>`) :
  - `200 OK` avec `EditerProfilSuccess` (cf. profil-edition.port.md).
  - `400 Bad Request` `{ kind: 'VALIDATION_FAILED' }` — body `{champ, messageFr}`.
  - `403 Forbidden` `{ kind: 'OWNERSHIP_MISMATCH' }`.
  - `409 Conflict` `{ kind: 'PROFIL_ANONYMISE' | 'CGU_OBSOLETES' }`.
  - `503 Service Unavailable` `{ kind: 'CONFORMITE_INDISPONIBLE' }`.

### `POST /api/profil/photo` — Upload photo (multipart)

- **Auth** : idem.
- **Body** : `multipart/form-data` avec un champ `file`.
- **Réponses** (mapping `Result<UploaderPhotoSuccess, UploaderPhotoError>`) :
  - `200 OK` avec `UploaderPhotoSuccess`.
  - `400` `{ kind: 'OWNERSHIP_MISMATCH' }`.
  - `409` `{ kind: 'PROFIL_ANONYMISE' }`.
  - `413 Payload Too Large` `{ kind: 'TAILLE_DEPASSE' }` (body inclut tailleOctets).
  - `415 Unsupported Media Type` `{ kind: 'FORMAT_NON_SUPPORTE' }`.
  - `422 Unprocessable Entity` `{ kind: 'CONTENU_NON_IMAGE' | 'DIMENSIONS_DEPASSE' }`.
  - `429 Too Many Requests` `{ kind: 'RATE_LIMIT_DEPASSE' }` + `Retry-After` header.
  - `503` `{ kind: 'STORAGE_HS' }`.

### `GET /api/profil/me` — Lecture du profil privé

- **Auth** : idem.
- **Réponse** : `200 OK` avec `ProfilPrivePayload`.

### `POST /api/profil/apercu` — Lecture aperçu

- **Auth** : idem.
- **Réponse** : `200 OK` avec `ProfilPreviewPayload`.

### `POST /api/admin/profils/:id/retirer-photo`

- **Auth** : `@UseGuards(AuthGuard, RoleGuard('admin'), StepUpGuard)`.
  StepUpGuard requiert une re-vérification MFA fraîche (< 30 min) car
  l'action est destructrice (Principe IX, pattern 002 sur change-password).
- **Body** : `{ raison: string }` (min 10 chars).
- **Réponse** : `200 OK` avec `RetirerPhotoAdminResult`.

### `POST /api/admin/profils/:id/masquer`

- **Auth** : `@UseGuards(AuthGuard, RoleGuard('admin'), StepUpGuard)`.
  StepUpGuard pour cohérence (l'action masque immédiatement un profil
  public + envoie courriel au conseiller — impact réversible mais visible).
- **Body** : `{ raison: string }` (min 10 chars).

### `POST /api/admin/profils/:id/retablir`

- **Auth** : `@UseGuards(AuthGuard, RoleGuard('admin'))` (sans StepUp —
  action constructive, pas destructrice).
- **Body** : `{ raison?: string }`.

### Endpoint interne `/api/internal/profil/:id/anonymiser-loi25`

- **Auth** : `@InternalOnly` (consommé par orchestrateur 023 uniquement,
  vérification via header `X-Internal-Service-Token`).
- **Body** : `{ orchestrateurReference: string }`.
- **Réponse** : `200 OK`.

### `POST /api/revalidate` (callback Next.js) — utilitaire R4

- **Auth** : header `Authorization: Bearer ${CV_REVALIDATE_SECRET}`.
- **Body** : `{ path: string }`.
- **Réponse** : `200 OK` après `revalidatePath(path)`.
- **Sécurité** : secret rotation indépendante, scope « ne révoque pas
  les cookies utilisateurs si compromis ».

---

## Headers HTTP par défaut

Configurés via Fastify Helmet (existant 002) + Next.js Headers config :

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` strict (no inline script sans nonce ; déjà
  configuré 002).

Routes admin et conseiller : `<meta name="robots" content="noindex, nofollow">`.

Page publique `/conseiller/<slug>` et `/sitemap.xml` : pas de `noindex`
(au contraire, cible SEO Principe XII).

---

## Liste consolidée des routes

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/conseiller/<slug>` | Anonyme | Page publique (SSG ISR) |
| GET | `/sitemap.xml` | Anonyme | Sitemap des profils publiables |
| GET (any) | `/intake?suggested=<id>` | Anonyme | Middleware pose cookie + redirect /intake |
| GET | `/conseiller` | Conseiller | Dashboard |
| GET | `/conseiller/profil` | Conseiller | Édition |
| GET | `/conseiller/profil/apercu` | Conseiller | Aperçu public |
| GET | `/admin/profils` | Admin | Liste modération |
| GET | `/admin/profils/<id>` | Admin | Détail + actions |
| POST | `/api/profil` | Conseiller (session) | Édition |
| POST | `/api/profil/photo` | Conseiller (session) | Upload photo |
| GET | `/api/profil/me` | Conseiller (session) | Lecture profil privé |
| POST | `/api/profil/apercu` | Conseiller (session) | Aperçu |
| POST | `/api/admin/profils/:id/retirer-photo` | Admin (session + step-up) | Retrait photo |
| POST | `/api/admin/profils/:id/masquer` | Admin (session + step-up) | Masquage |
| POST | `/api/admin/profils/:id/retablir` | Admin (session + step-up) | Rétablissement |
| POST | `/api/internal/profil/:id/anonymiser-loi25` | Service token | Anonymisation Loi 25 |
| POST | `/api/revalidate` | Bearer secret | Invalidation ISR |
