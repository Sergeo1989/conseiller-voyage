# Plan d'implémentation : Mentions légales, CGU, politique de confidentialité et page « Comment ça marche »

**Branche** : `004-mentions-legales` | **Date** : 2026-05-25 | **Spec** : [spec.md](./spec.md)

**Entrée** : Spécification fonctionnelle issue de `specs/004-mentions-legales/spec.md`

---

## Résumé

Cinq pages statiques (`/mentions-legales`, `/cgu-voyageur`, `/cgu-conseiller`,
`/confidentialite`, `/comment-ca-marche`) + un footer permanent + une petite
extension du module `identité` existant pour tracer les acceptations
horodatées Loi 25.

**Approche technique** : pages Next.js 15 App Router en SSG sous un segment
`(legal)` avec un layout partagé. Contenu éditorial en fichiers MDX
`packages/legal-content/<locale>/<slug>.mdx` versionnés dans le repo (le
versionnement est explicite via frontmatter `version: N` ; le bump de version
est une étape manuelle documentée). Footer composant React partagé via
`apps/web/src/components/Footer.tsx`. Côté serveur, une nouvelle entité
`LegalAcceptance` dans le schéma Prisma du module `identité`, un use case
pur `compareVersions` testé TDD, et un port public
`LegalAcceptanceWriter` consommé par le module 002-voyageur-intake pour le
double consentement au brief.

Middleware Next.js qui, sur les routes authentifiées du conseiller, vérifie
que la version `cgu_b2b` acceptée n'est pas obsolète et redirige vers
`/cgu-conseiller/re-accepter` si nécessaire.

---

## Technical Context

Stack figée par la constitution v2.2.0 — détails ci-dessous.

| Élément | Valeur |
|---|---|
| Langage / version | TypeScript ≥ 5, mode `strict` |
| Frontend principal | Next.js 15 App Router (RSC par défaut), Tailwind CSS v4, shadcn/ui, react-hook-form + Zod, **next-intl** (déjà configuré), date-fns (`fr-CA`) |
| Contenu éditorial | **MDX** sous `packages/legal-content/<locale>/<slug>.mdx` avec frontmatter (version, publishedAt, effectiveAt, checksum) — pas de CMS au MVP |
| Backend (extension `identité`) | NestJS 10 + Fastify, Prisma 5, Zod, Pino |
| DB | PostgreSQL 16 `ca-central-1` (extension du schéma existant — 2 nouvelles tables `auth_legal_documents` et `auth_legal_acceptances`) |
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

- Nouvelle table Prisma `auth_legal_documents` (préfixe `auth_` cohérent
  avec les tables Auth.js).
- Nouvelle table Prisma `auth_legal_acceptances`.
- 3 nouveaux use cases dans `apps/api/src/modules/identite/application/use-cases/`.
- 1 port public `LegalAcceptanceWriter` exposé via la façade
  `IdentiteModule.LegalAcceptanceFacade` — consommé par le module
  `002-voyageur-intake` pour le double consentement Loi 25 au brief.

Aucun appel LLM dans cette feature.

Enforcement de la frontière modulaire (déjà en place via 001) :
`tools/check-module-boundaries.ts` garantit qu'aucun module externe
n'importe directement les tables `auth_legal_*` — passage obligatoire
par la façade.

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

- `domain/entities/` : `LegalDocument`, `LegalAcceptance` (TypeScript
  pur, zéro import NestJS/Prisma).
- `domain/value-objects/` : `LegalDocumentType` (enum `mentions_legales` |
  `cgu_b2c` | `cgu_b2b` | `confidentialite` | `comment_ca_marche`),
  `DocumentVersion` (entier positif monotone).
- `application/use-cases/` : `AcceptCguB2bUseCase`,
  `AcceptIntakeConsentUseCase`, `CheckCguUpToDateUseCase`,
  `PublishLegalDocumentVersionUseCase` (admin, optionnel au MVP).
- `application/ports/` : `LegalAcceptanceReader`, `LegalAcceptanceWriter`,
  `LegalDocumentRepository`.
- `infrastructure/` : `PrismaLegalAcceptanceRepository`,
  `PrismaLegalDocumentRepository`.
- `interface/http/` : `LegalAcceptanceController` (POST
  `/api/me/legal/accept` pour conseiller).
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

