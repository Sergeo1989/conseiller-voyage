# `@cv/api` — Backend NestJS

API REST consommée par les Server Actions Next.js (`apps/web`). Validation
session Auth.js v5 via cookie partagé (ADR-0004), Fastify, Prisma 5,
PostgreSQL 16 `ca-central-1`.

## Modules

| Module | Responsable de | Livré par |
|---|---|---|
| `conformite` | Vérification CCV/TICO, machine d'état conseiller, dossiers, journal d'audit append-only | Feature 001 |
| `identite` | Sessions, MFA (TOTP, backup codes, step-up, reset admin, device change) | Feature 005 |
| _(à venir)_ | Auth conseiller + admin avec mot de passe + magic-link voyageur | Feature 002 |

## Module identité — MFA (Feature 005)

### Endpoints exposés

| Méthode | Route | Description | Phase |
|---|---|---|---|
| POST | `/api/mfa/enroll/start` | Démarrer un flow d'enrôlement TOTP (10/h rate limit) | 3 / US1 |
| POST | `/api/mfa/enroll/confirm` | Confirmer le 1er code TOTP, activer le secret | 3 / US1 |
| POST | `/api/mfa/verify` | Vérifier TOTP au login post-mot-de-passe (5 échecs → lockout 15min) | 5 / US3 |
| POST | `/api/mfa/verify-backup-code` | Connexion par code de récupération + consumeAtomic | 5 / US3 |
| POST | `/api/mfa/step-up` | Step-up TOTP intra-session (FR-016, 3 échecs → session kill) | 4 / US2 |
| GET | `/api/mfa/session-freshness` | Check si la session est MFA-frais (sans step-up) | 4 / US2 |
| POST | `/api/mfa/admin/reset` | Reset MFA d'un user cible (admin seul, justification ≥ 20 chars) | 6 / US4 |
| GET | `/api/admin/active-admins-count` | Compteur d'admins actifs (cache 60s) | 6 / US4 |
| POST | `/api/mfa/change-device/start` | Auto-service changement de device (mdp + 2e facteur) | 8 / US6 |
| POST | `/api/mfa/regenerate-backup-codes` | Régénération atomique des 10 codes (step-up requis) | 8 / US6 |

### Variables d'environnement requises (MFA)

| Variable | Description | Source en prod |
|---|---|---|
| `MFA_KEK_BASE64` | Clé de chiffrement AES-256-GCM du secret TOTP, 32 octets base64 | AWS Secrets Manager `cv-mfa-kek` (ADR-0010) |
| `DATABASE_URL` | Connection string Postgres `ca-central-1` (déjà en place) | AWS Secrets Manager |
| `REDIS_URL` | URL Redis BullMQ (déjà en place pour 001) | AWS ElastiCache |

Voir `apps/api/.env.example` pour la liste complète.

### Architecture

4 couches Clean Architecture (Principe VIII de la constitution v2.2.0) :

```text
identite/
├── domain/
│   ├── entities/           # MfaSecret, BackupCodeBatch, MfaAuditEvent
│   └── value-objects/      # EncryptedTotpSecret, BackupCodeHash, MfaEventType
├── application/
│   ├── ports/              # 10 interfaces (repos, encrypter, hasher, validator, mailer, rate limiter, password verifier)
│   └── use-cases/          # EnrollTotp, StepUp, VerifyTotp, VerifyBackupCode, ResetMfaAdmin, ChangeDevice, RegenerateBackupCodes, CountActiveAdmins
├── infrastructure/         # Adapteurs Prisma + Node crypto + bcrypt + otplib + SES stub
└── interface/              # 5 contrôleurs HTTP + AuthGuard + RoleGuard + StepUpGuard
```

### Sécurité (Principe IX NON-NÉGOCIABLE)

- **Chiffrement secret TOTP** : AES-256-GCM avec auth tag, IV aléatoire 96 bits, version byte pour rotation future. Cf. ADR-0010.
- **Hash backup codes** : bcrypt cost 12.
- **Audit append-only** : 3 triggers Postgres bloquent UPDATE/DELETE/TRUNCATE sur `mfa_audit_events`. IP source abrégée (IPv4 /24, IPv6 /48) cohérent ADR-0008.
- **Rate limiting atomique** : INSERT ... ON CONFLICT DO UPDATE (pas de race condition).
- **Sessions invalidées** sur reset admin + device change. Buckets stepup_totp orphelins nettoyés en cascade.
- **Step-up** : fenêtre 30 min après dernière validation TOTP. 3 échecs → session killed + courriel FR-020a.

### Tests

- **Unitaires pure** : `pnpm --filter @cv/mfa test` (60 tests, ≥ 95 % coverage Principe VI).
- **Intégration Testcontainers Postgres** : `pnpm --filter @cv/api test:integration` (55 tests dont 30+ pour MFA).
- **e2e Playwright** : `pnpm --filter @cv/web test:e2e` (squelettes — couverture comportementale via tests d'intégration backend).
- **a11y axe-core** : `pnpm --filter @cv/web test:a11y` (WCAG 2.1 AA bloquant — Principe XI).

### Observabilité

- Health checks : `GET /healthz` (liveness) et `GET /readyz` (readiness Postgres + Redis).
- Stub Mailer : les courriels MFA sont enqueués dans la table `mfa_outbox_emails`. Le worker SES sera branché par la feature 003.
- Métriques Prometheus (`cv_active_admins_total`, `cv_mfa_*_failures_total`) : à brancher en feature 021 (Observabilité centrale).

### Linter custom

`pnpm exec tsx tools/check-mfa-secrets-not-leaked.ts` — scanne les fichiers
de logs pour détecter une fuite potentielle de secret TOTP Base32. À
ajouter au pipeline CI quand les logs commencent à être archivés.

### Pour aller plus loin

- Spec : [`specs/005-mfa-conseiller/spec.md`](../../specs/005-mfa-conseiller/spec.md)
- Plan : [`specs/005-mfa-conseiller/plan.md`](../../specs/005-mfa-conseiller/plan.md)
- ADR-0010 : [`docs/adr/0010-chiffrement-secret-totp-aes-gcm.md`](../../docs/adr/0010-chiffrement-secret-totp-aes-gcm.md)
- ADR-0011 : [`docs/adr/0011-validation-totp-otplib.md`](../../docs/adr/0011-validation-totp-otplib.md)
- Runbook : [`docs/runbooks/mfa-2-admins-actifs.md`](../../docs/runbooks/mfa-2-admins-actifs.md)
- Runbook : [`docs/runbooks/mfa-break-glass-db.md`](../../docs/runbooks/mfa-break-glass-db.md)
