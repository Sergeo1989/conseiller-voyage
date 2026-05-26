# Plan d'implémentation : Auth conseiller + admin (feature 002 / dossier `006-auth-conseiller-admin`)

**Branche** : `006-auth-conseiller-admin` | **Date** : 2026-05-26 | **Spec** : [spec.md](spec.md)

**Entrée** : Spécification fonctionnelle `specs/006-auth-conseiller-admin/spec.md`

---

## Résumé exécutif

La feature 002 livre le **provider `Credentials` Auth.js v5** (vérification mot de passe Prisma), la **signup conseiller self-service**, la **vérification d'email**, le **reset de mot de passe**, le **changement de mot de passe authentifié**, la **création d'admins** (CLI bootstrap + invitation admin-par-admin), et la **déconnexion**. Elle remplace le `StubPasswordVerifier` posé par 002a (qui throw en `NODE_ENV=production`) par un vrai `PrismaPasswordVerifier`.

L'implémentation tient en **4 couches** alignées sur la Clean Architecture du projet :

1. **`packages/auth-domain/`** (nouveau, TypeScript pur) — politique de complexité mot de passe (pure fn), génération/validation de tokens à usage unique (vérification email + reset), validateurs Zod des DTO. Zéro framework. TDD obligatoire (Principe VI).
2. **`apps/api/src/modules/identite/`** (extension du module existant 002a) — entités domaine (`AuthCredentialAccount`, `EmailVerificationToken`, `PasswordResetToken`, `AuthAuditEvent`, `LoginLockoutBucket`), ports (password verifier réel, token issuer, email outbox writer, audit writer existant), use cases (`SignupConseillerUseCase`, `LoginUseCase`, `VerifyEmailUseCase`, `RequestPasswordResetUseCase`, `CompletePasswordResetUseCase`, `ChangePasswordUseCase`, `LogoutUseCase`, `BootstrapAdminUseCase`, `InviteAdminUseCase`), adaptateurs Prisma + bcrypt.
3. **`apps/web/src/app/(auth)/`** (nouveau) — pages publiques `/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/mot-de-passe-reinitialiser`, `/verifier-email`, et privées `/parametres/securite/changer-mot-de-passe`, `/admin/utilisateurs/nouveau`. Toutes Server Actions Next.js + react-hook-form + Zod.
4. **CLI bootstrap** — `apps/api/src/cli/admin-bootstrap.ts` exécutée par `pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts --email … --password …`. Crée un admin avec `emailVerifiedAt = NOW`, `mfaSecrets = []` (force enrôlement MFA J1 héritée 002a). Audit `admin_bootstrap`.

**Le `PrismaPasswordVerifier`** remplit le port `PasswordVerifier` déjà défini par 002a (US6 change-device dépend de lui). Il fait `SELECT auth_users.*, auth_accounts.password_hash FROM auth_users LEFT JOIN auth_accounts ON auth_accounts.userId = auth_users.id AND auth_accounts.provider = 'credentials' WHERE auth_users.email = $1 LIMIT 1` (lookup symétrique, cf. C6 + R5) puis `bcrypt.compare(prehash(plaintext), passwordHash)`. Branchement dans `identite.module.ts` : `{ provide: PASSWORD_VERIFIER, useClass: PrismaPasswordVerifier }` à la place du stub.

**Le `StubPasswordVerifier` reste avec son throw `NODE_ENV=production`** (cf. C5 de la review). Défense en profondeur : si un futur reviewer rebascule le wiring sur le stub par erreur, l'app refuse de démarrer en prod. Les tests qui ont besoin du stub l'injectent explicitement via `Test.createTestingModule().overrideProvider(PASSWORD_VERIFIER).useClass(StubPasswordVerifier)` — le throw ne se déclenche pas en `NODE_ENV=test`.

