---

description: "Tâches d'implémentation — Mentions légales, CGU, politique de confidentialité, page « Comment ça marche »"
---

# Tasks: Mentions légales, CGU, politique de confidentialité et page « Comment ça marche »

**Input** : Design documents from `/specs/004-mentions-legales/`

**Prerequisites** :
- [plan.md](./plan.md) (stack v2.2.0, 12 principes Constitution Check, post-review)
- [spec.md](./spec.md) (5 user stories, 20 FR, 10 SC, 15/15 ✅)
- [research.md](./research.md) (R1-R9, dont R7 cross-module tx + R8 cookie HMAC)
- [data-model.md](./data-model.md) (3 entités, 3 triggers immutables, privilèges DB)
- [contracts/](./contracts/) (legal-acceptance.port, middleware-version-check, http-endpoints, mdx-frontmatter)
- [quickstart.md](./quickstart.md)
- [docs/adr/0008-anonymisation-loi25-hash-sale-immutable.md](../../docs/adr/0008-anonymisation-loi25-hash-sale-immutable.md)
- [docs/adr/0009-middleware-cookie-hmac-version-cgu.md](../../docs/adr/0009-middleware-cookie-hmac-version-cgu.md)

**Tests** : TDD obligatoire (Principe VI NON-NÉGOCIABLE) pour les fonctions pures
(`compareLegalVersion`, `shouldRequireReacceptance`, `extractBrowserFamily`,
`maskIpAddress`, `hashSubjectId`, `sign/verifyLegalVersionCookie`) et pour
les 4 use cases métier. Tests **écrits avant** l'implémentation, dans des
commits séparés visibles dans git. Tests e2e Playwright pour les parcours
utilisateurs. Tests a11y axe-core et Lighthouse CI bloquants pour
Principes XI et XII NON-NÉGOCIABLES.

**Organization** : Tâches groupées par user story pour permettre
l'implémentation et le test indépendants de chaque histoire. US1 + US2
forment ensemble le MVP P1 (5 pages publiques + footer).

## Format : `[ID] [P?] [Story] Description`

- **[P]** : peut être exécutée en parallèle (fichiers différents, pas de dépendance)
- **[Story]** : à quelle user story la tâche appartient (US1-US5) ; setup/foundational/polish sans label
- Chaque description inclut le chemin de fichier exact

## Path Conventions

- Backend : `apps/api/src/modules/identite/{domain,application,infrastructure,interface}/`
- Frontend : `apps/web/src/app/[locale]/(legal)/`
- Footer et helpers : `apps/web/src/components/`, `apps/web/src/lib/legal/`
- Partagé (Zod + fonctions pures) : `packages/legal/src/`
- Contenu éditorial : `packages/legal-content/<locale>/`
- Tests : à côté du code (`__tests__/`) ou dans `apps/api/test/{contract,integration,e2e}/` et `apps/web/test/{a11y,e2e,unit}/`
- CI tools : `tools/`

---

## Phase 1 : Setup (Outillage et dépendances)

**Objet** : ajouter les dépendances et créer les nouveaux packages workspace. La stack v2.2.0 est déjà bootstrée par 001.

- [x] T001 Installer dépendances racine : `pnpm add -D -w @next/mdx @mdx-js/loader @mdx-js/react gray-matter` et `pnpm add -w ua-parser-js@^2` dans `apps/web/package.json` et `apps/api/package.json`
- [x] T002 [P] Créer package `packages/legal/` (`package.json`, `tsconfig.json`, `src/index.ts` vide) avec exports `version.ts`, `anonymization.ts`, `schemas.ts`, `document-types.ts`, `branded-ids.ts`
- [x] T003 [P] Créer package `packages/legal-content/` (`package.json`, structure `fr-CA/` et `en/`) référencé via workspace dans `pnpm-workspace.yaml`
- [ ] T004 [P] Configurer `@next/mdx` dans `apps/web/next.config.ts` (extension `.mdx` activée, plugins MDX éventuels)
- [ ] T005 [P] Générer secrets dev : `LEGAL_COOKIE_HMAC_SECRET` et `LOI25_SUBJECT_ANONYMIZATION_SALT` via 1Password CLI ; documenter procédure dans `docs/runbooks/legal-secrets-setup.md`
- [ ] T006 [P] Ajouter à `infra/cdk/cv-prod-stack.ts` la création des deux secrets AWS Secrets Manager `ca-central-1` (vides, populés manuellement au déploiement initial — runbook documenté)

---

## Phase 2 : Foundational (Prérequis bloquants tous user stories)

**Objet** : schéma DB, fonctions pures partagées, ports/adapters, scripts CI. **Toutes les user stories en dépendent.**

**⚠ CRITIQUE** : aucun travail user story ne peut commencer tant que cette phase n'est pas finie.

### Schéma Prisma et migrations

- [x] T007 Étendre `apps/api/prisma/schema.prisma` avec les 3 modèles `LegalDocument`, `LegalAcceptance`, `LegalAcceptanceAnonymization` + enums (cf. `data-model.md` section *Schéma Prisma proposé*)
- [x] T008 Migration Prisma initiale : `apps/api/prisma/migrations/0NNN_init_legal/migration.sql` (3 tables + indexes)
- [x] T009 Migration SQL des triggers immutables stricts : `apps/api/prisma/migrations/0NNN_init_legal_immutability/migration.sql` (3 triggers `BEFORE UPDATE OR DELETE` qui RAISE EXCEPTION sur chaque table)
- [x] T010 Migration SQL des privilèges DB : `apps/api/prisma/migrations/0NNN_init_legal_privileges/migration.sql` (REVOKE UPDATE/DELETE pour `app_identite`, SELECT only pour `app_conformite` et `app_intake`)