- **RBAC** : `AcceptCguB2bUseCase` vérifie que `requestedBy.role === 'conseiller'` (ou `admin`). `AcceptIntakeConsentUseCase` est appelé par le module 002 avec un `briefId` issu de sa propre validation interne — le voyageur n'est pas authentifié.
- **AuthN** : conseiller authentifié via Auth.js v5 (déjà en place via 001). Pas de MFA pour cette feature (l'acceptation des CGU n'est pas une action sensible élevée — le MFA reste pour les actions matching côté conseiller, cf. spec MFA à venir).
- **CSRF** : `CsrfProtectionMiddleware` (livré en 001) appliqué à POST `/api/me/legal/accept`.
- **Validation Zod** côté serveur sur tous les payloads. Schémas partagés via `packages/legal/src/schemas.ts`.
- **En-têtes HTTP** : déjà configurés via Fastify hooks en 001 (CSP, HSTS, etc.).
- **Idempotence** : clé unique Prisma `(subjectId, documentType, documentVersion)`. Si rejeu → no-op silencieux (réponse 200, pas de nouvelle row). Header `Idempotency-Key` honoré via l'interceptor livré en 001.
- **Checklist OWASP Top 10** revue par endpoint (cf. `contracts/http-endpoints.md`).
- **Secrets** : aucun nouveau secret introduit.
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
- **MDX content unavailable** (régression bundle) → pages statiques
  pré-rendues servent depuis le CDN même si l'app est down. C'est tout
  l'intérêt du SSG.
- **Bump de version Failed mid-deploy** → version par défaut affichée
  reste la précédente (les fichiers MDX sont en repo) ; le compteur
  `legal_document_publish_total` ne bouge pas tant que la migration de
  version n'est pas appliquée en DB.

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
- **CWV budgets** : LCP < 2,5 s, INP < 200 ms, CLS < 0,1. Pages
  ultra-légères (texte + footer) — atteint trivialement. Lighthouse CI
  bloquant en pipeline.
- **Métadonnées** : chaque page a `<title>`, `<meta name="description">`,
  OpenGraph (`og:title`, `og:description`, `og:locale`, `og:type`),
  Twitter cards, canonical URL.
- **JSON-LD** : schéma `WebPage` (avec `inLanguage`, `dateModified`) sur
  chaque page. La page `/mentions-legales` ajoute un schéma
  `Organization` avec `name`, `address` (PostalAddress), `email`.
- **Sitemap** : les 5 pages ajoutées au `sitemap.xml` (référencé dans
  `robots.txt`). Au MVP, sitemap statique généré au build ; feature 017
  (Tier 3) le rendra dynamique.
- **hreflang** : `<link rel="alternate" hreflang="fr-CA">` et
  `hreflang="x-default">` (héritage du layout livré en 001). EN ajouté
  quand le contenu EN sera traduit.
- **Indexabilité** : aucun `noindex`. `robots.txt` autorise crawl des 5
  URLs.
- **Cohérence avec ADR-0002** : la page `/comment-ca-marche` est le pivot
  SEO pour les requêtes « comment ça marche conseiller voyage », « pas
  une agence de voyage ».

Lighthouse CI : Perf ≥ 90, SEO ≥ 95, A11y ≥ 95. Bloquant.

✅ **Conforme.**

### Definition of Done

La DoD complète de la constitution **sera cochée intégralement** avant le
merge du PR final. Items spécifiques à cette feature :

- Tests TDD écrits **avant** implémentation pour `compareLegalVersion`,
  `shouldRequireReacceptance`, et les 2 use cases d'acceptation (commits
  visibles).
- Migration Prisma testée en staging avec rollback applicatif vérifié.
- Audit axe-core sur les 5 pages publiques + composant Footer + page
  ré-acceptation conseiller.
- Lighthouse CI sur les 5 pages.
- Texte juridique des 5 pages relu par juriste (ou validation explicite
  du porteur si template adapté) — bloquant pour mise en ligne publique
  mais pas pour merge.
