# Tasks: Module Intake / Préqualification voyageur — feature 008 / dossier `002-voyageur-intake`

**Input** : Design documents from `specs/002-voyageur-intake/`

**Prerequisites** : spec.md (34 FRs post-clarify 2026-05-28, 5 US, 9 SC), plan.md, research.md (R1-R8), data-model.md (5 entités + 6 enums), contracts/http-endpoints.md (10 endpoints + 6 Server Actions + 4 outbox events), quickstart.md (10 scénarios)

**Tests** : **OBLIGATOIRES** (constitution v2.3.0 Principe VI TDD + DoD complète : unit pure dans `packages/shared/intake/`, intégration Testcontainers `apps/api`, e2e Playwright + axe-core a11y bloquant + Lighthouse CI Principe XI/XII)

**Organisation** : tâches groupées par user story pour permettre une implémentation et un test indépendants de chaque story (1 story = 1 incrément MVP livrable).

## Format: `[ID] [P?] [Story] Description`

- **[P]** : peut s'exécuter en parallèle (fichiers différents, pas de dépendance)
- **[Story]** : US1, US2, ..., US5 pour les phases user story (Setup / Foundational / Polish non taggés)
- Chemin de fichier exact dans chaque description

## Path Conventions (extraites de plan.md + Principe VIII.a)

- **Domaine partagé** : `packages/shared/src/intake/`
- **DB schema** : `packages/db/prisma/schema/intake.prisma`
- **API NestJS** : `apps/api/src/modules/intake/{domain,application,infrastructure,interface}/`
- **Web Next.js (VIII.a)** :
  - Routes : `apps/web/src/app/[locale]/(public)/voyage/`, `(voyageur)/voyage/`, `(admin)/admin/intake/`
  - Slice feature : `apps/web/src/features/intake/{actions,ui,hooks,infrastructure,lib,schemas,index.ts}`
- **Email templates** : `packages/email-templates/intake/`
- **Outils CI** : `tools/`
- **i18n** : `apps/web/messages/{fr-CA,en}.json` (namespace `intake.*`)

---

## Phase 1 : Setup (infrastructure partagée)

**Purpose** : scaffolding workspace + schéma Prisma + secrets + dépendances. Aucune logique métier ici.