### Tests d'invariants des triggers (TDD bloquant)

- [ ] T011 [P] Test intégration trigger : tentative UPDATE sur `auth_legal_documents` lève exception PostgreSQL — `apps/api/test/integration/identite/legal-documents-immutability.test.ts`
- [ ] T012 [P] Test intégration trigger : tentative UPDATE et DELETE sur `auth_legal_acceptances` lèvent exception — `apps/api/test/integration/identite/legal-acceptances-immutability.test.ts`
- [ ] T013 [P] Test intégration trigger : tentative UPDATE et DELETE sur `auth_legal_acceptance_anonymizations` lèvent exception — `apps/api/test/integration/identite/legal-anonymizations-immutability.test.ts`

### Types partagés et schemas Zod

- [x] T014 [P] Branded ID types (`LegalDocumentId`, `LegalAcceptanceId`, `LegalAcceptanceAnonymizationId`) dans `packages/legal/src/branded-ids.ts`
- [x] T015 [P] Enum `LegalDocumentType` partagé dans `packages/legal/src/document-types.ts`
- [x] T016 [P] Zod schemas API (AcceptCguB2bBody, VersionStatusResponse, AcceptanceRecord) dans `packages/legal/src/schemas.ts`

### Fonctions pures (TDD obligatoire — commits séparés red/green)

- [x] T017 [P] **TDD RED** Test `compareLegalVersion` (current=N, accepted=null → `'never_accepted'` ; accepted=N → `'up_to_date'` ; accepted<N → `'outdated'` ; inputs négatifs/zéro → exception) dans `packages/legal/src/__tests__/version.test.ts`
- [x] T018 [P] **TDD RED** Test `shouldRequireReacceptance(acceptance | null, currentVersion)` (cas nominal des 3 retours) dans `packages/legal/src/__tests__/version.test.ts`
- [x] T019 **TDD GREEN** Implémenter `compareLegalVersion` + `shouldRequireReacceptance` (GREEN contre T017 + T018) dans `packages/legal/src/version.ts`
- [x] T020 [P] **TDD RED** Test `extractBrowserFamily(ua: string)` avec fixtures (Firefox, Chrome, Safari, Edge, Opera, IE legacy, bot, vide, malformé) — chaque cas retourne valeur attendue ou `'unknown'` — dans `packages/legal/src/__tests__/anonymization.test.ts`
- [x] T021 [P] **TDD RED** Test `maskIpAddress` (IPv4 `192.168.1.42` → `192.0.0.0` ; IPv6 `2001:db8::ff42` → `2001:db8::` ; malformé → `'0.0.0.0'`) dans `packages/legal/src/__tests__/anonymization.test.ts`
- [x] T022 [P] **TDD RED** Test `hashSubjectId(subjectId, salt)` (déterminisme, 2 IDs différents → 2 hashs différents, même ID + 2 salts → 2 hashs différents, longueur 64 chars hex) dans `packages/legal/src/__tests__/anonymization.test.ts`
- [x] T023 **TDD GREEN** Implémenter `extractBrowserFamily` (via `ua-parser-js`), `maskIpAddress`, `hashSubjectId` (GREEN contre T020 + T021 + T022) dans `packages/legal/src/anonymization.ts`
- [x] T024 [P] **TDD RED** Test `signLegalVersionCookie` + `verifyLegalVersionCookie` HMAC : déterminisme, **détection de forge** (signature modifiée → null), TTL expiré → null, payload malformé → null, userId mismatch → null — dans `apps/web/test/unit/cookie-hmac.test.ts`
- [x] T025 **TDD GREEN** Implémenter `signLegalVersionCookie` + `verifyLegalVersionCookie` avec `crypto.timingSafeEqual` (GREEN contre T024) dans `apps/web/src/lib/legal/cookie-hmac.ts`

### Domain layer (zéro framework, zéro Prisma)

- [x] T026 [P] Entité `LegalDocument` (TypeScript pur) dans `apps/api/src/modules/identite/domain/entities/legal-document.entity.ts`
- [x] T027 [P] Entité `LegalAcceptance` dans `apps/api/src/modules/identite/domain/entities/legal-acceptance.entity.ts`
- [x] T028 [P] Entité `LegalAcceptanceAnonymization` dans `apps/api/src/modules/identite/domain/entities/legal-acceptance-anonymization.entity.ts`
- [x] T029 [P] Value object `DocumentVersion` (entier positif monotone, méthode `isStrictlyGreaterThan`) dans `apps/api/src/modules/identite/domain/value-objects/document-version.vo.ts`

### Application layer (ports)

- [x] T030 [P] Port `LegalDocumentRepository` dans `apps/api/src/modules/identite/application/ports/legal-document-repository.port.ts` (méthodes `findById`, `findCurrentByType`, `seedFromMdx`)
- [x] T031 [P] Port `LegalAcceptanceReader` dans `apps/api/src/modules/identite/application/ports/legal-acceptance-reader.port.ts` (`findLatestByUser`, `findWithAnonymization`)
- [x] T032 [P] Port `LegalAcceptanceWriter` dans `apps/api/src/modules/identite/application/ports/legal-acceptance-writer.port.ts` (`insert` idempotent sur `(subjectId, documentType, documentVersion)`)
- [x] T033 [P] Port `LegalAcceptanceAnonymizationWriter` dans `apps/api/src/modules/identite/application/ports/legal-acceptance-anonymization-writer.port.ts` (`insertAnonymization` unique sur `acceptanceId`)

