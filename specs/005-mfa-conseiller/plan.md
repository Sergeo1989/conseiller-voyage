# Plan d'implémentation : MFA conseiller et élévation de session

**Branche** : `005-mfa-conseiller` | **Date** : 2026-05-25 | **Spec** : [spec.md](spec.md)

**Entrée** : Spécification fonctionnelle `specs/005-mfa-conseiller/spec.md`

---

## Résumé exécutif

La feature 005 ajoute par-dessus l'infrastructure d'authentification posée
par 001 (`AuthUser`, `AuthSession.mfaVerifiedAt`, `AuthGuard`) la couche
**MFA TOTP + élévation de session step-up** exigée par le Principe IX
NON-NÉGOCIABLE de la constitution. L'approche tient en 4 couches alignées
sur l'architecture clean du projet :

1. **`packages/mfa/`** (nouveau, TypeScript pur) — TOTP RFC 6238, génération
   de codes de récupération, chiffrement symétrique AES-256-GCM du secret
   TOTP, validateurs Zod. Aucun framework. TDD obligatoire (Principe VI).
2. **`apps/api/src/modules/identite/`** (extension) — domaine
   (`MfaSecret`, `BackupCodeBatch`, `MfaAuditEvent`), ports (encrypter,
   hasher, repository, mailer, audit writer), use cases (`EnrollTotpUseCase`,
   `VerifyTotpUseCase`, `StepUpUseCase`, `ResetMfaUseCase`,
   `ChangeDeviceUseCase`, `RegenerateBackupCodesUseCase`), infrastructure
   Prisma + Node crypto.
3. **`apps/web/src/app/(auth)/mfa/`** (nouveau) — pages
   `/mfa/enroll`, `/mfa/verify`, `/mfa/step-up`, paramètres MFA, écrans de
   reset admin et de changement de device.
4. **Middlewares** — `mfaEnrollmentGuard` (Next.js middleware bloquant
   l'accès au tableau de bord conseiller `verified` non enrôlé), `stepUpGuard`
   (NestJS guard pour les routes API marquées comme actions sensibles).

L'**`AuthSession.mfaVerifiedAt`** existe déjà (livré par 001), il devient le
pivot fonctionnel : la fenêtre « MFA frais » = 30 min après la valeur
courante. L'invalidation de toutes les sessions actives sur reset/device
change se fait via `DELETE FROM auth_sessions WHERE userId = ?` (à part la
session courante pour le device change).

---

## Contexte technique

**Langage / version** : TypeScript ≥ 5.6, Node.js ≥ 22 (figés par
`package.json`).

**Dépendances principales** :
- `next@^15` (App Router, RSC) — déjà installé
- `next-auth@5.0.0-beta.*` (Auth.js v5) — déjà installé
- `@nestjs/common@^10`, `@nestjs/platform-fastify` — déjà installés
- `@prisma/client@^5` — déjà installé
- **Nouvelle** : `otplib@^12` (TOTP RFC 6238 + génération secret Base32 +
  validation à fenêtre glissante)
- **Nouvelle** : `qrcode@^1.5` (génération PNG/SVG du QR code côté serveur
  pour `apps/web`)
- **Nouvelle** : `bcryptjs@^2.4` (hash des codes de récupération, déjà
  utilisé par des composants Auth.js en hypothèse — sinon ajout via Auth.js
  v5)
- Crypto chiffrement secret TOTP : **module natif Node `crypto`
  (AES-256-GCM)**, pas de nouvelle dépendance
- `zod@^3` (validation entrée HTTP) — déjà installé
- `react-email@^3` (templates courriel pour les notifications MFA) —
  installé via 003 quand disponible. Pour 005 : on stub le `Mailer`
  port et on commit les templates `.tsx` dans
  `packages/email-templates/mfa/` pour usage par 003. Le stub écrit
  dans une table `mfa_outbox_emails` + console.log (mode dev) ou
  enqueue BullMQ avec retry exponentiel (mode prod, infra 001) sans
  envoi effectif tant que 003 n'a pas branché SES (mode dégradé Mailer
  HS, Principe X)

**Stockage** :
- PostgreSQL 16 ca-central-1 (ADR-0001) via Prisma — extensions du schéma
  via nouveau fichier multi-file `packages/db/prisma/schema/mfa.prisma`
- Cookies de session : déjà gérés par Auth.js v5 (`__Host-cv.session.token`)

**Tests** :
- `vitest` pour `packages/mfa/*` (logique pure, ≥ 95 % de couverture
  exigée par Principe VI — TDD strict)
