# Tâches : MFA conseiller et élévation de session

**Entrée** : `specs/005-mfa-conseiller/`

**Pré-requis** : [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests** : TDD strict obligatoire sur logique métier pure
(`packages/mfa/`) — Principe VI NON-NÉGOCIABLE. Tests d'intégration
Testcontainers obligatoires sur tous les use cases et triggers BD.
Tests e2e Playwright + a11y axe-core obligatoires sur les 5 flows
utilisateur livrables.

**Organisation** : groupées par user story pour permettre l'implémentation
et la livraison indépendante de chaque tranche.

---

## Format : `[ID] [P?] [Story?] Description (chemin)`

- `[P]` : peut tourner en parallèle (fichiers distincts, sans
  dépendance non terminée)
- `[USx]` : appartient à la user story x

---

## Phase 1 — Setup (infrastructure partagée)

**Objectif** : initialiser le workspace, la stack des dépendances, et
les fichiers de config qui n'existent pas encore.

- [ ] T001 [P] Créer le workspace `packages/mfa/` avec `package.json` (name `@cv/mfa`, type module, exports `./src/index.ts`), `tsconfig.json` extends `../../tsconfig.base.json`, `tsconfig.build.json`, `biome.json` (hérite de la racine). Référence : `plan.md` § Structure
- [ ] T002 [P] Créer le workspace `packages/email-templates/` (P1-3) avec `package.json` (name `@cv/email-templates`, exports `./mfa/*`), `tsconfig.json`. Servira pour les 5 templates `react-email` côté MFA et sera ré-exploité par 003
- [ ] T003 Ajouter à `pnpm-workspace.yaml` les nouveaux packages si absents (déjà couvert par le glob `packages/*` du workspace existant — vérifier)
- [ ] T004 [P] Ajouter `otplib@^12`, `qrcode@^1.5`, `bcryptjs@^2.4`, `@types/qrcode`, `@types/bcryptjs` aux `devDependencies`/`dependencies` appropriées de `packages/mfa/package.json` et `apps/api/package.json`
- [ ] T005 [P] Ajouter dans `.env.development.example` (et 1Password vault dev) la variable `MFA_KEK_BASE64` avec note « 32 octets aléatoires base64 — générer via `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` »
- [ ] T006 [P] Ajouter la même variable côté CI (`.github/workflows/ci.yml` step env) avec une KEK de test deterministe pour les tests d'intégration : `MFA_KEK_BASE64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` (32 octets de zéro — uniquement CI/test). Ajouter un check de production qui refuse cette valeur en `NODE_ENV=production`
- [ ] T007 Exécuter `pnpm install` à la racine pour propager les nouveaux packages et installer les dépendances

---

## Phase 2 — Foundational (bloque toutes les user stories)

**Objectif** : poser les fondations BD, le package pur `mfa/`, les
ports, l'infrastructure adaptateurs, les guards et les ADRs. Aucun
contrôleur HTTP ici — seulement le socle réutilisé par toutes les US.

### 2.A Documentation décisionnelle (ADRs et runbooks squelettes)

- [ ] T008 [P] Drafter `docs/adr/0010-chiffrement-secret-totp-aes-gcm.md` au format MADR : décision (AES-256-GCM Node crypto, KEK Secrets Manager), rationale (R2), alternatives rejetées (libsodium, KMS, pgcrypto), conséquences (limitation mémoire process documentée, rotation KEK reportée)
- [ ] T009 [P] Drafter `docs/adr/0011-validation-totp-otplib.md` : décision (otplib^12), rationale (R1), alternatives (Auth.js TOTP provider, impl manuelle), conséquences (port `TotpValidatorPort` permet de migrer plus tard)
- [ ] T010 [P] Squelette `docs/runbooks/mfa-2-admins-actifs.md` : politique ≥ 2 admins actifs, commande SQL de vérification, lien dashboard Grafana, processus de réinscription d'un admin perdu (US4)
- [ ] T011 [P] Squelette `docs/runbooks/mfa-break-glass-db.md` : pré-requis (accès DB direct, double validation), commande SQL exacte de résurrection d'un admin (DELETE de son MfaSecret + nettoyage sessions), audit obligatoire post-action

### 2.B Schéma Prisma et migrations

- [ ] T012 Créer `packages/db/prisma/schema/mfa.prisma` avec les 4 models (`MfaSecret`, `MfaBackupCode`, `MfaAuditEvent`, `MfaRateLimitBucket`) et 4 enums (`MfaSecretKind`, `MfaEventType`, `MfaVerifyMethod`, `MfaRateLimitKind`) selon `data-model.md`. Relations vers `AuthUser` (FK + cascade). PAS d'`@unique` sur `MfaSecret.userId` (P0-4)
- [ ] T013 Créer aussi le model `MfaOutboxEmail` (P1-3) dans `mfa.prisma` : table de stockage du stub Mailer (id UUID, recipientUserId UUID, templateKind enum, payload Json, sentAt DateTime?, queuedAt DateTime, attempts Int default 0, lastError String?)
- [ ] T014 Générer la migration `pnpm db:migrate -- --name init_mfa --create-only`. Vérifier le SQL produit ; ne PAS l'appliquer immédiatement
- [ ] T015 Éditer la migration `20260526000000_init_mfa/migration.sql` pour ajouter manuellement :
  - `CREATE UNIQUE INDEX mfa_secrets_one_enabled_per_user ON mfa_secrets ("userId") WHERE "enabledAt" IS NOT NULL;` (P0-4)
  - `CREATE UNIQUE INDEX mfa_rate_limit_buckets_per_session ON mfa_rate_limit_buckets ("userId", kind, "sessionId") WHERE "sessionId" IS NOT NULL;` (P0-3)
  - `CREATE UNIQUE INDEX mfa_rate_limit_buckets_per_user ON mfa_rate_limit_buckets ("userId", kind) WHERE "sessionId" IS NULL;` (P0-3)
- [ ] T016 Créer manuellement la migration `20260526000001_init_mfa_immutability/migration.sql` avec :
  - Trigger `BEFORE UPDATE` sur `mfa_audit_events` qui RAISE
  - Trigger `BEFORE DELETE` sur `mfa_audit_events` qui RAISE
  - `REVOKE TRUNCATE` wrappés dans `DO $$ BEGIN ... EXECUTE format(...) END $$` pour shadow DB compat (P1-7), pour rôles `app_identite` ET `cv_app_role`
- [ ] T017 Appliquer les migrations : `pnpm db:migrate`. Vérifier que `_prisma_migrations` contient les 2 nouvelles entrées avec checksums

### 2.C Tests TDD logique pure — RED phase (commits séparés rouges)

> **Commit pattern** : chaque tâche `T0xx test(mfa): ...` doit produire
> un commit séparé qui ÉCHOUE (red), AVANT l'implémentation correspondante
> dans la phase 2.D. Principe VI non négociable.

- [ ] T018 [P] Écrire `packages/mfa/src/__tests__/totp.test.ts` (9 tests selon `contracts/totp-validator.port.md`) — commit `test(mfa): totp validator RED`
- [ ] T019 [P] Écrire `packages/mfa/src/__tests__/backup-codes.test.ts` (8 tests selon `contracts/backup-code-hasher.port.md` + génération format alphabet) — commit `test(mfa): backup codes RED`
- [ ] T020 [P] Écrire `packages/mfa/src/__tests__/encryption.test.ts` (8 tests selon `contracts/mfa-encrypter.port.md`) — commit `test(mfa): encryption RED`
- [ ] T021 [P] Écrire `packages/mfa/src/__tests__/freshness.test.ts` : 6 tests (fresh à T=0, T=29:59, T=30:00 (limite inclusive : non-fresh, cf. P2-6), T=30:01, T=null, T négatif) — commit `test(mfa): freshness RED`
- [ ] T022 [P] Écrire `packages/mfa/src/__tests__/schemas.test.ts` : validation Zod sur les schemas exportés (TotpCodeSchema, BackupCodeSchema, JustificationSchema, UuidV4Schema, IntendedActionSchema) — commit `test(mfa): schemas RED`

### 2.D Implémentation logique pure — GREEN phase

- [ ] T023 [P] Implémenter `packages/mfa/src/totp.ts` : wrappers otplib (`verify`, `generateSecret`, `buildKeyUri`) selon `contracts/totp-validator.port.md`
- [ ] T024 [P] Implémenter `packages/mfa/src/backup-codes.ts` : `generateBatch()` (10 codes alphabet `[A-HJ-KM-NP-Z2-9]`, format `XXXX-XXXX-XX`, entropie crypto), `normalizeCode()` (toUpperCase, conserve les tirets)
- [ ] T025 [P] Implémenter `packages/mfa/src/encryption.ts` : `encrypt(plaintext, kek)` / `decrypt(blob, kek)` AES-256-GCM avec version byte + IV aléatoire + auth tag. Erreurs `TotpSecretIntegrityError`, `TotpSecretFormatError`, `KekNotConfiguredError`, `KekInvalidSizeError`
- [ ] T026 [P] Implémenter `packages/mfa/src/freshness.ts` : `isFresh(mfaVerifiedAt: Date | null, now: Date, windowMin: number = 30): boolean`. Limite stricte `>= 30 min` = non fresh (P2-6)
- [ ] T027 [P] Implémenter `packages/mfa/src/schemas.ts` : tous les schemas Zod selon `contracts/http-endpoints.md` § Schémas Zod partagés
- [ ] T028 [P] Implémenter `packages/mfa/src/errors.ts` : classes d'erreur typées (`MfaError`, `InvalidTotpCodeError`, `BackupCodeAlreadyConsumedError`, `MfaRateLimitedError`, `MfaNotEnrolledError`, `MfaAlreadyEnrolledError`, etc.)
- [ ] T029 [P] Implémenter `packages/mfa/src/index.ts` (barrel) qui re-exporte tout. Vérifier `pnpm --filter @cv/mfa build` puis `pnpm --filter @cv/mfa test --coverage` ≥ 95 %
- [ ] T030 Commit `feat(mfa): packages/mfa GREEN — 5 modules + 95% coverage` après que TOUS les tests T018-T022 passent

### 2.E Domaine + ports (apps/api)

- [ ] T031 [P] Créer `apps/api/src/modules/identite/domain/entities/mfa-secret.entity.ts` : classe `MfaSecret` avec invariants (`enable()`, `isEnabled()`, `markUsed()`)
- [ ] T032 [P] Créer `apps/api/src/modules/identite/domain/entities/backup-code-batch.entity.ts` : classe `BackupCodeBatch` (id, codes, remainingCount calculé)
- [ ] T033 [P] Créer `apps/api/src/modules/identite/domain/entities/mfa-audit-event.entity.ts`
- [ ] T034 [P] Créer `apps/api/src/modules/identite/domain/value-objects/encrypted-totp-secret.vo.ts` (branded type) + `backup-code-hash.vo.ts` + `mfa-event-type.vo.ts`
- [ ] T035 [P] Créer port `apps/api/src/modules/identite/application/ports/mfa-secret-repository.port.ts` : interface + Symbol. Méthodes : `findActiveByUserId`, `findPendingByUserId`, `findByEnrollmentRequestId`, `supersedePending(userId, newSecret)` (P0-1), `enable`, `delete`
- [ ] T036 [P] Créer port `backup-code-repository.port.ts` : `createBatch(mfaSecretId, hashes)`, `findUnusedByMfaSecret`, `consumeAtomic(id)` (P0-5, retourne `boolean`), `countRemaining`, `deleteAllByMfaSecret`
- [ ] T037 [P] Créer port `mfa-audit-writer.port.ts` : `append(event)` — l'écriture est append-only par contrat (l'impl Prisma ne fournit pas d'update/delete)
- [ ] T038 [P] Créer port `totp-secret-encrypter.port.ts` (cf. `contracts/mfa-encrypter.port.md`)
- [ ] T039 [P] Créer port `backup-code-hasher.port.ts` (cf. `contracts/backup-code-hasher.port.md`)
- [ ] T040 [P] Créer port `totp-validator.port.ts` (cf. `contracts/totp-validator.port.md`)
- [ ] T041 [P] Créer port `mfa-notification-mailer.port.ts` : méthodes `sendLoginLockedNotice`, `sendStepUpSessionKilledNotice`, `sendAdminResetNotice`, `sendDeviceChangedNotice`, `sendDeviceChangeIncompleteNotice` (5 méthodes)
- [ ] T042 [P] Créer port `active-session-revoker.port.ts` (P0-3 cohérence buckets) : `revokeAll(userId)`, `revokeAllExcept(userId, exceptToken)`, `revokeRateLimitBucketsForSessions(sessionIds[])`
- [ ] T043 [P] Créer port `mfa-rate-limiter.port.ts` : `recordAttempt(userId, kind, sessionId?)` retourne `{ attempts, lockedUntil }` atomique (P0-2), `isLocked(userId, kind, sessionId?)`, `reset(userId, kind, sessionId?)`

### 2.F Infrastructure adaptateurs

- [ ] T044 [P] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-mfa-secret-repository.ts` : `supersedePending` exécute la transaction de suppression + insertion atomique (P0-1, cf. data-model § Concurrence n°3)
- [ ] T045 [P] Implémenter `prisma-backup-code-repository.ts` : `consumeAtomic` exécute le `UPDATE ... WHERE id = ? AND usedAt IS NULL RETURNING id` (P0-5)
- [ ] T046 [P] Implémenter `prisma-mfa-audit-writer.ts` : un seul `create()`, pas d'update/delete exposés (la classe ne les compile pas)
- [ ] T047 [P] Implémenter `prisma-active-session-revoker.ts` : DELETE FROM auth_sessions + DELETE FROM mfa_rate_limit_buckets WHERE sessionId IN (collected)
- [ ] T048 [P] Implémenter `node-crypto-totp-secret-encrypter.ts` : module NestJS Injectable qui lit `MFA_KEK_BASE64` à l'instanciation, valide taille 32 octets, expose `encrypt`/`decrypt` qui délègue à `packages/mfa/encryption`
- [ ] T049 [P] Implémenter `bcrypt-backup-code-hasher.ts` : Injectable wrapping `bcryptjs.hash(code, 12)` et `bcryptjs.compare()` constant-time
- [ ] T050 [P] Implémenter `otplib-totp-validator.ts` : Injectable, délègue à `packages/mfa/totp`
- [ ] T051 [P] Implémenter `ses-mfa-notification-mailer.ts` (stub MVP, P1-3) : écrit dans `MfaOutboxEmail` table + console.log en dev. Enqueue BullMQ `mfaNotifications` queue en prod avec retry exponentiel. Pas d'envoi SES tant que 003 n'a pas branché
- [ ] T052 [P] Implémenter `postgres-mfa-rate-limiter.ts` : utilise un raw SQL `$queryRaw` pour l'`INSERT ... ON CONFLICT DO UPDATE` atomique (P0-2). Retourne `{ attempts, lockedUntil }` de la requête

### 2.G Guards et middleware

- [ ] T053 [P] Implémenter `apps/api/src/modules/identite/interface/role.guard.ts` : `@RoleGuard('admin')` qui lit `req.user.role` et 403 si différent
- [ ] T054 [P] Implémenter `apps/api/src/modules/identite/interface/step-up.guard.ts` : lit `req.user.mfaVerifiedAt`, calcule freshness via `packages/mfa/freshness`, 403 `STEP_UP_REQUIRED` si non fresh
- [ ] T055 Modifier `apps/api/src/modules/identite/identite.module.ts` : enregistrer les 8 nouveaux providers (ports → infrastructure mappings), exporter `RoleGuard` et `StepUpGuard`

### 2.H Tests d'intégration foundational (Testcontainers Postgres)

- [ ] T056 [P] Tests `apps/api/test/integration/identite/mfa/mfa-audit-immutability.test.ts` : 6 tests vérifiant que UPDATE/DELETE/TRUNCATE sur `mfa_audit_events` échouent même via `app_identite` et `cv_app_role`. Pattern 004 — référence `legal-acceptances-immutability.test.ts`
- [ ] T057 [P] Tests `apps/api/test/integration/identite/mfa/backup-code-concurrency.test.ts` (P0-5) : 2 transactions parallèles soumettent le même code clair, une seule réussit
- [ ] T058 [P] Tests `apps/api/test/integration/identite/mfa/rate-limit-concurrency.test.ts` (P0-2) : 10 incréments parallèles → attempts = 10 final (pas de perte)
- [ ] T059 [P] Tests `apps/api/test/integration/identite/mfa/mfa-secret-repository.test.ts` : supersedePending efface tous les pending, partial index empêche 2 actifs

### 2.I Templates courriel (squelettes, P1-3)

- [ ] T060 [P] Créer 5 templates `react-email` dans `packages/email-templates/mfa/` : `login-locked.tsx`, `stepup-session-killed.tsx`, `admin-reset.tsx`, `device-changed.tsx`, `device-change-incomplete.tsx`. FR-CA + locale prop. Branding minimal cohérent avec 003 à venir

**Checkpoint Phase 2** : tous les tests d'intégration foundational doivent
passer. `pnpm test` à la racine doit être vert. Sans cela, NE PAS démarrer
les user stories.

---

## Phase 3 — User Story 1 : Enrôlement TOTP au passage `verified` (P1) 🎯 MVP

**Objectif story** : un conseiller `verified` peut compléter son
enrôlement TOTP en < 3 min et accéder au tableau de bord.

**Critère de test indépendant** : créer un compte conseiller, approuver
son dossier de conformité, se reconnecter → enrôlement bloque l'accès,
saisie d'un code valide + cocher la confirmation des codes de
récupération → accès débloqué.

### 3.A API

- [ ] T061 [US1] Créer `apps/api/src/modules/identite/application/use-cases/enroll-totp.use-case.ts` : 3 méthodes `start` (supersede + génération secret + chiffrement + génération codes + hashing + audit `mfa_enrollment_started`), `confirm` (déchiffre, valide premier code TOTP, set `enabledAt = NOW`, set `mfaVerifiedAt = NOW` sur session courante, audit `mfa_enrolled`)
- [ ] T062 [US1] Créer `apps/api/src/modules/identite/interface/mfa-enrollment.controller.ts` : `POST /api/mfa/enroll/start` (avec query `?dryRun=true` pour détecter `PENDING_ENROLLMENT_EXISTS`, P0-1) + `POST /api/mfa/enroll/confirm`. Rate limit `enroll_start` (10/h, P1-1). Validation Zod côté contrôleur
- [ ] T063 [US1] Wire l'endpoint dans `identite.module.ts` (controller + use case provider)
- [ ] T064 [P] [US1] Test d'intégration `enroll-flow.test.ts` : (a) start → confirm avec code valide → enabledAt set ; (b) start sans confirm → DELETE pending au prochain start ; (c) rate limit 11ème start dans l'heure → 429 ; (d) confirm avec code invalide → 400 ; (e) confirm avec backupCodesAcknowledged = false → 400

### 3.B Middleware Next.js et flow web

- [ ] T065 [US1] Modifier `apps/web/src/middleware.ts` : ajouter `mfaEnrollmentGuard` qui (1) lit la session via Auth.js, (2) si `user.role === 'conseiller'`, requête `ConformiteQueryPort` pour le statut, (3) si `verified && !mfaEnabled` → redirige vers `/mfa/enroll`. Exclure les routes `/mfa/*`, `/api/*`, `/_next/*`, `/login`, `/inscription` du guard pour éviter les boucles
- [ ] T066 [P] [US1] Créer `apps/web/src/app/(auth)/mfa/layout.tsx` : noindex/nofollow meta tags, layout minimal (pas de Footer/Header conseiller, juste logo + titre)
- [ ] T067 [P] [US1] Créer `apps/web/src/app/(auth)/mfa/enroll/page.tsx` : Server Component qui appelle `startEnrollmentAction()`, rend `<EnrollForm>` Client avec QR SVG + secret + backup codes
- [ ] T068 [P] [US1] Créer `apps/web/src/components/mfa/EnrollForm.tsx` (Client Component, "use client") : affichage QR + secret copiable + champ TOTP + checkbox FR-006 + bouton submit qui appelle `confirmEnrollmentAction(formData)` → redirect `/`
- [ ] T069 [P] [US1] Créer `apps/web/src/components/mfa/BackupCodesDisplay.tsx` : bloc `<pre><code role="region" aria-label="...">`, contraste ≥ 7:1, boutons « Télécharger .txt » et « Copier »
- [ ] T070 [P] [US1] Créer `apps/web/src/components/mfa/TotpInput.tsx` : 6 inputs single-digit avec focus auto-advance et collage du code complet supporté, `aria-describedby`, navigation clavier (Tab/Backspace/flèches)
- [ ] T071 [P] [US1] Créer `apps/web/src/lib/mfa/server-actions.ts` avec `startEnrollmentAction` et `confirmEnrollmentAction` (cf. `contracts/server-actions.md`)
- [ ] T072 [P] [US1] Ajouter clés i18n dans `apps/web/messages/fr-CA.json` (`mfa.enroll.*`) + `apps/web/messages/en.json` placeholders vides

### 3.C Tests e2e + a11y

- [ ] T073 [P] [US1] Test Playwright `apps/web/test/e2e/mfa-enroll.spec.ts` : flow complet du scénario d'acceptation US1.1 (verified user redirigé, enroll, accès dashboard). Mock côté API si conformité pas seedée
- [ ] T074 [P] [US1] Test a11y `apps/web/test/a11y/mfa-enroll.spec.ts` : axe-core sur `/mfa/enroll` sans violation sérieuse/critique. Navigation clavier complète (Tab, Shift+Tab, Enter)

**Checkpoint US1** : flow d'enrôlement complet fonctionnel et testé. À ce
stade, le MVP est livrable indépendamment des autres stories.

---

## Phase 4 — User Story 2 : Step-up modal actions sensibles (P1) 🎯 MVP

**Objectif** : conseiller connecté > 30 min reçoit un modal step-up
avant accepter un lead / lire un brief. Modal interruptible.

**Critère de test indépendant** : forcer `mfaVerifiedAt = NOW - 31min`,
tenter une action sensible stub → modal apparaît, valider code TOTP →
action exécutée, fermer sans valider → écran précédent en lecture seule.

### 4.A API

- [ ] T075 [US2] Créer `apps/api/src/modules/identite/application/use-cases/step-up.use-case.ts` : `execute(userId, sessionId, totpCode, intendedAction)` → vérifie TOTP via port, set `mfaVerifiedAt = NOW`, audit `mfa_stepup_verified`. Sur 3 échecs (bucket per-session P0-3) → DELETE session courante + audit `mfa_stepup_session_killed` + appel mailer `sendStepUpSessionKilledNotice` (FR-020a)
- [ ] T076 [US2] Créer `apps/api/src/modules/identite/interface/mfa-step-up.controller.ts` : `POST /api/mfa/step-up`. AuthGuard. Validation Zod. Rate limit `stepup_totp` per-session
- [ ] T077 [P] [US2] Test intégration `step-up-flow.test.ts` : (a) session non fresh → modal logic ; (b) 3 échecs → session killed + courriel en outbox ; (c) buckets stepup_totp en parallèle dans 2 sessions du même user n'interfèrent pas (P0-3)

### 4.B Web — modal Radix + Server Action

- [ ] T078 [P] [US2] Créer `apps/web/src/components/mfa/StepUpModal.tsx` (Client) : `<Dialog>` shadcn/ui (Radix), focus piégé, `aria-labelledby`, `aria-modal="true"`, restauration focus au déclencheur (FR-036). Reçoit `intendedAction` et `onSuccess` callback en props
- [ ] T079 [P] [US2] Étendre `apps/web/src/lib/mfa/server-actions.ts` avec `stepUpAction(formData)` (cf. `contracts/server-actions.md`)
- [ ] T080 [P] [US2] Créer `apps/web/src/lib/mfa/stepup-client.ts` : helper `useStepUpGate(action, intendedAction)` qui (1) vérifie freshness via Server Action `checkSessionFreshnessAction`, (2) si fresh exécute `action()` direct, (3) sinon ouvre `<StepUpModal>` puis exécute `action()` au succès
- [ ] T081 [P] [US2] Créer page de fallback `apps/web/src/app/(auth)/mfa/step-up/page.tsx` pour les cas no-JS (rare, mais a11y + graceful degradation)
- [ ] T082 [P] [US2] Page stub de démo d'action sensible `apps/web/src/app/(private)/leads/test/accept/page.tsx` (utile pour les tests e2e — peut être supprimé quand le matching arrive en feature 011)
- [ ] T083 [P] [US2] Ajouter clés i18n `mfa.stepup.*` dans `fr-CA.json` + `en.json`

### 4.C Tests e2e + a11y

- [ ] T084 [P] [US2] Test Playwright `mfa-stepup.spec.ts` : flow complet du scénario US2.1-5 (modal apparaît, fermeture, échec 3x = redirect login)
- [ ] T085 [P] [US2] Test a11y axe-core sur le modal step-up monté

**Checkpoint US2** : step-up modal opérationnel. MVP P1 atteint avec US1 + US2.

---

## Phase 5 — User Story 3 : Connexion par code de récupération (P1) 🎯 MVP

**Objectif** : flow `/mfa/verify` + `/mfa/recovery` opérationnel,
consommation atomique, warning si codes < 3.

### 5.A API

- [ ] T086 [US3] Créer use case `verify-totp.use-case.ts` : appelle TotpValidatorPort, set mfaVerifiedAt, audit `mfa_login_verified`, sur échec bucket login_totp ++. Lockout après 5 → audit + courriel FR-013 via mailer port
- [ ] T087 [US3] Créer use case `verify-backup-code.use-case.ts` : utilise `consumeAtomic` du repository (P0-5), retourne `remainingCount`, déclenche `mfa_backup_codes_warning_low` si remainingCount transitionne à 2
- [ ] T088 [US3] Créer `apps/api/src/modules/identite/interface/mfa-verification.controller.ts` : `POST /api/mfa/verify` et `POST /api/mfa/verify-backup-code`. AuthGuard, validation Zod
- [ ] T089 [P] [US3] Test intégration `verify-flow.test.ts` : (a) TOTP correct → mfaVerifiedAt set ; (b) backup code valide → marked used atomically ; (c) backup code réutilisé → 400 ; (d) 5 échecs TOTP → lockout 15 min + courriel ; (e) remainingCount = 2 → warning event émis

### 5.B Web

- [ ] T090 [P] [US3] Créer `apps/web/src/app/(auth)/mfa/verify/page.tsx` : Server Component, form TOTP, lien « Utiliser un code de récupération » vers `/mfa/recovery`
- [ ] T091 [P] [US3] Créer `apps/web/src/app/(auth)/mfa/recovery/page.tsx` : form backup code (input format `XXXX-XXXX-XX` avec normalisation casse + tirets auto)
- [ ] T092 [P] [US3] Étendre server-actions : `verifyTotpAction`, `verifyBackupCodeAction`
- [ ] T093 [US3] Modifier le middleware Next : un user `verified && mfaEnabled && session.mfaVerifiedAt === null` est redirigé vers `/mfa/verify` après login (avec query `?return=<url>`)
- [ ] T094 [P] [US3] Bannière persistante « il vous reste {n} codes » dans le layout privé conseiller quand `warnLowCodes === true` (lue via `getMfaSummaryAction`)

### 5.C Tests

- [ ] T095 [P] [US3] Playwright `mfa-recovery.spec.ts` : scénarios US3.1-4 (succès, réutilisation refusée, warning, régénération invalide ancien lot)
- [ ] T096 [P] [US3] axe-core sur `/mfa/verify` et `/mfa/recovery`

**Checkpoint US3** : trio P1 (US1+US2+US3) complet — un conseiller peut
s'enrôler, se reconnecter en TOTP ou backup code, et se voir demander
step-up sur actions sensibles. **MVP livrable en production**.

---

## Phase 6 — User Story 4 : Reset MFA par un admin (conseiller OU admin) (P2)

**Objectif** : un admin peut reset le MFA d'un user après vérification
hors-bande. Idempotent. Sessions de la cible invalidées. Compteur admins
actifs alerté si descend à 1.

### 6.A API

- [ ] T097 [US4] Créer use case `reset-mfa-admin.use-case.ts` : valide non-auto-reset (FR-022a), DELETE secret + cascade backup codes, DELETE sessions cible + buckets stepup orphelins, audit `mfa_reset_by_admin` avec justification + targetRole, mailer `sendAdminResetNotice`. Idempotent via stockage `(idempotencyKey, sha256(payload))` (P1-2). Avertissement si dernier admin (compteur = 2 → action laisse 1) — flag dans metadata audit (FR-026b)
- [ ] T098 [US4] Créer use case `count-active-admins.use-case.ts` : SELECT COUNT(*) FROM auth_users JOIN mfa_secrets WHERE role='admin' AND enabledAt IS NOT NULL AND deletedAt IS NULL. Cache 60s en mémoire (R10) avec invalidation explicite sur reset admin
- [ ] T099 [US4] Créer `apps/api/src/modules/identite/interface/mfa-admin-reset.controller.ts` : `POST /api/mfa/admin/reset` (AuthGuard + RoleGuard('admin') + StepUpGuard) + `GET /api/admin/active-admins-count` (AuthGuard + RoleGuard('admin'))
- [ ] T100 [P] [US4] Test intégration `reset-admin-flow.test.ts` : (a) reset conseiller → sessions invalidées + audit + courriel ; (b) reset admin par admin → idem ; (c) auto-reset 400 ; (d) idempotency-key replay même payload → cached response ; (e) idempotency-key replay autre payload → 409 (P1-2) ; (f) reset du dernier autre admin → flag warningDisplayedLastAdmin dans audit

### 6.B Web admin

- [ ] T101 [P] [US4] Créer page admin `apps/web/src/app/(auth)/admin/users/[id]/reset-mfa/page.tsx` : form justification (textarea min 20, max 1000), bouton « Réinitialiser MFA » désactivé tant que validation Zod KO ou auto-reset détecté. Avertissement visible si compteur admins = 2 avant action (FR-026b)
- [ ] T102 [P] [US4] Étendre server-actions : `resetUserMfaAdminAction(formData)` (génère idempotencyKey UUID v4, revalidatePath fiche user en succès)
- [ ] T103 [P] [US4] Clés i18n `mfa.adminReset.*`

### 6.C Tests

- [ ] T104 [P] [US4] Playwright `mfa-admin-reset.spec.ts` : scénarios US4.1-6 (justification < 20 désactivée, reset effectif, audit présent, dernier admin warning)
- [ ] T105 [P] [US4] axe-core sur la page admin

---

## Phase 7 — User Story 5 : Enrôlement TOTP admin obligatoire dès J1 (P2)

**Objectif** : un admin nouvellement créé est bloqué sur `/admin/mfa/enroll`
avant tout accès à la console.

- [ ] T106 [US5] Étendre `mfaEnrollmentGuard` (T065) : si `user.role === 'admin'` et `!mfaEnabled` → redirige vers `/admin/mfa/enroll` (pas `/mfa/enroll`)
- [ ] T107 [P] [US5] Créer `apps/web/src/app/(auth)/admin/mfa/enroll/page.tsx` : page d'enrôlement avec messaging spécifique « MFA admin obligatoire » et URL distincte (réutilise `<EnrollForm>` mais affiche un Server Component d'introduction adapté)
- [ ] T108 [P] [US5] Le step-up admin déjà couvert par US2 (composant générique). Vérifier les actions sensibles admin listées FR-018 utilisent bien `useStepUpGate` (audit code review)
- [ ] T109 [P] [US5] Playwright `mfa-admin-enroll.spec.ts` : scénarios US5.1-3 (admin redirigé vers /admin/mfa/enroll, step-up admin sur actions sensibles, 3 échecs invalident session avec alerte audit hautement prioritaire)

---

## Phase 8 — User Story 6 : Auto-service changement de device TOTP (P2)

**Objectif** : un user peut changer de device sans support admin
(mot de passe + TOTP/backup).

### 8.A API

- [ ] T110 [US6] Créer use case `change-device.use-case.ts` : vérifie mot de passe (via Auth.js hash compare — délégation au service existant 001 ou Auth.js v5 helper), vérifie second facteur (TOTP ou backup code), exécute supersede du MfaSecret (atomique), DELETE sessions sauf courante (FR-015b), audit `mfa_device_changed_self`, mailer `sendDeviceChangedNotice`. Retourne `qr/secret/backupCodes` du nouveau secret pending
- [ ] T111 [US6] Créer `apps/api/src/modules/identite/interface/mfa-device-change.controller.ts` : `POST /api/mfa/change-device/start`. Validation Zod stricte sur `secondFactor` discriminated union
- [ ] T112 [US6] Job cron quotidien `mfa-device-change-incomplete-reminder.job.ts` : SELECT users où un `MfaSecret enabledAt IS NULL` existe depuis > 24h → mailer `sendDeviceChangeIncompleteNotice` (FR-015f). Mark le rappel via colonne `lastReminderAt` ou audit event spécifique pour éviter doublons
- [ ] T113 [P] [US6] Test intégration `device-change-flow.test.ts` : (a) password + TOTP valide → ancien supersede + autres sessions DELETE + courriel ; (b) password + backup code valide → idem + ancien lot invalidé ; (c) password seul → 401 ; (d) password + factor invalide → 400 ; (e) abandon > 24h → courriel rappel envoyé

### 8.B Web

- [ ] T114 [P] [US6] Créer `apps/web/src/app/(auth)/(private)/parametres/mfa/page.tsx` : Server Component, appelle `getMfaSummaryAction` (sans step-up, P1-4), affiche état basique + bouton « Modifier paramètres » qui déclenche `useStepUpGate(...)` → après step-up appelle `getMfaDetailsAction` pour afficher détails sensibles
- [ ] T115 [P] [US6] Créer `/parametres/mfa/change-device/page.tsx` + `components/mfa/DeviceChangeForm.tsx` (Client) : form mdp + second factor (radio TOTP/backup + input adaptatif), submit → `startDeviceChangeAction` → si OK redirect vers nouveau flow d'enrôlement
- [ ] T116 [P] [US6] Créer `/parametres/mfa/regenerate-codes/page.tsx` : confirmation + appel `regenerateBackupCodesAction` (step-up requis FR-017)
- [ ] T117 [P] [US6] Créer use case + endpoint + action `regenerate-backup-codes`. Idempotency-Key. Step-up requis
- [ ] T118 [P] [US6] Étendre server-actions : `startDeviceChangeAction`, `regenerateBackupCodesAction`, `getMfaSummaryAction`, `getMfaDetailsAction`
- [ ] T119 [P] [US6] Clés i18n `mfa.deviceChange.*`, `mfa.regen.*`, `mfa.settings.*`

### 8.C Tests

- [ ] T120 [P] [US6] Playwright `mfa-device-change.spec.ts` : scénarios US6.1-5 (TOTP+success, backup+success, sans 2FA refusé, abandon → courriel après 24h via job exécuté manuellement en test, audit présent)
- [ ] T121 [P] [US6] axe-core sur `/parametres/mfa/*`

---

## Phase 9 — Polish et observabilité cross-cutting

### 9.A Observabilité (Principe VII)

- [ ] T122 [P] Créer module Prometheus si pas existant : `apps/api/src/modules/observabilite/prometheus.module.ts` avec `prom-client`. Exposer `/metrics` (sans auth, protégé par CIDR ECS interne)
- [ ] T123 [P] Ajouter compteurs Prometheus : `cv_active_admins_total` (gauge), `cv_mfa_login_failures_total` (counter labels role), `cv_mfa_stepup_failures_total` (counter), `cv_mfa_enrollments_total` (counter), `cv_mfa_resets_by_admin_total` (counter), `cv_mfa_device_changes_total` (counter)
- [ ] T124 [P] Configurer Grafana dashboard panels MFA dans `infrastructure/grafana/dashboards/mfa.json` (panneaux : taux d'échec login, lockouts, step-up failures, enrôlements/jour, compteur admins actifs avec seuil ≤ 1 = critical)
- [ ] T125 [P] Configurer alertes Grafana : `cv_active_admins_total < 2` → critical immediate ; `cv_mfa_stepup_failures_total` taux > 10/min → warning

### 9.B Sécurité durcissement

- [ ] T126 [P] Vérifier/durcir cookie `__Host-cv.session.token` en `SameSite=Strict` (P1-6) dans config Auth.js v5 `apps/web/src/auth.config.ts`. Tester que les flows magic-link / OAuth non cassés. Si cassé, fallback `Lax` + ajouter header CSRF custom
- [ ] T127 [P] Implémenter le linter `tools/check-mfa-secrets-not-leaked.ts` : grep regex `/[A-Z2-7]{32}\b/` dans `logs/**/*.log` et `**/*.log.gz` (déziper). Allowlist : strings hex SHA-256 (longueur 64), JWT base64url (préfixe `eyJ`). Ajouter au `pnpm lint` job de CI
- [ ] T128 [P] Audit OWASP Top 10 documenté dans le corps du PR : pour chaque ligne du tableau IX du plan, lien vers le test/code qui couvre

### 9.C Performance et résilience

- [ ] T129 [P] Scénario load test `tools/load/mfa-verify.js` (k6) : 100 RPS soutenu 5 min sur `/api/mfa/verify`, vérifier p95 < 200 ms ; burst 500 RPS 30 s, vérifier rate limit tient
- [ ] T130 [P] Health check `GET /api/mfa/health` implémenté : ping crypto (déchiffrement test vector) + Prisma + accès `mfa_rate_limit_buckets`. 200 / 503

### 9.D Documentation FR-CA

- [ ] T131 [P] Mettre à jour `apps/api/README.md` section MFA : flow, ports, variables d'environnement requises
- [ ] T132 [P] Finaliser `docs/runbooks/mfa-2-admins-actifs.md` (T010 squelette → contenu complet)
- [ ] T133 [P] Finaliser `docs/runbooks/mfa-break-glass-db.md` (T011 squelette → contenu complet)
- [ ] T134 [P] Mettre à jour `CLAUDE.md` racine : section « Modules de premier niveau » → mentionner que MFA vit dans `identite/`. Pas de nouveau module

### 9.E Lighthouse CI

- [ ] T135 [P] Étendre `lighthouserc.json` (existant ou créer) avec les routes `/fr/mfa/enroll`, `/fr/mfa/verify`, `/fr/mfa/recovery`, `/fr/parametres/mfa`, `/fr/admin/mfa/enroll`. Cibles : Perf ≥ 90, A11y ≥ 95. (Pas de cible SEO — noindex.)

### 9.F Roadmap et clôture

- [ ] T136 Mettre à jour `docs/roadmap.md` : 002a status ⏳ → ✅ avec note « PR #N livré » à la date du merge
- [ ] T137 Vérifier la checklist DoD du plan (cf. `plan.md` § Definition of Done) intégralement avant PR
- [ ] T138 Ouvrir PR avec : description complète, lien spec/plan/data-model, captures d'écran des 5 flows, OWASP audit (T128), résultats k6 (T129), checklist DoD cochée

---

## Dépendances et graphe d'exécution

```text
Phase 1 (Setup)
       │
       ▼
Phase 2 (Foundational)
  ├── 2.A ADR + runbooks (parallèle avec 2.B)
  ├── 2.B Schéma Prisma + migrations ──┐
  ├── 2.C Tests TDD RED ───────┐       │
  ├── 2.D Implémentation GREEN ┤       │
  ├── 2.E Domaine + ports      │       │
  ├── 2.F Infrastructure       │       │
  ├── 2.G Guards               │       │
  ├── 2.H Tests intégration ───┘       │
  └── 2.I Templates courriel ──────────┘
       │
       ▼
       └─────────────────────────────────┐
       │                                 │
       ▼ (toutes les US en parallèle si capacité humaine suffit)
  Phase 3 (US1) ─── Phase 4 (US2) ─── Phase 5 (US3) ── Phase 6 (US4) ── Phase 7 (US5) ── Phase 8 (US6)
       │                │                │              │ (dépend US1+US2)│ (dépend US1+US2)│ (dépend US1+US2+US3+US4)
       │                │                │              │                  │                │
       └────────────────┴────────────────┴──────────────┴──────────────────┴────────────────┘
                                          │
                                          ▼
                                Phase 9 (Polish)
```

**Dépendances inter-US** :

- **US1 (Enrôlement)** : indépendante après Phase 2.
- **US2 (Step-up)** : indépendante après Phase 2. Peut être livrée AVANT US1 si on accepte que les premiers conseillers seront non-MFA temporairement (déconseillé).
- **US3 (Verify TOTP/backup)** : indépendante après Phase 2 mais l'UX réelle exige US1 d'abord (sinon rien à vérifier). Logiquement, US1 → US3.
- **US4 (Reset admin)** : dépend de US1 (besoin d'avoir des users enrôlés à reset). Sinon parallélisable avec US2/US3.
- **US5 (Admin MFA J1)** : réutilise composants US1, dépend de US1.
- **US6 (Auto-service device)** : dépend de US1 (besoin d'un MfaSecret actif à changer) ; dépend de US3 (réutilise verify TOTP/backup en interne).

---

## Stratégie MVP et livraison incrémentale

### Étape MVP (livraison minimale exploitable) — Phases 1 + 2 + 3 + 4 + 5

US1 + US2 + US3 = **MVP P1**. Un conseiller `verified` peut s'enrôler,
se reconnecter, et faire step-up sur actions sensibles. À ce stade, on
peut ouvrir la plateforme à des conseillers réels en production.

**~ 96 tâches** (Phases 1-5 + sous-tâches polish minimales pour OWASP +
observabilité de base).

### Étape Stabilisation — Phase 6 + 7

US4 + US5 = robustesse opérationnelle (reset admin, MFA admin
obligatoire). À livrer dans le mois suivant le MVP.

### Étape Quality-of-Life — Phase 8

US6 = réduction friction support. Peut attendre le retour terrain (si
les utilisateurs demandent souvent un reset device, prioriser).

### Étape finale — Phase 9 polish

Observabilité, durcissement, runbooks, documentation. À faire en
continu pendant les phases 3-8 plutôt qu'à la fin pour éviter
l'accumulation de dette.

---

## Exemples d'exécution parallèle

### Phase 2.C-D (TDD strict)

Les 5 tâches T018-T022 (tests RED) peuvent être écrites par 1 dev en
parallèle (fichiers distincts). Les 5 implémentations T023-T027
suivent en parallèle après le commit RED, par 1 ou 2 devs.

### Phase 3 (US1)

T064-T074 sont presque toutes `[P]` — frontend pages + backend tests +
i18n peuvent avancer en parallèle dès que T061-T063 (use case +
controller + wire) sont terminés.

### Phases 6-8

US4, US5, US6 peuvent être affectées à des devs différents en parallèle
si la capacité humaine le permet — chaque phase ne touche que les
fichiers `apps/api/src/modules/identite/interface/mfa-<area>-*.ts` et
`apps/web/src/app/.../mfa/<area>/page.tsx` qui sont disjoints.

---

## Validation du format des tâches

Format vérifié sur les 138 tâches générées :

- Toutes commencent par `- [ ]`
- Toutes ont un ID `Txxx` séquentiel
- Toutes les tâches de phases US ont le label `[USx]` ; ordre canonique `[P]` avant `[USx]`
- Toutes ont un chemin de fichier explicite ou une description d'action sans ambiguïté
- `[P]` posé uniquement quand les tâches ne partagent ni fichier ni dépendance non terminée

---

## Suivi

| Phase | Tâches | Tâches `[P]` | Story |
|---|---|---|---|
| Phase 1 — Setup | T001-T007 (7) | 5 | — |
| Phase 2 — Foundational | T008-T060 (53) | 39 | — |
| Phase 3 — US1 | T061-T074 (14) | 9 | US1 |
| Phase 4 — US2 | T075-T085 (11) | 8 | US2 |
| Phase 5 — US3 | T086-T096 (11) | 7 | US3 |
| Phase 6 — US4 | T097-T105 (9) | 5 | US4 |
| Phase 7 — US5 | T106-T109 (4) | 3 | US5 |
| Phase 8 — US6 | T110-T121 (12) | 9 | US6 |
| Phase 9 — Polish | T122-T138 (17) | 14 | — |
| **Total** | **138** | **99** | |

MVP livrable au checkpoint Phase 5 (≈ 96 tâches), reste de US2/3/4
incrémental par la suite.
