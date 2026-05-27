---
description: "Task list for feature 003 — notifications + courriel transactionnel"
---

# Tasks : Notifications et courriel transactionnel

**Input** : Design documents from `/specs/003-notifications-transactionnelles/`

**Prerequisites** : plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md (tous mergés au commit `168ac20` sur la
branche `003-notifications-transactionnelles`)

**Tests** : ✅ Tests inclus — Principe VI NON-NÉGOCIABLE de la constitution
exige TDD sur la logique métier sensible. Tests rouges AVANT
implémentation pour fonctions pures + use cases.

**Organization** : Tasks groupées par user story pour permettre
implémentation et test indépendants.

## Format : `[ID] [P?] [Story?] Description avec chemin de fichier`

- **[P]** : Peut tourner en parallèle (fichiers différents, pas de
  dépendance sur tâche incomplète)
- **[Story]** : User story rattachée (US1, US2, etc.)
- Tous les chemins absolus depuis la racine du repo

## Path Conventions

- Backend : `apps/api/src/modules/notifications/`
- Frontend : `apps/web/src/app/[locale]/admin/notifications/`
- Lambda : `apps/lambda-bounces-handler/`
- Templates : `packages/email-templates/src/<module>/`
- Shared : `packages/shared/src/notifications/`, `packages/shared/src/brand/`
- DB : `packages/db/prisma/schema/notifications.prisma` + migrations
- CDK : `infra/lib/notifications-stack.ts`
- Tools : `tools/check-module-boundaries.ts`

---

## Phase 1 : Setup (Infrastructure partagée)

**Purpose** : Initialisation de la structure + outillage CI

- [X] T001 Créer l'arborescence du module `apps/api/src/modules/notifications/` avec sous-dossiers `domain/{value-objects,entities,enums,pure-functions}/`, `application/{ports,use-cases}/`, `infrastructure/{jobs/}`, `interface/{public-api,http}/`
- [X] T002 Mettre à jour `tools/check-module-boundaries.ts` : ajouter `notifications: ['Notification', 'notification_', 'Suppression']` à `MODULE_PREFIXES` et ajouter les 7 symboles à `ALLOWED_CROSS_MODULE_SYMBOLS` (cf. plan.md Appendice D + research R14)
- [X] T003 [P] Créer `packages/shared/src/notifications/envelope.schema.ts` avec `NotificationEnvelopeSchema` Zod versionné (`schemaVersion: 1`) — cf. research R2
- [X] T004 [P] Créer `packages/shared/src/notifications/admin-actions.schema.ts` avec `RemoveFromSuppressionListSchema`, `RetryDeadLetterSchema`, `SuppressionListQuerySchema` — cf. data-model.md section 6
- [X] T005 [P] Créer `packages/shared/src/brand/brand-info.ts` avec constantes CASL (`BRAND_LEGAL_NAME`, `BRAND_POSTAL_ADDRESS`, `BRAND_CONTACT_URL`) — cf. plan.md Appendice C
- [X] T006 [P] Créer `apps/api/src/modules/notifications/README.md` (squelette FR-CA, sera complété en T100)

---

## Phase 2 : Foundational (prérequis bloquants — AUCUN US ne peut démarrer avant)

**Purpose** : Migrations DB, secrets, domaine pur testé, ports application

**⚠️ CRITIQUE** : aucun travail US ne commence avant complétion de cette phase

### Migrations Prisma

- [ ] T007 Créer `packages/db/prisma/schema/notifications.prisma` avec les 3 modèles (`NotificationLogEntry`, `SuppressionListEntry`, `NotificationAuditEntry`) + enums (`NotificationStatus`, `NotificationModule`, `SuppressionReason`, `SuppressionSource`, `NotificationAuditActorRole`) — cf. data-model.md sections 1-3
- [ ] T008 Générer la migration Prisma `pnpm --filter @cv/db prisma migrate dev --name notification_tables_initial` et vérifier le SQL généré
- [ ] T009 Créer la migration manuelle `notification_audit_block_modifications/migration.sql` avec triggers `BEFORE UPDATE/DELETE` (row-level) et `BEFORE TRUNCATE` (statement-level) — cf. data-model.md section 3 + pattern hérité 001
- [ ] T010 Créer la migration manuelle `notification_email_log_erasure_check/migration.sql` avec CHECK constraint `chk_erased_implies_null_pii_and_hash_kept` (élargie pour `recipientEmailHashHMAC IS NOT NULL` post-effacement — fix B-5)
- [ ] T011 Créer la migration expand `outbox_add_next_attempt_at/migration.sql` qui ajoute `next_attempt_at TIMESTAMPTZ NULL` à `auth_outbox_emails` ET `mfa_outbox_emails` + 2 index partiels — cf. outbox-source-contract.md section 4
- [ ] T012 Mettre à jour `packages/db/prisma/schema/auth-credentials.prisma` (ajout `nextAttemptAt` au modèle `AuthOutboxEmail`) et `mfa.prisma` (idem `MfaOutboxEmail`) — cohérent avec la migration T011

### Secrets et configuration