- `vitest` + `Testcontainers` (Postgres réel) pour les repositories et
  use cases dans `apps/api/`
- `Playwright` + `axe-core` pour les flows e2e côté `apps/web/`
  (enrôlement, step-up, reset admin)
- **MSW** pour stubber Auth.js côté tests web

**Plateforme cible** : AWS ECS Fargate ca-central-1 (ADR-0005), même
runtime que 001.

**Type de projet** : web-application (monorepo pnpm + Turborepo), même
structure que 001/004.

**Performance** :
- Validation TOTP serveur < 50 ms p95 (calcul HOTP en mémoire, pas d'I/O)
- Chiffrement/déchiffrement secret TOTP < 10 ms p95 (AES-256-GCM natif)
- Flow d'enrôlement complet (charge page → activation effective) < 3
  minutes pour 95 % des utilisateurs (SC-003)
- SLO global hérité Principe X : p95 < 800 ms sur tous les endpoints
  synchrones MFA

**Contraintes** :
- Secret TOTP **jamais** en clair en BD ni en logs (FR-007, FR-038)
- Backup codes **uniquement hashés** en BD (FR-039, bcrypt cost ≥ 12)
- Toutes les données en région canadienne ca-central-1 (Loi 25, Principe II)
- Audit log MFA **append-only** au niveau BD (FR-031, triggers Postgres
  comme 004)

**Échelle** :
- 50 à 500 conseillers en année 1 (cohérent avec spec 001)
- 2 à 5 admins actifs en permanence (politique opérationnelle 005)
- ~10 connexions/jour/conseiller à régime → ~5 000 validations TOTP/jour
  pic ; pas de pression sur la BD

---

## Vérification de la constitution

> **PORTE** : passer avant la Phase 0 (recherche) ET re-vérifier après la
> Phase 1 (design). Toute violation NON-NÉGOCIABLE non justifiée = échec.

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE) — ✅ N/A

005 ne touche **ni** à une réservation, **ni** à un encaissement, **ni** au
versement fournisseur, **ni** à l'affichage public d'un conseiller. La
feature n'altère pas la frontière transactionnelle. Elle protège l'accès
au tableau de bord conseiller (qui lui-même n'expose pas de paiement).

Le filtrage du statut `verified` n'est **pas** modifié : la cascade depuis
`ConformiteQueryPort` reste la source de vérité ; 005 ajoute simplement
qu'un conseiller `verified` non-enrôlé MFA voit son accès au tableau de
bord bloqué côté middleware avant même que `ConformiteQueryPort` ne soit
consulté.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ Conforme

**Données collectées par 005** :
- Secret TOTP (string, 160 bits Base32) → **chiffré AES-256-GCM** au repos
  avec KEK en gestionnaire de secrets (FR-038). Stocké dans la table
  `mfa_secrets` (BD ca-central-1). Strict minimum : un secret unique par
  utilisateur enrôlé.
- Hashes des codes de récupération (bcrypt cost ≥ 12) → table
  `mfa_backup_codes`. Jamais le clair, jamais récupérable côté serveur
  après l'affichage initial.
- IP source des événements d'audit MFA → enregistrée **abrégée** (IPv4 /24,
  IPv6 /48) dans `mfa_audit_events`, pas l'IP complète. Cohérent avec le
  pattern d'anonymisation de 004 (ADR-0008).

**Effacement Loi 25** :
- Lors d'un effacement de compte (feature 023, future), suppression en
  cascade de `mfa_secrets` + `mfa_backup_codes` du `userId` cible
  (FR-040). Le secret TOTP n'est PAS une donnée d'identité au sens Loi 25,
  c'est un secret cryptographique — pas d'anonymisation, suppression
  complète.
- `mfa_audit_events` : conservé 7 ans (obligation audit sécurité) avec
  `userId` anonymisé (hash salé) après l'effacement, même pattern que
  004 (ADR-0008) — l'événement reste, l'identité de la cible est rompue.

**Résidence** : tout dans ca-central-1 (DB, app, secrets manager).

**Sous-traitants** : aucun nouveau. Auth.js, Prisma, otplib, bcryptjs sont
des bibliothèques open-source exécutées dans nos process.

### III. Qualité de lead avant volume — ✅ N/A

Pas de matching, pas de notification de lead dans 005.

### IV. Français d'abord — ✅ Conforme