### Infrastructure layer (Prisma adapters)

- [ ] T034 [P] `PrismaLegalDocumentRepository` dans `apps/api/src/modules/identite/infrastructure/prisma-legal-document-repository.ts`
- [ ] T035 [P] `PrismaLegalAcceptanceRepository` dans `apps/api/src/modules/identite/infrastructure/prisma-legal-acceptance-repository.ts` — implémente `findWithAnonymization()` via LEFT JOIN
- [ ] T036 [P] `PrismaLegalAcceptanceAnonymizationRepository` dans `apps/api/src/modules/identite/infrastructure/prisma-legal-acceptance-anonymization-repository.ts`

### Scripts CI

- [x] T037 [P] Script `tools/check-legal-mdx.ts` (parse MDX, vérifie frontmatter Zod, unicité (type, version), strict-croissance par type, `effectiveAt >= publishedAt`, drift de checksum si version inchangée) + wire `pnpm legal:verify` dans `package.json` racine + ajouter étape bloquante dans `.github/workflows/ci.yml`
- [ ] T038 [P] Script `tools/seed-legal-documents.ts` (idempotent post-deploy : parse MDX, calcule checksum + `contentSnapshot`, insère row si absente, no-op si présente avec checksum identique, ERREUR si présente avec checksum différent — confluences avec T037)
- [x] T039 [P] **Test drift checksum** : modifier un MDX en mémoire (sans toucher version), exécuter `check-legal-mdx.ts` programmatiquement, vérifier exit ≠ 0 — dans `tools/__tests__/check-legal-mdx.test.ts`
- [ ] T040 [P] **Linter custom** `tools/check-legal-acceptance-access.ts` : refuse les imports directs de `prisma.legalAcceptance.find*` hors `PrismaLegalAcceptanceRepository`, force le passage par `findWithAnonymization()` — wired dans CI

### Wiring NestJS

- [ ] T041 Étendre `IdentiteModule` (`apps/api/src/modules/identite/identite.module.ts`) : enregistrer les 3 repositories, les 4 use cases (déclarés en Phase 3-6), la facade `LegalAcceptanceFacade`, et le secret salt via `useFactory: loadSaltFromSecretsManager`

**Checkpoint** : foundation prête → implémentation user stories peut commencer en parallèle.

---

## Phase 3 : User Story 1 — Page « Comment ça marche » (Priorité P1) 🎯 MVP

**Goal** : publier publiquement la page qui énonce explicitement que la plateforme n'est PAS une agence de voyages. Pivot narratif du modèle (cf. ADR-0002).

**Independent Test** : un voyageur (test manuel ou automated Playwright) accède à `/fr/comment-ca-marche`, voit l'affirmation explicite « ce n'est pas une agence de voyages » visible dans le `<h1>` ou un encadré, comprend le rôle du conseiller vérifié et le plafond de 3 conseillers. Page se charge en < 1 s, accessible WCAG AA, indexable.

- [ ] T042 [US1] Rédiger `packages/legal-content/fr-CA/comment-ca-marche.mdx` (placeholder texte, frontmatter version 1 conforme à `contracts/mdx-frontmatter.md`, énoncé explicite « pas une agence » visible) — texte juriste ou template adapté ; ne bloque pas le merge mais bloque le déploiement public
- [ ] T043 [US1] Placeholder vide `packages/legal-content/en/comment-ca-marche.mdx` (structure i18n)
- [ ] T044 [P] [US1] Page Next.js `apps/web/src/app/[locale]/(legal)/comment-ca-marche/page.tsx` (`export const dynamic = 'force-static'`, charge le MDX via next-mdx, métadonnées `<title>`, `<meta name="description">`, OpenGraph FR-CA, JSON-LD `WebPage` avec `inLanguage` et `dateModified`)
- [ ] T045 [P] [US1] Test a11y axe-core sur `/fr/comment-ca-marche` dans `apps/web/test/a11y/legal.spec.ts` (US1 seule — zéro violation `critical` ni `serious`)
- [ ] T046 [P] [US1] Test e2e Playwright : voyageur arrive sur `/fr/comment-ca-marche`, voit l'énoncé explicite « pas une agence », titre `<h1>` présent, JSON-LD parsable — dans `apps/web/test/e2e/legal-us1.spec.ts`

**Checkpoint US1** : la page peut être déployée seule, indépendamment des 4 autres. Le voyageur comprend le modèle. MVP minimal.

---

## Phase 4 : User Story 2 — Footer permanent + 4 autres pages légales (Priorité P1) 🎯 MVP partie 2

**Goal** : footer permanent visible sur toutes les pages publiques avec 5 liens vers les pages légales. Les 4 autres pages publiées (mentions-legales, cgu-voyageur, cgu-conseiller, confidentialite).

**Independent Test** : un crawler automatisé visite 10 pages publiques au hasard et vérifie que chacune contient les 5 liens dans le footer ; chaque lien retourne 200 OK ; navigation clavier complète ; touch targets ≥ 44 px sur mobile.

### Contenu éditorial (MDX placeholders)