**Sessions Auth.js v5** — durée 30 jours glissants (clarification Q2). Configuration côté `apps/web/src/auth.ts` : `session.maxAge = 30 * 24 * 60 * 60`, `session.updateAge = 24 * 60 * 60` (refresh côté DB max 1×/jour pour limiter le coût d'écriture). Le step-up MFA 30 min reste indépendant (déjà en place via 002a).

---

## Contexte technique

**Langage / version** : TypeScript ≥ 5.6, Node.js ≥ 22 (figés par `package.json`).

**Dépendances principales** :

- `next@^15` (App Router, RSC) — déjà installé.
- `next-auth@5.0.0-beta.*` (Auth.js v5) — déjà installé, on **active** ici le provider `Credentials` (avec `authorize` callback qui consomme `LoginUseCase`).
- `@nestjs/common@^10`, `@nestjs/platform-fastify` — déjà installés.
- `@prisma/client@^5` — déjà installé.
- `bcryptjs@^2.4` — **déjà installé** par 002a (codes de récupération). Réutilisé pour le hash des mots de passe avec **cost 11** appliqué sur un pré-hash SHA-256(base64) du plaintext. Voir `research.md` R3 pour le détail (cost 11 vs 12, pré-hash anti-72-byte-limit).
- `zod@^3` — déjà installé.
- `react-hook-form@^7` + `@hookform/resolvers@^3` — **nouveau** pour les formulaires côté `apps/web/`. Pattern attendu par la constitution (Principe XI a11y forte avec react-hook-form + Zod).
- `jose@^5` — **nouveau** côté `apps/api/`. Signature JWT (HS256) des tokens à usage unique (vérification email + reset password + invitation admin). Alternative à `jsonwebtoken` mais conforme à WebCrypto.
- `react-email@^3` — réutilise les templates de 002a sous `packages/email-templates/`. Ajout de 4 nouveaux templates : `auth_email_verification`, `auth_password_reset`, `auth_password_changed`, `auth_admin_invitation`.

**Stockage** :

- PostgreSQL 16 ca-central-1 (ADR-0001) via Prisma — extensions du schéma via **nouveau fichier multi-file** `packages/db/prisma/schema/auth-credentials.prisma`. Le fichier `auth.prisma` existant (`AuthUser`, `AuthAccount`, `AuthSession`, `AuthVerificationToken`) est **étendu** par ajout de relations (`emailVerificationTokens`, `passwordResetTokens`, `authAuditEvents`, `loginLockoutBuckets`) côté `AuthUser`.
- Cookies de session : déjà gérés par Auth.js v5 (`__Host-cv.session.token`).
- Hash de mot de passe : **stocké dans `auth_accounts.password_hash` (colonne ajoutée)**. Le provider `Credentials` Auth.js v5 stocke un row par compte (`provider='credentials'`, `providerAccountId=email`, `password_hash=…`). Pas de table séparée.

**Tests** :

- `vitest` pour `packages/auth-domain/*` (logique pure ≥ 95 % de couverture, Principe VI TDD strict).
- `vitest` + `Testcontainers` (Postgres réel) pour les repositories et use cases dans `apps/api/`.
- `Playwright` + `axe-core` pour les flows e2e côté `apps/web/` (inscription, connexion, vérification email, reset password).
- `MSW` pour stubber Auth.js côté tests web.

**Plateforme cible** : AWS ECS Fargate ca-central-1 (ADR-0005), même runtime que 001 et 002a.

**Type de projet** : web-application (monorepo pnpm + Turborepo), même structure que 001/002a/004.

**Performance** :

- `bcrypt.compare` **cost 11** sur `bcryptjs` JS pur ≈ **300-450 ms p95** sur Fargate t4g.medium (cf. R3, à benchmarker en CI avant production). Acceptable car derrière rate-limit + bucket de lockout — pas de DoS.
- Login complet (vérif password + audit + creation session) < 700 ms p95 (révisé depuis 600 ms post-review pour absorber le coût réel `bcryptjs`).
- Signup complet (validation Zod + SHA-256 + bcrypt + INSERT + outbox INSERT) < 800 ms p95.
- Reset password (vérif token JWT + bcrypt nouveau + DELETE sessions + audit + outbox) < 800 ms p95.

**Benchmark de validation** : à intégrer dans la phase de polish (avant merge) — un script `apps/api/test/perf/bcrypt-benchmark.test.ts` mesure le p95 de `bcrypt.hash` cost 10/11/12 sur la machine cible et fait échouer le test si > 500 ms à cost 11. Permet de fixer le cost final en connaissance de cause.

**Contraintes** :

- Mot de passe **jamais** journalisé ni transmis (FR-035 + SC-005).
- Hash bcrypt **jamais** quitter `auth_accounts` (FR-035, vérifié par `tools/check-mfa-secrets-not-leaked.ts` étendu).
- Toutes les données en région canadienne ca-central-1 (Loi 25, Principe II, FR-036).
- Audit log `auth_audit_events` **append-only** au niveau BD (FR-033, triggers Postgres pattern 002a).
- Anti-énumération : login + signup + reset retournent des réponses indistinguables temporellement (chronométrage à 50 ms ± 10) — vérifié par test d'intégration SC-007.

**Échelle** :

- 50 à 500 conseillers en année 1 (cohérent 001).
- 2 à 5 admins actifs.
- ~10 connexions/jour/conseiller = ~5 000 logins/jour pic.
- Pic d'inscription Black Friday tourisme : ~50 signups/h = négligeable.

---

## Vérification de la constitution

> **PORTE** : passer avant Phase 0 ET re-vérifier après Phase 1. Toute violation NON-NÉGOCIABLE non justifiée = échec.

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE) — ✅ N/A