Tous les libellés (écrans d'enrôlement, modal step-up, paramètres MFA,
courriels transactionnels FR-020a / FR-026 / FR-015e / FR-015f) en FR-CA
via `next-intl` (catalogues séparés `apps/web/messages/fr-CA.json`). Clés
EN ajoutées vides en placeholder pour la livraison i18n ultérieure
(feature 024). Pas de chaînes hard-codées dans le code.

### V. Architecture : monolithe modulaire — ✅ Conforme

005 reste dans le module `identite/` (cf. feature 001). Aucun nouveau
microservice. Le module `identite/` consomme le port
`ConformiteQueryPort` (déjà publié par `conformite/` en 001) pour savoir
si un user est `verified` lors du middleware d'enrôlement obligatoire —
usage légitime d'une interface publique.

**Pas de LLM** dans 005. Cache LLM non applicable.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ Conforme par design

Logiques métier sensibles introduites par 005 :
- Validation TOTP (RFC 6238, fenêtre ±1 pas) → fonction pure dans
  `packages/mfa/src/totp.ts`, **tests TDD écrits AVANT le code**
- Génération de codes de récupération (10 codes, alphabet sans ambiguïté
  visuelle, format `XXXX-XXXX-XX`) → fonction pure dans
  `packages/mfa/src/backup-codes.ts`, TDD
- Chiffrement/déchiffrement secret TOTP (AES-256-GCM) → fonction pure
  dans `packages/mfa/src/encryption.ts`, TDD avec vecteurs de test connus
- Politique « MFA frais » (calcul 30 min depuis `mfaVerifiedAt`) →
  fonction pure dans `packages/mfa/src/freshness.ts`, TDD
- Vérification d'un backup code (lookup hash en BD + comparaison
  bcrypt) → use case `VerifyBackupCodeUseCase` testé en intégration avec
  Testcontainers

Tests visibles dans commits séparés `test(005): ...` (rouges) AVANT les
commits d'implémentation `feat(005): ...` (verts). Couverture cible ≥
95 % sur `packages/mfa/*`.

### VII. Observabilité de la boucle économique — ✅ Conforme (extension)

005 ne touche pas directement les 4 métriques de boucle économique. Mais
ajoute des **signaux opérationnels** de sécurité :
- Compteur d'admins actifs (FR-026a) → métrique Prometheus
  `cv_active_admins_total{}` avec alerte hautement prioritaire si < 2
- Taux d'échec TOTP (logins + step-up) → métriques
  `cv_mfa_login_failures_total{}`, `cv_mfa_stepup_failures_total{}` —
  utiles pour détection d'attaque par force brute
- Tableau de bord central enrichi des panels sécurité MFA, lié dans
  `apps/api/README.md`

### VIII. Clean Architecture et SOLID — ✅ Conforme

**Couches respectées** :
- `domaine/` : entités `MfaSecret`, `BackupCode`, `MfaAuditEvent` ; value
  objects `EncryptedTotpSecret`, `BackupCodeHash`, `MfaSessionFreshness`.
  Aucun import NestJS, Next.js, Prisma. Pur.
- `application/` : ports `MfaSecretRepositoryPort`,
  `BackupCodeRepositoryPort`, `TotpSecretEncrypterPort`,
  `BackupCodeHasherPort`, `MfaAuditWriterPort`,
  `MfaNotificationMailerPort`, `ActiveSessionRevokerPort` ; use cases
  listés ci-dessus. Pas d'I/O direct.
- `infrastructure/` : adaptateurs Prisma pour les 3 nouveaux repositories,
  `NodeCryptoTotpSecretEncrypter`, `BcryptBackupCodeHasher`,
  `OtplibTotpValidator`, `SesMailer` (stub MVP — vrai impl arrive avec
  003), `PrismaActiveSessionRevoker`.
- `interface/` : contrôleurs NestJS `MfaEnrollmentController`,
  `MfaVerificationController`, `MfaStepUpController`,
  `MfaAdminResetController`, `MfaDeviceChangeController`. Server Actions
  Next.js côté `apps/web/`.

**SOLID** :
- **S** : chaque use case fait une seule chose (enroll vs verify vs
  step-up vs reset…)
- **O** : `TotpSecretEncrypterPort` permet d'ajouter
  `KmsTotpSecretEncrypter` futur sans toucher le domaine
- **L** : tous les ports respectent leurs contrats, les implémentations
  Prisma sont interchangeables avec des fakes en tests
- **I** : 8 ports distincts plutôt qu'une mégaclasse `MfaService` — chaque
  consommateur dépend uniquement de ce dont il a besoin
- **D** : use cases dépendent des ports, jamais des impls

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ Cœur de la feature