- [ ] T047 [P] [US2] Rédiger `packages/legal-content/fr-CA/mentions-legales.mdx` (structure : raison sociale + NEQ + adresse Québec + juridiction Montréal + contact + dernière mise à jour ; valeurs exactes placeholder à remplacer en T071)
- [ ] T048 [P] [US2] Rédiger `packages/legal-content/fr-CA/cgu-voyageur.mdx` (B2C : utilisation par voyageur, intake, plafond 3 conseillers, absence de transaction sur plateforme)
- [ ] T049 [P] [US2] Rédiger `packages/legal-content/fr-CA/cgu-conseiller.mdx` (B2B : abonnement, statut vérifié CCV/TICO, juridiction Montréal, droit civil québécois)
- [ ] T050 [P] [US2] Rédiger `packages/legal-content/fr-CA/confidentialite.mdx` (finalités collecte, tableau de rétention reflétant constitution, droits Loi 25, coordonnées responsable, mention « aucun cookie analytique au MVP »)
- [ ] T051 [P] [US2] Placeholders EN vides pour les 4 MDX (`packages/legal-content/en/*.mdx`)

### Pages Next.js SSG

- [ ] T052 [P] [US2] Page `apps/web/src/app/[locale]/(legal)/mentions-legales/page.tsx` (force-static, métadonnées, JSON-LD `WebPage` + `Organization` avec `PostalAddress`)
- [ ] T053 [P] [US2] Page `apps/web/src/app/[locale]/(legal)/cgu-voyageur/page.tsx`
- [ ] T054 [P] [US2] Page `apps/web/src/app/[locale]/(legal)/cgu-conseiller/page.tsx`
- [ ] T055 [P] [US2] Page `apps/web/src/app/[locale]/(legal)/confidentialite/page.tsx`
- [ ] T056 [US2] Layout partagé `apps/web/src/app/[locale]/(legal)/layout.tsx` (typographie cohérente, max-width lisible)

### Footer composant

- [ ] T057 [US2] Composant `apps/web/src/components/Footer.tsx` : purement statique (HTML+CSS pur, zéro JS, aucune donnée dynamique — année hardcodée par commit annuel), 5 liens labellisés, `aria-label` explicites, touch targets ≥ 44 px, focus visible (réutilise les classes a11y baseline livrées en 001)
- [ ] T058 [US2] Intégrer `Footer` dans `apps/web/src/app/[locale]/layout.tsx` (rendu sur toutes les pages du layout racine — Server Component, pas de hydration)

### SEO + sitemap

- [ ] T059 [P] [US2] Ajouter les 5 routes FR-CA + 5 routes EN au `sitemap.xml` (statique au MVP via `apps/web/src/app/sitemap.ts` standard Next.js)
- [ ] T060 [P] [US2] Vérifier que `apps/web/public/robots.txt` autorise crawl des 5 routes (aucun `Disallow` les concernant)

### Tests

- [ ] T061 [P] [US2] Test a11y axe-core sur les 5 pages + Footer dans `apps/web/test/a11y/legal.spec.ts` (étendu de T045)
- [ ] T062 [P] [US2] Test e2e crawler : un script Playwright visite l'accueil, 3 pages produit aléatoires (404, /, /comment-ca-marche), et vérifie que les 5 liens du footer sont présents et retournent 200 — dans `apps/web/test/e2e/footer.spec.ts`
- [ ] T063 [P] [US2] Test e2e Playwright responsive : mobile (375 px) + clavier-only — vérifier touch targets ≥ 44 px et focus visible — dans `apps/web/test/e2e/footer-responsive.spec.ts`
- [ ] T064 [US2] Configurer Lighthouse CI sur les 5 routes FR-CA (`lighthouserc.json` étendu) avec budgets Perf ≥ 90, SEO ≥ 95, A11y ≥ 95 — bloquant en CI

**Checkpoint US2** : les 5 pages publiques accessibles, footer partout, Lighthouse ≥ budgets, axe-core clean. Couche public-facing du MVP complète.

---

## Phase 5 : User Story 3 — Conseiller accepte CGU au signup (Priorité P2)

**Goal** : le conseiller au signup doit accepter explicitement les CGU conseiller (B2B) ; ré-acceptation obligatoire après bump de version.

**Independent Test** : un conseiller signup avec checkbox CGU non cochée → rejet ; checkbox cochée → compte créé + row dans `auth_legal_acceptances` ; bump version v1→v2 → conseiller redirigé vers `/cgu-conseiller/re-accepter` à la connexion suivante ; accepte v2 → tableau de bord accessible.

### Use cases (TDD)

- [ ] T065 [P] [US3] **TDD RED** Test `AcceptCguB2bUseCase` dans `apps/api/src/modules/identite/application/use-cases/__tests__/accept-cgu-b2b.test.ts` (cas nominal, RBAC role=voyageur → 403, document version inconnue → 404, version pas encore effective → 404, version supersédée → 409, double soumission → idempotent retourne acceptance existante, conseiller anonymisé → 403)
- [ ] T066 [US3] **TDD GREEN** Implémenter `AcceptCguB2bUseCase` (GREEN contre T065) dans `apps/api/src/modules/identite/application/use-cases/accept-cgu-b2b.use-case.ts`
- [ ] T067 [P] [US3] **TDD RED** Test `CheckCguUpToDateUseCase` dans `apps/api/src/modules/identite/application/use-cases/__tests__/check-cgu-up-to-date.test.ts` (`up_to_date`, `outdated`, `never_accepted` — 3 cas du retour)
- [ ] T068 [US3] **TDD GREEN** Implémenter `CheckCguUpToDateUseCase` (GREEN contre T067) dans `apps/api/src/modules/identite/application/use-cases/check-cgu-up-to-date.use-case.ts`

