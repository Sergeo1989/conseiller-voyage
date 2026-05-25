# Plan d'implémentation : Mentions légales, CGU, politique de confidentialité et page « Comment ça marche »

**Branche** : `004-mentions-legales` | **Date** : 2026-05-25 | **Spec** : [spec.md](./spec.md)

**Entrée** : Spécification fonctionnelle issue de `specs/004-mentions-legales/spec.md`

---

## Résumé

Cinq pages statiques (`/mentions-legales`, `/cgu-voyageur`, `/cgu-conseiller`,
`/confidentialite`, `/comment-ca-marche`) + un footer permanent statique +
une extension du module `identité` existant pour tracer les acceptations
horodatées Loi 25.

**Approche technique** : pages Next.js 15 App Router en SSG sous un segment
`(legal)` avec un layout partagé. Contenu éditorial en fichiers MDX
`packages/legal-content/<locale>/<slug>.mdx` versionnés dans le repo
(versionnement explicite via frontmatter `version: N` + checksum SHA-256 +
`contentSnapshot` archivé en BD à publication pour permettre la
re-consultation d'une version historique acceptée). Footer composant React
**purement statique** (année du copyright commitée, sans dynamic).

Côté serveur, trois nouvelles tables Prisma dans le schéma du module
`identité` :

- `auth_legal_documents` (immutable post-seed)
- `auth_legal_acceptances` (strictement append-only)
- `auth_legal_acceptance_anonymizations` (append-only, matérialise
  l'effacement Loi 25 sans toucher l'acceptation originale)

Quatre nouveaux use cases : `AcceptCguB2bUseCase`,
`AcceptIntakeConsentUseCase`, `CheckCguUpToDateUseCase`,
`AnonymizeLegalAcceptancesUseCase` (appelé en chaîne depuis l'extension
de `EraseConseillerDataUseCase` livré en 001). Un port public
`LegalAcceptanceFacade` consommé par le module 002-voyageur-intake — la
façade **encapsule sa propre transaction Prisma** (cf. research R7, ne
partage pas de client avec le module appelant).

Middleware Next.js qui, sur les routes authentifiées du conseiller, vérifie
via un **cookie HMAC signé** (`__Host-cv.legal-version`, TTL 5 min, cf.
research R8) que la version `cgu_b2b` acceptée n'est pas obsolète et
redirige vers `/cgu-conseiller/re-accepter` si nécessaire. Si cookie
absent ou signature invalide, fallback sur `GET /api/me/legal/version-status`.

Deux nouveaux ADRs documentent les décisions structurantes :
**ADR-0008** (anonymisation Loi 25 par hash salé) et **ADR-0009**
(middleware Next.js + cookie HMAC).

---

## Technical Context

Stack figée par la constitution v2.2.0 — détails ci-dessous.

| Élément | Valeur |
|---|---|
| Langage / version | TypeScript ≥ 5, mode `strict` |
| Frontend principal | Next.js 15 App Router (RSC par défaut), Tailwind CSS v4, shadcn/ui, react-hook-form + Zod, **next-intl** (déjà configuré), date-fns (`fr-CA`) |
| Contenu éditorial | **MDX** sous `packages/legal-content/<locale>/<slug>.mdx` avec frontmatter (version, publishedAt, effectiveAt, checksum) — pas de CMS au MVP |
| Backend (extension `identité`) | NestJS 10 + Fastify, Prisma 5, Zod, Pino, **`ua-parser-js` v2** (anonymisation User-Agent — cf. research R6) |
| DB | PostgreSQL 16 `ca-central-1` (extension du schéma existant — 3 nouvelles tables : `auth_legal_documents`, `auth_legal_acceptances`, `auth_legal_acceptance_anonymizations`) |
| Tests | Vitest (unit + intégration), Playwright (e2e), **axe-core** (a11y CI bloquant), **Lighthouse CI** (Perf/SEO/A11y bloquant) |
| Plateforme cible | Node.js 22 LTS, AWS ECS Fargate `ca-central-1` (existant), CloudFront CDN |
| Performance | LCP < 1,5 s (sous budget 2,5 s), INP < 200 ms, CLS < 0,1 ; Lighthouse Perf ≥ 90, SEO ≥ 95, A11y ≥ 95 |
| Type de projet | Application web (Next.js + NestJS, monorepo pnpm + Turborepo) |
| Volumétrie | 5 pages publiques × 2 locales (FR-CA livré, EN placeholder) = 10 routes ; ~1 acceptation/conseiller au signup ; ~2 acceptations/brief intake × ~50 briefs/mois = ~100 `LegalAcceptance`/mois année 1 |
| Contraintes | WCAG 2.1 AA bloquant (Principe XI), CWV bloquant (Principe XII), FR-CA primary (Principe IV), résidence ca-central-1 (Principe II), juridiction Montréal/Québec |
| Sécurité | RBAC : conseiller authentifié pour POST `/me/legal/accept` (CGU B2B) ; sans auth pour le brief intake (le voyageur est anonyme, lié par `briefId`). Validation Zod côté serveur. Idempotence : clé unique `(subjectId, documentType, documentVersion)`. |

Aucun item **NEEDS CLARIFICATION** — les 3 questions initiales de la spec
ont été résolues (Q1=B deux CGU, Q2=A entité Québec NEQ, Q3=A juridiction
Montréal) et 2 questions secondaires (juriste, cookies) sont des hypothèses
documentées.

---

## Constitution Check

*Réalisé avant Phase 0. Re-vérifié après Phase 1 (cf. section finale).*

Source de vérité : [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v2.2.0.

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

Cette feature **EST** l'énoncé public du Principe I. La page
`/comment-ca-marche` (FR-008) affirme explicitement et de manière visible
que la plateforme n'est PAS une agence de voyages au sens de la Loi sur les
agents de voyages du Québec ni de la *Travel Industry Act* de l'Ontario,
et qu'elle ne participe à aucune transaction de voyage. La page
`/mentions-legales` fixe la juridiction québécoise (FR-007).

Aucune touche à une transaction de voyage : la feature ne crée ni n'expose
de réservation, paiement client, ou versement fournisseur. Les acceptations
collectées concernent uniquement le consentement légal d'utilisation, pas
une transaction commerciale.

Aucune mutation du filtrage `verified` côté conseiller — la feature ne
touche pas au module `conformité`.

✅ **Conforme.**

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

Données personnelles collectées via `LegalAcceptance` :

- `subjectId` (UUID conseiller ou `briefId` voyageur)
- `ipAddress` (Loi 25 traçabilité technique, art. 8)
- `userAgent` (idem)
- `acceptedAt` (UTC)

Justification par minimisation : chaque champ sert directement à la preuve
de consentement éclairé (Loi 25 art. 8 « consentement libre, éclairé et
spécifique »). Aucun champ marketing, démographique, ou non nécessaire.

Résidence canadienne (Principe II) : PostgreSQL `ca-central-1` (extension
du schéma existant en 001 — aucune nouvelle infrastructure régionale).

Effacement (FR-019) : l'`EraseConseillerDataUseCase` (déjà livré en 001)
sera étendu pour anonymiser les `LegalAcceptance` du conseiller —
`subjectId` remplacé par `sha256(subjectId || project_salt)`. Les
acceptations restent comme preuve historique d'engagement, conformément à
l'arbitrage déjà acté pour le journal d'audit conformité (obligation de
preuve > droit à l'effacement).

Rétention : `LegalAcceptance` conservées 7 ans après la dernière
acceptation, alignées sur le journal d'audit conformité.

✅ **Conforme.**

### III. Qualité de lead avant volume

**Non applicable directement** — cette feature ne crée ni ne route de lead.
Mais la page `/comment-ca-marche` **éduque** explicitement le voyageur sur
le plafond de 3 conseillers et le pourquoi de l'intake, ce qui pose les
fondations narratives pour que le plafond soit accepté plutôt que subi.
Impact indirect positif.

✅ **Conforme par non-application.**

### IV. Français d'abord

Les 5 pages livrées en FR-CA au lancement. Structure i18n via `next-intl`
déjà en place (livrée en 001). Catalogues EN créés vides (placeholder)
pour matérialiser la structure. Aucune chaîne hardcodée — toutes les
strings passent par `getTranslations()` (RSC) ou `useTranslations()`
(client).

Formats régionaux : dates `dd MMMM yyyy` en FR-CA via la fonction
`formatDate` partagée (livrée en 001).

Juridiction québécoise + droit civil québécois (FR-007) — cohérent avec
le positionnement FR-CA.

Le script de check CI `tools/check-no-hardcoded-strings.ts` (livré en
001 pour les pages conformité) sera étendu à
`apps/web/src/app/[locale]/(legal)/**` dans cette feature.

✅ **Conforme.**

### V. Architecture : monolithe modulaire

Aucun nouveau module. Extension du module `identité` existant :

- 3 nouvelles tables Prisma (préfixe `auth_` cohérent avec Auth.js) :
  `auth_legal_documents`, `auth_legal_acceptances`,
  `auth_legal_acceptance_anonymizations`.
- 4 nouveaux use cases dans
  `apps/api/src/modules/identite/application/use-cases/` :
  `AcceptCguB2bUseCase`, `AcceptIntakeConsentUseCase`,
  `CheckCguUpToDateUseCase`, `AnonymizeLegalAcceptancesUseCase`.
- 1 port public `LegalAcceptanceFacade` exposé par le module identité —
  consommé par 002-voyageur-intake.

**Frontière modulaire respectée pour la transaction cross-module**
(cf. research R7 — décision Alt 2) : la façade `acceptForBrief()`
encapsule sa propre transaction Prisma côté `identité`. Le module 002
n'ouvre **jamais** une transaction qu'il partagerait avec `identité`.
Le brief est créé en état `consent_pending` ; après succès du
`acceptForBrief × 2`, il passe à `consent_ok`. Un job BullMQ orphan
cleanup détecte les briefs `consent_pending > 1h` et les marque
`consent_failed`.

Enforcement de la frontière modulaire (déjà en place via 001) :
`tools/check-module-boundaries.ts` garantit qu'aucun module externe
n'importe directement les tables `auth_legal_*` ni le client Prisma
d'`identité` — passage obligatoire par la façade.

Aucun appel LLM dans cette feature.

✅ **Conforme.**

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

Logique métier sensible :

1. **`compareLegalVersion(currentDocumentVersion, lastAcceptedVersion): 'up_to_date' | 'outdated' | 'never_accepted'`**
   — fonction pure dans `packages/legal/src/version.ts`. Pas d'I/O.
2. **`shouldRequireReacceptance(acceptance | null, documentVersion): boolean`**
   — fonction pure, couvre les cas `null` (jamais accepté),
   `acceptance.version < documentVersion` (obsolète),
   `acceptance.version === documentVersion` (à jour).
3. **`AcceptCguB2bUseCase.execute(input)`** et
   **`AcceptIntakeConsentUseCase.execute(input)`** — tests écrits AVANT
   l'implémentation dans des commits séparés visibles dans git (cycle
   Red-Green-Refactor).

Couverture par cas explicite : nominal + cas d'erreur (idempotence sur
double acceptation, version inconnue, document inexistant, refus de
consentement, conseiller anonymisé).

✅ **Conforme — porte 2 de la constitution s'appliquera au moment des PR.**

### VII. Observabilité de la boucle économique

Cette feature ne touche pas directement aux 4 métriques de premier ordre
(intake completion, % leads acceptés, conversion lead→devis, churn
conseiller). Elle alimente cependant des métriques de conformité
réglementaire utiles pour audit :

- `legal_acceptances_total{type, version}` — compteur par type de document
  et version acceptée
- `legal_reacceptance_required_total` — combien de conseillers redirigés
  vers la ré-acceptation après bump de version
- `legal_document_publish_total{type}` — bump de version d'un document

Aucune alerte critique (la conformité n'est pas une boucle économique),
mais une alerte WARN si `legal_reacceptance_required_total` reste > 10
pendant > 7 jours (indique que des conseillers ne se reconnectent pas
post-bump — possible signal de churn).

Dashboard Grafana lié dans le README du module `identité` au moment de la
livraison.

✅ **Conforme.**

### VIII. Clean Architecture et SOLID

Structure en quatre couches strictes (cohérent avec le pattern établi par
001) :

- `domain/entities/` : `LegalDocument`, `LegalAcceptance`,
  `LegalAcceptanceAnonymization` (TypeScript pur, zéro import NestJS/Prisma).
- `domain/value-objects/` : `LegalDocumentType` (enum `mentions_legales` |
  `cgu_b2c` | `cgu_b2b` | `confidentialite` | `comment_ca_marche`),
  `DocumentVersion` (entier positif monotone).
- `application/use-cases/` : `AcceptCguB2bUseCase`,
  `AcceptIntakeConsentUseCase`, `CheckCguUpToDateUseCase`,
  `AnonymizeLegalAcceptancesUseCase` (appelé depuis l'extension de
  `EraseConseillerDataUseCase` livré en 001).
- `application/ports/` : `LegalAcceptanceReader`, `LegalAcceptanceWriter`,
  `LegalDocumentRepository`, `LegalAcceptanceAnonymizationWriter`.
- `infrastructure/` : `PrismaLegalAcceptanceRepository`,
  `PrismaLegalDocumentRepository`,
  `PrismaLegalAcceptanceAnonymizationRepository`.
- `interface/http/` : `LegalAcceptanceController` (POST
  `/api/me/legal/accept`, GET `/api/me/legal/version-status`).
- `interface/public-api/` : `LegalAcceptanceFacade` consommée par le
  module 002-voyageur-intake.

SOLID appliqué :

- **S** : un cas d'usage = une action (`AcceptCguB2b` ≠ `AcceptIntakeConsent`).
- **O** : ajout d'un nouveau type de document = ajout d'une valeur d'enum + nouveau MDX, pas de modification de la logique d'acceptation.
- **L** : ports avec fakes en mémoire dans `_fakes.ts`.
- **I** : `LegalAcceptanceReader` scindé de `LegalAcceptanceWriter` (un consommateur lecture pure ne dépend pas du writer).
- **D** : application dépend uniquement des ports.

✅ **Conforme.**

### IX. Sécurité applicative (NON-NÉGOCIABLE)

- **RBAC** : `AcceptCguB2bUseCase` vérifie que `requestedBy.role === 'conseiller'`. `AcceptIntakeConsentUseCase` est appelé par le module 002 avec un `briefId` issu de sa propre validation interne — le voyageur n'est pas authentifié.
- **AuthN** : conseiller authentifié via Auth.js v5 (déjà en place via 001). Pas de MFA pour cette feature (l'acceptation des CGU n'est pas une action sensible élevée — le MFA reste pour les actions matching côté conseiller, cf. spec MFA à venir).
- **CSRF** : `CsrfProtectionMiddleware` (livré en 001) appliqué à POST `/api/me/legal/accept`.
- **Validation Zod** côté serveur sur tous les payloads. Schémas partagés via `packages/legal/src/schemas.ts`.
- **En-têtes HTTP** : déjà configurés via Fastify hooks en 001 (CSP, HSTS, etc.).
- **Cookie middleware HMAC signé** (cf. research R8) : `__Host-cv.legal-version`, `HttpOnly`, `Secure`, `SameSite=Lax`, payload signé HMAC-SHA256 avec un nouveau secret `LEGAL_COOKIE_HMAC_SECRET` (32 bytes, AWS Secrets Manager `ca-central-1`). Empêche la forge côté client.
- **Idempotence** : (a) clé unique Prisma `(subjectId, documentType, documentVersion)` empêche les doublons fonctionnels ; (b) header `Idempotency-Key` honoré via l'interceptor livré en 001 (rejeu HTTP exact). Les deux mécanismes coexistent — détails dans `contracts/http-endpoints.md`.
- **Checklist OWASP Top 10** revue par endpoint (cf. `contracts/http-endpoints.md`).
- **Nouveaux secrets** : `LEGAL_COOKIE_HMAC_SECRET` (cookie HMAC) ; `LOI25_SUBJECT_ANONYMIZATION_SALT` (cf. R3+R9, threat model documenté). Tous en AWS Secrets Manager `ca-central-1`, IAM read-only sur rôle ECS Fargate de l'app.
- **Aucun SQL brut** : Prisma exclusivement.
- **Uploads** : aucun (pages statiques + acceptations).

✅ **Conforme.**

### X. Fiabilité et résilience

**SLO** :

- Pages SSG : LCP < 1,5 s P95 (largement sous le budget 2,5 s — pages
  statiques pré-rendues CDN).
- POST `/api/me/legal/accept` : p95 < 200 ms (simple insert Prisma +
  audit).
- Disponibilité : 99,5 % mensuel (héritée de l'infrastructure).

**Idempotence** obligatoire (Principe X) :

- POST `/api/me/legal/accept` : idempotent par contrainte DB unique
  `(subjectId, documentType, documentVersion)`. Rejeu retourne 200 sans
  effet de bord.
- `LegalAcceptanceFacade.acceptIntakeConsent()` (consommé par 002) :
  idempotent sur `(briefId, documentType, documentVersion)`.

**Modes dégradés** :

- **DB primaire HS** → POST `/api/me/legal/accept` retourne 503 avec
  message FR-CA. Le conseiller ne peut pas finaliser son signup tant que
  l'écriture n'est pas confirmée (Principe IX : pas de compte sans
  consentement tracé). UI affiche bannière dégradé.
- **`acceptForBrief` côté 002 échoue après création du brief** → brief
  reste en état `consent_pending`. Job BullMQ orphan cleanup quotidien
  marque les briefs `consent_pending > 1h` à `consent_failed`. Le brief
  n'est jamais visible côté matching avant `consent_ok`. Cohérent avec
  research R7 (Alt 2).
- **MDX content unavailable** (régression bundle) → pages statiques
  pré-rendues servent depuis le CDN même si l'app est down. C'est tout
  l'intérêt du SSG.
- **Bump de version échoue mid-deploy** → version courante en BD reste
  la précédente jusqu'à idempotent retry du `seed-legal-documents.ts`.
  Les `contentSnapshot` archivés en BD garantissent que les versions
  historiques restent affichables même si le repo Git change.

**Circuit breakers** : non pertinent (pas d'appel externe).

**Health checks** : déjà couverts par les endpoints `/healthz` et
`/readyz` existants en 001.

✅ **Conforme.**

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE)

- **axe-core CI bloquant** sur les 5 pages + le composant `Footer`. Test
  Playwright a11y dans `apps/web/test/a11y/legal.spec.ts`.
- **Navigation clavier intégrale** : tous les liens du footer focusables
  séquentiellement avec focus visible (outline 2 px, contraste ≥ 4.5:1).
- **Contraste** ≥ 4.5:1 sur tout texte (vérifié via outils a11y dev en
  pré-PR + axe-core en CI).
- **Touch targets** ≥ 44 × 44 px sur les liens du footer (vérifié sur
  viewport ≤ 375 px via Playwright responsive test).
- **Lecteur d'écran** : audit `aria-label` sur les liens du footer
  (« Mentions légales — ouvre la page des mentions légales »), titres
  `<h1>` uniques par page, hiérarchie `<h2>` `<h3>` cohérente, landmarks
  `<main>` `<footer>` explicites.
- **Page d'acceptation CGU au signup** : labels associés aux checkboxes,
  message d'erreur en `aria-live="polite"`, focus géré sur soumission.
- **`prefers-reduced-motion`** respecté (déjà global via `layout.tsx`
  livré en 001).
- **Audit lecteur d'écran** manuel (NVDA ou VoiceOver) à la release.

✅ **Conforme.**

### XII. Optimisation SEO (NON-NÉGOCIABLE)

- **SSR/SSG** : les 5 pages sont rendues statiquement (`export const
  dynamic = 'force-static'`). Pas de RSC dynamique. Pages servies depuis
  CloudFront.
- **Footer purement statique** : aucune donnée dynamique (pas de version
  courante CGU, pas d'année calculée). Année du copyright hardcodée et
  bumpée par commit explicite annuel (rappel calendrier janvier).
  Préserve la garantie SSG (`force-static`).
- **CWV budgets** : LCP < 2,5 s, INP < 200 ms, CLS < 0,1. Pages
  ultra-légères (texte + footer) — atteint trivialement. Lighthouse CI
  bloquant en pipeline.
- **Métadonnées** : chaque page a `<title>`, `<meta name="description">`,
  OpenGraph (`og:title`, `og:description`, `og:locale`, `og:type`),
  Twitter cards, canonical URL.
- **JSON-LD** : schéma `WebPage` (avec `inLanguage`, `dateModified`) sur
  chaque page. La page `/mentions-legales` ajoute un schéma
  `Organization` avec `name`, `address` (PostalAddress), `email`.
- **Sitemap** : les 5 pages (FR-CA + EN placeholder) ajoutées au
  `sitemap.xml`. Au MVP, sitemap statique généré au build ; feature 017
  (Tier 3) le rendra dynamique.
- **hreflang** : `<link rel="alternate" hreflang="fr-CA">` et
  `hreflang="x-default">` (héritage du layout livré en 001). EN ajouté
  quand le contenu EN sera traduit.
- **Indexabilité** : aucun `noindex`. `robots.txt` autorise crawl des 5
  URLs.
- **Cohérence avec ADR-0002** : la page `/comment-ca-marche` est le pivot
  SEO pour les requêtes « comment ça marche conseiller voyage », « pas
  une agence de voyage ».

**Lighthouse CI au MVP** : 5 routes FR-CA uniquement (Perf ≥ 90, SEO ≥
95, A11y ≥ 95, bloquant). Quand le contenu EN sera ajouté plus tard,
étendre à 10 routes via `lighthouserc.json`.

✅ **Conforme.**

### Definition of Done

La DoD complète de la constitution **sera cochée intégralement** avant le
merge du PR final. Items spécifiques à cette feature :

- Tests TDD écrits **avant** implémentation pour `compareLegalVersion`,
  `shouldRequireReacceptance`, `extractBrowserFamily` (R6),
  `signLegalVersionCookie` / `verifyLegalVersionCookie` (R8), et les 4
  use cases d'acceptation/anonymisation (commits visibles).
- **Test critique du middleware Next.js** (`legal-middleware.spec.ts`)
  couvrant les 6 cas du diagramme : cookie absent, cookie valide,
  cookie expiré, cookie forgé (signature invalide), version obsolète,
  race multi-tab. **Bloquant** pour merge.
- **Test de contrat `LegalAcceptanceFacade`** dans 004 même
  (`legal-acceptance.contract.test.ts`) simulant un appelant module
  002, idempotence, version supersédée, version inconnue.
- **Test de drift checksum MDX** : modifier en mémoire un MDX et
  vérifier que `tools/check-legal-mdx.ts` exit ≠ 0.
- **Test immutabilité triggers PostgreSQL** : tenter UPDATE et DELETE
  sur chacune des 3 tables (`auth_legal_documents`,
  `auth_legal_acceptances`, `auth_legal_acceptance_anonymizations`) et
  vérifier l'exception.
- **Test anonymisation cross-module** : appeler
  `EraseConseillerDataUseCase` (livré en 001 + étendu ici), vérifier
  qu'une row `LegalAcceptanceAnonymization` est créée pour chaque
  acceptance du conseiller effacé et que la row originale reste intacte.
- Migration Prisma testée en staging avec rollback applicatif vérifié.
- Audit axe-core sur les 5 pages publiques + composant Footer + page
  ré-acceptation conseiller.
- Lighthouse CI sur les 5 pages FR-CA (10 quand EN sera ajouté).
- Texte juridique des 5 pages relu par juriste (ou validation explicite
  du porteur si template adapté), avec workflow de relecture via
  `pnpm legal:preview` (PDF rendus) — bloquant pour mise en ligne
  publique mais pas pour merge du code.
- Valeurs exactes raison sociale + NEQ + adresse de l'éditeur fournies
  par le porteur du projet et intégrées dans
  `/mentions-legales` — bloquant pour mise en ligne publique mais pas
  pour merge.
- **ADR-0008 et ADR-0009** créés et acceptés avant le PR final.
- License check (déjà CI).
- OWASP Top 10 par endpoint dans `contracts/http-endpoints.md`.

---

## Project Structure

### Documentation de cette feature

```text
specs/004-mentions-legales/
├── plan.md                # Ce fichier
├── spec.md                # Spécification fonctionnelle (mergée)
├── research.md            # Phase 0 — décisions techniques motivées
├── data-model.md          # Phase 1 — entités, schéma Prisma
├── contracts/             # Phase 1 — contrats d'interface
│   ├── legal-acceptance.port.md     # Port public consommé par 002
│   ├── http-endpoints.md            # POST /api/me/legal/accept
│   └── mdx-frontmatter.md           # Format frontmatter des fichiers MDX
├── quickstart.md          # Setup local + parcours de test
├── checklists/
│   └── requirements.md    # Validation post-spec (livré, 15/15 ✅)
└── tasks.md               # Phase 2 (à venir, généré par /speckit.tasks)
```

### Code source

```text
conseiller-voyage/                         # racine du monorepo pnpm
├── apps/
│   ├── api/                               # NestJS — extension du module identité
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   └── identite/              # ← MODULE ÉTENDU
│   │   │   │       ├── domain/
│   │   │   │       │   ├── entities/
│   │   │   │       │   │   ├── legal-document.entity.ts                # NOUVEAU
│   │   │   │       │   │   ├── legal-acceptance.entity.ts              # NOUVEAU
│   │   │   │       │   │   └── legal-acceptance-anonymization.entity.ts # NOUVEAU
│   │   │   │       │   └── value-objects/
│   │   │   │       │       ├── legal-document-type.vo.ts               # NOUVEAU
│   │   │   │       │       └── document-version.vo.ts                  # NOUVEAU
│   │   │   │       ├── application/
│   │   │   │       │   ├── use-cases/
│   │   │   │       │   │   ├── accept-cgu-b2b.use-case.ts              # NOUVEAU
│   │   │   │       │   │   ├── accept-intake-consent.use-case.ts       # NOUVEAU
│   │   │   │       │   │   ├── check-cgu-up-to-date.use-case.ts        # NOUVEAU
│   │   │   │       │   │   └── anonymize-legal-acceptances.use-case.ts # NOUVEAU (appelé par EraseConseillerData)
│   │   │   │       │   └── ports/
│   │   │   │       │       ├── legal-acceptance-reader.port.ts            # NOUVEAU
│   │   │   │       │       ├── legal-acceptance-writer.port.ts            # NOUVEAU
│   │   │   │       │       ├── legal-acceptance-anonymization-writer.port.ts # NOUVEAU
│   │   │   │       │       └── legal-document-repository.port.ts          # NOUVEAU
│   │   │   │       ├── infrastructure/
│   │   │   │       │   ├── prisma-legal-acceptance-repository.ts                # NOUVEAU
│   │   │   │       │   ├── prisma-legal-acceptance-anonymization-repository.ts  # NOUVEAU
│   │   │   │       │   └── prisma-legal-document-repository.ts                  # NOUVEAU
│   │   │   │       ├── interface/
│   │   │   │       │   ├── http/
│   │   │   │       │   │   └── legal-acceptance.controller.ts  # NOUVEAU (POST /accept + GET /version-status)
│   │   │   │       │   └── public-api/
│   │   │   │       │       └── legal-acceptance.facade.ts      # NOUVEAU
│   │   │   │       └── identite.module.ts                      # MODIFIÉ (wiring + extension EraseConseillerDataUseCase)
│   │   ├── prisma/
│   │   │   ├── schema.prisma                                   # MODIFIÉ (3 modèles ajoutés)
│   │   │   └── migrations/
│   │   │       └── 00NN_init_legal/migration.sql               # NOUVEAU (incl. 3 triggers immutables)
│   │   └── test/
│   │       ├── integration/identite/
│   │       │   ├── legal-acceptance.test.ts                    # NOUVEAU
│   │       │   └── legal-immutability-triggers.test.ts         # NOUVEAU (trigger UPDATE/DELETE blocked)
│   │       └── contract/
│   │           └── legal-acceptance.contract.test.ts           # NOUVEAU (simule consommateur 002)
│   └── web/                               # Next.js — frontend
│       ├── src/
│       │   ├── app/[locale]/
│       │   │   └── (legal)/                                    # NOUVEAU segment
│       │   │       ├── layout.tsx                              # NOUVEAU
│       │   │       ├── mentions-legales/page.tsx               # NOUVEAU
│       │   │       ├── cgu-voyageur/page.tsx                   # NOUVEAU
│       │   │       ├── cgu-conseiller/page.tsx                 # NOUVEAU
│       │   │       ├── cgu-conseiller/re-accepter/page.tsx     # NOUVEAU
│       │   │       ├── confidentialite/page.tsx                # NOUVEAU
│       │   │       └── comment-ca-marche/page.tsx              # NOUVEAU
│       │   ├── components/
│       │   │   ├── Footer.tsx                                  # NOUVEAU (purement statique, force-static compatible)
│       │   │   └── legal/
│       │   │       └── AcceptCguCheckbox.tsx                   # NOUVEAU
│       │   ├── lib/legal/
│       │   │   ├── cookie-hmac.ts                              # NOUVEAU (signature + vérification HMAC du cookie version)
│       │   │   └── version-check.ts                            # NOUVEAU (logique appelée par middleware)
│       │   ├── middleware.ts                                   # MODIFIÉ (extension ré-acceptation avec cookie HMAC)
│       │   └── app/[locale]/layout.tsx                         # MODIFIÉ (intègre Footer)
│       └── test/
│           ├── a11y/legal.spec.ts                              # NOUVEAU (axe-core sur 5 pages + Footer + re-accepter)
│           ├── e2e/legal.spec.ts                               # NOUVEAU (Playwright 5 pages + signup + ré-acceptation)
│           ├── e2e/legal-middleware.spec.ts                    # NOUVEAU (6 cas du diagram critique)
│           └── unit/cookie-hmac.test.ts                        # NOUVEAU (signature + forge detection)
└── packages/
    ├── legal/                                                  # NOUVEAU package
    │   ├── package.json
    │   └── src/
    │       ├── index.ts
    │       ├── document-types.ts                               # enum partagé
    │       ├── version.ts                                      # compareLegalVersion (PURE)
    │       ├── schemas.ts                                      # Zod schemas
    │       └── __tests__/
    │           └── version.test.ts
    └── legal-content/                                          # NOUVEAU package (MDX éditorial)
        ├── package.json
        ├── fr-CA/
        │   ├── mentions-legales.mdx
        │   ├── cgu-voyageur.mdx
        │   ├── cgu-conseiller.mdx
        │   ├── confidentialite.mdx
        │   └── comment-ca-marche.mdx
        └── en/                                                 # placeholders vides
            └── (idem, contenu à traduire post-MVP)
```

**Decision de structure** : extension du module `identité` (pas de nouveau
module — conforme à la *modularité monolithique* Principe V). Le contenu
éditorial est isolé dans un package séparé `packages/legal-content/` pour
permettre une mise à jour des textes sans toucher au code applicatif. Le
package `packages/legal/` regroupe les types, schémas Zod et fonctions
pures partagées entre frontend (validation Zod côté client) et backend
(use cases + adapters).

---

## Phase 0 — Recherche

Cf. [`research.md`](./research.md). Décisions traitées :

1. **R1** — Format du contenu éditorial — décision : **MDX**.
2. **R2** — Versioning des documents légaux — décision : **entier monotone + checksum SHA-256 + `contentSnapshot` archivé en BD**.
3. **R3** — Anonymisation `subjectId` Loi 25 — décision : **SHA-256(subjectId || project_salt) avec salt en AWS Secrets Manager**.
4. **R4** — Vérification de version CGU obsolète — décision : **middleware Next.js** avec cookie HMAC signé (raffiné en R8).
5. **R5** — Granularité du consentement Loi 25 — décision : **2 cases séparées** (Loi 25 art. 8).
6. **R6** — Parsing User-Agent pour anonymisation — décision : **`ua-parser-js` v2** + fonction pure `extractBrowserFamily()`.
7. **R7** — Stratégie de transaction cross-module pour le double consentement intake — décision : **Alt 2** (lifecycle de brief `consent_pending → consent_ok` + orphan cleanup job, façade `identité` encapsule sa propre transaction).
8. **R8** — Cookie de cache version — décision : **`__Host-cv.legal-version` signé HMAC-SHA256** avec nouveau secret `LEGAL_COOKIE_HMAC_SECRET`.
9. **R9** — Threat model du salt d'anonymisation Loi 25 — plan de réponse à incident documenté, rotation via versionnement AWS Secrets Manager + `anonymizationSaltVersion` colonne.

---

## Phase 1 — Design & Contrats

### Artefacts générés

- [`data-model.md`](./data-model.md) — 3 entités (`LegalDocument`,
  `LegalAcceptance`, `LegalAcceptanceAnonymization`), schéma Prisma, 3
  triggers d'immutabilité, privilèges DB par rôle, règles d'anonymisation.
- [`contracts/legal-acceptance.port.md`](./contracts/legal-acceptance.port.md)
  — port public `LegalAcceptanceFacade` consommé par 002 (transaction
  interne, pas de partage de client Prisma cross-module).
- [`contracts/middleware-version-check.md`](./contracts/middleware-version-check.md)
  — format du cookie HMAC `__Host-cv.legal-version`, logique du
  middleware, endpoint `/api/me/legal/version-status`, anti-patterns
  documentés, 9 cas de test dont 3 bloquants pour merge.
- [`contracts/http-endpoints.md`](./contracts/http-endpoints.md) —
  endpoints POST `/api/me/legal/accept` + GET `/api/me/legal/version-status`
  + checklist OWASP.
- [`contracts/mdx-frontmatter.md`](./contracts/mdx-frontmatter.md) —
  format frontmatter standardisé des fichiers MDX + workflow de bump
  de version.
- [`quickstart.md`](./quickstart.md) — setup local + parcours de test
  des 5 pages + acceptation conseiller + double consentement voyageur +
  ré-acceptation + effacement Loi 25.

### ADRs à créer (formalisation des décisions structurantes)

- **ADR-0008** — Anonymisation Loi 25 par hash salé immutable
  (formalise research R3 + R9 ; pattern d'anonymisation différée via
  table `LegalAcceptanceAnonymization`, threat model du salt, plan de
  rotation en cas d'incident).
- **ADR-0009** — Middleware Next.js + cookie HMAC signé pour la
  vérification de version CGU obsolète (formalise research R4 + R8 ;
  format du cookie `__Host-cv.legal-version`, endpoint
  `/api/me/legal/version-status`, comportement multi-tab).

À créer avant `/speckit.tasks` (les tâches dépendront du wording exact).

### ADRs liés (existants, référencés)

- [ADR-0002](../../docs/adr/0002-pas-de-cta-contact-direct.md) — Pas de
  CTA contact direct (pivot narratif de `/comment-ca-marche`).
- [ADR-0004](../../docs/adr/0004-auth-session-db-partagee.md) — Auth.js
  sessions DB partagées (consommé par le middleware version-check).

### Mise à jour du contexte agent

`CLAUDE.md` à la racine est mis à jour : le bloc `<!-- SPECKIT START -->`
pointe désormais vers ce plan (à l'issue du `/speckit.plan`).

---

## Re-vérification Constitution Check (post-design)

Toutes les contraintes adressées en pré-design restent satisfaites après
matérialisation du design (data-model + contracts). Aucune dérogation à
justifier.

Les principes XI (a11y WCAG 2.1 AA) et XII (SEO + CWV), ajoutés à la
constitution en v2.2.0 et absents du template `plan-template.md` actuel,
sont traités explicitement dans ce plan. Le template sera mis à jour
hors scope de cette feature.

✅ **Le plan est prêt pour `/speckit.tasks`.**

---

## Complexity Tracking

> Aucune violation du Constitution Check. Aucune dérogation à justifier.
> *Section laissée vide intentionnellement.*