005 **est** Principe IX. Couverture détaillée :

| Garde-fou | Implémentation |
|---|---|
| RBAC vérifié en couche application | `AuthGuard` existant (001) + nouveau `RoleGuard` qui vérifie `role === 'admin'` pour reset MFA admin |
| AuthN approprié (MFA conseiller) | TOTP obligatoire (US1), step-up sur actions sensibles (US2), reset par admin (US4), self-service device (US6) |
| Validation Zod côté serveur | Schémas dans `packages/mfa/src/schemas.ts` partagés par `apps/api` (contrôleurs) ET `apps/web` (Server Actions). Aucune entrée non validée. |
| En-têtes HTTP en place | Hérités de 001 (HSTS, CSP, X-Frame-Options, etc.). Pas de changement. |
| Aucun secret en clair | Secret TOTP **chiffré AES-256-GCM** (FR-038) ; backup codes **hashés bcrypt** (FR-039) ; tests linter custom `tools/check-mfa-secrets-not-leaked.ts` qui grep dans `logs/*.log` les chaînes `/[A-Z2-7]{32}/` (Base32 RFC 4648 exactement 32 chars = 160 bits, signature du secret TOTP) avec allowlist hex SHA-256 / JWT base64url |
| Résidence mémoire secret après déchiffrement | **Limitation acceptée** (P1-5 review) : Node.js ne permet pas de zero-out les strings immutables ; le secret TOTP traîne en RAM jusqu'au GC. Mitigation : déchiffrement uniquement dans le scope d'un use case, scope étroit, pas de log du secret. Documenté dans ADR-0010. Refacto future possible via `Buffer.fill(0)` si on accepte la friction otplib. |
| CSRF | Cookie `__Host-cv.session.token` en `SameSite=Strict` (P1-6 review — durcissement par rapport à `Lax`). Server Actions Next.js 15 ont du CSRF natif (Origin check). Aucun endpoint `/api/mfa/*` n'accepte de POST sans cookie strict + origine valide. |
| Aucun SQL brut | Tout passe par Prisma ; les triggers append-only sont des DDL Prisma standard |
| Rate limiting | Compteur Redis (BullMQ infra de 001) ou compteur DB simple selon décision research R3 |
| Session invalidation | `PrismaActiveSessionRevoker.revokeAllForUser(userId)` lors de reset/device change (FR-024a, FR-015b) |
| OWASP Top 10 sur endpoints MFA | Audit explicite documenté ci-dessous |

**Audit OWASP Top 10 sur endpoints `/mfa/*`** :
- A01 Broken Access Control : `AuthGuard` + `RoleGuard` ; tests intégration
- A02 Cryptographic Failures : AES-256-GCM (auth tag obligatoire), bcrypt
  cost ≥ 12, pas de SHA-1 nulle part, KEK en Secrets Manager
- A03 Injection : Zod everywhere, Prisma everywhere, pas de template
  string SQL
- A04 Insecure Design : modal step-up bloquant + audit log immuable +
  notification courriel échec session-kill
- A05 Security Misconfiguration : `mfaVerifiedAt` initialisé à `null` par
  défaut, Auth.js v5 secure cookies en prod
- A07 Identification & Auth Failures : c'est précisément l'objet de la
  feature
- A09 Security Logging Failures : tous les événements MFA (succès **et**
  échecs) en append-only via triggers Postgres

### X. Fiabilité et résilience — ✅ Conforme

- SLO endpoints MFA p95 < 800 ms (mesuré : validation TOTP < 50 ms,
  Prisma roundtrip < 10 ms, total < 200 ms aisément)
- **Idempotence** :
  - `POST /api/mfa/enroll/confirm` idempotent via `enrollmentRequestId`
    inclus dans le payload (UUID généré côté web au démarrage du flow,
    réutilisé sur retry). Contrainte UNIQUE en BD sur cet ID.
  - `POST /api/mfa/admin/reset` idempotent via `Idempotency-Key` HTTP
    header (pattern 001).
  - `POST /api/mfa/regenerate-backup-codes` idempotent même approche.