- [ ] T013 [P] Générer `NOTIFICATIONS_EMAIL_HASH_PEPPER` (`openssl rand -base64 32`) et le poser en dev via 1Password CLI (`op://Conseiller Voyage Dev/notifications-pepper`) — cf. research R6
- [ ] T014 [P] Générer `NOTIFICATIONS_SNS_HMAC_SECRET` (`openssl rand -base64 32`) et le poser en dev via 1Password CLI — cf. research R5
- [ ] T015 [P] Documenter dans `docs/runbooks/secrets-management.md` (ou existant) la procédure de provisioning prod via AWS Secrets Manager `ca-central-1`
- [ ] T016 Étendre `apps/api/src/common/logger.module.ts` (Pino) avec `redact.paths` listant les 12 chemins d'emails (cf. research R15)
- [ ] T017 [P] Créer `packages/shared/src/notifications/__tests__/pino-redaction.test.ts` qui sérialise objets avec emails et vérifie absence de PII en clair (RED → impl T016 GREEN)

### Domaine pur (TDD obligatoire — Principe VI)

- [ ] T018 [P] Tests Vitest `apps/api/src/modules/notifications/domain/pure-functions/__tests__/canonicalize-email.test.ts` (cas Gmail `+` et `.` stripping, autres domaines lowercase only, edge cases) — RED first
- [ ] T019 [P] Tests Vitest `__tests__/hash-recipient-email.test.ts` (HMAC peppered, déterministe, multi-pepper fallback) — RED first
- [ ] T020 [P] Tests Vitest `__tests__/compute-backoff.test.ts` (delays `[1m, 5m, 30m, 4h, 24h]`, throw au-delà 5 attempts) — RED first
- [ ] T021 [P] Tests Vitest `__tests__/should-suppress.test.ts` (entry permanente bloque, soft bounce expiré ne bloque pas, `removedAt` ne bloque pas) — RED first
- [ ] T022 [P] Tests Vitest `__tests__/compute-circuit-state.test.ts` (5 échecs/60s → open, 30s → half-open, succès → closed) — RED first
- [ ] T023 [P] Tests Vitest `__tests__/priority-for-event-type.test.ts` (auth.email_verification → 1, conformite.expiration_reminder → 10) — RED first
- [ ] T024 [P] Implémenter `apps/api/src/modules/notifications/domain/pure-functions/canonicalize-email.ts` — GREEN T018
- [ ] T025 [P] Implémenter `hash-recipient-email.ts` (avec multi-pepper fallback cf. R6) — GREEN T019
- [ ] T026 [P] Implémenter `compute-backoff.ts` — GREEN T020
- [ ] T027 [P] Implémenter `should-suppress.ts` — GREEN T021
- [ ] T028 [P] Implémenter `compute-circuit-state.ts` — GREEN T022
- [ ] T029 [P] Implémenter `priority-for-event-type.ts` — GREEN T023

### Value Objects, Entities, Enums