### Controllers HTTP

- [ ] T069 [P] [US3] DTOs et Zod validators dans `apps/api/src/modules/identite/interface/http/dto/legal-acceptance.dto.ts`
- [ ] T070 [US3] `LegalAcceptanceController` dans `apps/api/src/modules/identite/interface/http/legal-acceptance.controller.ts` : POST `/api/me/legal/accept` (AuthGuard + RoleGuard conseiller/admin + CSRF + Idempotency-Key + Set-Cookie HMAC) + GET `/api/me/legal/version-status` (lecture seule + Set-Cookie HMAC)
- [ ] T071 [P] [US3] Annotations `@nestjs/swagger` sur le controller + génération OpenAPI à `/api/docs` (dev/staging only)

### Frontend conseiller

- [ ] T072 [P] [US3] Composant `apps/web/src/components/legal/AcceptCguCheckbox.tsx` : checkbox `aria-required`, label clairement associé, message d'erreur en `aria-live="polite"`, lien vers `/cgu-conseiller` pour lecture
- [ ] T073 [US3] Page `apps/web/src/app/[locale]/(legal)/cgu-conseiller/re-accepter/page.tsx` (Server Component lit version courante + changelog du frontmatter MDX, formulaire Server Action vers POST `/api/me/legal/accept`)
- [ ] T074 [US3] Intégration de `AcceptCguCheckbox` dans le formulaire signup conseiller (à coordonner avec le module identité si signup existant en cours, sinon stub avec test isolé Vitest dans cette feature)

### Middleware Next.js (cookie HMAC + check version)

- [ ] T075 [P] [US3] Helper `apps/web/src/lib/legal/version-check.ts` : fonction `fetchVersionStatus(session, req)` qui appelle GET `/api/me/legal/version-status` ; cache process 60 s sur la version courante
- [ ] T076 [US3] Étendre `apps/web/src/middleware.ts` avec la clause de check de version `cgu_b2b` sur les routes `/(conseiller)/**` (sauf segment `(legal)` exclus) — voir pseudo-code dans `contracts/middleware-version-check.md`
- [ ] T077 [P] [US3] **Test middleware critique (P0 bloquant pour merge)** : Playwright `apps/web/test/e2e/legal-middleware.spec.ts` couvrant les 9 cas du contrat (1-9) dont les 3 P0 : forge detection (cookie signature invalide), redirect obsolète (v1 acceptée alors que courante v2), route exclue (`/cgu-conseiller/re-accepter` jamais redirigée)

### Tests bout-en-bout

- [ ] T078 [P] [US3] Test e2e Playwright : signup conseiller sans cocher CGU → rejet client + serveur — dans `apps/web/test/e2e/legal-us3-signup.spec.ts`
- [ ] T079 [P] [US3] Test e2e Playwright : signup conseiller avec CGU cochée → row `LegalAcceptance(documentType='cgu_b2b')` créée en BD avec `ipAddress` réel et `userAgent` — même fichier
- [ ] T080 [P] [US3] Test e2e Playwright ré-acceptation : seed BD avec acceptance v1, bump à v2, conseiller se connecte → redirect `/cgu-conseiller/re-accepter` qui affiche le `changelog` v2 — dans `apps/web/test/e2e/legal-us3-reacceptation.spec.ts`

**Checkpoint US3** : signup conseiller bloqué sans consentement ; ré-acceptation fonctionnelle après bump. Middleware sécurisé contre la forge de cookie.

---

## Phase 6 : User Story 4 — Voyageur double consentement intake (Priorité P2)

**Goal** : exposer la façade `LegalAcceptanceFacade` consommable par le module 002-voyageur-intake pour collecter le double consentement (confidentialité + CGU voyageur) au moment du brief intake.

**Independent Test** : un test de contrat dans 004 simule un consommateur (rôle de 002) qui appelle `acceptForBrief × 2` avec un `briefId` factice, et vérifie que (a) deux `LegalAcceptance` distinctes sont créées avec `subjectType='brief'`, (b) le rejeu est idempotent, (c) version inconnue lève l'exception attendue. Aucune dépendance à 002.

### Use case

- [ ] T081 [P] [US4] **TDD RED** Test `AcceptIntakeConsentUseCase` dans `apps/api/src/modules/identite/application/use-cases/__tests__/accept-intake-consent.test.ts` (cas nominal `confidentialite` + `cgu_b2c`, rejeu idempotent, version inconnue → `UnknownLegalDocumentVersionError`, version pas encore effective → idem, transaction interne testée via fake repository)
- [ ] T082 [US4] **TDD GREEN** Implémenter `AcceptIntakeConsentUseCase` (GREEN contre T081) dans `apps/api/src/modules/identite/application/use-cases/accept-intake-consent.use-case.ts` — transaction Prisma interne (`prisma.$transaction`), zéro client passé à l'appelant

### Facade publique