- Modes dégradés :
  - **Mailer HS** (AWS SES indisponible) : le flow d'enrôlement réussit
    quand même (l'utilisateur a déjà ses codes affichés) ; les
    notifications de sécurité (FR-020a, FR-026, FR-015e) sont enqueueées
    en BullMQ avec retry exponentiel + DLQ. Audit log enregistre quand
    même l'événement.
  - **Redis HS** (si choisi pour rate limiting) : fallback compteur DB
    Postgres (perf dégradée ~+20 ms par tentative, mais fonctionnel).
  - **Secrets Manager HS** : impossible de déchiffrer le secret TOTP →
    l'utilisateur reçoit une erreur explicite « Authentification MFA
    indisponible, contactez le support ». Pas de bypass MFA. Aligné avec
    Principe IX qui refuse tout mode dégradé qui contourne la sécurité.
- Health check `GET /api/mfa/health` : ping crypto + Prisma + (Redis si
  utilisé) ; intégré à la sonde ECS existante

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE) — ✅ Conforme

- Écran d'enrôlement : navigation clavier intégrale (Tab, Shift+Tab,
  Enter, Esc), QR code accompagné du secret texte copiable (FR-034),
  attribut `aria-describedby` sur le champ TOTP qui explique « code à 6
  chiffres affiché par votre application TOTP »
- Codes de récupération : bloc `<pre><code>` avec rôle `region` +
  `aria-label="Vos codes de récupération à conserver en lieu sûr"`,
  contraste ≥ 7:1 (FR-035)
- Modal step-up : composant `<Dialog>` Radix UI (shadcn/ui) — focus
  piégé, `aria-labelledby`, `aria-modal="true"`, restauration focus au
  déclencheur à la fermeture (FR-036)
- axe-core CI bloquant sur toutes les pages MFA (Lighthouse CI a11y ≥ 95)
- Tests Playwright avec `@axe-core/playwright` pour chaque écran

### XII. Optimisation SEO (NON-NÉGOCIABLE) — ✅ N/A non bloquant

Les pages `/mfa/*` sont **derrière l'authentification** (noindex
obligatoire). Pas d'impact SEO direct. Les méta-tags
`<meta name="robots" content="noindex, nofollow">` sont posées côté
`apps/web/src/app/(auth)/mfa/layout.tsx`. Pas de schema.org JSON-LD
(pages privées). Conformément à 001 et 004 qui ont déjà cette
infrastructure.

### Definition of Done

À cocher intégralement avant merge — checklist constitution v2.2.0 :

- [ ] Tests unitaires `packages/mfa/*` ≥ 95 % couverture (Principe VI)
- [ ] Tests intégration `apps/api/test/integration/identite/mfa/*.test.ts`
  passent (Testcontainers Postgres)
- [ ] Tests e2e Playwright sur 4 flows : enrôlement, step-up, reset
  admin, device change
- [ ] axe-core sans violation sérieuse/critique (CI bloquant)
- [ ] Lighthouse CI : Perf ≥ 90, A11y ≥ 95 (pages MFA noindex donc SEO
  non scoré)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` verts
- [ ] Métriques observabilité publiées (`cv_active_admins_total`,
  `cv_mfa_*_failures_total`)
- [ ] Audit OWASP Top 10 documenté dans le PR (section ci-dessus)
- [ ] Migration Prisma testée en staging avec rollback documenté
- [ ] ADR-0010 (chiffrement secret TOTP) et ADR-0011 (validation TOTP
  bibliothèque) créés
- [ ] Documentation FR-CA : README module + runbook ops « ≥ 2 admins
  actifs » + runbook infra « break-glass DB admin verrouillé »
- [ ] Roadmap mise à jour : 002a → ✅

---

## Structure du projet

### Documentation (cette feature)

```text
specs/005-mfa-conseiller/
├── plan.md              # Ce fichier
├── research.md          # Décisions techniques (Phase 0)
├── data-model.md        # Modèle de données (Phase 1)
├── quickstart.md        # Démarrage local développeur
├── contracts/           # Contrats d'interface
│   ├── totp-validator.port.md
│   ├── mfa-encrypter.port.md
│   ├── backup-code-hasher.port.md
│   ├── http-endpoints.md
│   ├── server-actions.md
│   └── events.md
├── checklists/
│   └── requirements.md  # Validation spec (déjà cochée)
└── tasks.md             # Découpage en tâches (Phase 2 — pas créé par /speckit-plan)
```

### Code source (racine du dépôt)

```text
packages/mfa/                                       # NOUVEAU package pur
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── src/
    ├── index.ts
    ├── totp.ts                                     # TOTP RFC 6238 wrapper otplib
    ├── backup-codes.ts                             # Génération + format
    ├── encryption.ts                               # AES-256-GCM helpers
    ├── freshness.ts                                # Calcul fenêtre 30 min
    ├── schemas.ts                                  # Zod schemas partagés
    ├── errors.ts                                   # Erreurs typées du domaine
    └── __tests__/
        ├── totp.test.ts
        ├── backup-codes.test.ts
        ├── encryption.test.ts
        ├── freshness.test.ts
        └── schemas.test.ts