- [X] T001 Créer le namespace `packages/shared/src/intake/` avec `index.ts` placeholder ré-exportant les futurs schemas / contracts / formatters ; `packages/shared/package.json` n'a rien à changer (export `./intake` existe via `./*`) — **note exécution : `./*` n'existait pas, l'export `./intake` + `./intake/*` a été ajouté à `packages/shared/package.json`**
- [X] T002 Étendre `turbo.json` avec env vars intake : `INTAKE_MAGIC_LINK_SECRET`, `INTAKE_DISPOSABLE_EMAILS_REFRESH_INTERVAL_HOURS`, `INTAKE_RATE_LIMIT_EMAIL_PER_24H`, `INTAKE_RATE_LIMIT_IP_PER_24H`, `INTAKE_BRIEF_EXPIRATION_DAYS` dans `globalPassThroughEnv`
- [X] T003 [P] Ajouter les dépendances domain pures à `packages/shared/package.json` (rien à ajouter — Zod, libphonenumber-js déjà présents) ; documenter la couverture cible (≥ 95 % lines/funcs/stmts, ≥ 90 % branches) dans `packages/shared/src/intake/README.md` — **note : libphonenumber-js n'est pas encore présent, sera ajouté en US1 quand le normaliseur sera implémenté**
- [X] T004 [P] Ajouter `disposable-email-domains` (npm, snapshot embedded en fallback) à `apps/api/package.json` ; documenter dans research.md R3 que le snapshot est régénéré par cron BullMQ
- [X] T005 Créer `packages/db/prisma/schema/intake.prisma` (file vide avec en-tête de feature) ; étendre `packages/db/prisma/schema.prisma` (multi-file) pour inclure intake — **note : `prismaSchemaFolder` preview auto-découvre les fichiers, pas de master schema.prisma à éditer**
- [X] T006 [P] `apps/api/src/env.ts` : ajouter les 5 env vars intake (INTAKE_MAGIC_LINK_SECRET ≥ 32 chars en prod, défaut dev fail-safe) avec validation Zod + superRefine refusant le défaut en prod
- [X] T007 [P] `apps/web/src/env.ts` : si une Server Action lit une var côté Web (rate-limit affichage, etc.), l'ajouter ici ; sinon NOOP — **NOOP confirmé, commentaire ajouté**
- [X] T008 Documenter dans `docs/runbooks/intake-secrets-rotation.md` la procédure de rotation `INTAKE_MAGIC_LINK_SECRET` (annual, double-token grace period 14 jours)
- [X] T009 [P] LocalStack SES : ajouter `intake-noreply@conseiller-voyage.local` aux verified identities dans `scripts/localstack/setup-ses.sh` — **note exécution : créé `02-init-ses.sh` (pattern numéroté, le `setup-ses.sh` n'existait pas), liste 3 identités (auth/conformite/intake)**
- [X] T010 Smoke test `pnpm typecheck && pnpm lint` après scaffolding — commit T001-T009 séparé pour avoir un point de retour propre — **OK : typecheck 17 packages successful + lint 620 files no errors + prisma validate OK**

---

## Phase 2 : Foundational (prérequis bloquants)

**⚠️ CRITICAL** : aucune user story ne peut commencer tant que cette phase n'est pas complète.

**Purpose** : schéma Prisma + enums + migrations + Zod schemas partagés + ports applicatifs core + outbox table + trigger audit append-only.

### Schéma DB

- [ ] T011 Définir dans `packages/db/prisma/schema/intake.prisma` les 6 enums : `BriefStatus`, `TravelBudget`, `TravelSpeciality`, `TravelFamiliarity`, `ConseillerLanguage`, `MagicLinkPurpose` (mapping data-model.md §enums)
- [ ] T012 Définir dans `packages/db/prisma/schema/intake.prisma` les 5 modèles : `VoyageurContact`, `VoyageurBrief`, `MagicLinkToken`, `IntakeAuditEntry`, `IntakeOutboxEntry` (tous champs/indexes/FK du data-model.md)
- [ ] T013 Créer migration `packages/db/prisma/migrations/<timestamp>_init_intake/migration.sql` : tables + index uniques (`email`, `idempotency_key WHERE NOT NULL`, `token_hash`)
- [ ] T014 Créer migration `packages/db/prisma/migrations/<timestamp>_intake_audit_append_only/migration.sql` : trigger Postgres `intake_audit_block_modifications` (copie/adapter de `conformite_audit_block_modifications`) bloquant UPDATE/DELETE
- [ ] T015 Créer migration `packages/db/prisma/migrations/<timestamp>_intake_anonymisation_trigger/migration.sql` : trigger Postgres sur `voyageur_contacts` qui rejette tout UPDATE de `firstName/lastName/phone/postalCode` en NON-NULL après `anonymizedAt IS NOT NULL` (idempotence anonymisation Loi 25, pattern hérité de 001/007)
- [ ] T016 `pnpm --filter @cv/db prisma generate` puis `pnpm --filter @cv/db migrate dev --name init_intake` en local LocalStack — vérifier que `prisma.voyageurBrief` est typé

### Zod schemas + branded IDs + contrats partagés

- [ ] T017 [P] **[TDD RED]** `packages/shared/src/intake/__tests__/branded-ids.test.ts` : tests des helpers `toVoyageurBriefId(uuid)`, `toMagicLinkTokenId`, `toVoyageurContactId` (refuse string non-UUID, accepte UUID v4)
- [ ] T018 [P] **[TDD GREEN]** `packages/shared/src/intake/branded-ids.ts` : type branding + helpers (pattern hérité de `packages/legal/src/branded-ids.ts`)
- [ ] T019 [P] **[TDD RED]** `packages/shared/src/intake/__tests__/schemas.test.ts` : tests Zod pour `SubmitBriefSchema`, `VerifyMagicLinkSchema`, `ResendMagicLinkSchema`, `ErasureRequestBriefSchema`, `AdminPushManualSchema` (chacun avec ≥ 5 cas valides + ≥ 8 cas refus avec assertion sur le path d'erreur)
- [ ] T020 [P] **[TDD GREEN]** `packages/shared/src/intake/schemas.ts` : Zod schemas alignés sur contracts/http-endpoints.md §1
- [ ] T021 [P] `packages/shared/src/intake/contracts.ts` : interface `IntakeQueryPort` (1 méthode `findActiveBriefsByEmail`) + types `BriefSummary` exposés à la feature matching future
- [ ] T022 [P] `packages/shared/src/intake/formatters.ts` : `formatBudgetRange`, `formatSpeciality`, `formatFamiliarity` FR-CA + EN (pure fns, testées)

### Ports applicatifs + base infrastructure

- [ ] T023 [P] `apps/api/src/modules/intake/application/ports/` : créer les 7 ports — `VoyageurBriefReader`, `VoyageurBriefWriter`, `VoyageurContactReader`, `VoyageurContactWriter`, `MagicLinkTokenWriter`, `MagicLinkMailer`, `DisposableEmailChecker`, `IntakeRateLimiter`, `IntakeAuditLogWriter`, `IntakeOutboxWriter` (interfaces TS pures, jamais d'import infrastructure)
- [ ] T024 [P] `apps/api/src/modules/intake/intake.module.ts` placeholder NestJS Module avec liste de providers vide (sera étendue par chaque US)
- [ ] T025 Ajouter `IntakeModule` dans `apps/api/src/app.module.ts` (lazy : le module n'expose encore aucun controller)

### Rolling session cookie cross-cutting (FR-014a, Q5 clarify, C2)

- [ ] T025a **(C2, TDD RED)** `apps/api/src/modules/intake/interface/http/__tests__/rolling-session-cookie.interceptor.test.ts` : tests unitaires NestJS de `RollingSessionCookieInterceptor` (mock `ExecutionContext`) — (a) requête sans cookie `__Host-cv.intake.token` → ne pose AUCUN Set-Cookie ; (b) requête avec cookie valide + handler retourne 200 → Set-Cookie posé avec `Max-Age=604800`, mêmes flags `HttpOnly/Secure/SameSite=Lax/Path=/` qu'à l'origine ; (c) handler retourne 4xx → PAS de renewal (anti-extension de session sur erreur) ; (d) handler annoté `@SkipRollingRenewal()` → PAS de renewal (utilisé sur POST `/erase-all-data` qui doit RÉVOQUER, pas renouveler).
- [ ] T025b **(C2, TDD GREEN)** `apps/api/src/modules/intake/interface/http/rolling-session-cookie.interceptor.ts` : implémentation `NestInterceptor` global pour le module intake ; lit le cookie depuis `req.cookies` ; après `next.handle()`, si statut < 400 ET pas de décorateur `@SkipRollingRenewal()`, ajoute `res.cookie(name, value, { maxAge: 604800_000, httpOnly: true, secure: prod, sameSite: 'lax', path: '/' })` (en prod : préfixe `__Host-`).
- [ ] T025c **(C2)** `apps/api/src/modules/intake/interface/http/skip-rolling-renewal.decorator.ts` : décorateur `@SkipRollingRenewal()` (Reflector metadata key `intake:skipRollingRenewal`)
- [ ] T025d **(C2)** Wire `RollingSessionCookieInterceptor` dans `intake.module.ts` via `APP_INTERCEPTOR` (scoped au module, pas global app — Principe V frontières modulaires)

**Checkpoint** : Foundation prête — `pnpm --filter @cv/db prisma migrate dev` reproductible, `prisma.voyageurBrief` typé, schemas Zod partagés, rolling cookie interceptor opérationnel. Les user stories peuvent commencer en parallèle.

---

## Phase 3 : US1 — Voyageur soumet un brief qualifié (P1) 🎯 MVP

**Goal** : un voyageur peut remplir le formulaire 5 étapes en < 7 min, recevoir un magic link, le cliquer, et activer son brief.

**Independent Test** : `pnpm --filter @cv/api test:e2e -- intake/submit-and-verify.spec.ts` — soumet via Server Action, lit le mail depuis LocalStack SES, hit le verify endpoint, asserte brief `active` + outbox `voyageur.brief.activated` créée.

### Domaine — entités & VO (TDD strict, Principe VI)

- [ ] T026 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/value-objects/__tests__/travel-budget.vo.test.ts` : tests purs de `TravelBudgetVo.fromString` (5 valeurs canoniques, refus 6e)
- [ ] T027 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/value-objects/travel-budget.vo.ts`
- [ ] T028 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/value-objects/__tests__/travel-speciality.vo.test.ts` : tests 11 valeurs canoniques + "other" avec précision libre obligatoire ≤ 200 chars
- [ ] T029 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/value-objects/travel-speciality.vo.ts`
- [ ] T030 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/value-objects/__tests__/travel-familiarity.vo.test.ts` (3 enum)
- [ ] T031 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/value-objects/travel-familiarity.vo.ts`
- [ ] T032 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/value-objects/__tests__/dates-flexibility.vo.test.ts` (bool + amplitude 1-30j conditionnel)
- [ ] T033 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/value-objects/dates-flexibility.vo.ts`
- [ ] T034 [P] [US1] `apps/api/src/modules/intake/domain/entities/voyageur-brief.entity.ts` : entité immuable post-vérification (status, transitions enum, helpers `markVerified()`, `markExpired()`)
- [ ] T035 [P] [US1] `apps/api/src/modules/intake/domain/entities/voyageur-contact.entity.ts` : PII séparée, helper `applyAnonymisation()` (nullify PII, conserve `emailHashAfterErasure`)
- [ ] T036 [P] [US1] `apps/api/src/modules/intake/domain/entities/magic-link-token.entity.ts` : token random 32 bytes hex, `tokenHash = sha256(clear)`, transitions `unused → consumed/expired`
- [ ] T037 [P] [US1] `apps/api/src/modules/intake/domain/events/{brief-submitted,brief-verified}.event.ts`
- [ ] T038 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/services/__tests__/sign-magic-link.test.ts` : tests HMAC SHA-256 — déterministe par secret, change si secret change, ne peut être forgé (cf. R1)
- [ ] T039 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/services/sign-magic-link.ts`
- [ ] T040 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/services/__tests__/compute-brief-expiration.test.ts` : tests purs J+90 (FR-024)
- [ ] T041 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/services/compute-brief-expiration.ts`
- [ ] T042 [P] [US1] **[TDD RED]** `apps/api/src/modules/intake/domain/services/__tests__/validate-brief-submission.test.ts` : règles métier (date retour > départ, voyage pas dans passé, < 3 ans dans futur, etc.)
- [ ] T043 [P] [US1] **[TDD GREEN]** `apps/api/src/modules/intake/domain/services/validate-brief-submission.ts`

### Application — use cases

- [ ] T044 [US1] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/submit-brief.use-case.test.ts` : suite Vitest avec fakes (`_fakes.ts` partagé) — cas nominal, validation Zod fail, idempotency hit, rate-limit fail, disposable email fail
- [ ] T045 [US1] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/submit-brief.use-case.ts` : orchestre Zod → DisposableEmailChecker → IntakeRateLimiter → upsert VoyageurContact → create VoyageurBrief → create MagicLinkToken → enqueue MailerJob → publish brief.submitted audit + outbox (transactionnel)
- [ ] T046 [US1] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/verify-magic-link.use-case.test.ts` : cas nominal, token expiré, token déjà consommé, brief anonymisé
- [ ] T047 [US1] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/verify-magic-link.use-case.ts` : lookup token hash, mark consumed, brief `pending_verification → active`, publish `voyageur.brief.activated` outbox + audit

### Infrastructure — adapters Prisma + SES + Redis

- [ ] T048 [P] [US1] `apps/api/src/modules/intake/infrastructure/prisma-voyageur-brief-repository.ts` : implémente `VoyageurBriefReader` + `VoyageurBriefWriter`
- [ ] T049 [P] [US1] `apps/api/src/modules/intake/infrastructure/prisma-voyageur-contact-repository.ts` : implémente readers/writers contact + upsert atomique sur `email`
- [ ] T050 [P] [US1] `apps/api/src/modules/intake/infrastructure/prisma-magic-link-token-repository.ts` : insertion + lookup par `tokenHash` + `markConsumed`
- [ ] T051 [P] [US1] `apps/api/src/modules/intake/infrastructure/redis-intake-rate-limiter.ts` : sliding window (3/24h par email, 5/24h par IP) — réutilise client Redis 001
- [ ] T052 [P] [US1] `apps/api/src/modules/intake/infrastructure/disposable-email-checker.ts` : lookup en-mémoire d'un Set chargé depuis Redis (key `intake:disposable-emails`) avec fallback `packages/shared/src/intake/disposable-emails-snapshot.json`
- [ ] T053 [P] [US1] `apps/api/src/modules/intake/infrastructure/ses-magic-link-mailer.ts` : implémente `MagicLinkMailer` ; consomme `packages/email-templates/intake/magic-link.tsx` (react-email)
- [ ] T054 [P] [US1] `apps/api/src/modules/intake/infrastructure/prisma-intake-audit-log-writer.ts` (table `intake_audit_entries` séparée — Principe V) + `prisma-intake-outbox-writer.ts`

### Interface — Controllers NestJS

- [ ] T055 [US1] **[TDD RED]** `apps/api/src/modules/intake/interface/http/__tests__/submit-brief.integration.test.ts` : Testcontainers Postgres + Redis — POST `/api/intake/briefs` golden path + validation 400 + rate-limit 429 + disposable 422 + idempotency 409 (réutilise pattern 001)
- [ ] T056 [US1] **[TDD GREEN]** `apps/api/src/modules/intake/interface/http/voyageur-intake.controller.ts` : POST `/api/intake/briefs` + POST `/api/intake/briefs/verify` ; DTOs Zod via `ZodValidationPipe` ; CSRF middleware + ThrottlerGuard hérités 001 + `Idempotency-Key` via `IdempotencyInterceptor`
- [ ] T057 [US1] Wire les providers (use cases + adapters + ports) dans `apps/api/src/modules/intake/intake.module.ts`

### Email templates + i18n

- [ ] T058 [P] [US1] `packages/email-templates/intake/magic-link.tsx` (react-email, FR-CA + EN) + tests rendu Vitest snapshot
- [ ] T059 [P] [US1] `apps/web/messages/fr-CA.json` namespace `intake.form.*` (5 étapes, FR-007 11 spécialités, FR-008 3 familiarités, FR-005 5 budgets, FR-010 texte consentement Loi 25 complet) + `apps/web/messages/en.json` mêmes clés

### Frontend — Server Actions + UI slice intake

- [ ] T060 [P] [US1] `apps/web/src/features/intake/schemas/index.ts` : ré-export depuis `@cv/shared/intake` pour usage RHF + zodResolver
- [ ] T061 [P] [US1] `apps/web/src/features/intake/infrastructure/api-client.ts` : wrapper typé sur les endpoints `/api/intake/briefs*` (via `@/shared/lib/http`)
- [ ] T062 [P] [US1] `apps/web/src/features/intake/actions/submit-brief.action.ts` : Server Action `'use server'`, validation Zod + forward NestJS, retourne `ActionResult<{ briefId; emailSent: boolean }>` typé
- [ ] T063 [P] [US1] `apps/web/src/features/intake/actions/verify-magic-link.action.ts`
- [ ] T064 [P] [US1] `apps/web/src/features/intake/ui/BriefFormWizard.tsx` : Client Component orchestrateur (RHF + zodResolver + useTransition), 5 étapes navigables Next/Back, aria-live erreurs. **localStorage reprise 24h (Q3 clarify 2026-05-28)** : key `intake:draft:v1`, payload = **5 étapes intégrales PII comprise** (destinations, dates, groupe, budget, langue, spécialité, familiarité, contact prénom/nom/email/téléphone/code postal — PAS le consentGiven qui doit être re-coché à chaque tentative), TTL 24h via timestamp dans le payload (lecture rejette si > 24h), auto-clear à `submit` réussi (status 201/429/422), auto-clear à `verify-magic-link` réussi (logout équivalent), hors scope Loi 25 (stockage device voyageur, pas serveur) — clause « stockage local côté client » dans politique de confidentialité (feature 004)
- [ ] T065 [P] [US1] `apps/web/src/features/intake/ui/BriefStep1Destination.tsx` : autocomplete pays (liste canonique embedded), multi-stop
- [ ] T066 [P] [US1] `apps/web/src/features/intake/ui/BriefStep2Dates.tsx` : datepicker accessible, toggle flexible + slider amplitude
- [ ] T067 [P] [US1] `apps/web/src/features/intake/ui/BriefStep3Groupe.tsx` : compteurs adultes/enfants/bébés + ages enfants
- [ ] T068 [P] [US1] `apps/web/src/features/intake/ui/BriefStep4Preferences.tsx` : radio budget, multi-select langue + spécialité (avec "autre + texte"), radio familiarité
- [ ] T069 [P] [US1] `apps/web/src/features/intake/ui/BriefStep5ContactConsentement.tsx` : champs PII + case Loi 25 non pré-cochée (FR-010)
- [ ] T070 [P] [US1] `apps/web/src/features/intake/ui/EmailSentNotice.tsx` : Client Component affiché après `submitBriefAction` succès (statut 201). **UX countdown FR-013a (Q1 clarify)** : (1) message principal *« Vérifiez votre courriel <email> »* + sous-titre discret *« Il peut y avoir un léger délai »* (FR-013a 5xx SES) ; (2) bouton *« Je n'ai rien reçu — renvoyer un lien »* **disabled** au premier rendu ; (3) compteur visible 120s côté client (`useEffect` + `setInterval`, libellé *« Disponible dans Xs »*) ; (4) bouton **enabled** à t=120s, libellé devient *« Renvoyer le lien »* ; (5) clic appelle `resendMagicLinkAction(email)` puis remet le compteur à zéro et redisable le bouton 120s ; (6) `aria-live="polite"` annonce le compteur final à 0 pour lecteurs d'écran ; (7) bouton désactivé reste focusable mais `aria-disabled="true"` + tooltip *« Veuillez patienter Xs »*. Imports via barrel `@/features/intake`.
- [ ] T070b [P] [US1] `apps/web/src/features/intake/ui/MagicLinkExpiredNotice.tsx` (FR-015, H4) : Client Component pour la page `/voyage/lien-expire` — input email + bouton *« Renvoyer un nouveau lien »* → `resendMagicLinkAction` ; affiche un message générique de succès 202 (anti-énumération email)
- [ ] T071 [P] [US1] `apps/web/src/features/intake/index.ts` : barrel publiant `BriefFormWizard`, `EmailSentNotice`, `MagicLinkExpiredNotice`, `submitBriefAction`, `verifyMagicLinkAction`, `resendMagicLinkAction`, types
- [ ] T072 [US1] `apps/web/src/app/[locale]/(public)/voyage/nouveau/page.tsx` : Server Component MINCE qui rend `<BriefFormWizard />` ; **import UNIQUEMENT via le barrel** `import { BriefFormWizard } from '@/features/intake'` (jamais `@/features/intake/ui/BriefFormWizard` — Principe VIII.a §6) ; metadata + JSON-LD `WebPage`
- [ ] T073 [US1] `apps/web/src/app/[locale]/(public)/voyage/email-envoye/page.tsx` : rend `<EmailSentNotice />` via barrel `@/features/intake`
- [ ] T073b [US1] **(H4)** `apps/web/src/app/[locale]/(public)/voyage/lien-expire/page.tsx` : Server Component MINCE → `<MagicLinkExpiredNotice />` via barrel `@/features/intake` ; metadata `noindex` (page d'erreur, pas de valeur SEO) ; déclenchée par redirection depuis `/voyage/[token]` quand `verify-magic-link` retourne 401
- [ ] T073c [P] [US1] **(H4)** `apps/web/src/features/intake/actions/resend-magic-link.action.ts` : Server Action `'use server'`, Zod parse `{ email }`, forward POST `/api/intake/briefs/:id/resend-magic-link`, retourne `ActionResult<{ status: 'sent_or_email_not_found' }>` (réponse uniforme 202 — anti-énumération)
- [ ] T074 [US1] `apps/web/src/app/[locale]/(public)/layout.tsx` : déjà présent (#17) — vérifier que SEO indexable (pas de noindex) car page entrée funnel

### Tests e2e + a11y US1

- [ ] T075 [P] [US1] `apps/web/test/e2e/intake-submit.spec.ts` : Playwright golden path (LocalStack SES inspection) ; activé via `E2E_SEED_ENABLED` ou en mode public (anti-spam désactivé pour test)
- [ ] T076 [P] [US1] `apps/web/test/a11y/intake-form.spec.ts` : axe-core sur les 5 étapes du formulaire — zéro violation serious/critical (Principe XI NON-NÉGOCIABLE)
- [ ] T077 [P] [US1] `apps/web/test/e2e/intake-verify-magic-link.spec.ts` : lit le token depuis LocalStack SES, navigate `/voyage/<token>`, asserte cookie posé + redirect récap

**Checkpoint US1** : `POST /api/intake/briefs` + `POST /api/intake/briefs/verify` fonctionnels, formulaire 5 étapes accessible WCAG AA, magic link reçu via SES, brief activé. **MVP livrable** (sans matching).

---

## Phase 4 : US2 — Voyageur consulte le statut de son brief (P2)

**Goal** : le voyageur peut visiter `/voyage/<token>` et voir un récap lecture-seule + lien vers ses autres briefs.

**Independent Test** : Playwright e2e `intake-view-status.spec.ts` — depuis cookie posé en US1, GET récap → 9 dimensions affichées, statut « Actif », date expiration, bouton effacement disponible.

### Backend — endpoints lecture

- [ ] T078 [P] [US2] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/view-brief-status.use-case.test.ts` : cas nominal + 401 sans cookie + 410 brief anonymisé
- [ ] T079 [P] [US2] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/view-brief-status.use-case.ts`
- [ ] T080 [P] [US2] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/list-briefs-by-email.use-case.test.ts`
- [ ] T081 [P] [US2] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/list-briefs-by-email.use-case.ts`
- [ ] T082 [US2] Étendre `voyageur-intake.controller.ts` avec GET `/api/intake/briefs/:briefId` + GET `/api/intake/briefs/by-email` (auth via `IntakeAuthGuard` qui valide le cookie `__Host-cv.intake.token`)
- [ ] T081b [P] [US1] **(N1, TDD RED)** `apps/api/src/modules/intake/application/use-cases/__tests__/resend-magic-link.use-case.test.ts` : cas nominal (brief existant en `pending_verification` OU `active`/expiration < 7j → nouveau token + email), brief inexistant (réponse 202 quand même — anti-énumération), brief anonymisé (refus silencieux), rate-limit déclenché (5/heure/IP + 3/24h/email)
- [ ] T081c [P] [US1] **(N1, TDD GREEN)** `apps/api/src/modules/intake/application/use-cases/resend-magic-link.use-case.ts` : recherche brief par email (le caller a vérifié son adresse, donc lookup OK), marque les anciens MagicLinkToken `verify_email` comme expirés, crée un nouveau MagicLinkToken random + enqueue mailer, retourne toujours `{ status: 'sent_or_email_not_found' }` (anti-énumération)
- [ ] T082a [US1] **(N1)** Étendre `voyageur-intake.controller.ts` avec POST `/api/intake/briefs/:briefId/resend-magic-link` — body Zod `{ email }`, rate-limit `5/heure/IP + 3/24h/email` (réutilise `@IntakeRateLimit`), retour 202 uniforme (anti-énumération), `@SkipRollingRenewal()` (pas de cookie en jeu)
- [ ] T082b [P] [US1] **(N1, intégration)** `apps/api/src/modules/intake/interface/http/__tests__/resend-magic-link.integration.test.ts` : Testcontainers — golden path 202, brief inexistant → 202 identique (assert pas de leak email), rate-limit → 429 avec body neutre `RATE_LIMIT_EXCEEDED`, anciens tokens marqués expirés en DB
- [ ] T083 [P] [US2] `apps/api/src/modules/intake/interface/http/intake-auth.guard.ts` : guard NestJS lit le cookie, dérive le `contactId` du token, attache à `req.intakeContext`

### Frontend — page récap

- [ ] T084 [P] [US2] `apps/web/src/features/intake/ui/BriefRecap.tsx` : Server Component qui lit le brief via `apiClient` et l'affiche en lecture-seule (formatters `@cv/shared/intake`) ; JSON-LD `BreadcrumbList`
- [ ] T085 [P] [US2] `apps/web/src/features/intake/ui/BriefStatusBadge.tsx` : badge couleur par statut (pending/active/matched/expired/deleted) avec contraste ≥ 4.5:1
- [ ] T086 [P] [US2] `apps/web/src/features/intake/ui/OtherBriefsLink.tsx` : link FR-017 "Voir mes autres briefs"
- [ ] T087 [US2] `apps/web/src/app/[locale]/(voyageur)/layout.tsx` : nouveau route group, metadata `noindex` (page privée magic link)
- [ ] T088 [US2] `apps/web/src/app/[locale]/(voyageur)/voyage/[token]/page.tsx` : Server Component MINCE → `<BriefRecap />` via barrel `@/features/intake`
- [ ] T089 [US2] `apps/web/src/app/[locale]/(voyageur)/voyage/mes-briefs/page.tsx` : liste briefs du même contact (FR-017) ; composants via barrel `@/features/intake`
- [ ] T090 [US2] Exporter `BriefRecap`, `BriefStatusBadge`, `OtherBriefsLink` depuis `features/intake/index.ts`

### Tests US2

- [ ] T091 [P] [US2] **[TDD intégration]** `apps/api/src/modules/intake/interface/http/__tests__/view-brief-status.integration.test.ts` : Testcontainers. **Assertions rolling renewal FR-014a (Q5, C2)** : (a) 1ère visite récap → Set-Cookie présent avec `Max-Age=604800` ; (b) visite 6 jours plus tard → Set-Cookie présent, nouveau Max-Age recalculé à partir de t6 (donc cookie expire à t6+7j, pas t0+7j) ; (c) 8 jours sans visite après dernier renewal → 401 sur visite suivante (cookie expiré, navigateur ne l'envoie plus) ; (d) GET 404 sur briefId inexistant → PAS de renewal (statut ≥ 400).
- [ ] T091b [P] [US2] **(C2)** `apps/api/src/modules/intake/interface/http/__tests__/list-briefs-by-email.integration.test.ts` : mêmes assertions rolling renewal sur GET `/api/intake/briefs/by-email`.
- [ ] T092 [P] [US2] `apps/web/test/e2e/intake-view-status.spec.ts` : Playwright avec cookie posé ; assert que `document.cookie` montre `Max-Age` renouvelé après visite récap (via parse de la valeur ou en interceptant la response header `Set-Cookie`).
- [ ] T093 [P] [US2] `apps/web/test/a11y/intake-recap.spec.ts` : axe-core sur récap + page mes-briefs

**Checkpoint US2** : récap brief accessible, listing par email fonctionnel.

---

## Phase 5 : US3 — Voyageur soumet un second brief distinct (P2)

**Goal** : multi-soumission sans compte, rate-limit anti-spam (3/24h/email, 5/24h/IP, disposable emails bloqués).

**Independent Test** : intégration — soumet 3 briefs avec même email → 200/200/200 ; 4e tentative → 429 ; soumet avec `mailinator.com` → 422.

### Backend

- [ ] T094 [P] [US3] **[TDD RED]** `apps/api/src/modules/intake/infrastructure/__tests__/redis-intake-rate-limiter.integration.test.ts` : Testcontainers Redis — vérifie sliding window 24h, compteurs séparés par email/IP
- [ ] T095 [P] [US3] **[TDD GREEN]** Compléter `redis-intake-rate-limiter.ts` si pas finalisé en US1
- [ ] T096 [P] [US3] **[TDD RED]** `apps/api/src/modules/intake/infrastructure/__tests__/disposable-email-checker.test.ts` : cas mailinator/10minutemail/temp-mail bloqués, gmail/outlook acceptés
- [ ] T097 [P] [US3] **[TDD GREEN]** Compléter `disposable-email-checker.ts`
- [ ] T098 [US3] `apps/api/src/modules/intake/infrastructure/jobs/intake-disposable-emails-refresh.job.ts` : BullMQ cron 7 jours (R3) — fetch GitHub raw → set Redis key `intake:disposable-emails` (TTL 30j) → fallback snapshot embedded si fetch échoue
- [ ] T099 [P] [US3] `packages/shared/src/intake/disposable-emails-snapshot.json` : snapshot v1 (régénéré au build, embedded en fallback)
- [ ] T100 [US3] Étendre Throttler du `voyageur-intake.controller.ts` POST avec décorateur `@IntakeRateLimit(emailScoped: '3/24h', ipScoped: '5/24h')`. **Ordre d'évaluation FR-020a (Q2 clarify) : email-first, IP-second** — si l'email hit la limite, retourner immédiatement `429` + `{ code: 'EMAIL_RATE_LIMIT_EXCEEDED', retryAfter: <s>, message: ... }` + header `Retry-After: <s>` (favorise l'utilisateur légitime, message FR-CA actionnable). Sinon, si l'IP hit la limite, retourner `429` + `{ code: 'RATE_LIMIT_EXCEEDED', message: <neutre> }` **sans** `retryAfter` ni header `Retry-After` (anti-énumération bot). Logger `intake_brief_abuse_blocked_total{reason="rate_limit_email"|"rate_limit_ip"}` selon le code émis.

### Tests US3

- [ ] T101 [P] [US3] `apps/api/test/integration/intake/multi-briefs.spec.ts` : Testcontainers — 3 briefs OK, 4e refusé. **Assertions explicites FR-020a (Q2)** : (a) 4e brief même email → 429 + body `{ code: 'EMAIL_RATE_LIMIT_EXCEEDED', retryAfter: number, message: string }` + header `Retry-After` ; (b) 6e brief même IP (emails différents, IP identique) → 429 + body neutre `{ code: 'RATE_LIMIT_EXCEEDED', message: string }` SANS `retryAfter` ni header ; (c) hit simultané email+IP → reçoit `EMAIL_RATE_LIMIT_EXCEEDED` (ordre eval email-first).
- [ ] T102 [P] [US3] `apps/api/test/integration/intake/disposable-emails.spec.ts` : 4 emails jetables connus → 422 avec code `DISPOSABLE_EMAIL_DETECTED`
- [ ] T102b [P] [US1] **(H2)** `apps/web/test/unit/intake/EmailSentNotice.test.tsx` : Vitest+RTL — bouton « renvoyer » disabled à t=0, compteur décroit, `aria-disabled="true"`, enabled à t=120s, clic relance compteur. Mock `setInterval` via `vi.useFakeTimers()`.

**Checkpoint US3** : multi-briefs avec rate-limit, disposable emails filtrés.

---

## Phase 6 : US4 — Voyageur retire son brief (Loi 25) (P3)

**Goal** : voyageur peut demander l'effacement depuis la page récap, confirmation par typage exact d'une phrase, anonymisation < 60s confirmation (SC-008).

**Independent Test** : intégration — POST `/erasure-request` avec bonne confirmation → 200, vérifier PII nullifiée dans la même transaction, audit entry créée, statut `deleted`, événement `voyageur.brief.deleted` outbox.

### Backend

- [ ] T103 [P] [US4] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/request-brief-erasure.use-case.test.ts` : confirmation correcte/incorrecte, brief inexistant, déjà supprimé, idempotence
- [ ] T104 [P] [US4] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/request-brief-erasure.use-case.ts` : valide phrase exacte (`JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE`), enqueue `IntakeAnonymizeJob` BullMQ
- [ ] T105 [P] [US4] `apps/api/src/modules/intake/infrastructure/jobs/intake-anonymize-loi25.job.ts` : BullMQ worker idempotent — appelle `applyAnonymisation()` sur VoyageurContact + VoyageurBrief.status=`deleted` + outbox `voyageur.brief.deleted` + audit
- [ ] T106 [US4] Étendre `voyageur-intake.controller.ts` avec POST `/api/intake/briefs/:briefId/erasure-request`
- [ ] T107 [P] [US4] **[TDD intégration]** `apps/api/src/modules/intake/infrastructure/jobs/__tests__/intake-anonymize-loi25.integration.test.ts` : Testcontainers — relance double, asserte idempotence (pas de double nullification, pas de double outbox)

### Frontend

- [ ] T108 [P] [US4] `apps/web/src/features/intake/actions/request-brief-erasure.action.ts` : Server Action
- [ ] T109 [P] [US4] `apps/web/src/features/intake/ui/ErasureForm.tsx` : Client Component (RHF) avec input `confirmation` + bouton désactivé tant que la phrase ne match pas exactement (anti-erreur)
- [ ] T110 [US4] Étendre `BriefRecap` avec bouton « Supprimer mes données » qui ouvre `<ErasureForm />` (Dialog Radix avec focus trap)
- [ ] T111 [US4] `apps/web/src/app/[locale]/(voyageur)/voyage/[token]/effacement/page.tsx` : page dédiée erasure (alternative au Dialog)
- [ ] T112 [P] [US4] `apps/web/src/features/intake/ui/BriefDeletedNotice.tsx` : page neutre post-effacement (FR-023 — pas d'exposition PII)

### Tests US4

- [ ] T113 [P] [US4] `apps/web/test/e2e/intake-erasure.spec.ts` : Playwright — flow complet effacement
- [ ] T114 [P] [US4] `apps/web/test/a11y/intake-erasure-form.spec.ts` : axe-core sur `<ErasureForm />` (focus trap Dialog)
- [ ] T115 [P] [US4] **Test invariant SC-008** : `apps/api/test/integration/intake/sc-008-erasure-latency.spec.ts` — mesure latence entre POST erasure-request et nullification PII < 60s

### Effacement global contact + tous briefs (FR-022a, Q4 clarify, C1)

- [ ] T115a [P] [US4] **(C1, TDD RED)** `apps/api/src/modules/intake/application/use-cases/__tests__/erase-all-voyageur-data.use-case.test.ts` : cas nominal (contact + 3 briefs nullifiés en 1 transaction), confirmation incorrecte → refus, `acknowledgedBriefCount` stale → refus (anti-race condition UI), 2e appel idempotent (déjà supprimé → 409), audit `intake.contact.erase_all_requested` créée, événement `voyageur.brief.deleted` émis pour chaque brief affecté
- [ ] T115b [P] [US4] **(C1, TDD GREEN)** `apps/api/src/modules/intake/application/use-cases/erase-all-voyageur-data.use-case.ts` : valide phrase exacte (`JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES`), valide `acknowledgedBriefCount === currentActiveBriefCount`, enqueue `IntakeAnonymizeAllJob` BullMQ (cascade contact + briefs en 1 transaction Prisma)
- [ ] T115c [P] [US4] **(C1)** `apps/api/src/modules/intake/infrastructure/jobs/intake-anonymize-all-loi25.job.ts` : worker BullMQ idempotent — `applyAnonymisation()` sur VoyageurContact + tous `VoyageurBrief.status='deleted'` du contact + outbox `voyageur.brief.deleted` × N + audit `intake.contact.erase_all_completed` ; idempotence via lock Redis sur `contactId`
- [ ] T115d [US4] **(C1 + C2)** Étendre `voyageur-intake.controller.ts` avec POST `/api/intake/voyageur/erase-all-data` — auth cookie voyageur, rate-limit `2/24h/contact`, **annoté `@SkipRollingRenewal()`** (T025c), retourne payload `{ status, contactId, briefsAffectedCount, message, estimatedCompletionSeconds }` + `Set-Cookie: __Host-cv.intake.token=; Max-Age=0; Path=/` (révoque la session — opération terminale, cf. contracts/http-endpoints.md §1 dernier endpoint)
- [ ] T115e [P] [US4] **(C1)** `apps/web/src/features/intake/actions/erase-all-voyageur-data.action.ts` : Server Action `'use server'`, valide Zod `{ confirmation, acknowledgedBriefCount }`, forward au NestJS, retourne `ActionResult<{ briefsAffectedCount: number }>` ; sur succès, `cookies().delete('__Host-cv.intake.token')` côté serveur (défense en profondeur, le NestJS l'a déjà révoqué)
- [ ] T115f [P] [US4] **(C1)** `apps/web/src/features/intake/ui/EraseAllDataForm.tsx` : Client Component (RHF) — affiche le **nombre de briefs concernés** (passé en prop depuis le RSC parent qui a fait le GET by-email), input `confirmation` text, bouton désactivé tant que phrase ≠ exacte, message `aria-live` annonce *« Cette action est irréversible et supprimera N briefs »*
- [ ] T115g [US4] **(C1)** `apps/web/src/app/[locale]/(voyageur)/voyage/mes-donnees/effacer-tout/page.tsx` : Server Component — lit le contactId via cookie, GET `/api/intake/briefs/by-email` pour récupérer le count actuel, rend `<EraseAllDataForm activeBriefCount={N} />` ; metadata `noindex`, h1 *« Effacer toutes mes données »*
- [ ] T115h [US4] **(C1)** `apps/web/src/app/[locale]/(voyageur)/voyage/mes-donnees/effacee/page.tsx` : page de confirmation post-effacement global (statique, FR-CA, pas d'exposition PII, lien retour `/voyage/nouveau`)
- [ ] T115i [P] [US4] **(C1, TDD intégration)** `apps/api/src/modules/intake/interface/http/__tests__/erase-all-data.integration.test.ts` : Testcontainers Postgres + Redis — golden path, race condition stale count, cookie révoqué dans la réponse, idempotence si 2e appel après succès
- [ ] T115j [P] [US4] **(C1)** `apps/web/test/e2e/intake-erase-all-data.spec.ts` : Playwright — soumet 2 briefs, vérifie email, navigue `/voyage/mes-donnees/effacer-tout`, type phrase exacte, confirme, asserte `mes-donnees/effacee` affichée + cookie `__Host-cv.intake.token` absent dans `document.cookie`
- [ ] T115k [P] [US4] **(C1)** `apps/web/test/a11y/intake-erase-all-form.spec.ts` : axe-core sur `<EraseAllDataForm />` — zéro violation serious/critical

**Checkpoint US4** : effacement Loi 25 brief seul (FR-022) **et** global contact + tous briefs (FR-022a) fonctionnels < 60s, audit append-only, brief neutre post-suppression, session révoquée sur erase-all.

---

## Phase 7 : US5 — Admin traite manuellement un brief sans match (P3)

**Goal** : admin voit dans une file `unmatched` les briefs actifs > 4h sans conseiller notifié, consulte le détail, déclenche un push manuel vers un conseiller vérifié (lookup `ConformiteQueryFacade`).

**Independent Test** : intégration — créer brief actif sans match (mock signal feature matching), GET `/api/intake/admin/unmatched` → liste, POST push-manual avec conseiller compliant → 200 + outbox `voyageur.brief.pushed_manual`.

### Backend

- [ ] T116 [P] [US5] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/list-unmatched-briefs.use-case.test.ts` : filtre actifs depuis > 4h sans match
- [ ] T117 [P] [US5] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/list-unmatched-briefs.use-case.ts`
- [ ] T118 [P] [US5] **[TDD RED]** `apps/api/src/modules/intake/application/use-cases/__tests__/push-brief-to-conseiller.use-case.test.ts` : conseiller non-vérifié refusé (lookup `ConformiteQueryPort`), motif < 20 chars refusé, idempotency via Idempotency-Key
- [ ] T119 [P] [US5] **[TDD GREEN]** `apps/api/src/modules/intake/application/use-cases/push-brief-to-conseiller.use-case.ts`
- [ ] T120 [US5] `apps/api/src/modules/intake/interface/http/admin-intake.controller.ts` : GET `/api/intake/admin/unmatched` + GET `/api/intake/admin/briefs/:briefId` + POST `/api/intake/admin/briefs/:briefId/push-manual` ; `AuthGuard` + `RoleGuard('admin')` + `IdempotencyInterceptor`

### Frontend (slice intake-admin séparé pour respecter Principe VIII.a §6)

- [ ] T121 [P] [US5] `apps/web/src/features/intake-admin/actions/push-brief-to-conseiller.action.ts` : Server Action admin
- [ ] T122 [P] [US5] `apps/web/src/features/intake-admin/ui/UnmatchedBriefsTable.tsx` : Server Component paginé, table accessible (caption + th scope)
- [ ] T123 [P] [US5] `apps/web/src/features/intake-admin/ui/AdminBriefDetail.tsx` : Server Component — affiche brief + PII contact + bouton push manuel
- [ ] T124 [P] [US5] `apps/web/src/features/intake-admin/ui/PushToConseillerForm.tsx` : Client Component (RHF) avec autocomplete conseiller vérifié (via `ConformiteQueryFacade`), motif texte 20-500 chars, Idempotency-Key auto-généré
- [ ] T125 [P] [US5] `apps/web/src/features/intake-admin/index.ts` : barrel
- [ ] T126 [US5] `apps/web/src/app/[locale]/(admin)/admin/intake/non-matche/page.tsx` : Server Component MINCE → `<UnmatchedBriefsTable />` via barrel `@/features/intake-admin`
- [ ] T127 [US5] `apps/web/src/app/[locale]/(admin)/admin/intake/[briefId]/page.tsx` : MINCE → `<AdminBriefDetail />` via barrel `@/features/intake-admin`

### Tests US5

- [ ] T128 [P] [US5] `apps/api/test/integration/intake/admin-push-manual.spec.ts` : Testcontainers, lookup ConformiteQueryFacade vraie
- [ ] T129 [P] [US5] `apps/web/test/a11y/intake-admin.spec.ts` : axe-core sur table + Dialog form
- [ ] T130 [P] [US5] `apps/web/test/e2e/intake-admin-flow.spec.ts` : Playwright avec seed admin (E2E_SEED_ENABLED)

**Checkpoint US5** : console admin briefs unmatched + push manuel vers conseiller vérifié.

---

## Phase 8 : Polish & Cross-cutting

**Purpose** : ADRs, runbooks, expiration job, observability, scan adoption.

### Jobs background

- [ ] T131 `apps/api/src/modules/intake/infrastructure/jobs/intake-brief-expiration-sweep.job.ts` : BullMQ cron quotidien — scan `expiresAt < now()` → enqueue anonymisation Loi 25 + outbox `voyageur.brief.expired` (FR-024)
- [ ] T132 `apps/api/src/modules/intake/infrastructure/jobs/intake-expiration-reminder.job.ts` : BullMQ cron quotidien — scan `expiresAt - 7 jours = aujourd'hui` → envoi courriel rappel FR-CA via SES (FR-025)
- [ ] T133 `apps/api/src/modules/intake/infrastructure/jobs/intake-magic-link-retry.job.ts` : BullMQ retry SES (backoff exponentiel max 5)
- [ ] T134 [P] Étendre `OutboxPublisherJob` 001 pour consommer `intake_outbox_entries` (réutilise pattern existant)

### ADRs

- [ ] T135 [P] `docs/adr/0017-intake-audit-log-table-separee.md` : formaliser R2 (table `intake_audit_entries` séparée vs partagée avec conformité)
- [ ] T136 [P] `docs/adr/0018-intake-magic-link-token-db.md` : formaliser R1 (random token DB vs JWT vs HMAC signé, justification Loi 25)
- [ ] T137 [P] `docs/adr/0019-intake-disposable-emails-list.md` (optionnel) : formaliser R3 si retenu — sinon supprimer la mention du plan

### Runbooks

- [ ] T138 [P] `docs/runbooks/intake-secrets-rotation.md` : rotation INTAKE_MAGIC_LINK_SECRET (annuelle, 14j grace period)
- [ ] T139 [P] `docs/runbooks/intake-anonymisation-loi25.md` : procédure réponse demande effacement voyageur (similaire à conseiller)
- [ ] T140 [P] `docs/runbooks/intake-disposable-emails-monitoring.md` : monitoring cron refresh + procédure si fetch échoue plusieurs fois

### Observabilité (préfigure feature 021)

- [ ] T141 [P] `apps/api/src/cli/scan-intake-completion.ts` : CLI mesure SC-001 (% voyageurs qui complètent les 5 étapes) + SC-002 (temps médian)
- [ ] T142 [P] `apps/api/src/cli/scan-intake-quality.ts` : CLI mesure SC-003 (% briefs avec budget) + SC-004 (% briefs avec langue conseiller)
- [ ] T142a [P] **(M5)** `apps/api/src/cli/scan-intake-validation-errors.ts` : CLI mesure **SC-005** (% soumissions rejetées validation Zod / total soumissions, par champ fautif) — lit `intake_brief_rejected_validation_total{field=...}` via Prom / OTel collector ou requête DB sur `intake_audit_entries WHERE action='brief.validation_failed'`
- [ ] T142b [P] **(M5)** `apps/api/src/cli/scan-intake-magic-link-verification.ts` : CLI mesure **SC-006** (% voyageurs qui cliquent le magic link dans 24h / total briefs soumis) — diff `VoyageurBrief.verifiedAt - submittedAt < 24h` / count total
- [ ] T142c [P] **(M5)** `apps/api/src/cli/scan-intake-abuse-rate.ts` : CLI mesure **SC-007** (% briefs marqués spam/jetables/bot via marquage manuel hebdo OU détection auto) — lit `intake_brief_abuse_blocked_total{reason=...}` + colonne `VoyageurBrief.abuseMarkedAt` (à ajouter en T012 si pas déjà présent)
- [ ] T143 [P] `.github/workflows/scan-intake-adoption.yml` : workflow cron hebdo (lundi 9h UTC) consommant les **5 CLIs (T141, T142, T142a, T142b, T142c)**, JSON dans `docs/dashboards/intake-adoption.json` (skip tant que `vars.PRODUCTION_DEPLOYED != 'true'`) ; chaque CLI rapporte la métrique + un statut `OK | WARNING | ALERT` selon seuils (SC-005 ≤ 5% / SC-006 ≥ 70% / SC-007 ≤ 3%)

### A11y + Lighthouse + perf

- [ ] T144 [P] Étendre `.github/workflows/ci.yml` job `lighthouse` avec les URLs intake publiques : `/fr/voyage/nouveau`, `/fr/voyage/email-envoye`, `/en/voyage/nouveau` — asserts Perf ≥ 90 / SEO ≥ 95 / A11y ≥ 95
- [ ] T145 [P] Étendre `apps/web/lighthouserc.json` avec les routes intake (LCP < 2.0s sur step 1 — cible interne plus stricte)
- [ ] T146 [P] **Test invariant SC-009** : `apps/web/test/a11y/intake-keyboard-only.spec.ts` — navigue le formulaire 5 étapes en Tab/Shift+Tab/Enter uniquement, asserte aucune trap

### Documentation + clôture

- [ ] T147 [P] `apps/api/src/modules/intake/README.md` : doc module — entités, ports publics, événements outbox, dépendances cross-module (uniquement `ConformiteQueryFacade`)
- [ ] T148 [P] `packages/shared/src/intake/README.md` : doc namespace partagé + exemples Zod + formatters
- [ ] T149 [P] Mettre à jour `docs/roadmap.md` : cocher 008 (intake) en cours puis ✅ post-merge
- [ ] T150 Constitution Check final : compléter la checklist 12 principes du PR template (`.github/pull_request_template.md`) — chaque principe lié aux tâches qui le couvrent

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** : aucune dépendance, peut démarrer immédiatement.
- **Phase 2 (Foundational)** : dépend de Phase 1. **BLOQUE toutes les user stories**.
- **Phase 3 (US1, P1)** : dépend de Phase 2.
- **Phase 4 (US2, P2)** : dépend de Phase 2. Peut commencer en parallèle de Phase 3 si capacité, mais le récap (T084) suppose la table VoyageurBrief peuplée par US1 → testé indépendamment via seed.
- **Phase 5 (US3, P2)** : dépend de Phase 2. Peut paralléliser US1/US2.
- **Phase 6 (US4, P3)** : dépend de Phase 2 + Phase 3 (US1) pour avoir des briefs à effacer.
- **Phase 7 (US5, P3)** : dépend de Phase 2 + Phase 4 (US2 récap utilisé partiellement par admin).
- **Phase 8 (Polish)** : dépend de toutes les user stories vouées au scope MVP.

### User Story Dependencies

- US1 **autonome** : MVP livrable seul.
- US2 **autonome** : peut être livrée après US1 ou en parallèle (test avec seed).
- US3 **autonome** : peut être livrée après US1 (rate-limit déjà implémenté en US1, US3 valide les invariants).
- US4 **dépend de** US1 (besoin de briefs à effacer).
- US5 **dépend de** Phase 2 + lookup `ConformiteQueryFacade` (001) — peut paralléliser US1/US2 si admin a un seed de briefs actifs.

### Within Each User Story (Principe VI TDD)

- Tests RED **AVANT** implémentation (commits séparés visibles dans git log).
- Domain entités/VO → application use cases → infrastructure adapters → interface controllers.
- Tests intégration Testcontainers après green pour valider end-to-end côté API.
- Tests e2e + a11y Playwright après green côté Web.

### Parallel Opportunities

- T026-T043 (domain pure VO/services US1) tous parallèles entre eux ([P] marqués).
- T048-T054 (infrastructure adapters US1) tous parallèles.
- T064-T071 (UI Wizard + Steps US1) parallèles entre eux mais séquentiel après T064 (Wizard) pour la cohérence du state shape.
- T084-T087 (UI récap US2) parallèles.
- Toute Phase 8 task marquée [P] parallèle.

---

## Implementation Strategy

### MVP First (US1 uniquement) — déploiement avec valeur réelle

1. Phase 1 + Phase 2 complètes (Setup + Foundational).
2. Phase 3 (US1) complète et testée — **briefs collectables et activables**.
3. **STOP et VALIDER** : un voyageur peut soumettre, recevoir le magic link, activer son brief. Outbox `voyageur.brief.activated` accumule en attendant la feature matching (ID roadmap 011).
4. Déployable en pré-production pour collecte réelle (lead capture autonome).

### Incremental Delivery

1. MVP US1 → déployable
2. + US2 (récap) → meilleure rétention voyageur, transparence
3. + US3 (multi-briefs + rate-limit + disposable) → robustesse anti-spam pour ouverture grand public
4. + US4 (Loi 25) → **bloquant ouverture grand public** (compliance)
5. + US5 (admin filet) → ouverture grand public avec filet de sécurité
6. Polish (Phase 8) → observabilité, expiration job, ADRs

### Parallel Team Strategy

Avec 2-3 devs :

1. Tous : Phase 1 + 2 ensemble.
2. Une fois T025 (checkpoint Foundational) :
   - Dev A : US1 (T026-T077, le plus gros)
   - Dev B : US3 (T094-T102) — rate-limit + disposable, parallèle à US1
   - Dev C : US2 (T078-T093) avec seed mocké au début, intégration finale après US1

---

## Notes

- [P] = fichiers différents, aucune dépendance sur tâche non-complétée.
- [Story] mappe la tâche à un user story pour la traçabilité.
- Chaque user story est indépendamment **complétable** et **testable** (Principe VI + section Constitution Check).
- Tests RED **AVANT** implémentation — commits séparés visibles dans `git log`.
- Commit après chaque tâche ou groupe logique (≤ 3 tâches par commit).
- Stop à chaque checkpoint pour valider le story indépendamment.
- Convention front (Principe VIII.a) : Server Actions UNIQUEMENT dans `features/intake/actions/<verbe>.action.ts` ; pages `app/` MINCES.
- Validation par CI : `tools/check-feature-boundaries.ts` + `tools/check-module-boundaries.ts` + axe-core + Lighthouse CI bloquants.

---

## Constitution Check (PR template — `.github/pull_request_template.md`)

À cocher dans la PR finale :

- [ ] **I — Conformité OPC/TICO** : aucun champ paiement / réservation / versement dans le brief (cf. T012, T020, audit code). Anti-marketplace : brief ne contient pas de mention de conseiller spécifique avant push admin (US5 séparé, traçable).
- [ ] **II — Vie privée / Loi 25** : PII isolée dans `VoyageurContact` (T035) ; effacement brief seul < 60s (T103-T107, SC-008 invariant T115) ; **effacement global contact + tous briefs (FR-022a)** (T115a-T115k) ; rétention J+90 (T131, FR-024) ; rolling cookie 7j d'inactivité maximum (T025a-T025d, FR-014a) ; émail hashé post-anonymisation (data-model §VoyageurContact).
- [ ] **III — Qualité de lead** : brief structuré 9 dimensions (différenciateur positioning.md) ; rate-limit anti-spam (FR-019/020, T094-T102) ; magic link 2-step (anti-bot, FR-013).
- [ ] **IV — Français d'abord** : i18n FR-CA premier + EN J1 (T059, FR-029) ; formats canadiens (postal code, monnaie CAD).
- [ ] **V — Monolithe modulaire** : module `intake` séparé `apps/api/src/modules/intake/` ; tables Prisma préfixées `intake_*` ; audit log séparé (T014, ADR-0017 T135) ; `tools/check-module-boundaries.ts` vert.
- [ ] **VI — TDD strict** : tests RED → GREEN visibles dans git log pour T026-T043 (VO/services), T044-T047 (use cases), T078-T081, T103-T104, T116-T119.
- [ ] **VII — Observabilité boucle économique** : CLIs scan-intake-completion/quality/validation-errors/magic-link-verification/abuse-rate + workflow scan hebdo (T141-T143) couvrent SC-001/002/003/004/005/006/007 (vers feature 021).
- [ ] **VIII — Clean Architecture + VIII.a** : 4 couches API (T023, T026-T057) ; feature slicing front `features/intake/` + `features/intake-admin/` (T060-T071, T121-T125) ; Server Actions normalisées `<verbe>.action.ts` ; pages `app/` minces (T072, T088, T126) ; `tools/check-feature-boundaries.ts` vert.
- [ ] **IX — Sécurité applicative** : RBAC admin (T120) ; Zod côté serveur (T020, T056) ; CSRF + ThrottlerGuard + IdempotencyInterceptor hérités 001 ; magic link random DB (R1) ; cookie `__Host-cv.intake.token` strict HTTPS prod + rolling renewal 7j (T025a-T025d) + révocation explicite sur erase-all (T115d `@SkipRollingRenewal()`) ; 2 codes 429 distincts anti-énumération (T100, FR-020a) ; rotation secret documentée (T138).
- [ ] **X — Fiabilité et résilience** : outbox transactionnel (T054) ; idempotence Anonymize (T107) + Push manuel (T119) ; magic link retry SES (T133) ; expiration sweep idempotent (T131).
- [ ] **XI — Accessibilité WCAG 2.1 AA** : axe-core CI bloquant (T076, T093, T114, T129, T146) ; clavier-only test invariant SC-009 (T146) ; aria-live erreurs Zod (T064).
- [ ] **XII — SEO** : `/voyage/nouveau` indexable (T072, T074) ; metadata + JSON-LD (T084) ; Lighthouse CI étendu (T144) ; LCP < 2.0s cible (T145).