002 ne touche **ni** à une réservation, **ni** à un encaissement, **ni** au filtrage de statut « vérifié » côté affichage (c'est 001 qui le fait). L'auth conseiller crée des comptes en statut « email non vérifié », le statut « vérifié » CCV/TICO reste sous la responsabilité du module conformité (001). Les redirections post-login (FR-010/011) consomment **le port `ConformiteQueryPort`** de 001 mais ne le modifient pas. La frontière transactionnelle reste intacte.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ Adressé

Données personnelles collectées :
- Email (identifiant + canal de communication) — minimisation OK.
- Prénom + nom (identité publique sur profil — feature 005 future) — minimisation OK.
- Hash bcrypt mot de passe — minimisation OK (jamais clair).
- Adresse IP abrégée (audit événement, /24 IPv4 ou /48 IPv6 via `actor-ip.util.ts` de 002a) — minimisation OK.
- Horodatage acceptation CGU + Loi 25 — obligation légale (FR-038).

Résidence canadienne : **PostgreSQL ca-central-1** (ADR-0001), tables chiffrées au repos par AWS RDS encryption-at-rest (ADR-0005). Aucun sous-traitant hors région.

Effacement Loi 25 (feature 023 future) : cascade prévue dans le schéma (`onDelete: Cascade` sur `auth_users` → `auth_accounts`, `auth_sessions`, `email_verification_tokens`, `password_reset_tokens`). Les `auth_audit_events` sont conservés 7 ans (obligation légale supplante droit à l'effacement, arbitrage acté en 001).

Rétention : alignée sur le tableau de la constitution (sessions 30j glissants, tokens email 24h, tokens reset 1h, audit 7 ans, comptes actifs sans limite, comptes supprimés anonymisés sous 30j).

### III. Qualité de lead avant volume — ✅ N/A

002 ne touche pas au matching ni à la notification de leads. Le redirect post-login conseiller `verified` non-MFA va vers `/mfa/enroll` (002a) — pas de lead avant MFA actif. Le plafond 3 conseillers est appliqué par le module matching (011 future).

### IV. Français d'abord — ✅ Adressé

Toutes les pages utilisateur livrées en FR-CA :
- `/inscription` → titre « Créer un compte conseiller »
- `/connexion` → « Se connecter »
- `/mot-de-passe-oublie` → « Mot de passe oublié »
- `/mot-de-passe-reinitialiser` → « Choisir un nouveau mot de passe »
- `/verifier-email` → « Vérifier votre courriel »
- `/parametres/securite/changer-mot-de-passe` → « Changer mon mot de passe »

Clés i18n en place pour l'EN futur via `next-intl` (déjà câblé par 001). Format de date FR-CA via `date-fns/locale/fr-CA`. Pas de monnaie côté 002.

Messages d'erreur FR-CA : « Courriel ou mot de passe incorrect », « Le mot de passe doit contenir au moins 12 caractères », « Votre compte est temporairement bloqué », etc.

### V. Architecture : monolithe modulaire — ✅ Adressé

Module concerné : **`identite`** (extension du module existant 002a). Aucun nouveau module créé. Tout passe par les ports/use cases existants quand possible (audit writer, outbox, IP helper, rate limit bucket).

Imports cross-module : 002 consomme `ConformiteQueryPort` (001) pour décider du redirect post-login. Pas de couplage inverse.

LLM : **non utilisé** par cette feature. Pas de coût LLM à plafonner.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ Adressé

Logique métier sensible identifiée :

1. **Politique de complexité du mot de passe** (`packages/auth-domain/src/password-policy.ts`) — fonction pure `validatePasswordPolicy(password, email, firstName) → ValidationResult`. TDD : tests écrits **avant** l'implémentation, commits séparés visibles dans git. Cas couverts : trop court, manque classes, contient email, contient prénom, ≥ 12 mixtes valide.

2. **Génération + validation de tokens à usage unique** (`packages/auth-domain/src/single-use-tokens.ts`) — fonctions pures `issueToken({purpose, userId, ttlSec})` et `verifyToken(token, expectedPurpose, now)`. JWT HS256 + claims spécifiques (`purpose: 'email_verification' | 'password_reset' | 'admin_invitation'`, `userId`, `nonce`, `iat`, `exp`). TDD : tests RED avant GREEN, séparation des purposes vérifiée par scénario d'attaque cross-purpose (token de vérif email rejeté par flow reset).

3. **Calcul du verrouillage de compte** (`packages/auth-domain/src/lockout-policy.ts`) — fonction pure `shouldLockout({accountFailures, ipFailures, now, accountWindow, ipWindow}) → LockoutDecision`. TDD : 5 failures/15min compte ET 20 failures/1h IP, bordures fenêtres glissantes, reset compteur.

4. **Anti-énumération** : la **fonction pure** `normalizeAuthError(reason) → 'INVALID_CREDENTIALS'` masque toute distinction sémantique. Testée par 4 scénarios (compte inexistant / mauvais mot de passe / compte désactivé / email non vérifié) qui produisent tous le même retour.

Couverture cible ≥ 95 % sur `packages/auth-domain/`.

### VII. Observabilité de la boucle économique — ✅ Reporté à 021 (décision clarification)

Métriques business identifiées mais **déférées à 021** (feature observabilité centrale) :
- `auth_signup_total{role}` — compteur signup conseiller.
- `auth_login_success_total{role}`, `auth_login_failed_total{reason}` — login.
- `auth_lockout_total{type=account|ip}` — verrouillage.
- `auth_password_reset_requested_total`, `auth_password_reset_completed_total` — reset.
- `auth_email_verification_completed_total` — vérif.

**Source de vérité** : événements d'audit immuables (FR-033) dans `auth_audit_events`. 021 dérivera les compteurs par sourcing d'événements (pattern déjà appliqué à 002a pour `cv_active_admins_total`). Pas de double instrumentation côté 002.

Note ajoutée dans `identite.module.ts` : `// Métriques Prometheus déférées à feature 021 — voir auth_audit_events comme source.`

### VIII. Clean Architecture et SOLID — ✅ Adressé

**4 couches** strictement respectées :

```
interface/         → contrôleurs NestJS, Server Actions Next.js (mince)
   ↓
application/       → use cases avec méthode execute (1 classe = 1 cas d'usage)
   ↓
domaine/           → entités pures (AuthCredentialAccount, EmailVerificationToken,
                     PasswordResetToken, LoginLockoutBucket), value objects,
                     règles métier (politique mot de passe, anti-énumération)
   ↑
infrastructure/    → adaptateurs Prisma (PrismaCredentialAccountRepository,
                     PrismaPasswordVerifier, PrismaTokenRepository,
                     PrismaAuditWriter, etc.)
```

Imports interdits vérifiés par `tools/check-module-boundaries.ts` (étendu) :
- `domaine/` ne peut PAS importer NestJS, Prisma, Next.js, Auth.js.
- `application/` ne peut PAS importer Prisma ni Auth.js direct, seulement les ports.
- `infrastructure/` ne peut PAS importer `interface/`.

**SOLID** :
- **S** (Single Responsibility) — chaque use case n'a qu'une seule raison de changer. `LoginUseCase` ne fait que login (pas signup, pas reset).
- **O** (Open/Closed) — ajout d'un OAuth provider futur ne touche pas `LoginUseCase` (provider passé en paramètre).
- **L** (Liskov) — `PrismaPasswordVerifier` substitue parfaitement `StubPasswordVerifier` (même interface `PasswordVerifier`).
- **I** (Interface Segregation) — `PasswordVerifier.verify(userId, plaintext)` ne mélange pas hash/comparaison.
- **D** (Dependency Inversion) — `LoginUseCase` dépend de l'abstraction `PasswordVerifier`, pas de bcryptjs directement.

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ Adressé

**RBAC** : appliqué en couche application via `RoleGuard` (existant 002a). Endpoint `POST /admin/users` (invitation admin) annoté `@RequireRole('admin')` + `@UseGuards(StepUpGuard)`.

**AuthN** : MFA conseiller `verified` déjà obligatoire (002a). 002 ajoute le mot de passe comme premier facteur. Auth.js v5 + sessions DB.

**Validation Zod côté serveur** : tous les DTO (`SignupDto`, `LoginDto`, `RequestResetDto`, `CompleteResetDto`, `ChangePasswordDto`, `InviteAdminDto`) ont leur schéma Zod consommé par `ZodValidationPipe` (existant 002a) côté NestJS et par `react-hook-form` resolver côté Next.js (même schéma partagé via `packages/auth-domain/src/dtos/`).

**En-têtes HTTP** : déjà gérés par `@fastify/helmet` (constitution Stack canonique). Pas de changement.

**OWASP Top 10** — checklist couverte explicitement (cf. *Audit OWASP* ci-dessous).

**Aucun secret en clair** :
- Mot de passe utilisateur : jamais en log, jamais en query string, jamais en URL fragment (POST body only).
- Hash bcrypt : ne quitte jamais `auth_accounts`. Vérifié par `tools/check-auth-leaks.ts` (nouveau).
- JWT secret de signature de tokens : `AUTH_TOKEN_SECRET` dans AWS Secrets Manager (prod) ou 1Password (dev). Validation au boot via `env.ts` (refus zeros, refus < 32 octets).

**Aucun SQL brut** : tout passe par Prisma. Seule exception : la **migration** qui ajoute les triggers append-only sur `auth_audit_events` (pattern 002a / 001 — `CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER`).

#### Audit OWASP Top 10 explicite

| # | Risque | Mitigation |
|---|---|---|
| A01 Broken Access Control | RBAC `RoleGuard` (002a) + `RequireRole('admin')` sur invitation admin + `StepUpGuard` (002a) sur change-password + endpoint signup `noAuth` mais rate-limité + endpoint admin/users en `noindex` |
| A02 Cryptographic Failures | bcrypt cost 11 sur SHA-256 pré-hash (FR-004, R3) + JWT HS256 avec secret AWS Secrets Manager (R10) + cookies `__Host-cv.session.token` SameSite=Strict (Auth.js v5 default — override `cv.session.token` non-Secure en dev local, H5) + pas de mot de passe en plaintext nulle part (R12 Pino redact) |
| A03 Injection | Prisma typed queries, zéro raw SQL hors trigger immutability + Zod validation entrée HTTP (toutes les API routes) |
| A04 Insecure Design | Anti-énumération imposée par scénario (US1.2, US5.2, FR-002, FR-018) + lockout double bucket (FR-009) + step-up MFA sur change-password (FR-024) + invalidation sessions à reset (FR-020) |
| A05 Security Misconfiguration | Helmet (déjà en place) + `Strict-Transport-Security` (déjà en place) + `Content-Security-Policy` (déjà en place) + AWS Secrets Manager (jamais en code) + `StubPasswordVerifier` reste protégé par `NODE_ENV=production` throw |
| A06 Vulnerable Components | pnpm audit bloquant CRITICAL en CI (existant) + Dependabot actif sur le repo |
| A07 Identification/AuthN Failures | bcrypt + lockout double bucket + MFA héritée 002a + rate-limit signup (10/h/IP) + rate-limit reset (3 actifs/compte) + rate-limit renvoi vérif (3/h/compte) + session 30j glissants avec step-up 30min pour actions sensibles |
| A08 Software Integrity Failures | npm lockfile committé + pnpm audit en CI + pas de scripts post-install non audités |
| A09 Security Logging | `auth_audit_events` append-only avec triggers Postgres rejetant UPDATE/DELETE/TRUNCATE (FR-033) + IP abrégée (FR-034) + métriques déférées à 021 mais audit est la source de vérité immuable. **ADR-0012** : pas de FK Prisma vers `auth_users` pour résoudre la contradiction Principe IX (immuable) × Principe II (effacement Loi 25). Corrélation post-effacement via `actorEmailHash`/`targetEmailHash` SHA-256. **Pino logger** configuré avec `redact: ['req.body.password', 'req.body.newPassword', 'req.body.currentPassword', 'req.body.newPasswordConfirmation', 'req.headers.authorization', 'req.headers.cookie']` (cf. H10 / R12) — vérifié par SC-005 |
| A10 SSRF | Pas d'URL externe consommée par cette feature. Outbox écrit en DB, drainage par 003 (SES) hors scope direct |

### X. Fiabilité et résilience — ✅ Adressé

**SLO endpoints concernés** (p95 < 800 ms hors LLM, Principe X) :
- `POST /api/auth/signup` < 800 ms
- `POST /api/auth/login` < 600 ms (hors latence bcrypt = ~250 ms p95)
- `POST /api/auth/password-reset-request` < 400 ms (juste outbox + token)
- `POST /api/auth/password-reset` < 800 ms (vérif token + bcrypt + delete sessions + audit)
- `POST /api/auth/password-change` < 800 ms (idem + step-up déjà validé)
- `GET /api/auth/verify-email` < 300 ms
- `POST /api/auth/logout` < 200 ms
- `POST /admin/users` (invitation admin) < 600 ms

**Idempotence** : les **endpoints d'écriture publique** doivent être idempotents (Principe X). Inventaire :

| Endpoint | Idempotent ? | Mécanisme |
|---|---|---|
| `POST /api/auth/signup` | ⚠ Pas strictement (création de compte = effet unique). Mais 2ᵉ soumission identique avec même email → réponse identique sans création doublon (déjà couvert par anti-énumération + contrainte unique). Pas besoin de `Idempotency-Key`. |
| `POST /api/auth/login` | ✅ Naturellement (pas d'effet de bord sauf incrément compteur lockout, qui est l'effet voulu). |
| `POST /api/auth/password-reset-request` | ✅ Si 2× même `email` en < 1s → un seul token émis (déduplication par bucket de rate-limit `password_reset_request` 3 actifs / compte). |
| `POST /api/auth/password-reset` | ⚠ Le token étant à usage unique (consommé au 1ᵉʳ succès), rejouer la 2ᵉ requête échoue. Le token est l'idempotency-key naturel. |
| `POST /api/auth/password-change` | ⚠ Pareil : effet de bord (changement de mot de passe + revoke sessions), mais re-soumission avec le même ancien mot de passe échoue après le 1ᵉʳ succès car l'ancien n'est plus valide. |
| `POST /admin/users` (invitation admin) | ✅ `Idempotency-Key` header obligatoire (consommé par interceptor Redis existant 001) — pattern admin `POST` aligné sur 001. |

**Modes dégradés documentés** :

| Dépendance | Mode dégradé |
|---|---|
| **Outbox courriel (stub MVP)** | Si le draining 003 n'existe pas encore : signup réussit (compte créé `emailVerifiedAt=null`), mais l'email de vérification reste en queue dans `auth_outbox_emails`. UX : page de confirmation post-signup affiche bouton « Renvoyer » avec countdown 60s (clarification Q1) → re-INSERT dans outbox. Pas de DLQ pour MVP. |
| **DB primaire HS** | Impossible de login (lecture `auth_accounts`). Auth.js v5 retourne 503 via guard. Pas de read-replica fallback (incompatibilité MFA verify de 002a qui exige writes). |
| **Redis HS** (rate limit) | Le bucket Postgres existant (002a) **n'utilise pas Redis**. La feature 002 réutilise ce même bucket Postgres. Donc résilience Redis HS = N/A. Si l'interceptor Idempotency-Key (001) tombe → fallback HTTP 503 sur les rares endpoints qui l'utilisent (`POST /admin/users`). |

**Health checks** : déjà exposés par `apps/api` (existant 001). Pas de changement.

**Circuit breakers** : pas nécessaires côté 002 (aucun appel HTTP sortant).

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE) — ✅ Adressé

Toutes les pages utilisateur de 002 sont des formulaires — c'est le terrain de jeu prioritaire de WCAG :

- Navigation clavier intégrale : `Tab` cycle entre champs, `Enter` soumet, focus visible (`outline-ring/50`).
- Messages d'erreur exposés via `aria-describedby` pointant sur un `<p id="…-error">` (react-hook-form + shadcn `Form` fait ça par défaut). Le countdown 60s du bouton « Renvoyer » utilise `aria-live="polite"` + `aria-disabled="true"`.
- Contraste ≥ 4.5:1 sur tous les textes et placeholders (Tailwind palette grey-700+/white = 11:1, validé par axe-core).
- Politique de complexité expliquée **avant** la soumission (liste statique visible des règles ; pas de validation différée silencieuse). Cohérent avec NIST SP 800-63B 5.1.1.2.
- `<input type="password">` avec **bouton de bascule visibilité** (Radix `Toggle` + icône lucide `Eye/EyeOff`), accessible clavier + `aria-pressed`.
- Captcha : **pas de captcha** au MVP. Le rate-limit signup 10/h/IP + lockout double bucket suffit. Si abus détecté en prod, ajout de hCaptcha invisible en suivi (hors scope 002).

**axe-core CI bloquant** sur 7 routes : `/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/mot-de-passe-reinitialiser`, `/verifier-email`, `/parametres/securite/changer-mot-de-passe`, `/admin/utilisateurs/nouveau`. Toute violation WCAG AA = échec CI.

### XII. Optimisation SEO (NON-NÉGOCIABLE) — ✅ Adressé (pages privées noindex)

Toutes les pages de 002 sont **privées par nature** :

- `/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/mot-de-passe-reinitialiser`, `/verifier-email`, `/parametres/*`, `/admin/*` → `<meta name="robots" content="noindex, nofollow">` côté `<head>` (Next.js `metadata` export).
- Aucun contenu indexable de valeur SEO sur ces routes.
- Lighthouse SEO score → vérifié à ≥ 95 sur les pages publiques marketing (hors 002).
- Pas de Schema.org structured data sur ces pages (rien à indexer).

CWV (LCP/INP/CLS) restent sous budget Principe XII même sur ces pages privées :
- LCP < 2.5s : page d'inscription est statique SSR, asset fonts pré-chargés.
- INP < 200ms : formulaires `react-hook-form` (uncontrolled, optimisé).
- CLS < 0.1 : pas de bannière cookie qui réajuste (hérité 004).

Lighthouse CI bloquant Performance ≥ 90 / A11y ≥ 95 / SEO ≥ 95 (sur la page publique racine).

### Definition of Done

La DoD intégrale de la constitution sera cochée avant merge :

- [ ] Tous les FR de la spec couverts par tests unitaires + intégration verts (Vitest, Testcontainers).
- [ ] Tous les SC mesurables vérifiables (avec script de validation pour SC-007 anti-énumération).
- [ ] Benchmark `bcrypt` cost final fixé en CI (cible : p95 < 500 ms sur machine cible — cf. R3 + H1).
- [ ] `pnpm lint` (Biome) sans warning, `pnpm typecheck` propre.
- [ ] `pnpm --filter @cv/auth-domain test` ≥ 95 % de couverture.
- [ ] `pnpm --filter @cv/api test:integration` 100 % vert.
- [ ] Test SC-005 « pas de mot de passe dans les logs » vert (POST signup, grep logs).
- [ ] axe-core CI vert sur les 7 routes.
- [ ] Lighthouse CI vert sur la page publique.
- [ ] Audit OWASP Top 10 revu en revue de PR (checklist remplie).
- [ ] Migration `auth_credentials` testée en staging avec rollback documenté dans `docs/runbooks/auth-rollback.md`.
- [ ] Documentation FR-CA : README `apps/api`, README `apps/web`, runbook `docs/runbooks/bootstrap-admin.md` (≤ 1 page), runbook `docs/runbooks/auth-rollback.md` (≤ 1 page), runbook `docs/runbooks/auth-secret-rotation.md` (≤ 1 page — cf. R10).
- [ ] ADR-0012 livré : `docs/adr/0012-audit-vs-loi-25-no-fk-policy.md` (cf. H7 / R11).
- [ ] Templates email FR-CA dans `packages/email-templates/auth/`.
- [ ] `packages/auth-domain/README.md` mentionne la complémentarité avec `@cv/mfa` et la fusion future possible en `@cv/identite-domain` (cf. M10).

---

## Structure de projet

### Documentation (cette feature)

```text
specs/006-auth-conseiller-admin/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions techniques (R1-R8)
├── data-model.md        # Phase 1 — entités + transitions d'état + migrations
├── quickstart.md        # Phase 1 — flow démo pour reviewer
├── contracts/
│   ├── api-signup.md
│   ├── api-login.md
│   ├── api-verify-email.md
│   ├── api-password-reset.md
│   ├── api-password-change.md
│   ├── api-logout.md
│   ├── api-admin-invitation.md
│   └── cli-admin-bootstrap.md
├── checklists/
│   └── requirements.md  # Déjà créé par /speckit.specify
└── tasks.md             # Phase 2 (créé par /speckit.tasks plus tard)
```

### Code source (extension de la structure existante)

```text
packages/
├── auth-domain/                           # NOUVEAU package
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── password-policy.ts             # fonction pure validatePasswordPolicy
│   │   ├── single-use-tokens.ts           # issueToken / verifyToken (JWT HS256)
│   │   ├── lockout-policy.ts              # shouldLockout (compte + IP)
│   │   ├── auth-error-normalizer.ts       # anti-énumération
│   │   └── dtos/                          # schémas Zod partagés api+web
│   │       ├── signup.dto.ts
│   │       ├── login.dto.ts
│   │       ├── request-reset.dto.ts
│   │       ├── complete-reset.dto.ts
│   │       ├── change-password.dto.ts
│   │       └── invite-admin.dto.ts
│   └── tests/
│       ├── password-policy.test.ts
│       ├── single-use-tokens.test.ts
│       ├── lockout-policy.test.ts
│       └── auth-error-normalizer.test.ts
│
├── db/prisma/schema/
│   ├── auth.prisma                        # ÉTENDU (ajout relations)
│   ├── auth-credentials.prisma            # NOUVEAU — credentials + tokens + lockout + audit + outbox
│   └── (autres .prisma existants inchangés)
│
└── email-templates/auth/                  # NOUVEAU sous-répertoire
    ├── email-verification.tsx
    ├── password-reset.tsx
    ├── password-changed.tsx
    └── admin-invitation.tsx

apps/api/src/
├── cli/
│   └── admin-bootstrap.ts                 # NOUVEAU — CLI pnpm exec tsx
├── modules/identite/                      # EXTENSION du module 002a
│   ├── application/
│   │   ├── ports/
│   │   │   ├── credential-account-repository.port.ts    # NOUVEAU
│   │   │   ├── email-verification-token-repository.port.ts  # NOUVEAU
│   │   │   ├── password-reset-token-repository.port.ts  # NOUVEAU
│   │   │   ├── login-lockout-repository.port.ts         # NOUVEAU
│   │   │   ├── auth-audit-writer.port.ts                # NOUVEAU (séparé de mfa-audit-writer)
│   │   │   └── (ports 002a existants intacts)
│   │   └── use-cases/
│   │       ├── signup-conseiller.use-case.ts            # NOUVEAU
│   │       ├── login.use-case.ts                        # NOUVEAU
│   │       ├── verify-email.use-case.ts                 # NOUVEAU
│   │       ├── request-password-reset.use-case.ts       # NOUVEAU
│   │       ├── complete-password-reset.use-case.ts      # NOUVEAU
│   │       ├── change-password.use-case.ts              # NOUVEAU
│   │       ├── logout.use-case.ts                       # NOUVEAU
│   │       ├── bootstrap-admin.use-case.ts              # NOUVEAU (consommé par CLI)
│   │       ├── invite-admin.use-case.ts                 # NOUVEAU
│   │       └── (use cases 002a existants intacts)
│   ├── infrastructure/
│   │   ├── prisma-credential-account-repository.ts      # NOUVEAU
│   │   ├── prisma-password-verifier.ts                  # NOUVEAU (remplace stub)
│   │   ├── prisma-email-verification-token-repository.ts  # NOUVEAU
│   │   ├── prisma-password-reset-token-repository.ts    # NOUVEAU
│   │   ├── prisma-login-lockout-repository.ts           # NOUVEAU
│   │   ├── prisma-auth-audit-writer.ts                  # NOUVEAU
│   │   ├── jose-token-issuer.ts                         # NOUVEAU (JWT HS256)
│   │   ├── stub-password-verifier.ts                    # CONSERVÉ pour tests
│   │   └── (adapters 002a existants intacts)
│   ├── interface/
│   │   ├── auth-signup.controller.ts                    # NOUVEAU
│   │   ├── auth-login.controller.ts                     # NOUVEAU (POST /api/auth/login → consommé par Auth.js v5 credentials authorize)
│   │   ├── auth-email-verification.controller.ts       # NOUVEAU
│   │   ├── auth-password-reset.controller.ts            # NOUVEAU
│   │   ├── auth-password-change.controller.ts           # NOUVEAU
│   │   ├── auth-logout.controller.ts                    # NOUVEAU
│   │   ├── admin-user-invitation.controller.ts          # NOUVEAU
│   │   ├── dto/
│   │   │   └── (DTOs Zod réexportés depuis @cv/auth-domain)
│   │   └── (controllers MFA 002a existants intacts)
│   └── identite.module.ts                               # ÉTENDU (rewire PASSWORD_VERIFIER → PrismaPasswordVerifier ; le stub reste dispo pour tests, throw NODE_ENV=production conservé — cf. C5)

apps/web/src/
├── auth.ts                                              # ÉTENDU — provider Credentials activé
├── middleware.ts                                        # ÉTENDU — protection routes privées
└── app/
    ├── (auth)/                                          # NOUVEAU group
    │   ├── inscription/page.tsx
    │   ├── connexion/page.tsx
    │   ├── mot-de-passe-oublie/page.tsx
    │   ├── mot-de-passe-reinitialiser/[token]/page.tsx
    │   ├── verifier-email/[token]/page.tsx
    │   └── _components/
    │       ├── signup-form.tsx
    │       ├── login-form.tsx
    │       ├── password-reset-request-form.tsx
    │       ├── password-reset-complete-form.tsx
    │       └── resend-countdown-button.tsx              # countdown 60s + a11y
    ├── parametres/securite/
    │   └── changer-mot-de-passe/page.tsx                # NOUVEAU
    └── admin/
        └── utilisateurs/
            └── nouveau/page.tsx                         # NOUVEAU (invitation admin)
```

**Décision de structure** : extension du monorepo existant. Aucun nouveau apps/. Nouveau package `@cv/auth-domain` pour la logique pure isolée (pattern aligné sur `@cv/mfa` de 002a). Tout le reste vit dans `apps/api/src/modules/identite/` (extension) et `apps/web/src/app/(auth)/` (nouveau group de routes).

---

## Suivi de la complexité

> Pas de violation justifiée nécessaire. Tous les principes de la constitution sont respectés sans déviation.

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée car |
|-----------|---------------------|-------------------------------------|
| (aucune) | | |

---

## Phase 0 — Recherche

Sortie : `research.md` (généré séparément). Décisions à documenter :

- **R1** — Provider Credentials Auth.js v5 vs implémentation Auth.js custom signin
- **R2** — Format des tokens à usage unique : JWT HS256 (jose) vs token opaque en DB
- **R3** — Hash bcrypt cost 11 + pré-hash SHA-256 (vs cost 12, vs Argon2id)
- **R4** — Bucket de lockout Postgres (réutilisation 002a) vs Redis vs nouveau modèle
- **R5** — Anti-énumération via chronométrage constant
- **R6** — Stockage `password_hash` : colonne sur `auth_accounts` vs nouvelle table `credential_accounts`
- **R7** — Cookie de session 30 jours glissants : configuration Auth.js v5
- **R8** — Bouton « Renvoyer » countdown 60s : pattern shadcn + a11y

---

## Phase 1 — Conception et contrats

### Données et migrations

`data-model.md` (généré séparément) — couvre :

- Extension `AuthAccount` avec colonne `password_hash` + index sur `(provider, email)`.
- Nouvelles tables :
  - `auth_email_verification_tokens` (token JWT signé côté serveur, ID stocké en DB pour invalidation one-shot)
  - `auth_password_reset_tokens` (idem)
  - `auth_admin_invitation_tokens` (idem, TTL 72h)
  - `auth_login_lockout_buckets` (kind + accountId OU ip, count, windowStart) — pattern Postgres atomique INSERT ON CONFLICT DO UPDATE (réutilise concept 002a)
  - `auth_audit_events` (immuable append-only via triggers)
  - `auth_outbox_emails` (idem `mfa_outbox_emails` mais pour les templates auth)
- Transitions d'état du compte : `pending_email` → `email_verified` → `verified_no_mfa` → `verified_mfa` (pour conseiller) ; `bootstrap_no_mfa` → `bootstrap_mfa` (pour admin).
- Index partiels Postgres alignés avec 002a (notamment sur lockout buckets `WHERE windowStart > NOW() - interval`).
- Migrations : 3 fichiers (init schema + immutability triggers + GRANTs) sur le pattern 002a (bug_026 inclus). Procédure de rollback documentée dans `docs/runbooks/auth-rollback.md` car les triggers d'immutability ne sont pas réversibles automatiquement par `prisma migrate reset` (cf. C7).
- **Dette technique acceptée** (cf. M11) : les GRANTs s'appliquent sur le rôle Postgres `app_conformite` (réutilisation pragmatique 002a). Le refactor vers un rôle dédié `app_identite` est inscrit dans la roadmap pour une future feature de durcissement opérationnel.

### Contrats

`contracts/` (généré séparément) — 8 fichiers documentant les endpoints API et la CLI :

| Fichier | Endpoint / Commande | Auth | Méthode |
|---|---|---|---|
| `api-signup.md` | `POST /api/auth/signup` | Public | rate-limit 10/h/IP |
| `api-login.md` | `POST /api/auth/login` | Public (Auth.js v5 callback) | rate-limit lockout double bucket |
| `api-verify-email.md` | `GET /api/auth/verify-email?token=…` | Public | one-shot |
| `api-password-reset.md` | `POST /api/auth/password-reset-request` + `POST /api/auth/password-reset` | Public | rate-limit 3 actifs/compte |
| `api-password-change.md` | `POST /api/auth/password-change` | Authentifié + StepUp | — |
| `api-logout.md` | `POST /api/auth/logout` | Authentifié | — |
| `api-admin-invitation.md` | `POST /admin/users` | Admin + StepUp + Idempotency-Key | RoleGuard |
| `cli-admin-bootstrap.md` | `pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts --email --password` | Local / CI | runbook ≤ 1 page |

Chaque contrat documente : payload requête (Zod schema), réponses (succès + erreurs codifiées), événement d'audit émis, side effects DB.

### Quickstart

`quickstart.md` (généré séparément) — flow démo pour le reviewer :

1. `pnpm docker:up && pnpm db:migrate && pnpm dev:up`
2. Bootstrap admin via CLI
3. Se connecter en admin, MFA enroll forcé
4. Créer un conseiller via signup self-service
5. Vérifier email, se connecter
6. Tester reset password
7. Tester change password authentifié
8. Tester logout

### Update du contexte agent

`CLAUDE.md` actuel pointe sur `specs/005-mfa-conseiller/plan.md`. À mettre à jour entre les markers `<!-- SPECKIT START -->` et `<!-- SPECKIT END -->` pour pointer sur `specs/006-auth-conseiller-admin/plan.md`.

---

## Vérification post-Phase 1 de la constitution

Re-vérifier les 12 principes après génération de `research.md` + `data-model.md` + `contracts/`. Si une décision de la Phase 0 ou de la Phase 1 introduit une violation NON-NÉGOCIABLE (I, II, VI, IX, XI, XII), bloquer et amender. Section *Suivi de la complexité* à remplir uniquement si des compromis justifiés sont introduits.

---

## Sortie

Après Phase 0 + Phase 1, lancer `/speckit.tasks` pour générer la décomposition exécutable. Le merge sur `main` exigera une PR avec :

- Spec, plan, research, data-model, contracts, quickstart, tasks (tous mergés).
- Tous les commits suivent le flux TDD pour la logique métier (test RED avant GREEN).
- DoD intégrale cochée.
- Ultrareview lancée avant merge (cf. workflow 002a).