packages/db/prisma/schema/
├── auth.prisma                                     # Existant (001) — inchangé
├── base.prisma                                     # Existant
├── conformite.prisma                               # Existant
└── mfa.prisma                                      # NOUVEAU

packages/db/prisma/migrations/
├── 20260526000000_init_mfa/migration.sql           # NOUVEAU
└── 20260526000001_init_mfa_immutability/migration.sql  # NOUVEAU (triggers append-only)

apps/api/src/modules/identite/
├── identite.module.ts                              # MODIFIÉ : enregistrer les nouveaux providers
├── domain/
│   ├── entities/
│   │   ├── mfa-secret.entity.ts                    # NOUVEAU
│   │   ├── backup-code-batch.entity.ts             # NOUVEAU
│   │   └── mfa-audit-event.entity.ts               # NOUVEAU
│   └── value-objects/
│       ├── encrypted-totp-secret.vo.ts             # NOUVEAU
│       ├── backup-code-hash.vo.ts                  # NOUVEAU
│       └── mfa-event-type.vo.ts                    # NOUVEAU
├── application/
│   ├── ports/
│   │   ├── mfa-secret-repository.port.ts           # NOUVEAU
│   │   ├── backup-code-repository.port.ts          # NOUVEAU
│   │   ├── mfa-audit-writer.port.ts                # NOUVEAU
│   │   ├── totp-secret-encrypter.port.ts           # NOUVEAU
│   │   ├── backup-code-hasher.port.ts              # NOUVEAU
│   │   ├── totp-validator.port.ts                  # NOUVEAU
│   │   ├── mfa-notification-mailer.port.ts         # NOUVEAU
│   │   └── active-session-revoker.port.ts          # NOUVEAU
│   └── use-cases/
│       ├── enroll-totp.use-case.ts                 # NOUVEAU
│       ├── verify-totp.use-case.ts                 # NOUVEAU
│       ├── verify-backup-code.use-case.ts          # NOUVEAU
│       ├── step-up.use-case.ts                     # NOUVEAU
│       ├── reset-mfa-admin.use-case.ts             # NOUVEAU
│       ├── change-device.use-case.ts               # NOUVEAU
│       └── regenerate-backup-codes.use-case.ts     # NOUVEAU
├── infrastructure/
│   ├── prisma-mfa-secret-repository.ts             # NOUVEAU
│   ├── prisma-backup-code-repository.ts            # NOUVEAU
│   ├── prisma-mfa-audit-writer.ts                  # NOUVEAU
│   ├── prisma-active-session-revoker.ts            # NOUVEAU
│   ├── node-crypto-totp-secret-encrypter.ts        # NOUVEAU
│   ├── bcrypt-backup-code-hasher.ts                # NOUVEAU
│   ├── otplib-totp-validator.ts                    # NOUVEAU
│   ├── ses-mfa-notification-mailer.ts              # NOUVEAU (stub MVP, vrai SES via 003)
│   └── mfa-rate-limiter.ts                         # NOUVEAU (Redis ou Postgres selon R3)
└── interface/
    ├── mfa-enrollment.controller.ts                # NOUVEAU
    ├── mfa-verification.controller.ts              # NOUVEAU
    ├── mfa-step-up.controller.ts                   # NOUVEAU
    ├── mfa-admin-reset.controller.ts               # NOUVEAU
    ├── mfa-device-change.controller.ts             # NOUVEAU
    ├── mfa-backup-codes.controller.ts              # NOUVEAU
    ├── role.guard.ts                               # NOUVEAU (vérifie role === 'admin')
    └── step-up.guard.ts                            # NOUVEAU (vérifie « MFA frais »)

apps/api/test/
├── unit/identite/                                  # NOUVEAU sous-dossier
│   └── *.spec.ts                                   # tests use cases avec fakes
└── integration/identite/mfa/                       # NOUVEAU
    ├── mfa-secret-repository.test.ts
    ├── mfa-audit-immutability.test.ts
    ├── enroll-flow.test.ts
    ├── step-up-flow.test.ts
    ├── reset-admin-flow.test.ts
    └── device-change-flow.test.ts

apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── mfa/
│   │   │   ├── enroll/page.tsx                     # NOUVEAU
│   │   │   ├── verify/page.tsx                     # NOUVEAU
│   │   │   ├── step-up/page.tsx                    # NOUVEAU (fallback si modal échoue)
│   │   │   ├── recovery/page.tsx                   # NOUVEAU (saisie backup code)
│   │   │   └── layout.tsx                          # NOUVEAU (noindex)
│   │   ├── (private)/
│   │   │   └── parametres/mfa/
│   │   │       ├── page.tsx                        # NOUVEAU (paramètres MFA)
│   │   │       ├── change-device/page.tsx          # NOUVEAU
│   │   │       └── regenerate-codes/page.tsx       # NOUVEAU
│   │   └── admin/
│   │       └── users/[id]/reset-mfa/page.tsx       # NOUVEAU
├── components/mfa/
│   ├── EnrollForm.tsx                              # NOUVEAU (RSC + Client pour QR)
│   ├── BackupCodesDisplay.tsx                      # NOUVEAU
│   ├── StepUpModal.tsx                             # NOUVEAU (Client, Radix Dialog)
│   ├── TotpInput.tsx                               # NOUVEAU (input 6 chiffres focus-trap)
│   └── DeviceChangeForm.tsx                        # NOUVEAU
├── lib/mfa/
│   ├── server-actions.ts                           # NOUVEAU
│   └── stepup-client.ts                            # NOUVEAU (helper côté Client modal)
├── middleware.ts                                   # MODIFIÉ : ajouter mfaEnrollmentGuard
└── messages/
    ├── fr-CA.json                                  # MODIFIÉ (nouvelles clés mfa.*)
    └── en.json                                     # MODIFIÉ (placeholders)

apps/web/test/
├── a11y/mfa.spec.ts                                # NOUVEAU
└── e2e/mfa.spec.ts                                 # NOUVEAU

docs/adr/
├── 0010-chiffrement-secret-totp-aes-gcm.md         # NOUVEAU
└── 0011-validation-totp-otplib.md                  # NOUVEAU