- [ ] T083 [US4] Implémenter `LegalAcceptanceFacade` dans `apps/api/src/modules/identite/interface/public-api/legal-acceptance.facade.ts` : méthodes `acceptForBrief(input)` et `getCurrentVersion(type)` — délégue à `AcceptIntakeConsentUseCase` et `LegalDocumentRepository.findCurrentByType`, encapsule la transaction
- [ ] T084 [P] [US4] Exporter `LegalAcceptanceFacade` depuis `IdentiteModule.exports` (cf. wiring T041)

### Test de contrat (cohérent avec pattern 001)

- [ ] T085 [P] [US4] Test de contrat `apps/api/test/contract/legal-acceptance.contract.test.ts` : simule consommateur 002, couvre les 6 scénarios du contrat (cf. `contracts/legal-acceptance.port.md`) — y compris le test « non-fuite de transaction » qui vérifie qu'aucune méthode du contrat n'expose un type Prisma ou un client transactionnel
- [ ] T086 [P] [US4] Fixture JSON snapshot du contrat dans `apps/api/test/contract/__snapshots__/legal-acceptance-facade.snapshot.json` (signature des méthodes, types d'exceptions exposées) — tout changement non-intentionnel fait échouer le test

### Anticipation orphan cleanup (sera owned par 002)

- [ ] T087 [P] [US4] Documenter dans `contracts/legal-acceptance.port.md` (section anticipation) le contrat du futur job `OrphanBriefCleanupJob` côté 002 : détecte briefs en `consent_pending > 1h` et les marque `consent_failed`. Pas d'implémentation ici (relève de 002).

**Checkpoint US4** : façade testée et stable. Le module 002-voyageur-intake peut commencer à la consommer dès le merge de cette spec.

---

## Phase 7 : User Story 5 — Inspecteur OPC consulte mentions légales (Priorité P3)

**Goal** : la page `/mentions-legales` affiche les valeurs exactes (raison sociale, NEQ à 10 chiffres, adresse postale Québec, juridiction Montréal, contact email) — pas de placeholders.

**Independent Test** : un inspecteur fictif consulte la page, confirme par checklist visuelle la présence et l'exactitude des 6 informations requises.

- [ ] T088 [US5] Demander au porteur du projet les valeurs exactes : raison sociale enregistrée au REQ Québec, NEQ 10 chiffres, adresse du siège social au Québec, courriel `legal@<domain>.ca` du responsable de la protection des renseignements personnels — documenter dans `docs/legal/editor-identity.md` (fichier `.gitignore`'d si données sensibles, sinon committed)
- [ ] T089 [US5] Remplacer les placeholders dans `packages/legal-content/fr-CA/mentions-legales.mdx` par les valeurs exactes — bumper version `1 → 2` dans le frontmatter — bloquant pour mise en ligne publique uniquement
- [ ] T090 [P] [US5] Test e2e Playwright `apps/web/test/e2e/legal-us5-mentions.spec.ts` : page contient `<h1>` mentions légales + 6 informations identifiables par sélecteurs robustes (data-testid)

**Checkpoint US5** : page mentions légales prête pour audit OPC.

---

## Phase N : Polish & Cross-cutting Concerns

**Objet** : effacement Loi 25 cross-module, observabilité, sécurité, documentation, validation finale.

### Effacement Loi 25 (extension de 001)

- [ ] T091 [P] **TDD RED** Test `AnonymizeLegalAcceptancesUseCase` dans `apps/api/src/modules/identite/application/use-cases/__tests__/anonymize-legal-acceptances.test.ts` (cas nominal : conseiller avec N acceptances → N rows `LegalAcceptanceAnonymization` créées ; rows originales intactes ; champs IP et UA correctement masqués ; idempotent sur double appel)
- [ ] T092 **TDD GREEN** Implémenter `AnonymizeLegalAcceptancesUseCase` (GREEN contre T091) dans `apps/api/src/modules/identite/application/use-cases/anonymize-legal-acceptances.use-case.ts`
- [ ] T093 **Étendre** `EraseConseillerDataUseCase` (livré en 001) : ajouter l'appel à `AnonymizeLegalAcceptancesUseCase` après les anonymisations conformité existantes — `apps/api/src/modules/conformite/application/use-cases/erase-conseiller-data.use-case.ts`
- [ ] T094 [P] **Test cross-module** : test d'intégration qui appelle `EraseConseillerDataUseCase` sur un conseiller test avec 3 acceptances seedées, vérifie que les 3 anonymizations sont créées et que les rows originales restent intactes — dans `apps/api/test/integration/conformite/erase-with-legal-anonymization.test.ts`

### Observabilité

- [ ] T095 [P] Métriques Prometheus exposées via OTel (livré en 001) : `legal_acceptances_total{type, version}`, `legal_reacceptance_required_total`, `legal_document_publish_total{type}`, `legal_cookie_present_total`, `legal_cookie_valid_total{result}`, `legal_cookie_forge_detected_total`, `legal_version_status_api_calls_total`, `legal_middleware_redirect_total{reason}` — dans `apps/api/src/modules/identite/observability/legal-metrics.ts` et `apps/web/src/lib/legal/metrics.ts`
- [ ] T096 [P] Dashboard Grafana JSON pour métriques légales dans `docs/dashboards/legal.json`
- [ ] T097 [P] Alertes Grafana dans `docs/dashboards/legal-alerts.yaml` : CRITICAL si `legal_cookie_forge_detected_total > 5/h` (attaque potentielle) ; WARN si `legal_reacceptance_required_total > 10` pendant > 7 jours (signal de churn conseiller post-bump)

### Sécurité

- [ ] T098 [P] Health check de boot : test de lecture des deux secrets AWS Secrets Manager (`LEGAL_COOKIE_HMAC_SECRET` + `LOI25_SUBJECT_ANONYMIZATION_SALT`) ; échec lecture → fail au démarrage (Principe IX) — étendre `apps/api/src/health/health.controller.ts`
- [ ] T099 [P] Audit IAM CloudTrail activé sur l'accès au secret salt anonymisation (ADR-0008 plan de réponse incident) — documenter procédure d'alerte SecOps dans `docs/runbooks/legal-incident-response.md`

### Documentation et préparation publication

- [ ] T100 [P] Script `pnpm legal:preview` : génère PDF des 5 MDX rendus pour relecture juriste hors-ligne (via `pandoc` ou équivalent), output dans `packages/legal-content/preview/<locale>/`
- [ ] T101 [P] Workflow de bump de version documenté dans `docs/runbooks/legal-version-bump.md` : juriste tag `[BUMP]`/`[NO-BUMP]`, développeur exécute, reviewer code confirme. Pattern bumper version : édition MDX → `pnpm legal:verify` → PR review juriste → merge → `seed-legal-documents.ts` post-deploy
- [ ] T102 [P] README du module identité — section LegalAcceptance avec liens dashboards + ADR-0008 + ADR-0009 — `apps/api/src/modules/identite/README.md`
- [ ] T103 [P] Mettre à jour `docs/roadmap.md` : 004 passe de 🔵 plan en cours à 🟢 mergé quand le PR merge

### Validation finale (Definition of Done)

- [ ] T104 Validation manuelle parcours quickstart end-to-end (parcours 1-5 de `quickstart.md`)
- [ ] T105 Exécution `/speckit.analyze` pour vérifier cohérence cross-artefacts (spec ↔ plan ↔ tasks ↔ contracts ↔ data-model)
- [ ] T106 Definition of Done — cocher tous les items de la checklist constitution + items spécifiques :
  - [ ] axe-core CI vert sur 5 pages + Footer + page ré-acceptation
  - [ ] Lighthouse CI vert (Perf ≥ 90, SEO ≥ 95, A11y ≥ 95) sur 5 routes FR-CA
  - [ ] `pnpm legal:verify` vert
  - [ ] Test middleware critique (T077) vert sur les 3 cas P0
  - [ ] Test de contrat `LegalAcceptanceFacade` (T085) vert
  - [ ] Tests immutabilité triggers (T011, T012, T013) verts
  - [ ] Test cross-module effacement Loi 25 (T094) vert
  - [ ] ADR-0008 + ADR-0009 acceptés et référencés
  - [ ] Migration Prisma testée en staging avec rollback applicatif vérifié
  - [ ] Valeurs exactes éditeur + texte juriste intégrés (T088 + T089) — bloquant déploiement public seulement
  - [ ] Roadmap.md mis à jour

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance externe — démarrage immédiat
- **Foundational (Phase 2)** : dépend de Setup — **bloque toutes les user stories**
- **User Story 1 (Phase 3)** : démarre après Foundational. P1 MVP — déployable seule
- **User Story 2 (Phase 4)** : démarre après Foundational. P1 MVP partie 2 — Footer requis par toutes les pages publiques futures, donc le plus tôt possible
- **User Story 3 (Phase 5)** : démarre après Foundational. P2. Indépendant de US2 (le middleware vit côté Next.js, le Footer aussi mais sur des fichiers différents)
- **User Story 4 (Phase 6)** : démarre après Foundational. P2. Aucune dépendance à US3 — la façade est testée en isolation
- **User Story 5 (Phase 7)** : démarre après US2 (les pages mentions-legales doivent exister). P3. Petit
- **Polish (Phase N)** : démarre après US1-US5 complétées ; effacement Loi 25 dépend des use cases livrés

### Dépendances dans la Foundational (Phase 2)

- T007 (schéma Prisma) → T008 (migration init) → T009 (triggers) → T010 (privilèges)
- T011, T012, T013 (tests triggers) **après** T008-T010
- T014-T016 (types + Zod) en parallèle entre eux
- T017-T018 (tests TDD red purs) **avant** T019 (GREEN compareLegalVersion + shouldRequireReacceptance)
- T020-T022 (tests TDD red) **avant** T023 (GREEN extractBrowserFamily + maskIpAddress + hashSubjectId)
- T024 (test TDD red cookie HMAC) **avant** T025 (GREEN cookie HMAC)
- T026-T029 (domain entities + VOs) en parallèle après T014-T015
- T030-T033 (ports) en parallèle après T026-T029
- T034-T036 (repositories Prisma) en parallèle après T030-T033 + T007
- T037-T040 (scripts CI) en parallèle, indépendants
- T041 (wiring) après tout le reste de Phase 2

### Dépendances intra-US

- **US1** : T042 (MDX) avant T044 (page) ; T045-T046 (tests) après T044
- **US2** : T047-T051 (MDX) avant T052-T055 (pages) ; T056 (layout) avant T057 (Footer) ; T058 (intégration) après T057 ; T059-T060 (sitemap) en parallèle des pages ; T061-T064 (tests) après les pages
- **US3** : T065-T066, T067-T068 (use cases TDD) → T069-T070 (controller) → T072-T074 (frontend) → T075-T076 (middleware) → T077-T080 (tests)
- **US4** : T081-T082 (use case TDD) → T083 (façade) → T084 (export) → T085-T087 (tests)
- **US5** : T088 (collecte valeurs) → T089 (MDX final) → T090 (test)

### Parallel Opportunities

- **Phase 1 Setup** : T002, T003, T004, T005, T006 en parallèle (configurations indépendantes)
- **Phase 2 — Tests triggers** : T011, T012, T013 en parallèle (fichiers différents) après T008-T010
- **Phase 2 — Types + Zod** : T014, T015, T016 en parallèle
- **Phase 2 — Domain layer** : T026, T027, T028, T029 en parallèle (entités indépendantes)
- **Phase 2 — Ports** : T030, T031, T032, T033 en parallèle
- **Phase 2 — Repositories** : T034, T035, T036 en parallèle
- **Phase 2 — Scripts CI** : T037, T038, T039, T040 en parallèle
- **Phase 3 US1** : T042 + T043 + T044 + T045 + T046 séquentiel-ish (T044 dépend T042) ; T045 et T046 [P]
- **Phase 4 US2** : T047-T051 [P] entre eux ; T052-T055 [P] après les MDX ; T059-T060 [P] avec les pages ; T061-T064 [P] après
- **Phase 5 US3** : tests TDD (T065, T067) [P], implémentations (T066, T068) après ; T072, T075 [P]
- **Phase 6 US4** : T085, T086, T087 [P] après T083
- **Phase N Polish** : T095, T096, T097, T098, T099, T100, T101, T102, T103 majoritairement en parallèle

---

## Implementation Strategy

### MVP First (US1 + US2 — P1)

1. **Phase 1 Setup** (T001-T006) — ~1 jour CC
2. **Phase 2 Foundational** (T007-T041) — ~3-5 jours CC (parallélisable, beaucoup de TDD pair)
3. **Phase 3 US1** (T042-T046) — ~2-3 heures CC
4. **Phase 4 US2** (T047-T064) — ~1-2 jours CC (5 MDX + 4 pages + Footer + tests a11y/perf bloquants)
5. **STOP and VALIDATE** : déployer 5 pages publiques en staging, exécuter Lighthouse + axe-core CI, valider Footer sur 10 pages aléatoires
6. Si OK → déployable comme MVP P1 (mentions légales publiquement accessibles, conformité légale minimale satisfaite)

### Incremental Delivery

1. Phase 1 + 2 complète → fondation prête
2. US1 + US2 (MVP P1) → 5 pages publiques + Footer
3. US3 (signup conseiller) → débloque l'inscription des premiers conseillers
4. US4 (façade publique) → débloque l'intégration côté module 002-voyageur-intake
5. US5 → mentions légales avec valeurs exactes pour audit OPC
6. Polish → effacement Loi 25 cross-module + observabilité + validation finale

### Parallel Team Strategy

Avec 2 développeurs après Phase 2 :

- **Dev A** : US1 + US2 (frontend + MDX) → US3 frontend (T072-T074)
- **Dev B** : US3 backend (T065-T071) + US4 (T081-T087) → Polish backend (T091-T094)

Avec 1 développeur : exécution séquentielle dans l'ordre des phases.

---

## Notes

- **[P]** = fichiers différents, pas de dépendance
- **[Story]** = traçabilité user story pour indépendance (sauf Setup, Foundational, Polish)
- Tests TDD écrits AVANT implémentation (commits séparés visibles dans git, sinon rejet à la revue — Principe VI)
- Commit après chaque task ou groupe logique
- Stop à n'importe quel checkpoint pour valider une user story indépendamment
- 3 tests P0 bloquants pour merge dans cette feature : forge detection (T077), redirect obsolète (T077), route exclue (T077). Cf. `contracts/middleware-version-check.md` section *Tests bloquants pour merge*.
- Éviter : tâches vagues, conflits de fichiers, dépendances cross-story qui cassent l'indépendance

---

## Validation finale

Avant de marquer cette feature 004 livrable, vérifier :

- [ ] Toutes les tâches T001-T106 cochées `[x]`
- [ ] CI verte complète sur le PR :
  - [ ] Biome (lint + format) — `pnpm lint`
  - [ ] tsc strict — `pnpm typecheck`
  - [ ] Vitest unitaire + integration — `pnpm test`
  - [ ] Playwright e2e — incluant `legal-middleware.spec.ts` (3 cas P0 bloquants)
  - [ ] axe-core a11y sur 5 pages + Footer + ré-acceptation
  - [ ] Lighthouse CI sur 5 routes FR-CA (Perf ≥ 90, SEO ≥ 95, A11y ≥ 95)
  - [ ] license check
  - [ ] `pnpm legal:verify` (drift checksum MDX)
- [ ] Tests d'invariants : 3 triggers immutables + drift checksum + non-fuite transaction cross-module
- [ ] Definition of Done de la constitution intégralement validée
- [ ] Migration Prisma testée en staging avec rollback applicatif vérifié
- [ ] ADR-0008 et ADR-0009 acceptés et liés depuis la spec et le plan
- [ ] Roadmap.md mis à jour : 004 → 🟢
- [ ] Texte juridique des 5 MDX relu par juriste (ou explicitement signé par le porteur si template adapté) — bloquant pour déploiement public seulement
- [ ] Valeurs exactes raison sociale + NEQ + adresse intégrées dans `mentions-legales.mdx` (T088 + T089) — bloquant pour déploiement public seulement