- Valeurs exactes raison sociale + NEQ + adresse de l'éditeur fournies
  par le porteur du projet et intégrées dans
  `/mentions-legales` — bloquant pour mise en ligne publique mais pas
  pour merge.
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
│   │   │   │       │   │   ├── legal-document.entity.ts        # NOUVEAU
│   │   │   │       │   │   └── legal-acceptance.entity.ts      # NOUVEAU
│   │   │   │       │   └── value-objects/
│   │   │   │       │       ├── legal-document-type.vo.ts       # NOUVEAU
│   │   │   │       │       └── document-version.vo.ts          # NOUVEAU
│   │   │   │       ├── application/
│   │   │   │       │   ├── use-cases/
│   │   │   │       │   │   ├── accept-cgu-b2b.use-case.ts      # NOUVEAU
│   │   │   │       │   │   ├── accept-intake-consent.use-case.ts # NOUVEAU
│   │   │   │       │   │   └── check-cgu-up-to-date.use-case.ts # NOUVEAU
│   │   │   │       │   └── ports/
│   │   │   │       │       ├── legal-acceptance-reader.port.ts # NOUVEAU
│   │   │   │       │       ├── legal-acceptance-writer.port.ts # NOUVEAU
│   │   │   │       │       └── legal-document-repository.port.ts # NOUVEAU
│   │   │   │       ├── infrastructure/
│   │   │   │       │   ├── prisma-legal-acceptance-repository.ts # NOUVEAU
│   │   │   │       │   └── prisma-legal-document-repository.ts # NOUVEAU
│   │   │   │       ├── interface/
│   │   │   │       │   ├── http/
│   │   │   │       │   │   └── legal-acceptance.controller.ts  # NOUVEAU
│   │   │   │       │   └── public-api/
│   │   │   │       │       └── legal-acceptance.facade.ts      # NOUVEAU
│   │   │   │       └── identite.module.ts                      # MODIFIÉ (wiring)
│   │   ├── prisma/
│   │   │   ├── schema.prisma                                   # MODIFIÉ (2 modèles ajoutés)
│   │   │   └── migrations/
│   │   │       └── 00NN_init_legal/migration.sql               # NOUVEAU
│   │   └── test/
│   │       └── integration/identite/
│   │           └── legal-acceptance.test.ts                    # NOUVEAU
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
│       │   │   ├── Footer.tsx                                  # NOUVEAU
│       │   │   └── legal/
│       │   │       ├── AcceptCguCheckbox.tsx                   # NOUVEAU
│       │   │       └── ReacceptCguGuard.tsx                    # NOUVEAU (client component)
│       │   ├── middleware.ts                                   # MODIFIÉ (extension ré-acceptation)
│       │   └── app/[locale]/layout.tsx                         # MODIFIÉ (intègre Footer)
│       └── test/
│           ├── a11y/legal.spec.ts                              # NOUVEAU (axe-core)
│           └── e2e/legal.spec.ts                               # NOUVEAU (Playwright)
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

1. Format du contenu éditorial (Markdown frontmatter, MDX, JSON, CMS) — décision : **MDX**.
2. Stratégie de versioning et de bump (incrément manuel, semver, hash de contenu) — décision : **entier monotone + checksum SHA-256 du contenu**.
3. Stratégie d'anonymisation `subjectId` lors d'un effacement Loi 25 — décision : **SHA-256(subjectId || project_salt) avec salt en AWS Secrets Manager**.
4. Vérification de version CGU obsolète : middleware Next.js, Server Component check, ou interceptor NestJS — décision : **middleware Next.js sur les routes du conseiller authentifié**.
5. Granularité du consentement Loi 25 au brief intake (1 case groupée vs 2 cases séparées) — décision : **2 cases séparées** (cohérent avec Loi 25 art. 8).

---

## Phase 1 — Design & Contrats

### Artefacts générés

- [`data-model.md`](./data-model.md) — entités `LegalDocument` et
  `LegalAcceptance`, schéma Prisma proposé, contraintes d'intégrité,
  règles d'anonymisation.
- [`contracts/legal-acceptance.port.md`](./contracts/legal-acceptance.port.md)
  — port public `LegalAcceptanceWriter` consommé par 002.
- [`contracts/http-endpoints.md`](./contracts/http-endpoints.md) —
  endpoint POST `/api/me/legal/accept` + checklist OWASP.
- [`contracts/mdx-frontmatter.md`](./contracts/mdx-frontmatter.md) —
  format frontmatter standardisé des fichiers MDX.
- [`quickstart.md`](./quickstart.md) — setup local + parcours de test
  des 5 pages + acceptation conseiller + double consentement voyageur.

### ADR liés

Aucun nouvel ADR introduit. Référence implicite à
[ADR-0002](../../docs/adr/0002-pas-de-cta-contact-direct.md) pour la
position « pas une agence ».

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
