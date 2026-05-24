---

description: "Tâches d'implémentation — Module Conformité"
---

# Tasks: Module Conformité

**Input** : Design documents from `/specs/001-conformite-module/`

**Prerequisites** :
- [plan.md](./plan.md) (stack v2.1.0, Constitution Check, blockers B1-B6 résolus)
- [spec.md](./spec.md) (5 user stories, 22 FR, 10 SC)
- [research.md](./research.md) (R1-R11)
- [data-model.md](./data-model.md) (entités, schéma Prisma, machine d'état, OutboxEntry, UploadIntent, règles pseudonymisation)
- [contracts/](./contracts/) (ConformiteQueryPort, http-endpoints, events)
- [quickstart.md](./quickstart.md)

**Tests** : TDD obligatoire (Principe VI NON-NÉGOCIABLE) pour : `computeConformiteStatus`, `isTransitionAllowed`, et tous les cas d'usage métier sensibles. Les tests sont **écrits avant** l'implémentation, dans des commits séparés. Tests e2e Playwright pour les parcours utilisateurs (US1, US2, US4, US5).

**Organization** : Tâches groupées par user story pour permettre l'implémentation et le test indépendants de chaque histoire.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : peut être exécutée en parallèle (fichiers différents, pas de dépendance)
- **[Story]** : à quelle user story la tâche appartient (US1-US5)
- Chaque description inclut le chemin de fichier exact

## Path Conventions

- Backend : `apps/api/src/modules/conformite/{domain,application,infrastructure,interface}/`
- Frontend : `apps/web/src/app/{(conseiller),(admin)}/conformite/`
- Partagé : `packages/shared/conformite/`
- DB : `apps/api/prisma/`
- Tests : à côté du code (`__tests__/`) ou dans `apps/api/test/{contract,integration,e2e}/`
- Infra : `infra/cdk/` (CDK TypeScript)

---

## Phase 1 : Setup (Bootstrap du monorepo)

**Objet** : initialiser la structure monorepo, l'outillage et la stack v2.1.0. **Cette phase est partagée avec tous les futurs modules** — exécutée une seule fois.

- [x] T001 Create pnpm workspace structure (`pnpm-workspace.yaml`, `apps/`, `packages/`, `infra/`, racine `package.json`)
- [x] T002 [P] Configure Turborepo (`turbo.json` avec pipelines `dev`, `lint`, `typecheck`, `test`, `build`)
- [x] T003 [P] Configure Biome (`biome.json` avec formatter + linter + import boundaries rule)
- [x] T004 [P] Configure Husky + lint-staged (`.husky/pre-commit`, `package.json` lint-staged config)
- [x] T005 [P] Configure commitlint avec Conventional Commits (`commitlint.config.js`, hook `.husky/commit-msg`)
- [x] T006 [P] Configure TypeScript strict (`tsconfig.base.json` partagé + `tsconfig.json` par app/package)
- [x] T007 [P] Setup `docker-compose.dev.yml` (Postgres 16, Redis 7, LocalStack pour S3/SES/KMS/Secrets)
- [x] T008 Initialize NestJS app avec Fastify adapter dans `apps/api/` (`src/main.ts`, `src/app.module.ts`, `package.json`)
- [x] T009 Initialize Next.js 15 App Router dans `apps/web/` avec **structure routing localisé `[locale]`** (B6 du review itération 2 — Principe IV) : arborescence `src/app/[locale]/(conseiller)/...` et `src/app/[locale]/(admin)/...`, `next.config.ts` configuré pour next-intl, layout racine `src/app/[locale]/layout.tsx`. La configuration concrète next-intl provider/middleware est faite en T030d
- [x] T010 Initialize `packages/shared/` avec Zod, exports vides pour `conformite`, `auth` (`packages/shared/package.json`, `src/index.ts`)
- [x] T011 Configure GitHub Actions CI (`.github/workflows/ci.yml` — lint Biome, typecheck tsc, test Vitest, build Turbo, license check, **scan SCA (`pnpm audit` + Snyk avec seuil CVSS ≥ 7 bloquant)**, axe-core, Lighthouse CI)
- [x] T012 Configure Prisma avec multi-file schema dans `apps/api/prisma/` (`schema.prisma` principal + import `auth.prisma` depuis `packages/shared/auth/prisma/`, connexion `DATABASE_URL`)

---

## Phase 2 : Foundational (Prérequis bloquants tous user stories)

**Objet** : infrastructure transversale dont **toutes** les user stories dépendent. Doit être complète avant de démarrer la moindre user story.

**⚠ CRITIQUE** : aucun travail user story ne peut commencer tant que cette phase n'est pas finie.

- [x] T013 Setup Pino logger global pour NestJS via `nestjs-pino` dans `apps/api/src/common/logger.module.ts`
- [x] T014 [P] Setup OpenTelemetry SDK (traces, metrics, logs) avec OTLP exporter vers Grafana Cloud CA — `apps/api/src/common/observability/otel.ts`
- [x] T015 [P] Setup Sentry SDK avec `beforeSend` PII scrubbing (allowlist) — `apps/api/src/common/observability/sentry.ts` et `apps/web/sentry.client.config.ts`
- [x] T016 Create Zod env validation schema et load au boot (crash si manquant) — `apps/api/src/env.ts` et `apps/web/src/env.ts`
- [x] T017 [P] Setup Auth.js v5 avec adapter Prisma — `apps/web/src/auth.ts` + migration Prisma pour tables `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verification_tokens` (schéma dans `packages/shared/auth/prisma/auth.prisma`)
- [x] T018 [P] Create `AuthSessionReader` port et `PrismaAuthSessionReader` adapter dans `apps/api/src/modules/identite/{application/ports,infrastructure}/`
- [x] T019 [P] Create `AuthGuard` NestJS lisant `auth_sessions` via le reader + cache local 5-10s — `apps/api/src/modules/identite/interface/auth.guard.ts`
- [x] T020 [P] Implement `IdempotencyInterceptor` lisant header `Idempotency-Key`, persistant `(key, response)` 7j dans Redis — `apps/api/src/common/interceptors/idempotency.interceptor.ts`
- [x] T021 [P] Implement `CsrfProtectionMiddleware` (vérification header `X-Requested-By: web` sur mutations) — `apps/api/src/common/middleware/csrf.middleware.ts`
- [x] T022 [P] Configure security headers via Fastify hooks (CSP strict, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) — `apps/api/src/common/security/headers.ts`
- [x] T023 [P] Create Zod validation pipe pour NestJS — `apps/api/src/common/pipes/zod-validation.pipe.ts`
- [x] T024 [P] Configure `@nestjs/throttler` avec backing Redis (rate limiting global + per-route) — `apps/api/src/common/throttler.module.ts`
- [x] T025 [P] Setup BullMQ avec connexion ioredis + module NestJS — `apps/api/src/queue/bullmq.module.ts`
- [x] T026 [P] Setup AWS SDK clients (S3, SES, Secrets Manager) avec credentials IAM via task role — `apps/api/src/aws/clients.ts`
- [x] T027 [P] Define branded UUID types (`ConseillerComplianceId`, `CertificatId`, `AffiliationId`, etc.) dans `packages/shared/conformite/branded-ids.ts`
- [x] T028 [P] Define `Clock` port et `SystemClock` adapter — `apps/api/src/common/{ports,infrastructure}/clock.{port,ts}` (testabilité fonctions pures Principe VI)
- [x] T029 Implement `/healthz` (liveness) et `/readyz` (readiness avec test PG + Redis + S3 PutObject) — `apps/api/src/health/health.controller.ts`
- [x] T030 Configure CDK stack initial (VPC, ECS Cluster, RDS, ElastiCache, S3 buckets, IAM roles) — `infra/cdk/cv-prod-stack.ts`
- [x] T030a [P] **Module-boundary enforcement CI test** (G1 du review — SC-008 / Principe V) : script `tools/check-module-boundaries.ts` qui parse les imports TS de `apps/api/src/modules/<X>/` et **fail le build** si un fichier importe un type Prisma ou un client SDK appartenant à un module `<Y>` différent. Wiring dans `.github/workflows/ci.yml` comme étape bloquante — `tools/check-module-boundaries.ts`
- [x] T030b [P] **Setup DNS DKIM/SPF/DMARC** pour AWS SES domaine `cv-mail.example.ca` (G4 du review — cf. ADR-0006 *Plan d'envoi initial*) : J-14 création domaine SES + configuration DKIM/SPF, J-7 DMARC `p=quarantine`, J-3 demande sortie sandbox SES, J-0 bascule DMARC `p=reject`. Documenter dans `docs/runbooks/ses-setup.md`
- [x] T030c [P] **Deploy Sentry self-hosted via CDK** (G5 du review — cf. ADR-0007) : stack `infra/cdk/sentry-stack.ts` créant service ECS Fargate dédié `sentry-prod` (séparé du cluster applicatif), RDS PostgreSQL `db.t4g.small`, conteneur ClickHouse single-node, ALB privé `sentry.cv.internal.example.ca`. Configuration `beforeSend` PII scrubbing dans T015 reste valable.
- [x] T030d [P] **next-intl provider + middleware Next.js** (B1 du review itération 2 — Principe IV NON-NÉGOCIABLE) : configuration `apps/web/src/i18n.ts` (locales `['fr-CA', 'en']`, defaultLocale `'fr-CA'`, fallback `'fr-CA'`, chargement dynamique des catalogues depuis `packages/shared/conformite/i18n/`), middleware `apps/web/src/middleware.ts` qui détecte la locale via cookie + en-tête Accept-Language + URL prefix, wrap du layout racine avec `<NextIntlClientProvider>` ; catalogue `en.json` créé vide (placeholder) pour matérialiser la structure i18n et permettre l'ajout EN ultérieur sans refonte
- [x] T030e [P] **Balises hreflang + lang attribute** dans le layout racine (B4 du review itération 2 — Principe IV SEO) : `<html lang={locale}>` dynamique, balises `<link rel="alternate" hreflang="fr-CA" />` et `<link rel="alternate" hreflang="x-default" />` générées par next-intl helper dans `apps/web/src/app/[locale]/layout.tsx`, prêtes à accepter `<link rel="alternate" hreflang="en" />` quand l'EN sera ajouté
- [x] T030f [P] **Zod setErrorMap FR-CA** (B5 du review itération 2 — Principe IV) : map d'erreurs Zod en FR-CA (`Required` → `Ce champ est obligatoire`, `Invalid email` → `Adresse courriel invalide`, etc.), exposé via `z.setErrorMap()` dans `packages/shared/conformite/zod-errors.ts`, appliqué globalement au boot des deux apps. Structure prête à accepter une map EN ultérieure (sélection par locale courante)
- [x] T030g [P] **Utilitaire formatters partagé** (B7 du review itération 2 — Principe IV formats régionaux) : helpers `formatDate(d, locale = 'fr-CA')` (format `dd MMMM yyyy`), `formatDateTime(d, locale)`, `formatCurrency(amount, currency = 'CAD', locale = 'fr-CA')`, basés sur date-fns + Intl.NumberFormat ; dans `packages/shared/conformite/formatters.ts`. **Aucun usage de format hardcodé** dans les pages — convention enforcée par les tâches UI ci-dessous

**Checkpoint** : foundation prête → implémentation user stories peut commencer en parallèle.

---

## Phase 3 : User Story 1 — Vérification initiale du conseiller (Priorité P1) 🎯 MVP

**Goal** : un conseiller soumet ses documents de conformité, un admin les approuve ou refuse, le statut bascule à `verified` si approuvé. Débloque toute la chaîne de valeur de la plateforme.

**Independent Test** : simuler un conseiller qui s'inscrit, soumet ses documents (CCV + affiliation OPC), voit son statut passer à `pending`, un admin l'approuve, statut bascule à `verified`. Aucun autre module métier requis.

### Tests TDD (à écrire AVANT l'implémentation — Principe VI)

> Cycle Red-Green-Refactor obligatoire pour les fonctions pures et les use cases métier sensibles. Tests commités séparément des implémentations.

- [x] T031 [P] [US1] Test `isTransitionAllowed` (cas nominal + cas d'erreur pour chaque transition de la machine d'état) dans `apps/api/src/modules/conformite/domain/services/__tests__/is-transition-allowed.test.ts`
- [x] T032 [P] [US1] Test `computeConformiteStatus` (cas nominal, cas d'erreur, conseiller sans cert, multi-affiliation, cert expiré) dans `apps/api/src/modules/conformite/domain/services/__tests__/compute-conformite-status.test.ts`
- [x] T033 [P] [US1] Test `validateDossierSubmission` (Zod + règles métier : ≥1 certificat, ≥1 affiliation, consentement obligatoire) dans `apps/api/src/modules/conformite/application/__tests__/validate-dossier-submission.test.ts`

### Domain (couche pure — zéro framework)

- [x] T034 [P] [US1] `ConformiteStatus` value object (4 valeurs + méthodes `isVerified`, `isFinal`) dans `apps/api/src/modules/conformite/domain/value-objects/conformite-status.vo.ts`
- [x] T035 [P] [US1] `Province` value object (`QC` | `ON`) dans `apps/api/src/modules/conformite/domain/value-objects/province.vo.ts`
- [x] T036 [P] [US1] `PermitNumber` value object (normalisation + validation format provincial) dans `apps/api/src/modules/conformite/domain/value-objects/permit-number.vo.ts`
- [x] T037 [P] [US1] `ConseillerCompliance` entity (avec invariants métier) dans `apps/api/src/modules/conformite/domain/entities/conseiller-compliance.entity.ts`
- [x] T038 [P] [US1] `Certificat` entity (avec invariants `decision === 'refused' ⇒ reason ≥ 20 chars`) dans `apps/api/src/modules/conformite/domain/entities/certificat.entity.ts`
- [x] T039 [P] [US1] `Affiliation` entity dans `apps/api/src/modules/conformite/domain/entities/affiliation.entity.ts`
- [x] T040 [P] [US1] `AuditEntry` entity dans `apps/api/src/modules/conformite/domain/entities/audit-entry.entity.ts`
- [x] T041 [P] [US1] Domain events (`ConformiteStatusChanged`, `DossierSubmitted`, `DossierDecided`) dans `apps/api/src/modules/conformite/domain/events/`
- [x] T042 [US1] Implement `isTransitionAllowed` fonction pure (GREEN contre T031) dans `apps/api/src/modules/conformite/domain/services/is-transition-allowed.ts`
- [x] T043 [US1] Implement `computeConformiteStatus` fonction pure (GREEN contre T032) dans `apps/api/src/modules/conformite/domain/services/compute-conformite-status.ts`

### Application (ports + cas d'usage)

- [x] T044 [P] [US1] Define ports `ConformiteReader`, `ConformiteWriter` dans `apps/api/src/modules/conformite/application/ports/conformite-{reader,writer}.port.ts`
- [x] T045 [P] [US1] Define ports `DocumentStoragePort`, `AuditLogWriter`, `NotificationPort`, `ConformiteEventPublisher` dans `apps/api/src/modules/conformite/application/ports/`
- [x] T046 [P] [US1] Define audit payload Zod schemas par `eventType` (B5 du review) dans `apps/api/src/modules/conformite/application/audit/payload-schemas.ts`
- [x] T047 [P] [US1] Implement `validateDossierSubmission` fonction pure (GREEN contre T033) dans `apps/api/src/modules/conformite/application/validate-dossier-submission.ts`
- [x] T048 [US1] Test `RequestUploadUrlsUseCase` avec fakes (B2) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/request-upload-urls.test.ts`
- [x] T049 [US1] Implement `RequestUploadUrlsUseCase` créant N `UploadIntent` + N URLs signées (B2) dans `apps/api/src/modules/conformite/application/use-cases/request-upload-urls.use-case.ts`
- [x] T050 [US1] Test `SubmitDossierUseCase` avec fakes (validation `UploadIntent`, écriture transactionnelle + outbox) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/submit-dossier.test.ts`
- [x] T051 [US1] Implement `SubmitDossierUseCase` (transaction Prisma unique : ConseillerCompliance + Certificat + Affiliation + AuditEntry + OutboxEntry) dans `apps/api/src/modules/conformite/application/use-cases/submit-dossier.use-case.ts`
- [x] T052 [US1] Test `ApproveDossierUseCase` (transition vers `verified`, OutboxEntry, AuditEntry) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/approve-dossier.test.ts`
- [x] T053 [US1] Implement `ApproveDossierUseCase` dans `apps/api/src/modules/conformite/application/use-cases/approve-dossier.use-case.ts`
- [x] T054 [US1] Test `RefuseDossierUseCase` (reason ≥ 20 chars, statut reste `pending`) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/refuse-dossier.test.ts`
- [x] T055 [US1] Implement `RefuseDossierUseCase` dans `apps/api/src/modules/conformite/application/use-cases/refuse-dossier.use-case.ts`

### Infrastructure (adaptateurs)

- [x] T056 [P] [US1] Prisma schema entities (ConseillerCompliance, Certificat, Affiliation, PermitRevocation, AuditEntry, UploadIntent, OutboxEntry) — édition `apps/api/prisma/schema.prisma`
- [x] T057 [US1] Migration Prisma initiale (créer toutes les tables `conformite_*`) — `apps/api/prisma/migrations/0001_init_conformite/migration.sql`
- [x] T058 [P] [US1] Migration SQL pour rôle DB `app_conformite` (privilèges restreints, REVOKE UPDATE/DELETE sur `conformite_audit_entries`) — `apps/api/prisma/migrations/0000_setup_db_roles/migration.sql`
- [x] T059 [US1] Migration SQL pour trigger PostgreSQL `conformite_audit_block_modifications` (audit append-only — R2) — `apps/api/prisma/migrations/0002_audit_append_only/migration.sql`
- [x] T060 [P] [US1] `PrismaConformiteRepository` implémentant `ConformiteReader` + `ConformiteWriter` dans `apps/api/src/modules/conformite/infrastructure/prisma-conformite-repository.ts`
- [x] T061 [P] [US1] `S3DocumentStorage` adapter (signed URLs PUT + GET, HEAD verification post-upload) dans `apps/api/src/modules/conformite/infrastructure/s3-document-storage.ts`
- [x] T062 [P] [US1] `PrismaAuditLogWriter` (valide chaque payload contre les Zod schemas T046 avant insert) dans `apps/api/src/modules/conformite/infrastructure/prisma-audit-log-writer.ts`
- [x] T063 [P] [US1] Test invariant : aucun appel `AuditLogWriter.write` n'inclut clés interdites (email, phone, firstName, lastName) — `apps/api/src/modules/conformite/infrastructure/__tests__/audit-payload-invariant.test.ts`
- [x] T064 [P] [US1] `BullmqNotification` adapter (enqueue un job par destinataire — Principe X) dans `apps/api/src/modules/conformite/infrastructure/bullmq-notification.ts`
- [x] T065 [P] [US1] `OutboxWriter` port + `PrismaOutboxWriter` adapter (B1 : utilisé par les use cases pour écrire un événement de domaine dans `conformite_outbox` **dans la même transaction Prisma** que la mutation métier ; **ne publie pas** l'événement — c'est `OutboxPublisherJob` T066 qui appelle ensuite `ConformiteEventPublisher` T096) — port dans `apps/api/src/modules/conformite/application/ports/outbox-writer.port.ts`, adapter dans `apps/api/src/modules/conformite/infrastructure/prisma-outbox-writer.ts`
- [x] T066 [US1] `OutboxPublisherJob` BullMQ worker (lit outbox, publie via `@nestjs/event-emitter`, marque `publishedAt`, backoff exponentiel) dans `apps/api/src/modules/conformite/infrastructure/jobs/outbox-publisher.job.ts`

### Interface (HTTP + DI)

- [x] T067 [P] [US1] Zod schemas API (RequestUploadUrls, SubmitDossier, ApproveDossier, RefuseDossier) dans `packages/shared/conformite/schemas.ts`
- [x] T068 [P] [US1] DTOs `ConseillerConformiteController` dans `apps/api/src/modules/conformite/interface/http/dto/conseiller.dto.ts`
- [x] T069 [P] [US1] DTOs `AdminConformiteController` dans `apps/api/src/modules/conformite/interface/http/dto/admin.dto.ts`
- [x] T070 [US1] `ConseillerConformiteController` (POST `/me/upload-urls`, POST `/me/submissions`, GET `/me`) dans `apps/api/src/modules/conformite/interface/http/conseiller-conformite.controller.ts`
- [x] T071 [US1] `AdminConformiteController` (GET `/admin/queue`, GET `/admin/submissions/:id`, POST `approve`, POST `refuse`) dans `apps/api/src/modules/conformite/interface/http/admin-conformite.controller.ts`
- [x] T072 [US1] `ConformiteModule` NestJS DI wiring (use cases ↔ ports ↔ adapters) dans `apps/api/src/modules/conformite/interface/conformite.module.ts`
- [x] T073 [US1] Add `@nestjs/swagger` annotations sur les contrôleurs + génération OpenAPI à `/api/docs` (dev/staging only)

### Frontend Next.js

- [ ] T074 [P] [US1] i18n FR-CA messages pour conformité (formulaires + erreurs + emails) dans `packages/shared/conformite/i18n/fr-CA.json` + miroir `en.json` vide (placeholder pour structure i18n)
- [ ] T074a [P] [US1] **Convention i18n stricte + check CI** (B2 du review itération 2 — Principe IV NON-NÉGOCIABLE) : à partir de cette feature, **aucune chaîne UI hardcodée** dans les pages Next.js. Toutes les strings passent par `getTranslations()` (RSC) ou `useTranslations()` (client). Script CI `tools/check-no-hardcoded-strings.ts` qui grep les fichiers `apps/web/src/app/[locale]/(conseiller|admin)/conformite/**` pour détecter chaînes françaises hardcodées (heuristique : contenu textuel JSX > 3 caractères contenant accents ou mots français) et **fail le build** sur détection. Wiring dans `.github/workflows/ci.yml`
- [ ] T075 [P] [US1] Templates react-email (résultat de revue : approuvé, refusé) **avec signature `({ locale, ...props })`** (B3 du review itération 2 — Principe IV) : messages via clés i18n du catalogue partagé (`fr-CA.json` initialement, `en.json` placeholder), formats de date via `formatDate(d, locale)` de T030g, dans `packages/shared/email/templates/conformite/`
- [ ] T076 [US1] Page conseiller soumission multi-step (5 étapes, react-hook-form + Zod + shadcn/ui + autosave) dans `apps/web/src/app/(conseiller)/conformite/soumettre/page.tsx`
- [ ] T077 [US1] Page conseiller dossier overview (statut actuel + résumé) dans `apps/web/src/app/(conseiller)/conformite/page.tsx`
- [ ] T078 [US1] Page admin file paginée (20/page, filtre par statut) dans `apps/web/src/app/(admin)/conformite/page.tsx`
- [ ] T079 [US1] Page admin détail soumission + modal approve/refuse dans `apps/web/src/app/(admin)/conformite/[dossierId]/page.tsx`
- [ ] T080 [US1] Server Actions wrappers avec header `X-Requested-By: web` + `Idempotency-Key` dans `apps/web/src/app/_lib/api-client.ts`

### Tests E2E

- [ ] T081 [US1] Playwright e2e : conseiller soumet → admin approuve → statut `verified` consultable via port public dans `apps/api/test/e2e/conformite-us1.spec.ts`
- [ ] T081a [P] [US1] **Test invariant filtrage matériel FR-007 / U1 du review** : test d'intégration `PrismaConformiteRepository` qui crée 3 conseillers (statuts `verified` / `suspended` / `revoked`) et vérifie que la méthode `findVerified()` retourne uniquement le premier. Couvre aussi le cas où `anonymizedAt` est non-null (filtré comme non-trouvé) — `apps/api/test/integration/conformite/prisma-repository-filter.test.ts`
- [ ] T081b [P] [US1] **Test trigger audit append-only FR-019 / U2 du review** : test d'intégration qui tente un `UPDATE` puis un `DELETE` sur une row `conformite_audit_entries` et vérifie que les deux lèvent une exception PostgreSQL (`audit log is append-only`). Test aussi que le rôle `app_conformite` n'a pas les privilèges UPDATE/DELETE — `apps/api/test/integration/conformite/audit-trigger.test.ts`
- [x] T081c [P] [US1] **Test attribution admin nominatif FR-018 / U3 du review** : test unitaire `PrismaAuditLogWriter` qui rejette toute entrée avec `actorRole === 'admin'` mais `actorId === null`. Garantit la traçabilité opérationnelle — `apps/api/src/modules/conformite/infrastructure/__tests__/prisma-audit-log-writer.test.ts`

**Checkpoint US1** : à ce stade, le MVP est fonctionnel et testable de bout en bout. Toute la chaîne soumission → revue → vérification → exposition via port public marche. Le module peut être déployé en MVP même sans US2-US5.

---

## Phase 4 : User Story 2 — Expiration automatique (Priorité P2)

**Goal** : surveillance automatique des dates d'expiration ; rappels J-60/J-30/J-7 ; bascule auto en `suspended` à l'expiration sans renouvellement.

**Independent Test** : injecter une horloge dans `Clock`, créer un certificat expirant à des dates connues, exécuter le job, vérifier les rappels et la bascule.

- [ ] T082 [P] [US2] Test `SendExpirationRemindersUseCase` (J-60, J-30, J-7 — horloge injectée) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/send-expiration-reminders.test.ts`
- [ ] T083 [P] [US2] Test `PropagateExpirationsUseCase` (bascule vers `suspended` après expiration totale) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/propagate-expirations.test.ts`
- [ ] T084 [US2] Implement `SendExpirationRemindersUseCase` dans `apps/api/src/modules/conformite/application/use-cases/send-expiration-reminders.use-case.ts`
- [ ] T085 [US2] Implement `PropagateExpirationsUseCase` dans `apps/api/src/modules/conformite/application/use-cases/propagate-expirations.use-case.ts`
- [ ] T086 [P] [US2] `ExpirationSweepJob` BullMQ scheduled quotidiennement à 02:00 (ca-central-1) dans `apps/api/src/modules/conformite/infrastructure/jobs/expiration-sweep.job.ts`
- [ ] T087 [P] [US2] `ReminderFanoutJob` (un job par conseiller, idempotent) dans `apps/api/src/modules/conformite/infrastructure/jobs/reminder-fanout.job.ts`
- [ ] T088 [P] [US2] Templates react-email (rappel J-60, J-30, J-7) **avec signature `({ locale, ...props })`** (B3 du review itération 2 — Principe IV) : messages via clés i18n + formats date via `formatDate` de T030g, dans `packages/shared/email/templates/conformite/`
- [ ] T089 [US2] Page conseiller renouvellement (re-soumission documents) dans `apps/web/src/app/(conseiller)/conformite/renouveler/page.tsx`
- [ ] T090 [US2] Playwright e2e avec horloge injectée : créer cert expirant J-1 → run job → vérifier statut `suspended` dans `apps/api/test/e2e/conformite-us2.spec.ts`

---

## Phase 5 : User Story 3 — Consultation interne du statut vérifié (Priorité P2)

**Goal** : exposer une interface publique `ConformiteQueryPort` aux autres modules + propagation < 60 s / < 10 s négatives (FR-022). Inclut la déclaration de retrait de permis (FR-015).

**Independent Test** : un consommateur fictif appelle `ConformiteQueryPort.getVerificationStatus()` avec différents états ; vérifier les valeurs binaires retournées + latence de propagation après transition.

- [ ] T091 [P] [US3] Test `GetVerificationStatusUseCase` (cache HIT, cache MISS, strict bypass, conseiller inconnu, anonymisé) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/get-verification-status.test.ts`
- [ ] T092 [P] [US3] Test `DeclarePermitRevokedUseCase` (idempotence sur `(permitNumber, province)`, cascade vers tous les conseillers affectés, OutboxEntry par conseiller) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/declare-permit-revoked.test.ts`
- [ ] T093 [US3] Implement `GetVerificationStatusUseCase` (avec bypass cache strict) dans `apps/api/src/modules/conformite/application/use-cases/get-verification-status.use-case.ts`
- [ ] T094 [US3] Implement `DeclarePermitRevokedUseCase` (transaction Prisma : PermitRevocation + UPDATE affiliations + recalcul statuts + N OutboxEntries) dans `apps/api/src/modules/conformite/application/use-cases/declare-permit-revoked.use-case.ts`
- [ ] T095 [P] [US3] `ConformiteStatusCache` Redis (TTL 60 s + invalidation explicite via pub/sub) dans `apps/api/src/modules/conformite/infrastructure/conformite-status-cache.ts`
- [ ] T096 [P] [US3] `RedisConformiteEventPublisher` — impl Redis pub/sub du port `ConformiteEventPublisher` (défini en T045 ; consommé par `OutboxPublisherJob` T066 pour la livraison effective des événements ; publie sur canal `conformite.status.changed` pour l'invalidation des caches consommateurs) dans `apps/api/src/modules/conformite/infrastructure/redis-conformite-event-publisher.ts`
- [ ] T097 [US3] `ConformiteQueryFacade` implémentant `ConformiteQueryPort` (cache + strict bypass + subscribe) dans `apps/api/src/modules/conformite/interface/public-api/conformite-query.facade.ts`
- [ ] T098 [US3] Contract test : consommateur fictif vérifie la conformité au contrat publié dans `packages/shared/conformite/contracts.ts` — `apps/api/test/contract/conformite-query.contract.test.ts`
- [ ] T099 [US3] AdminConformiteController POST `/admin/permits/revoke` endpoint dans `apps/api/src/modules/conformite/interface/http/admin-conformite.controller.ts` (UPDATE existant)
- [ ] T100 [US3] Page admin déclaration retrait de permis (formulaire + preview impact) dans `apps/web/src/app/(admin)/conformite/permis/page.tsx`
- [ ] T101 [US3] Playwright e2e : créer 3 conseillers affiliés à même permis → admin déclare retrait → 3 statuts basculés `suspended` en < 10 s dans `apps/api/test/e2e/conformite-us3-cascade.spec.ts`

---

## Phase 6 : User Story 4 — Révocation manuelle par admin (Priorité P3)

**Goal** : un admin peut révoquer manuellement un conseiller avec motif obligatoire ≥ 20 chars. Révocation définitive.

**Independent Test** : admin déclenche révocation → statut bascule à `revoked`, notification conseiller, événement journalisé, conseiller invisible des matchings.

- [ ] T102 [P] [US4] Test `RevokeConseillerUseCase` (motif ≥ 20 chars, transition vers `revoked`, irréversible, OutboxEntry) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/revoke-conseiller.test.ts`
- [ ] T103 [US4] Implement `RevokeConseillerUseCase` dans `apps/api/src/modules/conformite/application/use-cases/revoke-conseiller.use-case.ts`
- [ ] T104 [US4] AdminConformiteController POST `/admin/conseillers/:id/revoke` endpoint dans `apps/api/src/modules/conformite/interface/http/admin-conformite.controller.ts` (UPDATE existant)
- [ ] T105 [US4] Page admin détail conseiller avec action « Révoquer » (modal avec textarea motif ≥ 20 chars) dans `apps/web/src/app/(admin)/conformite/conseillers/[id]/page.tsx`
- [ ] T106 [US4] Playwright e2e : admin révoque conseiller `verified` → statut `revoked` + invisible du port public en < 10 s dans `apps/api/test/e2e/conformite-us4.spec.ts`
- [ ] T106a [P] [US4] **Template react-email « Révocation de votre statut conseiller »** (G2 du review itération 1 — couvre FR-005 et le scénario d'acceptation US4) **avec signature `({ locale, ...props })`** (B3 du review itération 2 — Principe IV) : template + plain-text auto-généré, messages via clés i18n du catalogue partagé (FR-CA puis EN), mention du motif communiqué par l'admin, lien magic-link vers l'espace conseiller pour soumettre un nouveau dossier — `packages/shared/email/templates/conformite/revocation.tsx`

---

## Phase 7 : User Story 5 — Espace personnel conseiller (Priorité P3)

**Goal** : le conseiller consulte son propre dossier : statut, certificats, affiliations, historique d'événements.

**Independent Test** : conseiller authentifié accède à son espace → voit statut + dates d'expiration + historique paginé.

- [ ] T107 [P] [US5] Test `ViewConseillerDossierUseCase` (audit paginé curseur, dates en `fr-CA`, certificats avec dates d'expiration) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/view-conseiller-dossier.test.ts`
- [ ] T108 [US5] Implement `ViewConseillerDossierUseCase` dans `apps/api/src/modules/conformite/application/use-cases/view-conseiller-dossier.use-case.ts`
- [ ] T109 [US5] ConseillerConformiteController GET `/me/audit` paginé curseur dans `apps/api/src/modules/conformite/interface/http/conseiller-conformite.controller.ts` (UPDATE existant)
- [ ] T110 [US5] Composant historique d'événements avec dates FR-CA + avertissement renouvellement si J-30 — édition `apps/web/src/app/(conseiller)/conformite/page.tsx`
- [ ] T111 [US5] Playwright e2e : conseiller voit statut + 5 derniers événements + avertissement si cert expire J-30 dans `apps/api/test/e2e/conformite-us5.spec.ts`

---

## Phase N : Polish & Cross-cutting Concerns

**Objet** : tâches transversales qui touchent plusieurs user stories ou qui sont des prérequis à la production.

- [ ] T112 [P] Test `EraseConseillerDataUseCase` (anonymisation profil + documents, conservation audit 7 ans) dans `apps/api/src/modules/conformite/application/use-cases/__tests__/erase-conseiller-data.test.ts`
- [ ] T113 Implement `EraseConseillerDataUseCase` (job BullMQ asynchrone, transaction Prisma + S3 delete + audit `erasure.completed`) dans `apps/api/src/modules/conformite/application/use-cases/erase-conseiller-data.use-case.ts`
- [ ] T114 ConseillerConformiteController POST `/me/erasure-request` endpoint dans `apps/api/src/modules/conformite/interface/http/conseiller-conformite.controller.ts` (UPDATE existant)
- [ ] T115 [P] `UploadIntentCleanupJob` BullMQ quotidien (delete intents expirés non consommés + objets S3 associés) dans `apps/api/src/modules/conformite/infrastructure/jobs/upload-intent-cleanup.job.ts`
- [ ] T116 [P] `DataRetentionSweepJob` BullMQ quotidien (anonymise briefs > 24 mois, profils désactivés > 6 mois, etc. selon tableau constitution) dans `apps/api/src/modules/conformite/infrastructure/jobs/data-retention-sweep.job.ts`
- [ ] T117 [P] S3 lifecycle policy CDK construct (abort incomplete multipart 1d, transition Glacier 24mo, supprime orphan intents) — édition `infra/cdk/cv-prod-stack.ts`
- [ ] T118 [P] Grafana dashboard JSON pour métriques conformité (SLA admin, latence propagation, file pending, cascades, échecs job, profondeur outbox) dans `docs/dashboards/conformite.json`
- [ ] T119 [P] Grafana alerts (WARN file pending > 5j ouvrables ; CRITICAL latence propagation négative > 10s ; CRITICAL job d'expiration en échec 2 jours consécutifs ; WARN profondeur outbox > 100) dans `docs/dashboards/conformite-alerts.yaml`
- [ ] T120 [P] axe-core tests automatiques sur pages conseiller + admin (WCAG 2.1 AA) dans `apps/web/test/a11y/conformite.spec.ts`
- [ ] T121 [P] Lighthouse CI config + baseline pour pages conseiller + admin (LCP, INP, CLS, JS budget) dans `lighthouserc.json`
- [ ] T122 README du module conformité + lien vers dashboard Grafana + lien vers spec/plan/research dans `apps/api/src/modules/conformite/README.md`
- [ ] T123 Validate `quickstart.md` end-to-end manuellement (suivre le parcours sur staging)
- [ ] T124 Run `/speckit.analyze` pour vérifier la cohérence cross-artefacts (spec ↔ plan ↔ tasks)
- [ ] T125a [P] **Page UI conseiller — demande d'effacement Loi 25** (G3 du review — couvre FR-017 côté interface) : page avec explication des conséquences (irréversible, conservation 7 ans audit), confirmation explicite « I_UNDERSTAND_THIS_IS_IRREVERSIBLE », appel Server Action vers POST `/me/erasure-request` — `apps/web/src/app/(conseiller)/conformite/effacement/page.tsx`
- [ ] T125 Definition of Done — cocher tous les items de la checklist constitution avant de marquer le PR ready, **plus les items suivants spécifiques à cette feature (C1, C2, C3 du review)** :
  - [ ] Checklist OWASP Top 10 cochée pour chaque endpoint HTTP modifié dans le PR (référencer la grille par endpoint dans `contracts/http-endpoints.md`)
  - [ ] Premier test de restauration de backup réussi en staging (RPO 24h validé) avant la première mise en production
  - [ ] DPA Loi 25 signé avec Grafana Labs et archivé dans `docs/legal/dpa/grafana-cloud-dpa.pdf` (cf. ADR-0003)
  - [ ] Audit pen test externe planifié dans les 90 jours suivant la mise en production publique (cf. constitution Principe IX)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance — démarrage immédiat
- **Foundational (Phase 2)** : dépend de Setup — **bloque toutes les user stories**
- **User Story 1 (Phase 3)** : démarre après Foundational. **MVP** — peut être déployé seul
- **User Story 2 (Phase 4)** : démarre après Foundational, indépendant de US1. Possible en parallèle de US1 si équipe staffée
- **User Story 3 (Phase 5)** : démarre après US1 (besoin de l'entité conformité écrite). Indépendant de US2/4/5
- **User Story 4 (Phase 6)** : démarre après US1. Indépendant de US2/3/5
- **User Story 5 (Phase 7)** : démarre après US1. Indépendant de US2/3/4
- **Polish (Phase N)** : démarre après toutes les user stories désirées sont complètes

### Dependances dans US1

- Tests TDD (T031-T033) **AVANT** implementations (T042, T043, T047)
- Value objects (T034-T036) avant entities (T037-T040)
- Entities + ports (T044-T046) avant use cases (T048+)
- Use case tests (T048, T050, T052, T054) **AVANT** use case implementations (T049, T051, T053, T055)
- Prisma schema (T056) avant migrations (T057-T059)
- Migrations avant adaptateurs Prisma (T060, T062)
- Adaptateurs (T060-T066) avant contrôleurs (T070-T071)
- Module wiring (T072) après tous les use cases et adaptateurs
- Frontend pages (T076-T079) après contrôleurs
- E2E test (T081) en dernier

### Parallel Opportunities

- **Phase 1 Setup** : T002, T003, T004, T005, T006, T007 en parallèle (configurations indépendantes)
- **Phase 2 Foundational** : T014-T028 en parallèle après T013 (Pino logger)
- **Phase 3 US1 — Tests TDD** : T031, T032, T033 en parallèle (fichiers de tests différents)
- **Phase 3 US1 — Value Objects + Entities** : T034-T041 en parallèle après les tests
- **Phase 3 US1 — Ports** : T044, T045, T046 en parallèle
- **Phase 3 US1 — Tests de use cases** : T048, T050, T052, T054 en parallèle
- **Phase 3 US1 — Adaptateurs infra** : T060, T061, T062, T064, T065 en parallèle après les ports
- **Phase 3 US1 — DTOs + schemas** : T067, T068, T069 en parallèle
- **Phase 4 US2** : T082, T083 en parallèle ; puis T086, T087, T088 en parallèle après les use cases
- **Phase 5 US3** : T091, T092 en parallèle ; puis T095, T096 en parallèle
- **Phase 7 US5** : démarre en parallèle de US3, US4 si équipe staffée
- **Phase N Polish** : T112-T121 majoritairement en parallèle

---

## Implementation Strategy

### MVP First (US1 uniquement)

1. **Phase 1 Setup** (T001-T012) — ~3-5 jours
2. **Phase 2 Foundational** (T013-T030) — ~5-7 jours (parallélisable)
3. **Phase 3 US1** (T031-T081) — ~3-4 semaines (équipe de 2-3 développeurs, TDD strict)
4. **STOP and VALIDATE** : tester US1 indépendamment (Playwright + manuel via `quickstart.md`)
5. Si OK → déploiement MVP (matching pas encore disponible mais conformité prête)

### Incremental Delivery

1. Phase 1 + 2 complète → fondation prête
2. US1 (MVP) → déploie + recueille feedback admin sur la file de revue
3. US3 (port public) → permet aux autres modules futurs de consommer
4. US2 (expiration auto) → indispensable dès qu'on dépasse 50 conseillers
5. US4 (révocation manuelle) → opérationnel ne peut pas tourner sans
6. US5 (espace personnel) → quality of life
7. Polish → avant ouverture publique

### Parallel Team Strategy

Avec 2-3 développeurs après Phase 2 :

- Dev A : couche domaine + application US1 (T031-T055)
- Dev B : couche infrastructure US1 (T056-T066) + setup CDK/CI
- Dev C : frontend US1 (T074-T080) + e2e Playwright

Puis US2-US5 par dev en parallèle après merge US1.

---

## Validation finale

Avant de marquer cette feature 001 livrable :

- [ ] Tous les tasks T001-T125 cochés `[x]`
- [ ] CI verte (Biome, tsc, Vitest, Playwright, axe-core, Lighthouse CI, license check)
- [ ] Definition of Done de la constitution (section *Flux de développement*) intégralement validée
- [ ] Migration Prisma testée en staging avec rollback applicatif vérifié 1h après déploiement
- [ ] Dashboard Grafana lié dans README du module + alertes configurées
- [ ] Audit pen test à planifier dans les 90 jours avant lancement public (cf. constitution Principe IX)

---

## Notes

- **[P]** = fichiers différents, pas de dépendance
- **[Story]** = traçabilité user story pour indépendance
- Chaque user story est complétable et testable indépendamment
- Tests TDD écrits AVANT implémentation (commits séparés visibles dans git, sinon rejet à la revue — Principe VI)
- Commit après chaque task ou groupe logique
- Stop à n'importe quel checkpoint pour valider une user story indépendamment
- Éviter : tâches vagues, conflits de fichiers, dépendances cross-story qui cassent l'indépendance
