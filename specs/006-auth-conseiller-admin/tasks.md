---
description: "Décomposition exécutable — Auth conseiller + admin (feature 002 / dossier 006)"
---

# Tasks — Auth conseiller + admin (feature 002 / dossier `006-auth-conseiller-admin`)

**Input** : `specs/006-auth-conseiller-admin/{spec,plan,research,data-model,quickstart}.md` + `contracts/`

**Prérequis** : plan.md, spec.md (US1-US7 priorisés), research.md (R1-R12), data-model.md (6 nouvelles tables), contracts/ (7 API + 1 CLI).

**TDD obligatoire** (Principe VI constitution v2.2.0) : tests pure-fn écrits AVANT implémentation pour `packages/auth-domain/`. Commits séparés visibles dans git.

**Format** : `- [ ] T### [P?] [US?] Description avec chemin de fichier`

- **[P]** : parallélisable (fichier différent, sans dépendance ouverte).
- **[US#]** : appartient à un user story (Phase 3+).
- Setup / Foundational / Polish : pas de label `[US]`.

---

## Phase 1 — Setup (infrastructure partagée)

**Objectif** : Préparer le terrain — nouveau package `@cv/auth-domain`, dépendances, variables d'environnement, configuration logger.

- [ ] T001 Créer le workspace `packages/auth-domain` avec `package.json`, `tsconfig.json`, `tsup.config.ts` (build CommonJS + ESM), `vitest.config.ts`. Aligner sur la structure de `packages/mfa` (002a).
- [ ] T002 [P] Mettre à jour `pnpm-workspace.yaml` pour inclure `packages/auth-domain`. Vérifier `pnpm install` sans erreur.
- [ ] T003 [P] Ajouter `jose@^5` aux dépendances de `apps/api/package.json` (signature JWT HS256, cf. R2).
- [ ] T004 [P] Ajouter `react-hook-form@^7` et `@hookform/resolvers@^3` aux dépendances de `apps/web/package.json` (formulaires accessibles).
- [ ] T005 [P] Ajouter `AUTH_TOKEN_SECRET` (32 octets base64) à `.env.dev`, `.env.example`. Documenter dans `apps/api/src/env.ts` la validation au boot (refus de valeur < 32 octets ou zeros, mirror du pattern `MFA_KEK_BASE64` de 002a).
- [ ] T006 [P] Étendre `apps/api/src/env.ts` (ajout schéma Zod pour `AUTH_TOKEN_SECRET` + `TRUSTED_PROXY_HEADERS`).
- [ ] T007 Configurer le logger Pino global dans `apps/api/src/main.ts` avec `redact: ['req.body.password', 'req.body.newPassword', 'req.body.currentPassword', 'req.body.newPasswordConfirmation', 'req.headers.authorization', 'req.headers.cookie']` (R12 / H10). Vérifier que le bootstrap n'est pas régressé par cette config.
- [ ] T008 [P] Ajouter `ipaddr.js` déjà présent (réutilisation 002a `actor-ip.util.ts`) — vérifier juste l'import correct dans `apps/api`.

---

## Phase 2 — Foundational (prérequis bloquants)

**Objectif** : Schémas Prisma, migrations, ports, fonctions pures testées TDD, ADR-0012. **Aucun US ne peut démarrer avant cette phase complète.**

### Schéma + migrations Prisma

- [ ] T009 Étendre `packages/db/prisma/schema/auth.prisma` : ajouter colonne `password_hash String?` à `AuthAccount`, ajouter relations `emailVerificationTokens`, `passwordResetTokens`, `authOutboxEmails`, `adminInvitationsSent` à `AuthUser`. Commenter le partial unique index (appliqué par migration manuelle).
- [ ] T010 Créer `packages/db/prisma/schema/auth-credentials.prisma` (nouveau fichier multi-file) : `EmailVerificationToken`, `PasswordResetToken`, `AdminInvitationToken`, `AuthAuditEvent`, `LoginLockoutBucket`, `AuthOutboxEmail` + enums `AuthAuditEventType`, `LoginLockoutKind`, `AuthEmailTemplate`. Suit data-model.md.
- [ ] T011 Générer la migration `pnpm --filter @cv/db migrate dev --name init_auth_credentials --create-only`. Éditer le fichier généré pour ajouter : (a) `ALTER TABLE auth_accounts ADD CONSTRAINT credential_password_required CHECK (provider != 'credentials' OR password_hash IS NOT NULL)`, (b) `DROP INDEX auth_users_email_key; CREATE UNIQUE INDEX auth_users_email_unique_not_null ON auth_users(email) WHERE email IS NOT NULL`, (c) `ALTER TABLE auth_login_lockout_buckets ADD CONSTRAINT login_lockout_key_xor CHECK (...)`. Appliquer.
- [ ] T012 Créer migration `20260527000001_auth_audit_immutability` : `CREATE FUNCTION reject_auth_audit_mutation()` + 3 triggers `BEFORE UPDATE/DELETE/TRUNCATE` sur `auth_audit_events`. Suit le pattern 002a `mfa_audit_immutability`. Tester en local que UPDATE/DELETE est bien rejeté.
- [ ] T013 Créer migration `20260527000002_auth_credentials_grants` : pattern DO + format() (bug_026 002a). GRANT SELECT/INSERT/UPDATE/DELETE sur les 6 nouvelles tables au rôle `app_conformite` (dette M11 inscrite roadmap). GRANT USAGE sur les enums.
- [ ] T014 Régénérer le client Prisma : `pnpm --filter @cv/db generate`. Vérifier que les nouveaux modèles sont accessibles via `prisma.emailVerificationToken`, `prisma.authAuditEvent`, etc.

### Domaine pur `@cv/auth-domain` (TDD strict — RED avant GREEN)

- [ ] T015 [P] **Tests RED** — `packages/auth-domain/tests/normalize-email.test.ts` : couvre `trim()`, `toLowerCase()`, `NFC`, IDN, espaces, casse mixte, emoji-emails (cas pratique). Aligner sur R9.
- [ ] T016 [P] **Tests RED** — `packages/auth-domain/tests/password-policy.test.ts` : 12 chars min, 128 max, 4 classes obligatoires, refus si contient email/prénom (insensible casse), refus de string vide, UTF-8 (emoji compte comme 1 char).
- [ ] T017 [P] **Tests RED** — `packages/auth-domain/tests/single-use-tokens.test.ts` : `issueToken({purpose, userId, ttlSec})` + `verifyToken(token, expectedPurpose, now)`. Couvre signature OK, signature falsifiée, exp expiré, purpose mismatch (cross-purpose attack), nonce structure.
- [ ] T018 [P] **Tests RED** — `packages/auth-domain/tests/lockout-policy.test.ts` : `shouldLockout({accountFailures, ipFailures, now, accountWindow, ipWindow})`. Couvre 5/15min, 20/1h, bordures fenêtres glissantes, reset compteur quand fenêtre expirée, deux buckets indépendants.
- [ ] T019 [P] **Tests RED** — `packages/auth-domain/tests/auth-error-normalizer.test.ts` : 4 raisons internes (`USER_NOT_FOUND`, `INVALID_PASSWORD`, `ACCOUNT_DISABLED`, `EMAIL_NOT_VERIFIED`) → toutes retournent `INVALID_CREDENTIALS` (anti-énumération, R5).
- [ ] T020 [P] **Tests RED** — `packages/auth-domain/tests/password-hash.test.ts` : `prehashAndHash(plaintext) → bcrypt(base64(sha256(plaintext)), cost=11)`. Vérifie le pré-hash neutralise la limite 72 octets de bcrypt (mots de passe > 72 chars distincts produisent des hash distincts).
- [ ] T021 Implémentation **GREEN** — `packages/auth-domain/src/email-normalizer.ts` : `normalizeEmail(raw: string) → string`. Test T015 doit passer.
- [ ] T022 Implémentation **GREEN** — `packages/auth-domain/src/password-policy.ts` : `validatePasswordPolicy(password, email?, firstName?) → ValidationResult`. Test T016 doit passer.
- [ ] T023 Implémentation **GREEN** — `packages/auth-domain/src/single-use-tokens.ts` : `issueToken` + `verifyToken` via `jose` HS256. Test T017 doit passer.
- [ ] T024 Implémentation **GREEN** — `packages/auth-domain/src/lockout-policy.ts` : `shouldLockout()` pure fn. Test T018 doit passer.
- [ ] T025 Implémentation **GREEN** — `packages/auth-domain/src/auth-error-normalizer.ts` : `normalizeAuthError(reason) → 'INVALID_CREDENTIALS'`. Test T019 doit passer.
- [ ] T026 Implémentation **GREEN** — `packages/auth-domain/src/password-hash.ts` : `prehashAndHash` + `verifyPrehashed`. Test T020 doit passer.

### DTOs Zod partagés

- [ ] T027 [P] Créer `packages/auth-domain/src/dtos/signup.dto.ts` (Zod schema + type, sans `.refine()` async — M5).
- [ ] T028 [P] Créer `packages/auth-domain/src/dtos/login.dto.ts`.
- [ ] T029 [P] Créer `packages/auth-domain/src/dtos/request-reset.dto.ts`.
- [ ] T030 [P] Créer `packages/auth-domain/src/dtos/complete-reset.dto.ts`.
- [ ] T031 [P] Créer `packages/auth-domain/src/dtos/change-password.dto.ts`.
- [ ] T032 [P] Créer `packages/auth-domain/src/dtos/invite-admin.dto.ts` + `accept-invitation.dto.ts`.
- [ ] T033 Exporter tout depuis `packages/auth-domain/src/index.ts`. Build : `pnpm --filter @cv/auth-domain build`. Vérifier exports via `pnpm --filter @cv/api typecheck`.

### Ports application + infrastructure

- [ ] T034 [P] Créer ports `apps/api/src/modules/identite/application/ports/credential-account-repository.port.ts`.
- [ ] T035 [P] Créer ports `apps/api/src/modules/identite/application/ports/email-verification-token-repository.port.ts`.
- [ ] T036 [P] Créer ports `apps/api/src/modules/identite/application/ports/password-reset-token-repository.port.ts`.
- [ ] T037 [P] Créer ports `apps/api/src/modules/identite/application/ports/admin-invitation-token-repository.port.ts`.
- [ ] T038 [P] Créer ports `apps/api/src/modules/identite/application/ports/login-lockout-repository.port.ts`.
- [ ] T039 [P] Créer port `apps/api/src/modules/identite/application/ports/auth-audit-writer.port.ts` (séparé du `mfa-audit-writer.port.ts` existant — propre traçabilité).
- [ ] T040 [P] Créer port `apps/api/src/modules/identite/application/ports/auth-outbox-writer.port.ts`.
- [ ] T041 [P] Créer port `apps/api/src/modules/identite/application/ports/token-issuer.port.ts` (abstraction `jose` HS256).

### ADR-0012 (résolution H7)

- [ ] T042 Créer `docs/adr/0012-audit-vs-loi-25-no-fk-policy.md` au format MADR : contexte (contradiction Principe IX × Principe II), décision (pas de FK + hash anonymisé), alternatives rejetées (FK SetNull + whitelist trigger ; cascade complète ; table séparée), conséquences. Aligner sur les ADR-0010/0011 de 002a pour le style.

### Module boundaries

- [ ] T043 Étendre `tools/check-module-boundaries.ts` : `@cv/auth-domain` ne doit jamais importer NestJS, Prisma, Next.js, Auth.js. Test que le check échoue si on ajoute un import interdit.

**Checkpoint Phase 2** : `pnpm --filter @cv/auth-domain test` 100% vert (≥ 95% couverture), `pnpm --filter @cv/db generate` OK, `pnpm exec tsx tools/check-module-boundaries.ts` OK, migrations appliquées sur la BD dev.

---

## Phase 3 — User Story 1 : Inscription conseiller self-service (Priorité P1) 🎯 MVP

**Objectif** : Un visiteur peut créer un compte conseiller depuis `/inscription` et reçoit un courriel de vérification.

**Test indépendant** : remplir le formulaire `/inscription` → 202 retourné → INSERT visible en DB (`auth_users` + `auth_accounts` + `auth_email_verification_tokens` + `auth_outbox_emails`).

### Tests US1 (TDD, RED avant GREEN)

- [ ] T044 [P] [US1] **Test RED** — `apps/api/test/integration/identite/auth/signup.integration.test.ts` : signup nominal, email déjà utilisé (anti-énumération), mot de passe trop court, CGU non cochées, rate-limit 11ᵉ tentative/IP. Suit `contracts/api-signup.md`.
- [ ] T045 [P] [US1] **Test RED** — anti-énumération SC-007 dans la même suite : 100 requêtes × 2 cas (existe / inexiste) → écart-type chronométrage < 50 ms.

### Infrastructure US1

- [ ] T046 [P] [US1] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-credential-account-repository.ts` (port T034). Méthode `findByEmail` utilise le SELECT JOIN unifié (R5/C6) pour lookup symétrique.
- [ ] T047 [P] [US1] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-email-verification-token-repository.ts` (port T035).
- [ ] T048 [P] [US1] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-auth-audit-writer.ts` (port T039). Hash `actorEmailHash` + `targetEmailHash` SHA-256 (R11).
- [ ] T049 [P] [US1] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-auth-outbox-writer.ts` (port T040).
- [ ] T050 [P] [US1] Implémenter `apps/api/src/modules/identite/infrastructure/jose-token-issuer.ts` (port T041) — HS256, lit `AUTH_TOKEN_SECRET` via env.
- [ ] T051 [P] [US1] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-login-lockout-repository.ts` (port T038) — pattern atomique `INSERT ON CONFLICT DO UPDATE` (R4). Le bucket signup utilise le même repo avec un kind différent.

### Use case + controller US1

- [ ] T052 [US1] Implémenter `apps/api/src/modules/identite/application/use-cases/signup-conseiller.use-case.ts` : valide DTO Zod + `validatePasswordPolicy` + `normalizeEmail` + `findByEmail` (single roundtrip JOIN) → si exists : INSERT audit `signup` avec `duplicate_attempt=true` + dummy bcrypt ; si pas exists : INSERT `auth_users` + `auth_accounts` + `auth_email_verification_tokens` + `auth_outbox_emails` + audit `signup` (tout en `prisma.$transaction`).
- [ ] T053 [US1] Implémenter `apps/api/src/modules/identite/interface/auth-signup.controller.ts` : `POST /api/auth/signup` avec `ZodValidationPipe` + `@Throttle()` (10/h/IP) + bucket `signup_ip` (login-lockout repo réutilisé). Status 202.
- [ ] T054 [US1] Brancher le controller dans `apps/api/src/modules/identite/identite.module.ts` : ajouter `SignupConseillerUseCase` + tous les providers ports/infra créés. Aligner sur le pattern 002a.
- [ ] T055 [US1] Vérifier T044 + T045 **GREEN**. Si timing pas serré → ajuster dummy bcrypt timing.

### Template email + page web US1

- [ ] T056 [P] [US1] Créer template `packages/email-templates/auth/email-verification.tsx` (react-email, FR-CA). Mentionne validité 24 h + bouton CTA + lien fallback.
- [ ] T057 [P] [US1] Créer page `apps/web/src/app/(auth)/inscription/page.tsx` (Server Component) avec `noindex` metadata, layout shadcn Card, formulaire client `SignupForm`.
- [ ] T058 [P] [US1] Créer `apps/web/src/app/(auth)/inscription/_components/signup-form.tsx` ('use client', react-hook-form + zod resolver avec `packages/auth-domain` schema, état submitting, messages d'erreur FR-CA, `aria-describedby`).
- [ ] T059 [P] [US1] Créer Server Action `apps/web/src/app/(auth)/inscription/actions.ts` : POST vers `/api/auth/signup` côté API, retourne `{ success: true } | { error: 'VALIDATION_FAILED' | ... }`.
- [ ] T060 [P] [US1] Créer page `apps/web/src/app/(auth)/inscription/confirmation/page.tsx` (post-submit) : message statique « vérifiez vos spams » + `<ResendCountdownButton />` (réutilisable par US3 aussi).

### Validation US1

- [ ] T061 [US1] Test Playwright e2e `apps/web/test/e2e/signup.spec.ts` : remplir formulaire valide → confirmation page → vérifier DB row créée + audit event. Test a11y axe-core sur `/inscription`.

**Checkpoint Phase 3** : signup nominal fonctionnel ; 5/5 tests intégration verts ; e2e Playwright vert ; axe-core 0 violation.

---

## Phase 4 — User Story 2 : Connexion conseiller + admin (Priorité P1) 🎯 MVP

**Objectif** : Un utilisateur peut se connecter via `/connexion`. Le `StubPasswordVerifier` est remplacé par `PrismaPasswordVerifier`. Auth.js v5 `Credentials` provider activé.

**Test indépendant** : se connecter avec un compte vérifié → session ouverte. Tester lockout 5/15min + 20/1h IP.

### Tests US2 (TDD, RED avant GREEN)

- [ ] T062 [P] [US2] **Test RED** — `apps/api/test/integration/identite/auth/login.integration.test.ts` : login nominal conseiller, login mauvais password, login email inconnu (anti-énumération), lockout compte 5e échec, lockout IP 20e échec sur comptes différents, redirect post-login (verified MFA, verified non-MFA, admin J1, email non vérifié).
- [ ] T063 [P] [US2] **Test RED** — chronométrage SC-007 dans la même suite : compte existe vs n'existe pas → écart-type < 50 ms (validate cf. R5).

### PrismaPasswordVerifier + rewiring (cœur du remplacement de 002a)

- [ ] T064 [US2] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-password-verifier.ts` : implémente le port `PasswordVerifier` (002a) via `prehashAndHash` + `bcrypt.compare`. Méthode signature inchangée — drop-in replacement.
- [ ] T065 [US2] Rewire `apps/api/src/modules/identite/identite.module.ts` : `{ provide: PASSWORD_VERIFIER, useClass: PrismaPasswordVerifier }` (remplace `StubPasswordVerifier` mais le stub reste exporté pour tests — garde son throw NODE_ENV=production cf. C5).
- [ ] T066 [US2] Vérifier que les tests intégration 002a (MFA US6 device change) restent verts avec `PrismaPasswordVerifier`. Pas de régression.

### LoginUseCase + controller

- [ ] T067 [US2] Implémenter `apps/api/src/modules/identite/application/use-cases/login.use-case.ts` : lookup symétrique JOIN (R5/C6), bcrypt compare (réel ou dummy), incrément bucket account + IP atomique, audit `login_success`/`login_failed`/`login_locked`, retour `{ userId, role, redirect }` (logique de redirect héritée 002a).
- [ ] T068 [US2] Implémenter `apps/api/src/modules/identite/interface/auth-login.controller.ts` : `POST /api/auth/login` consommé par Auth.js v5 callback `authorize` (server-to-server) OU directement par tests intégration. Header `Retry-After` exposé sur 423.

### Auth.js v5 wiring côté `apps/web`

- [ ] T069 [US2] Étendre `apps/web/src/auth.ts` : activer le provider `Credentials` avec callback `authorize` qui POST `${API_URL}/api/auth/login` server-to-server. Cookie config dev/prod override (`__Host-cv.session.token` prod, `cv.session.token` dev, cf. H5).
- [ ] T070 [US2] Configurer `session.maxAge = 30 * 24 * 60 * 60` + `session.updateAge = 24 * 60 * 60` (R7).
- [ ] T071 [US2] Vérifier que le middleware Next.js existant (002a) supporte la redirection post-login conditionnelle (verified MFA → `/mfa/verify`, etc.). Adapter si nécessaire.

### Page web `/connexion`

- [ ] T072 [P] [US2] Créer `apps/web/src/app/(auth)/connexion/page.tsx` (Server Component, `noindex`, bandeau "vérifié" si `?verified=1`).
- [ ] T073 [P] [US2] Créer `apps/web/src/app/(auth)/connexion/_components/login-form.tsx` ('use client', react-hook-form, bouton "Mot de passe oublié").
- [ ] T074 [P] [US2] Créer Server Action `apps/web/src/app/(auth)/connexion/actions.ts` : appelle `signIn('credentials', { email, password, redirect: false })`. Gère erreurs (INVALID_CREDENTIALS, ACCOUNT_LOCKED avec countdown UI — M2).
- [ ] T075 [P] [US2] Créer composant `<RetryAfterCountdown />` réutilisable dans `apps/web/src/components/auth/` (lit le header Retry-After, affiche countdown `aria-live="polite"`). Pattern aligné sur `<ResendCountdownButton />`.

### Validation US2

- [ ] T076 [US2] Test Playwright e2e `apps/web/test/e2e/login.spec.ts` : login nominal verified → dashboard ; 5 échecs → lockout countdown ; a11y axe-core sur `/connexion`.

**Checkpoint Phase 4** : login fonctionnel ; PrismaPasswordVerifier branché ; tests 002a + 002 = 100% verts ; e2e login OK.

---

## Phase 5 — User Story 3 : Vérification de courriel (Priorité P1) 🎯 MVP

**Objectif** : un utilisateur peut cliquer le lien de vérif reçu après signup → `emailVerified = NOW()`. Peut renvoyer un courriel s'il ne l'a pas reçu.

### Tests US3 (TDD)

- [ ] T077 [P] [US3] **Test RED** — `apps/api/test/integration/identite/auth/verify-email.integration.test.ts` : GET avec token valide, expiré, déjà consommé, signature invalide ; POST resend pour compte non-vérifié, déjà-vérifié, inexistant, 4ᵉ resend (rate-limit).

### Use cases + controller

- [ ] T078 [US3] Implémenter `apps/api/src/modules/identite/application/use-cases/verify-email.use-case.ts` : vérif JWT signature + purpose + exp + DB nonce + `UPDATE auth_users SET emailVerified` + UPDATE token consumedAt + audit `email_verified` (transaction).
- [ ] T079 [US3] Implémenter `apps/api/src/modules/identite/application/use-cases/resend-email-verification.use-case.ts` : lookup compte non-vérifié + check bucket `email_verification_resend` (3/h/compte) + INSERT nouveau token + INSERT outbox.
- [ ] T080 [US3] Implémenter `apps/api/src/modules/identite/interface/auth-email-verification.controller.ts` : `GET /api/auth/verify-email?token=...` (redirect 302) + `POST /api/auth/verify-email/resend`.

### Pages web US3

- [ ] T081 [P] [US3] Créer `apps/web/src/app/(auth)/verifier-email/[token]/page.tsx` : Server Component, appelle l'API GET au mount via Server Action, redirige selon résultat. Inutile si on consomme l'API directement côté web — route purement de passage.
- [ ] T082 [P] [US3] Créer `apps/web/src/app/(auth)/verifier-email/erreur/page.tsx` : page d'erreur "lien expiré" + bouton "renvoyer".
- [ ] T083 [P] [US3] Créer composant réutilisable `apps/web/src/components/auth/resend-countdown-button.tsx` ('use client', `useState` countdown + `sessionStorage.resend_last_at` pour persister cf. M8, `aria-live="polite"`).
- [ ] T084 [P] [US3] Brancher `<ResendCountdownButton />` sur `inscription/confirmation/page.tsx` (T060) et `verifier-email/erreur/page.tsx`.

### Validation US3

- [ ] T085 [US3] Test Playwright e2e `apps/web/test/e2e/verify-email.spec.ts` : flow complet signup → récupère token via outbox DB → clique → vérif OK.

**Checkpoint Phase 5** : email verification fonctionnelle ; 4/4 tests verts.

---

## Phase 6 — User Story 4 : Déconnexion (Priorité P1) 🎯 MVP

**Objectif** : un utilisateur peut se déconnecter via le menu utilisateur.

### Tests + implémentation

- [ ] T086 [P] [US4] **Test RED** — `apps/api/test/integration/identite/auth/logout.integration.test.ts` : logout session valide, logout sans cookie, logout autres sessions du même user restent actives (FR-027).
- [ ] T087 [US4] Implémenter `apps/api/src/modules/identite/application/use-cases/logout.use-case.ts` : DELETE `auth_sessions` WHERE `sessionToken = currentSessionToken` + audit `logout` avec `sessionTokenHash` en metadata.
- [ ] T088 [US4] Implémenter `apps/api/src/modules/identite/interface/auth-logout.controller.ts` : `POST /api/auth/logout` (AuthGuard 002a). Documenter dans le commentaire de classe que c'est pour tests / future force-logout admin (H9).
- [ ] T089 [US4] Côté `apps/web`, vérifier que le bouton « Se déconnecter » du menu utilisateur (déjà existant via 002a `<UserMenu />`) appelle bien `signOut({ callbackUrl: '/connexion' })` Auth.js v5.
- [ ] T090 [US4] Test Playwright e2e logout : session ouverte → click logout → redirige `/connexion` → tentative `/conseiller` redirige aussi.

**Checkpoint Phase 6** : logout fonctionnel.

---

## Phase 7 — User Story 5 : Réinitialisation de mot de passe oublié (Priorité P2)

**Objectif** : l'utilisateur reçoit un lien par email et peut choisir un nouveau mot de passe ; toutes ses sessions sont invalidées.

### Tests US5 (TDD)

- [ ] T091 [P] [US5] **Test RED** — `apps/api/test/integration/identite/auth/password-reset.integration.test.ts` : request reset compte existant, request reset email inconnu (anti-énumération), 4ᵉ request (rate-limit 3 actifs), reset avec token valide + sessions invalidées, reset avec token expiré/consommé/cross-purpose.

### Use cases + controller

- [ ] T092 [US5] Implémenter `apps/api/src/modules/identite/application/use-cases/request-password-reset.use-case.ts` : lookup compte, COUNT tokens actifs, INSERT nouveau token + outbox + audit (anti-énumération avec dummy si compte inexistant).
- [ ] T093 [US5] Implémenter `apps/api/src/modules/identite/application/use-cases/complete-password-reset.use-case.ts` : vérif token JWT + DB, UPDATE password_hash, DELETE sessions (sauf courante si applicable cf. M7), DELETE bucket lockout, UPDATE token consumed + invalidate les autres tokens actifs, audit + outbox confirmation. Transaction atomique.
- [ ] T094 [US5] Implémenter `apps/api/src/modules/identite/interface/auth-password-reset.controller.ts` : 2 endpoints (`-request` et `-reset`).

### Templates email US5

- [ ] T095 [P] [US5] Créer template `packages/email-templates/auth/password-reset.tsx` (lien + validité 1h + warning si pas vous).
- [ ] T096 [P] [US5] Créer template `packages/email-templates/auth/password-changed.tsx` (confirmation après reset OU change, FR-CA).

### Pages web US5

- [ ] T097 [P] [US5] Créer `apps/web/src/app/(auth)/mot-de-passe-oublie/page.tsx` + formulaire + Server Action.
- [ ] T098 [P] [US5] Créer `apps/web/src/app/(auth)/mot-de-passe-reinitialiser/[token]/page.tsx` + formulaire (token côté URL params).
- [ ] T099 [P] [US5] Créer Server Action `apps/web/src/app/(auth)/mot-de-passe-reinitialiser/[token]/actions.ts`.

### Validation US5

- [ ] T100 [US5] Test Playwright e2e `apps/web/test/e2e/password-reset.spec.ts` : flow complet (oubli → email → reset → login avec nouveau).

**Checkpoint Phase 7** : reset password fonctionnel ; 5/5 tests verts.

---

## Phase 8 — User Story 6 : Changement de mot de passe authentifié (Priorité P2)

**Objectif** : un utilisateur connecté peut changer son mot de passe. Step-up MFA exigé si actif.

### Tests + implémentation US6

- [ ] T101 [P] [US6] **Test RED** — `apps/api/test/integration/identite/auth/password-change.integration.test.ts` : change nominal, current invalide, lockout 5e échec, new = current (PASSWORD_REUSE), step-up MFA requis si actif, autres sessions révoquées.
- [ ] T102 [US6] Implémenter `apps/api/src/modules/identite/application/use-cases/change-password.use-case.ts` : compare current, refus si new=current, UPDATE password_hash + DELETE autres sessions + DELETE bucket account + audit + outbox confirmation. Transaction atomique.
- [ ] T103 [US6] Implémenter `apps/api/src/modules/identite/interface/auth-password-change.controller.ts` : `POST /api/auth/password-change` avec AuthGuard + StepUpGuard (002a).

### Page web US6

- [ ] T104 [P] [US6] Créer `apps/web/src/app/parametres/securite/changer-mot-de-passe/page.tsx` (Server Component) + formulaire client.
- [ ] T105 [P] [US6] Créer Server Action `actions.ts` qui consomme l'API + gère le 401 STEP_UP_REQUIRED en déclenchant le modal step-up existant 002a.

### Validation US6

- [ ] T106 [US6] Test Playwright e2e `apps/web/test/e2e/password-change.spec.ts` : login → step-up → change → ancien refusé / nouveau accepté.

**Checkpoint Phase 8** : change password fonctionnel.

---

## Phase 9 — User Story 7 : Création d'admin (Priorité P2)

**Objectif** : bootstrap CLI du premier admin + invitation admin-par-admin (Server Action Next.js coordinator cf. C1).

### Tests US7 (TDD)

- [ ] T107 [P] [US7] **Test RED** — `apps/api/test/integration/identite/auth/admin-bootstrap.integration.test.ts` : bootstrap nominal sur DB vide (exit 0 + 1 admin créé), bootstrap si admin existe (exit 2), bootstrap avec mot de passe invalide (exit 3), bootstrap avec --force.
- [ ] T108 [P] [US7] **Test RED** — `apps/api/test/integration/identite/auth/admin-invitation.integration.test.ts` : invite nominal, invite par non-admin (403), invite email déjà user (409 TARGET_EMAIL_ALREADY_REGISTERED cf. H6), invite son propre email (400 SELF_INVITATION_FORBIDDEN), invite duplicate (INVITATION_ALREADY_ACTIVE), validate token, consume token race condition.

### CLI bootstrap admin

- [ ] T109 [US7] Implémenter `apps/api/src/cli/admin-bootstrap.ts` : parse argv (yargs ou minimist), valide password policy via `@cv/auth-domain`, refuse si admin existe (sauf --force), INSERT user/account/audit avec `actorEmailHash`/`targetEmailHash`, runbook stdout. Exit codes 0/2/3/4 (cf. contrat `cli-admin-bootstrap.md`).
- [ ] T110 [US7] Créer le runbook `docs/runbooks/bootstrap-admin.md` (≤ 1 page) avec checklist opérateur (cf. cli-admin-bootstrap.md).

### Use cases invitation

- [ ] T111 [P] [US7] Implémenter `apps/api/src/modules/identite/infrastructure/prisma-admin-invitation-token-repository.ts` (port T037).
- [ ] T112 [US7] Implémenter `apps/api/src/modules/identite/application/use-cases/invite-admin.use-case.ts` : vérif targetEmail pas dans `auth_users` (H6), vérif pas invitation active, vérif pas self-invitation (H7), INSERT token + outbox + audit `admin_invitation_sent`.
- [ ] T113 [US7] Implémenter `apps/api/src/modules/identite/application/use-cases/validate-admin-invitation.use-case.ts` : vérif JWT + DB nonce, retourne `{ valid, targetEmail, invitationId }` (pure read).
- [ ] T114 [US7] Implémenter `apps/api/src/modules/identite/application/use-cases/consume-admin-invitation.use-case.ts` : transaction atomique — vérif token + race-check targetEmail not in auth_users + INSERT user/account + UPDATE token consumed + 2 audits (`admin_invitation_consumed` + `admin_created_by_admin`).

### Controllers + Server Action US7

- [ ] T115 [US7] Implémenter `apps/api/src/modules/identite/interface/admin-user-invitation.controller.ts` : `POST /admin/users` avec `@RequireRole('admin')` + `@UseGuards(StepUpGuard)` + `Idempotency-Key` header.
- [ ] T116 [US7] Implémenter `apps/api/src/modules/identite/interface/auth-admin-invitation.controller.ts` : `POST /api/auth/admin-invitation/validate` + `POST /api/auth/admin-invitation/consume` (public, token-auth).
- [ ] T117 [US7] Créer Server Action `apps/web/src/app/admin/accepter-invitation/[token]/actions.ts` (orchestrator C1) : appelle validate → consume → `signIn('credentials', ...)` → redirect `/admin/mfa/enroll`.

### Pages web US7

- [ ] T118 [P] [US7] Créer `apps/web/src/app/admin/utilisateurs/nouveau/page.tsx` (admin only, RoleGuard côté layout) + formulaire d'invitation.
- [ ] T119 [P] [US7] Créer `apps/web/src/app/admin/accepter-invitation/[token]/page.tsx` (public, token-auth) + formulaire d'acceptation (firstName, lastName, password, CGU).

### Template email US7

- [ ] T120 [P] [US7] Créer template `packages/email-templates/auth/admin-invitation.tsx` (lien activation 72h + mention de l'invitant).

### Validation US7

- [ ] T121 [US7] Test Playwright e2e `apps/web/test/e2e/admin-invitation.spec.ts` : bootstrap CLI → admin login + MFA → invite admin2 → admin2 accepte → admin2 login + MFA enroll.

**Checkpoint Phase 9** : création admin (bootstrap + invitation) fonctionnelle.

---

## Phase 10 — Polish & cross-cutting

**Objectif** : qualité, sécurité, performance, accessibilité, documentation, ADRs.

### Tests transverses

- [ ] T122 [P] Test SC-005 « aucun mot de passe dans les logs » : `apps/api/test/integration/security/no-password-leak.integration.test.ts` — fait POST /signup + login + reset, capture les logs Pino, grep absence du password en clair.
- [ ] T123 [P] Test SC-007 chronométrage anti-énumération renforcé : `apps/api/test/integration/security/anti-enumeration-timing.integration.test.ts` — 100 requêtes par endpoint × cas existe/inexiste, écart-type < 50 ms.
- [ ] T124 [P] Benchmark bcrypt cost : `apps/api/test/perf/bcrypt-benchmark.test.ts` — mesure p95 de `prehashAndHash` cost 10/11/12 sur la machine cible. Échec si cost 11 > 500 ms.
- [ ] T125 [P] Test module boundaries étendu (T043 — sanity check) : `tools/check-module-boundaries.ts` couvre `@cv/auth-domain`.

### Accessibilité

- [ ] T126 [P] Audit axe-core CI sur les 7 routes auth : `/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/mot-de-passe-reinitialiser/[token]`, `/verifier-email/erreur`, `/parametres/securite/changer-mot-de-passe`, `/admin/utilisateurs/nouveau`, `/admin/accepter-invitation/[token]`. Ajouter au workflow CI.

### Performance & SEO

- [ ] T127 [P] Vérifier `metadata.robots: { index: false, follow: false }` sur toutes les pages auth (XII noindex). Test Lighthouse CI vert sur la home publique (perf ≥ 90, a11y ≥ 95, SEO ≥ 95).

### Documentation FR-CA

- [ ] T128 [P] Étendre `apps/api/README.md` : table des nouveaux endpoints auth + variables env (`AUTH_TOKEN_SECRET`, `TRUSTED_PROXY_HEADERS`).
- [ ] T129 [P] Étendre `apps/web/README.md` : nouvelles pages auth + flow Auth.js v5 Credentials.
- [ ] T130 [P] Créer `packages/auth-domain/README.md` : description + complémentarité avec `@cv/mfa` + mention fusion possible `@cv/identite-domain` (M10).
- [ ] T131 [P] Créer runbook `docs/runbooks/auth-rollback.md` (≤ 1 page) : procédure DROP triggers → opération exceptionnelle → recréer triggers (C7).
- [ ] T132 [P] Créer runbook `docs/runbooks/auth-secret-rotation.md` (≤ 1 page) : étapes rotation `AUTH_TOKEN_SECRET` (R10 / M6).

### Sécurité

- [ ] T133 Revoir audit OWASP Top 10 du plan : cocher chaque ligne du tableau A01-A10 dans la PR (checklist remplie pour reviewer).
- [ ] T134 Implémenter `tools/check-auth-leaks.ts` : analyse statique des références `password_hash` hors `packages/auth-domain/password-hash.ts` et `prisma-credential-account-repository.ts`. Ajout au CI.

### Roadmap update

- [ ] T135 Mettre à jour `docs/roadmap.md` post-merge : ligne 002 passe de ⏳ à ✅ mergé ; barrer la note « stub `PasswordVerifier` à remplacer quand 002 livre » de la ligne 002a (résolu). Mettre à jour la séquence d'implémentation suggérée (sprint 1 partiellement consommé).

### Validation finale

- [ ] T136 Lancer `pnpm lint && pnpm typecheck && pnpm --filter @cv/auth-domain test && pnpm --filter @cv/api test:integration && pnpm --filter @cv/web test:e2e`. Cible : 100% vert.
- [ ] T137 Exécuter le quickstart.md de A à Z manuellement sur l'environnement dev. Cocher chaque étape.
- [ ] T138 Lancer `/ultrareview` (ou équivalent) avant ouverture de PR.

**Checkpoint final** : feature 002 prête à merger sur `main`.

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Phase 1 (Setup)** : aucune dépendance.
- **Phase 2 (Foundational)** : dépend de Phase 1. **Bloque toutes les US.**
- **Phase 3 (US1)** : peut démarrer après Phase 2.
- **Phase 4 (US2)** : peut démarrer après Phase 2 (mais bénéficie de l'infra US1 — repos + audit writer déjà en place).
- **Phase 5 (US3)** : dépend de US1 (le token est créé par signup).
- **Phase 6 (US4)** : peut démarrer après Phase 2.
- **Phase 7 (US5)** : dépend de US1 + US3 (templates email pattern réutilisés).
- **Phase 8 (US6)** : dépend de US2 (auth) + reset pattern de US5.
- **Phase 9 (US7)** : dépend de US1 + US2 + US3 (réutilise repos + token issuer + audit + flow d'auth complet).
- **Phase 10 (Polish)** : dépend de toutes les US.

### Dans chaque US

- Tests RED écrits AVANT implémentation (Principe VI TDD).
- Modèles → services (use cases) → endpoints (controllers) → pages web → e2e.
- Templates email en parallèle des use cases (pas de dépendance).

### Parallèles intra-phase

- Phase 2 : T015-T020 (tests pure-fn) tous en parallèle ; T021-T026 (implémentations) tous en parallèle ; T027-T032 (DTOs) tous en parallèle ; T034-T041 (ports) tous en parallèle.
- Phase 3 : T046-T051 (infra Prisma) en parallèle ; T056-T060 (templates + pages) en parallèle.
- Phase 4 : T072-T075 (pages web + composant countdown) en parallèle.
- Phase 7 : T095-T099 (templates + pages) en parallèle.
- Phase 9 : T111-T120 mostly parallel.
- Phase 10 : T122-T132 mostly parallel.

### MVP minimum viable

- Phase 1 + 2 + 3 (US1 signup) + 4 (US2 login) + 5 (US3 verify email) + 6 (US4 logout) = **MVP fonctionnel**.
- Phases 7-9 (US5/6/7) = livrables Tier 1 (peuvent être incrementaux).

---

## Exemple d'exécution parallèle — Phase 2 Foundational

```bash
# Vague 1 : tests pure-fn RED (tous en parallèle)
T015 (normalize-email.test.ts)
T016 (password-policy.test.ts)
T017 (single-use-tokens.test.ts)
T018 (lockout-policy.test.ts)
T019 (auth-error-normalizer.test.ts)
T020 (password-hash.test.ts)

# Vague 2 : implémentations GREEN (tous en parallèle)
T021 normalize-email.ts
T022 password-policy.ts
T023 single-use-tokens.ts
T024 lockout-policy.ts
T025 auth-error-normalizer.ts
T026 password-hash.ts

# Vague 3 : DTOs Zod (tous en parallèle)
T027-T032

# Vague 4 : ports (tous en parallèle)
T034-T041
```

---

## Stratégie d'implémentation

### MVP first (US1 + US2 + US3 + US4)

1. Phase 1 setup → Phase 2 foundational → Phase 3 US1 → Phase 4 US2 → Phase 5 US3 → Phase 6 US4 → polish minimum.
2. Stop et valider : signup + login + verify + logout opérationnels.
3. Démo prête. C'est le point où on peut envisager un déploiement staging.

### Incrémental

1. MVP livré.
2. Ajout US5 reset password (réduit le ticket support).
3. Ajout US6 change password (rotation proactive).
4. Ajout US7 admin (bootstrap + invitation).
5. Polish complet.

### Parallèle équipe

Avec 2 développeurs :
1. Dev A : Phase 1 + 2 (ensemble).
2. Une fois Phase 2 done :
   - Dev A : US1 (signup) + US3 (verify email — dépend US1).
   - Dev B : US2 (login) + US4 (logout).
3. Convergence Phase 5 + 6 terminées.
4. Puis US5 (Dev A) + US6 (Dev B) en parallèle.
5. US7 et polish ensemble.

---

## Notes

- **TDD strict** sur `@cv/auth-domain` : commits séparés `test:` (RED) puis `feat:` (GREEN). Visible dans git log pour audit Principe VI.
- **Anti-énumération** : SC-007 vérifié par test T123 (timing constant). Chaque endpoint signup/login/reset DOIT passer ce test avant merge.
- **Cookie config** : double-check en CI que `__Host-` est bien activé en prod (Playwright assertion).
- **Migrations** : staging passage obligatoire avant prod (DoD).
- **Logger Pino redact** : test T122 garde-fou ; ne pas oublier de tester aussi qu'un POST password-change ne fuite pas le `currentPassword`.
- **Bcrypt cost** : T124 benchmark fixe la valeur ; ajuster `prehashAndHash` si nécessaire avant freeze.
- **ADR-0012** (T042) à livrer avant Phase 2 done. Sans ADR, la décision "no FK auth_audit_events" reste à valider en revue.

---

**Total : 138 tâches** organisées en 10 phases. MVP minimum (Phases 1-6) = ~90 tâches. Restant (Phases 7-10) = ~48 tâches.