docs/runbooks/
├── mfa-2-admins-actifs.md                          # NOUVEAU (politique ops)
└── mfa-break-glass-db.md                           # NOUVEAU (dernier recours)
```

**Décision de structure** : extension du module `identite/` existant
(livré par 001), aucune nouvelle frontière de module. Le nouveau package
TS pur `packages/mfa/` isole la logique métier testable indépendamment
(Principe VI). La structure miroir avec 001/004 maximise la lisibilité.

---

## Suivi de complexité

Aucune dérogation à la constitution. Le tableau de complexité reste vide.

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée car |
|---|---|---|
| _(aucune)_ | _(aucune)_ | _(aucune)_ |

---

## Phases

### Phase 0 — Recherche

Décisions techniques résolues dans [research.md](research.md) :
- R1 : bibliothèque TOTP (otplib vs @auth/core natif vs implémentation
  manuelle)
- R2 : algorithme de chiffrement secret TOTP (AES-256-GCM Node crypto vs
  libsodium)
- R3 : rate limiting (Redis BullMQ infra vs compteur Postgres dédié)
- R4 : génération QR code (qrcode lib server-side vs lib client-side)
- R5 : hashing backup codes (bcrypt vs argon2id)
- R6 : intégration Auth.js v5 MFA (callback vs middleware vs custom
  credentials provider)
- R7 : invalidation de toutes les sessions (DELETE direct vs flag DB vs
  JWT versioning)
- R8 : audit append-only (triggers Postgres comme 004 vs application-level)
- R9 : architecture du modal step-up (Server Component + Client Component
  avec fetch vs Server Action vs Modal route Next.js)
- R10 : politique compteur admins actifs (job cron vs vue matérialisée vs
  requête à la volée + cache)

### Phase 1 — Design

Artefacts produits :
- [data-model.md](data-model.md) — entités, relations, contraintes,
  triggers d'immutabilité
- [contracts/](contracts/) — 6 contrats d'interface
- [quickstart.md](quickstart.md) — démarrage local développeur

---

## Re-vérification de la constitution post-design

Après écriture de `data-model.md` et `contracts/`, je revérifie chaque
NON-NÉGOCIABLE :

- **Principe I** : aucune frontière transactionnelle touchée. Toujours ✅.
- **Principe II** : `mfa_secrets.encrypted_secret` chiffré (FR-038),
  `mfa_backup_codes.code_hash` hashé (FR-039), `mfa_audit_events.actor_ip`
  abrégé (cohérent ADR-0008). Cascade Loi 25 documentée. ✅.
- **Principe VI** : tous les use cases ont leurs tests d'intégration
  spécifiés ; toutes les fonctions pures du package `mfa/` ont leurs
  contrats Zod testables. ✅.
- **Principe IX** : OWASP audit explicite, RBAC `RoleGuard`,
  `StepUpGuard`, audit log append-only via triggers Postgres comme 004.
  ✅.
- **Principe XI** : composants Radix UI + `@axe-core/playwright` testés.
  ✅.
- **Principe XII** : pages noindex (privées). N/A non bloquant. ✅.

Aucun renoncement nécessaire. Le plan tient sans dérogation à la
constitution v2.2.0.

---

## Corrections post-revue (2026-05-25)

Revue d'ingénierie du plan initial menée juste après la Phase 1. Les
corrections suivantes ont été intégrées dans le plan, le data-model et
les contrats avant l'étape `/speckit.tasks` :

### P0 — Corrections bloquantes appliquées

| # | Sujet | Correction |
|---|---|---|
| **P0-1** | Idempotence impossible de `/enroll/start` (codes clairs non re-fabricables après hash bcrypt) | Bascule en **sémantique supersede** : chaque appel invalide les `MfaSecret` pendants existants. L'UX `apps/web` affiche un confirm dialog si un secret pendant existe (`?dryRun=true` → `409 PENDING_ENROLLMENT_EXISTS`). Documenté dans `data-model.md` § règles métier `MfaSecret` et `http-endpoints.md` § `/enroll/start`. |
| **P0-2** | Race condition sur incrément du compteur de rate limit | Pattern atomique en une seule requête `INSERT … ON CONFLICT DO UPDATE`. Documenté dans `data-model.md` § Concurrence n°1. |
| **P0-3** | Incohérence spec ↔ data-model : step-up bucket scope user au lieu de session | Ajout colonne `sessionId String?` dans `mfa_rate_limit_buckets` + index uniques partiels selon `sessionId IS NULL` / `IS NOT NULL`. Suppression des buckets `stepup_totp` orphelins lors d'un DELETE de session. |
| **P0-4** | `@unique` sur `MfaSecret.userId` empêchait un enrôlement après abandon | Suppression du `@unique`, remplacé par un **index partiel Postgres** `WHERE enabledAt IS NOT NULL`. Plusieurs secrets pendants tolérés transitoirement, un seul actif. |
| **P0-5** | Consommation non-atomique d'un backup code permet double consommation théorique | Pattern UPDATE conditionnel `WHERE id = ? AND usedAt IS NULL RETURNING id`, vérifier `rowCount === 1`. Test d'intégration `backup-code-concurrency.test.ts` ajouté à la liste DoD. Documenté dans `data-model.md` § Concurrence n°2 et `http-endpoints.md` § `/verify-backup-code`. |

### P1 — Corrections importantes appliquées

| # | Sujet | Correction |
|---|---|---|
| **P1-1** | `/enroll/start` sans rate limit (DoS possible) | Ajout `MfaRateLimitKind.enroll_start` : 10 starts max/heure/user. |
| **P1-2** | `Idempotency-Key` admin/reset sans binding payload | Stockage `(key, sha256(payload))` côté serveur, conflit `409 IDEMPOTENCY_KEY_CONFLICT` si même clé avec payload différent. |
| **P1-3** | Spec `MfaNotificationMailerPort` sous-définie | Templates `react-email` dans `packages/email-templates/mfa/`. Stub MVP : table `mfa_outbox_emails` + BullMQ retry. Vrai SES via 003. |
| **P1-4** | `/api/mfa/me` chicken-and-egg (step-up requis pour voir si step-up est utile) | Split en `/me/summary` (sans step-up, `{enabled, enrolledAt}`) et `/me/details` (avec step-up, compteurs précis + batchId). Aligné côté Server Actions. |
| **P1-5** | Secret TOTP résident en mémoire process après déchiffrement | Limitation acceptée, documentée. Mitigation : scope étroit + ADR-0010 mentionne. |
| **P1-6** | CSRF sur `/api/mfa/*` | Cookie `__Host-cv.session.token` en `SameSite=Strict` (durcissement par rapport à `Lax`). |
| **P1-7** | Migration immutability sans wrapper shadow DB | `DO $$ BEGIN ... END $$` + `EXECUTE format(…)` autour des `REVOKE`. |

### P2 — Reportées en sous-tâches

Les points P2 (linter restreint à `logs/`, load test k6, ADR drafts en
phase 0 tasks, runbooks squelettes, métriques Prometheus endpoint
exposé, invalidation cache compteur admins) sont traités comme
sous-tâches explicites dans `tasks.md` à venir.