- [ ] T030 [P] Créer `domain/value-objects/email-address.vo.ts` (validation Zod, immutable)
- [ ] T031 [P] Créer `domain/value-objects/email-locale.vo.ts` (`'fr-CA' | 'en'`)
- [ ] T032 [P] Créer `domain/value-objects/email-template-id.vo.ts` (format `<module>.<template-name>`)
- [ ] T033 [P] Créer `domain/entities/notification-envelope.entity.ts` (from `NotificationEnvelopeSchema`)
- [ ] T034 [P] Créer `domain/entities/notification-log-entry.entity.ts`
- [ ] T035 [P] Créer `domain/entities/suppression-list-entry.entity.ts`
- [ ] T036 [P] Créer `domain/enums/notification-status.enum.ts` (mappé à l'enum Prisma)
- [ ] T037 [P] Créer `domain/enums/suppression-reason.enum.ts`

### Ports application (interfaces uniquement)

- [ ] T038 [P] Créer `application/ports/email-sender.port.ts` avec `EmailSender` interface + symbole DI `EMAIL_SENDER`
- [ ] T039 [P] Créer `application/ports/suppression-list-reader.port.ts` (Principe ISP — séparé du writer)
- [ ] T040 [P] Créer `application/ports/suppression-list-writer.port.ts`
- [ ] T041 [P] Créer `application/ports/notification-log-reader.port.ts`
- [ ] T042 [P] Créer `application/ports/notification-log-writer.port.ts`
- [ ] T043 [P] Créer `application/ports/notification-audit-log-writer.port.ts`
- [ ] T044 [P] Créer `application/ports/email-template-renderer.port.ts`

**Checkpoint** : Foundation prête — les US peuvent démarrer en parallèle

---

## Phase 3 : US1 — Premier courriel transactionnel délivré bout en bout (Priority : P1) 🎯 MVP

**Goal** : Inscription conseiller → courriel verify-email reçu en < 2 min, lien fonctionnel, compte vérifié

**Independent Test** : Scénario 2 quickstart.md — signup `test+nouveau@example.com` → MailHog reçoit le courriel → clic lien → compte verified

### Tests US1 (RED first — Principe VI)

- [ ] T045 [P] [US1] Test Vitest `application/use-cases/__tests__/send-notification.use-case.test.ts` (envelope valide → enqueue, envelope dupliquée → no-op, envelope suppressed → skipped) — RED first
- [ ] T046 [P] [US1] Test Testcontainers `apps/api/test/integration/notifications/signup-flow.integration.spec.ts` couvrant flux POST `/api/auth/signup` → row outbox → worker drain → SES (LocalStack) → MailHog reçu

### Implémentation use case `SendNotificationUseCase`

- [ ] T047 [US1] Implémenter `application/use-cases/send-notification.use-case.ts` (validation Zod envelope, vérification suppression list via port, insert `notification_email_log` avec idempotence sur `correlationId`, enqueue BullMQ avec priority via `priorityForEventType`) — GREEN T045

### Adapters infrastructure US1

- [ ] T048 [US1] Implémenter `infrastructure/ses-email-sender.ts` avec `@aws-sdk/client-sesv2`, Configuration Set `notifications-prod`/`-staging`, **propagation `correlationId` comme SES Outbound Idempotency Token** (cf. research R17), **headers `List-Unsubscribe` et `List-Unsubscribe-Post: One-Click`** (FR-010-b), circuit breaker custom utilisant `computeCircuitState`
- [ ] T049 [US1] Implémenter `infrastructure/prisma-notification-log.ts` (CRUD + idempotence insert via try-catch P2002)
- [ ] T050 [US1] Implémenter `infrastructure/prisma-suppression-list.ts` (lookup par hash, upsert avec gestion expiresAt)
- [ ] T051 [US1] Implémenter `infrastructure/prisma-notification-audit-log-writer.ts` (insert append-only, hérite pattern 001)
- [ ] T052 [US1] Implémenter `infrastructure/react-email-renderer.ts` utilisant `@react-email/render.renderAsync()` runtime — cf. research R3

### Worker BullMQ + Facade publique

- [ ] T053 [US1] Implémenter `infrastructure/jobs/notification-dispatch.worker.ts` (BullMQ worker consumant la file `notifications-dispatch`, lock ré-entrant, retry exponentiel, dead-letter après 5 attempts, propagation OTel span context)
- [ ] T054 [US1] Implémenter `interface/public-api/notification.port.ts` avec class `NotificationPortImpl implements NotificationPort` (méthode `send(envelope): Promise<SendResult>`) — cf. contracts/notification.port.md
- [ ] T055 [US1] Créer `interface/notifications.module.ts` (NestJS Module avec DI wiring : ports → adapters, expose `NotificationPort` en `exports`)

### Wiring module source — Conformité (001)

- [ ] T056 [US1] Audit J1 — grep `prisma.outboxEntry.create` dans `apps/api/src/modules/conformite/` et lister tous les `eventType` réels publiés (compléter plan.md Appendice A avec la liste finale)
- [ ] T057 [US1] Créer `apps/api/src/modules/conformite/infrastructure/jobs/conformite-template-mapper.ts` (fonction pure `mapConformiteEventToTemplateId(eventType): string` couvrant tous les `eventType` audités)
- [ ] T058 [US1] Modifier `apps/api/src/modules/conformite/infrastructure/jobs/outbox-publisher.job.ts` : remplacer l'appel `RedisConformiteEventPublisher.publish()` par `NotificationPort.send()` avec mapping envelope (cf. outbox-source-contract.md section 2.1)
- [ ] T059 [US1] Mettre à jour `apps/api/src/modules/conformite/interface/conformite.module.ts` pour injecter `NotificationPort` (import depuis `notifications/interface/public-api/notification.port.ts`) — vérifier que `check-module-boundaries.ts` passe avec T002 appliqué
- [ ] T060 [US1] Auditer les use cases conformité qui posent en outbox (ApproveDossier, RefuseDossier, etc.) pour garantir que `payload.recipientEmail` est toujours rempli ; ajouter si manquant

### Wiring module source — Auth (002)

- [ ] T061 [US1] Créer `apps/api/src/modules/identite/infrastructure/jobs/auth-template-mapper.ts` (mapping `AuthEmailTemplate` enum → `templateId`)
- [ ] T062 [US1] Créer `apps/api/src/modules/identite/infrastructure/jobs/auth-outbox-dispatch.worker.ts` (scanner `auth_outbox_emails` avec `sentAt IS NULL` + `nextAttemptAt`, mapping envelope avec lookup `AuthUser.preferredLocale` via FK, appel `NotificationPort.send()`) — cf. outbox-source-contract.md section 2.2
- [ ] T063 [US1] Modifier `apps/api/src/modules/identite/identite.module.ts` pour enregistrer `AuthOutboxDispatchWorker` + `setInterval` 5s/30s (prod/dev) dans `onModuleInit`

### Validation US1

- [ ] T064 [P] [US1] Exécuter Scénario 2 quickstart.md en dev local : signup → vérification courriel reçu MailHog → clic lien → compte verified
- [ ] T065 [P] [US1] Exécuter Scénario 3 quickstart.md (idempotence) : forcer un échec transient SES, vérifier qu'un seul email part au retry

**Checkpoint** : À ce stade, US1 est fonctionnel et testable indépendamment. MVP livrable.

---

## Phase 4 : US2 — Couverture complète des templates J1 (Priority : P1)

**Goal** : Les 16+ `eventType` posés par 001/002/002a produisent tous un courriel rendu correctement en FR-CA / EN

**Independent Test** : Scénario quickstart 9 (E2E sur chaque type de courriel) — déclencher chaque action métier et vérifier le rendu

### Consolidation des templates

- [ ] T066 [US2] Migration git `git mv packages/shared/src/email/templates/conformite/* packages/email-templates/src/conformite/` + adapter les imports React (`react-email`)
- [ ] T067 [US2] Mettre à jour `packages/email-templates/src/index.ts` pour exporter le namespace `conformite/`
- [ ] T068 [US2] Mettre à jour les imports dans `apps/api/src/modules/conformite/` qui pointaient vers `@cv/shared/email/templates/conformite/`
- [ ] T069 [US2] Supprimer `packages/shared/src/email/templates/conformite/` (dossier vide) + mettre à jour `packages/shared/src/email/templates/index.ts`

### Templates manquants J1 (3 minimum, plus si audit T056 en révèle d'autres)

- [ ] T070 [P] [US2] Créer `packages/email-templates/src/conformite/dossier-submitted.tsx` (accusé soumission, FR-CA + EN, preview text, mobile-first, dark mode safe)
- [ ] T071 [P] [US2] Créer `packages/email-templates/src/mfa/totp-activated.tsx` (confirmation post-setup TOTP réussi, FR-CA + EN)
- [ ] T072 [P] [US2] Créer `packages/email-templates/src/conformite/erasure-confirmed.tsx` (confirmation effacement Loi 25, FR-CA + EN, mention conservation 7 ans audit)
- [ ] T073 [US2] Créer templates additionnels si audit T056 / audit MFA / audit auth les exige (zéro `eventType` orphelin en prod)

### Module source — MFA (002a)

- [ ] T074 [US2] Créer `apps/api/src/modules/identite/infrastructure/jobs/mfa-template-mapper.ts` (mapping `MfaEmailTemplateKind` enum → `templateId`)
- [ ] T075 [US2] Créer `apps/api/src/modules/identite/infrastructure/jobs/mfa-outbox-dispatch.worker.ts` (scanner `mfa_outbox_emails`, lookup `AuthUser.email` ET `AuthUser.preferredLocale` via FK — cf. outbox-source-contract.md section 2.3)
- [ ] T076 [US2] Mettre à jour `apps/api/src/modules/identite/identite.module.ts` pour enregistrer `MfaOutboxDispatchWorker`

### Tests intégration couverture US2

- [ ] T077 [P] [US2] Test Testcontainers `apps/api/test/integration/notifications/template-coverage.integration.spec.ts` qui pour chaque `templateId` du catalogue : pose une entry outbox, attend le drain, vérifie présence dans MailHog avec sujet attendu en FR-CA
- [ ] T078 [P] [US2] Test snapshot Vitest `packages/email-templates/src/__tests__/templates-snapshot.test.ts` qui rend chaque template avec dataset fixe et vérifie le HTML/plain-text (anti-régression)
- [ ] T079 [P] [US2] Test `apps/api/test/integration/notifications/casl-content.integration.spec.ts` : pour chaque template, vérifier présence des 3 champs CASL (nom légal + adresse postale + contact) dans le body rendu

**Checkpoint** : Tous les events 001/002/002a sont délivrés en FR-CA / EN, headers CASL + List-Unsubscribe présents.

---

## Phase 5 : US3 — Suppression list via SES bounces/complaints (Priority : P2)

**Goal** : Lambda parse SNS events, alimente suppression list, bloque les envois futurs

**Independent Test** : Scénario 4 quickstart.md — POST SNS simulé bounce hard → suppression list peuplée → tentative envoi vers email → `skipped_suppressed`

### Lambda handler

- [ ] T080 [US3] Créer `apps/lambda-bounces-handler/package.json` (deps : `@aws-sdk/client-sns`, `aws-lambda`)
- [ ] T081 [US3] Créer `apps/lambda-bounces-handler/src/parse-sns-event.ts` (fonction pure de normalisation Bounce/Complaint/Delivery → `NormalizedSesEvent`) avec tests Vitest
- [ ] T082 [US3] Créer `apps/lambda-bounces-handler/src/handler.ts` (entry Lambda : parse → sign HMAC sur `timestamp.body` → POST signé vers `/api/internal/notifications/sns`)
- [ ] T083 [P] [US3] Tests Vitest `apps/lambda-bounces-handler/src/__tests__/parse-sns-event.test.ts` (fixtures bounce permanent/transient, complaint, delivery)

### Webhook NestJS

- [ ] T084 [US3] Créer `interface/http/sns-webhook.controller.ts` avec endpoint `POST /api/internal/notifications/sns` validé par `SnsForwardedEventSchema` (Zod discriminated union)
- [ ] T085 [US3] Créer `interface/http/sns-webhook.guard.ts` (`SnsWebhookGuard`) avec validation timestamp window ±5min + HMAC sur `timestamp.body` + `crypto.timingSafeEqual` — cf. contracts/sns-event-schema.md section 4 (fix I-1)
- [ ] T086 [P] [US3] Tests intégration `apps/api/test/integration/notifications/sns-webhook.integration.spec.ts` : signature valide accepted, signature invalide rejected 401, timestamp expiré rejected 401, replay même event idempotent (1 seule mutation)

### Use cases bounce/complaint/delivery

- [ ] T087 [P] [US3] Tests Vitest `application/use-cases/__tests__/record-bounce.use-case.test.ts` (Permanent → suppression permanent, Transient + < 3 soft → pas de suppression, Transient + > 3 soft sur 30j → suppression TTL 30j) — RED first
- [ ] T088 [P] [US3] Tests Vitest `__tests__/record-complaint.use-case.test.ts` (toujours suppression permanente)
- [ ] T089 [P] [US3] Tests Vitest `__tests__/record-delivery.use-case.test.ts` (update `deliveredAt`)
- [ ] T090 [US3] Implémenter `application/use-cases/record-bounce.use-case.ts` — GREEN T087
- [ ] T091 [US3] Implémenter `application/use-cases/record-complaint.use-case.ts` — GREEN T088
- [ ] T092 [US3] Implémenter `application/use-cases/record-delivery.use-case.ts` — GREEN T089

### CDK Infrastructure

- [ ] T093 [US3] Créer `infra/lib/notifications-stack.ts` (SNS topic `notifications-ses-events`, SES Configuration Set `notifications-prod`/`-staging`, Lambda `lambda-bounces-handler` subscription, IAM roles least-privilege, Route 53 enregistrement `notifications.conseiller-voyage.ca`, Secrets Manager pepper + HMAC) — cohérent ADR-0005
- [ ] T094 [P] [US3] Documenter dans `docs/runbooks/notifications-cdk-deploy.md` la procédure de déploiement de la stack

### Validation US3

- [ ] T095 [P] [US3] Créer `scripts/dev/simulate-sns-bounce.ts` (signe HMAC + POST local)
- [ ] T096 [P] [US3] Exécuter Scénario 4 quickstart.md : simuler bounce hard → vérifier suppression list peuplée + audit + second envoi `skipped_suppressed`

**Checkpoint** : Réputation SES protégée — bounce rate restera < 3 % en production.

---

## Phase 6 : US4 — Observabilité de la délivrabilité (Priority : P2)

**Goal** : Métriques OTel + dashboard Grafana + alerting Slack pour tous les seuils

**Independent Test** : Scénario 8 quickstart.md — forcer pic bounces / complaint / DLQ → alertes routées correctement dans `#ops-page` / `#ops-warn`

### Métriques OTel (cardinality bornée ≤ 2000 séries — cf. plan.md Appendice B)

- [ ] T097 [P] [US4] Instrumenter `notification_email_sent_total` counter (labels : `template_id`, `locale`, `source_module`) dans `SesEmailSender` au moment de `command.send()` accepté
- [ ] T098 [P] [US4] Instrumenter `notification_email_delivered_total` dans `RecordDeliveryUseCase`
- [ ] T099 [P] [US4] Instrumenter `notification_email_bounced_total` (label `bounce_type`) dans `RecordBounceUseCase`
- [ ] T100 [P] [US4] Instrumenter `notification_email_complained_total` dans `RecordComplaintUseCase`
- [ ] T101 [P] [US4] Instrumenter histogram `notification_email_send_duration_seconds` (mesure dépôt outbox → SES accepté) dans `SendNotificationUseCase`
- [ ] T102 [P] [US4] Instrumenter gauge `notification_email_dlq_size` rafraîchie chaque 30s par un job `DlqGaugeRefreshJob`

### Tracing distribué

- [ ] T103 [US4] Propager OTel span context depuis l'outbox source jusqu'à l'envoi SES (corrélation worker → BullMQ job → SES) via baggage carrier

### Dashboards et alerting

- [ ] T104 [US4] Créer `docs/dashboards/notifications.json` (Grafana panels : sent par template, taux délivrance / bounce / complaint, p95 send duration, DLQ size, suppression list growth)
- [ ] T105 [P] [US4] Configurer alerte Grafana `notification_bounce_rate_high` (> 5% / 1h) → webhook Slack `#ops-page` avec mention `@channel` — FR-018
- [ ] T106 [P] [US4] Configurer alerte `notification_complaint_rate_high` (> 0.1% / 24h) → `#ops-page` — FR-019
- [ ] T107 [P] [US4] Configurer alerte `notification_dlq_size_warn` (> 50) → `#ops-warn` silent — FR-020
- [ ] T108 [P] [US4] Configurer alerte `notification_provider_down_30min` (SES erreurs > 90% sur 30 min) → `#ops-page` — FR-021
- [ ] T109 [P] [US4] Configurer alerte `notification_sns_events_idle_15min` (gauge plate) → `#ops-page` — modes dégradés SNS HS

### Validation US4

- [ ] T110 [P] [US4] Créer `scripts/dev/simulate-bounce-storm.ts` (100 bounces SNS sur 60s) + `simulate-complaint.ts` + `saturate-dlq.ts`
- [ ] T111 [P] [US4] Exécuter Scénario 8 quickstart.md : vérifier toutes les alertes déclenchées dans les bons canaux

**Checkpoint** : Visibilité opérationnelle complète, SLO instrumentés.

---

## Phase 7 : US5 — Effacement Loi 25 cross-module (Priority : P2)

**Goal** : `EraseRecipientHistoryUseCase` anonymise tout l'historique d'un destinataire en < 60s (SC-008)

**Independent Test** : Scénario 7 quickstart.md — 5 entries pour un destinataire → erase → tous PII nullifiés, hash conservé, audit complet

### Tests + use case

- [ ] T112 [P] [US5] Tests Vitest `application/use-cases/__tests__/erase-recipient-history.use-case.test.ts` (multi-row anonymisation, CHECK constraint validée, audit émis, durée < 60s pour 5 rows) — RED first
- [ ] T113 [US5] Implémenter `application/use-cases/erase-recipient-history.use-case.ts` (transaction Postgres : UPDATE tous `notification_email_log` où `recipientEmailHashHMAC = ?` avec nullification + `erasedAt = now()`, insert audit `notification.recipient_history.erased`) — GREEN T112

### Exposition pour feature 023 future

- [ ] T114 [US5] Exposer méthode `eraseHistory(emailHashHMAC, reason)` sur `NotificationPort` (additive, mineur — cf. contracts/notification.port.md section Stabilité)
- [ ] T115 [US5] Mettre à jour `contracts/notification.port.md` pour documenter la nouvelle méthode

### Validation US5

- [ ] T116 [P] [US5] Exécuter Scénario 7 quickstart.md (5 entries → erase → CHECK constraint + audit)
- [ ] T117 [P] [US5] Test intégration CHECK constraint : INSERT manuel `erasedAt = now()` avec `recipientEmailClear` non-null doit échouer (Postgres ERROR)
- [ ] T118 [P] [US5] Test intégration CHECK constraint : nullification du hash post-effacement doit échouer (fix B-5)

**Checkpoint** : Conformité Loi 25 art. 28.1 garantie par le schéma + tests.

---

## Phase 8 : US6 — Console admin notifications (Priority : P3)

**Goal** : Admin gère suppression list, retry DLQ, browse audit log via UI accessible WCAG 2.1 AA

**Independent Test** : Scénarios 5 + 6 quickstart.md — admin retire faux positif suppression, retry dead-letter, audit trace

### Use cases admin (TDD)

- [ ] T119 [P] [US6] Tests Vitest `__tests__/remove-from-suppression-list.use-case.test.ts` (motif requis, audit émis, idempotency-key respecté) — RED
- [ ] T120 [P] [US6] Tests Vitest `__tests__/retry-dead-letter.use-case.test.ts` (entry dead_letter → queued, reset attempts, BullMQ enqueue) — RED
- [ ] T121 [US6] Implémenter `application/use-cases/remove-from-suppression-list.use-case.ts` — GREEN T119
- [ ] T122 [US6] Implémenter `application/use-cases/retry-dead-letter.use-case.ts` — GREEN T120

### Controller backend

- [ ] T123 [US6] Créer `interface/http/admin-notifications.controller.ts` avec les 7 endpoints admin (cf. contracts/http-endpoints.md sections 1-7) :
  - GET `/admin/notifications/suppression-list`
  - POST `/admin/notifications/suppression-list/:id/remove` (+ Idempotency-Key)
  - GET `/admin/notifications/dead-letter`
  - POST `/admin/notifications/dead-letter/:id/retry` (+ Idempotency-Key)
  - GET `/admin/notifications/log/:correlationId`
  - GET `/admin/notifications/audit` (cursor pagination)
  - GET `/admin/notifications/metrics/snapshot`
- [ ] T124 [US6] Wiring `RoleGuard('admin')` + `MfaSessionGuard` + `IdempotencyInterceptor` sur le controller (réutilisation patterns 002 + 001)
- [ ] T125 [P] [US6] Tests intégration `apps/api/test/integration/notifications/admin-endpoints.integration.spec.ts` couvrant les 7 endpoints (auth requis, validation Zod, idempotence)

### Frontend Next.js

- [ ] T126 [P] [US6] Créer `apps/web/src/app/[locale]/admin/notifications/layout.tsx` (nav sidebar, breadcrumbs)
- [ ] T127 [P] [US6] Créer `apps/web/src/app/[locale]/admin/notifications/suppression-list/page.tsx` (RSC, table paginée filtrable, shadcn/ui)
- [ ] T128 [P] [US6] Créer `apps/web/src/app/[locale]/admin/notifications/dead-letter/page.tsx`
- [ ] T129 [P] [US6] Créer `apps/web/src/app/[locale]/admin/notifications/audit/page.tsx` (cursor pagination)
- [ ] T130 [P] [US6] Créer `apps/web/src/app/[locale]/admin/notifications/_actions.ts` (Server Actions : `removeFromSuppressionAction`, `retryDeadLetterAction` avec validation Zod côté serveur)
- [ ] T131 [P] [US6] Créer `apps/web/src/components/admin/notifications/RemoveSuppressionModal.tsx` (motif texte min 10 chars, validation react-hook-form + Zod resolver, accessible WCAG 2.1 AA)
- [ ] T132 [P] [US6] Créer `apps/web/src/components/admin/notifications/RetryDeadLetterModal.tsx` (motif obligatoire)

### Validation US6

- [ ] T133 [P] [US6] Test Playwright `apps/web/test/e2e/admin/notifications.spec.ts` (US6 scénarios 5 + 6 quickstart.md)
- [ ] T134 [P] [US6] Test Playwright `apps/web/test/e2e/admin/notifications-a11y.spec.ts` (axe-core sur les 3 routes, 0 erreur critique/sérieuse — FR Principe XI)
- [ ] T135 [P] [US6] Test navigation clavier intégrale (Tab, Enter, Esc sur les modals)

**Checkpoint** : Console admin opérationnelle, conformité WCAG 2.1 AA garantie en CI.

---

## Phase 9 : Polish & Cross-Cutting Concerns

### Jobs de purge périodique

- [ ] T136 [P] Implémenter `application/use-cases/sweep-retention.use-case.ts` (anonymise rows `notification_email_log` où `sentAt < now() - 24 months` AND `erasedAt IS NULL`)
- [ ] T137 [P] Implémenter `application/use-cases/sweep-expired-suppressions.use-case.ts` (purge soft bounces TTL atteints — fix I-6)
- [ ] T138 [P] Implémenter `infrastructure/jobs/notification-retention-sweep.job.ts` (cron mensuel, jour 1 du mois à 02:00 ca-central-1)
- [ ] T139 [P] Implémenter `infrastructure/jobs/suppression-list-expiration-sweep.job.ts` (cron quotidien 03:00)
- [ ] T140 Wiring ces 2 jobs dans `NotificationsModule.onModuleInit` (setInterval ou nestjs-schedule)

### ADRs

- [ ] T141 [P] Créer `docs/adr/0013-pepper-hash-emails-notifications.md` (décision pepper unique non-rotatif J1 + fenêtre double-pepper sur fuite, contexte Loi 25 + leçon review adversariale 002 finding B-1)
- [ ] T142 [P] Créer `docs/adr/0014-multi-tenant-templates-architecture.md` (consolidation dans `packages/email-templates/`, namespace par module, evolution policy)

### Documentation

- [ ] T143 Mettre à jour `apps/api/src/modules/notifications/README.md` (vue d'ensemble, dépendances, port public, métriques, dashboards, runbooks liés)
- [ ] T144 Mettre à jour `docs/roadmap.md` : 003 passe en `🔵 implémentation en cours` puis (à la fin) `✅ mergé`
- [ ] T145 Créer `docs/runbooks/notifications-ses-production-access.md` (procédure ticket AWS support, SPF/DKIM/DMARC checklist, validation domain identity vs email identity)
- [ ] T146 Créer `docs/runbooks/notifications-disaster-recovery.md` (procédure SNS HS, Secrets Manager HS, DNS HS — cf. modes dégradés plan.md)
- [ ] T147 Créer `docs/runbooks/notifications-bounce-investigation.md` (procédure investigation pic bounces, retrait manuel suppression, identification template défaillant)

### Validation finale + checklists DoD

- [ ] T148 Créer `specs/003-notifications-transactionnelles/checklists/owasp.md` (OWASP Top 10 review : A01 broken access control, A02 crypto failures, A03 injection, A04 insecure design, A05 security misconfig, A06 vulnerable components, A07 auth failures, A08 software/data integrity, A09 logging failures, A10 SSRF — cochage en revue)
- [ ] T149 Créer `specs/003-notifications-transactionnelles/checklists/dod.md` (Definition of Done de la constitution checked, basé sur 001 pattern)
- [ ] T150 Exécuter `pnpm tsx tools/check-module-boundaries.ts` et confirmer 0 violation
- [ ] T151 Exécuter `pnpm typecheck` et `pnpm lint` sur l'ensemble du repo (zéro erreur)
- [ ] T152 Exécuter `pnpm --filter @cv/api test:unit` (tous les tests purs passent)
- [ ] T153 Exécuter `pnpm --filter @cv/api test:integration` (Testcontainers — tous tests passent)
- [ ] T154 Exécuter `pnpm --filter @cv/web test:e2e -- admin/notifications` + `test:a11y`
- [ ] T155 Exécuter `pnpm --filter @cv/web lighthouse:ci` (régression < 10% sur LCP/INP/CLS)
- [ ] T156 Exécuter quickstart.md scénarios 1-9 complets en environnement staging
- [ ] T157 Code review approuvée (PR ouverte vers `main`)

**Checkpoint** : Toutes les portes de la Definition of Done cochées — feature mergeable.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** : Pas de dépendance — peut démarrer immédiatement
- **Phase 2 (Foundational)** : Dépend de Phase 1 complétée — BLOQUE tous les US
- **Phase 3 (US1 P1)** : Dépend de Phase 2 — MVP livrable seul
- **Phase 4 (US2 P1)** : Dépend de Phase 2 — peut paralléliser avec Phase 3 (templates / migrations sont des fichiers différents)
- **Phase 5 (US3 P2)** : Dépend de Phase 2 ; peut paralléliser avec Phase 3 + 4
- **Phase 6 (US4 P2)** : Dépend de Phase 3 minimum (besoin de `SendNotificationUseCase` instrumenté)
- **Phase 7 (US5 P2)** : Dépend de Phase 2 ; peut paralléliser avec Phase 3-6
- **Phase 8 (US6 P3)** : Dépend de Phase 5 + 7 (besoin des entries suppression list + log pour la console)
- **Phase 9 (Polish)** : Dépend de toutes les phases US complétées

### User Story Dependencies

- **US1 (P1)** : Foundation Phase 2 → MVP livrable
- **US2 (P1)** : Foundation Phase 2 → indépendant de US1 (templates + workers MFA séparés)
- **US3 (P2)** : Foundation Phase 2 → indépendant
- **US4 (P2)** : US1 (instrumentation des use cases qui doivent exister)
- **US5 (P2)** : Foundation Phase 2 → indépendant (use case domain pur)
- **US6 (P3)** : US3 + US5 (console exploite suppression list + audit log)

### Within Each User Story

- Tests (Vitest + Testcontainers) DOIVENT échouer (RED) avant impl (GREEN) — Principe VI
- Domain pure functions → value objects → entities → use cases → adapters → controllers → frontend
- Stories complètes avant US suivante (validation indépendante)

### Parallel Opportunities (extraits)

- Setup Phase 1 : T003-T006 parallèles
- Foundation Phase 2 : T013-T015, T017-T023, T024-T029, T030-T044 (tous en groupes parallèles indépendants)
- US1 : T045+T046 (tests) parallèles ; T048-T052 (adapters) parallèles
- US2 : T070-T072 (3 templates manquants) parallèles
- US3 : T087-T089 (tests use cases bounce/complaint/delivery) parallèles
- US4 : T097-T102 (6 métriques) parallèles ; T105-T109 (5 alertes) parallèles
- US6 : T126-T132 (7 fichiers frontend) parallèles
- Polish Phase 9 : T136-T139 (jobs purge), T141-T142 (ADRs), T143-T147 (docs) parallèles

---

## Parallel Example : User Story 1 (Foundation completed)

```bash
# Tests US1 en parallèle (différents fichiers, RED avant GREEN) :
Task T045: "Test SendNotificationUseCase in apps/api/src/modules/notifications/application/use-cases/__tests__/send-notification.use-case.test.ts"
Task T046: "Test integration signup → email reçu in apps/api/test/integration/notifications/signup-flow.integration.spec.ts"

# Adapters US1 en parallèle (T048-T052 portés sur fichiers distincts) :
Task T048: "Implement SesEmailSender in apps/api/src/modules/notifications/infrastructure/ses-email-sender.ts"
Task T049: "Implement PrismaNotificationLog in .../infrastructure/prisma-notification-log.ts"
Task T050: "Implement PrismaSuppressionList in .../infrastructure/prisma-suppression-list.ts"
Task T051: "Implement PrismaNotificationAuditLogWriter in .../infrastructure/prisma-notification-audit-log-writer.ts"
Task T052: "Implement ReactEmailRenderer in .../infrastructure/react-email-renderer.ts"
```

---

## Implementation Strategy

### MVP First (US1 seule)

1. Phase 1 Setup (T001-T006)
2. Phase 2 Foundational (T007-T044) — BLOQUANT
3. Phase 3 US1 (T045-T065) — premier email transactionnel livré
4. **STOP + VALIDATE** : exécuter scénarios 1, 2, 3 quickstart.md
5. Demo / soft-launch interne possible

### Incremental Delivery

1. MVP US1 → ouvre le canal pour 100% du flux signup conseiller
2. + US2 (T066-T079) → couvre tous les events 001/002/002a → soft-launch conseiller complet
3. + US3 (T080-T096) → protège réputation SES → demande sortie sandbox AWS
4. + US4 (T097-T111) → visibilité opérationnelle → go-live possible
5. + US5 (T112-T118) → conformité Loi 25 complète → ouverture publique possible
6. + US6 (T119-T135) → outillage ops → équipe support autonome
7. + Polish Phase 9 (T136-T157) → DoD complète → merge

### Parallel Team Strategy

Avec 3 développeurs après Foundation :

- **Dev A** : Phases 3 + 6 (US1 → US4 observabilité) — l'axe « envoi + métriques »
- **Dev B** : Phases 4 + 7 (US2 → US5 effacement) — l'axe « templates + Loi 25 »
- **Dev C** : Phases 5 + 8 (US3 → US6 console admin) — l'axe « SES feedback + ops »

Polish Phase 9 ramène tout le monde sur les tests intégrés et les runbooks.

---

## Notes

- **[P] tasks** = fichiers différents, pas de dépendance — démarrables en parallèle
- **[Story] label** = traçabilité US → tâches
- **Tests RED avant GREEN** : Principe VI NON-NÉGOCIABLE — commits séparés visibles dans l'historique git
- **Commit par tâche logique** (ou groupe parallèle complet) avec message conventional commit `<type>(003): T<NN>...`
- **Module boundaries** : exécuter `tools/check-module-boundaries.ts` avant chaque PR de phase
- **Audit T056** : finaliser en début de Phase 3 — fige la liste réelle des templates et révèle d'éventuels manquants additionnels
- **Pas de merge avant DoD complète** : T148-T157 sont les portes finales obligatoires (Principe constitution)

---

## Récapitulatif

- **Total** : 157 tâches
- **Par phase** :
  - Setup : 6 tâches
  - Foundational : 38 tâches
  - US1 (P1) : 21 tâches (MVP)
  - US2 (P1) : 14 tâches
  - US3 (P2) : 17 tâches
  - US4 (P2) : 15 tâches
  - US5 (P2) : 7 tâches
  - US6 (P3) : 17 tâches
  - Polish : 22 tâches
- **Tâches parallèles ([P])** : ~70 tâches (45 % du total)
- **Tâches TDD (RED before GREEN)** : Phase 2 (T018-T029) + use cases US1/US3/US5/US6

**MVP suggéré** : Phases 1 + 2 + 3 (US1) = 65 tâches → premier email transactionnel délivré bout en bout. Démontrable. Démoable. Soft-launch interne possible.
