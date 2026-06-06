---
description: "Task list — feature 012 notifications conseillers + machine d'état de lead"
---

# Tasks : Notifications conseillers + machine d'état de lead

**Input** : Design documents from `/specs/012-lead-notifications-state-machine/`

**Prerequisites** : `plan.md` ✅, `spec.md` ✅, `research.md` ✅, `data-model.md` ✅, `contracts/` ✅, `quickstart.md` ✅.

**Tests** : OUI — TDD strict obligatoire (Constitution Principe VI NON-NÉGOCIABLE) sur la machine d'état + use cases. RED commits séparés AVANT GREEN. Tests de propriété (fast-check) pour SC-003 (transitions illégales) + FR-020 (idempotence montées).

**Organization** : tâches groupées par User Story (US1 P1 / US2 P2 / US3 P3) — chaque US livrable et testable indépendamment. **MVP = US1** (un matching → leads + notifications conseiller).

## Format : `[ID] [P?] [Story] Description`

- **[P]** : exécutable en parallèle (fichiers différents, pas de dépendance sur tâche non terminée)
- **[Story]** : US1 / US2 / US3 — phases user story uniquement
- Chemin de fichier exact dans chaque description

---

## Phase 1 : Setup — Infrastructure partagée

- [X] T001 [P] Étendre `packages/shared/src/matching/` — ajouter `lead-state.ts` (enum `LeadState`, `LeadAction`, `LeadTransitionActor` + schemas Zod) et le contrat `lead-query.port.ts` (interface `MatchingLeadQueryPort` + vues `LeadDetailView`/`LeadAdminListView`/`BriefLeadsSummaryView` + token `MATCHING_LEAD_QUERY_PORT`), re-exports dans `index.ts`.
- [X] T002 [P] Créer le gabarit courriel `packages/email-templates/src/matching/lead-received.tsx` (react-email, FR-CA, résumé brief NON sensible + lien espace conseiller, AUCUNE PII de contact) + export depuis le barrel `matching/`.
- [X] T003 [P] Créer `docs/adr/0025-lead-state-machine.md` (statut Proposed) — états + table de transitions + fonction pure TDD (cf. research R4).
- [X] T004 [P] Créer `docs/adr/0026-lead-bus-consumption-reconciliation.md` (statut Proposed) — abonnement pub/sub `matching.events` + sweep de réconciliation (résilience pub/sub-lossy, cf. research R1).
- [X] T005 [P] Mettre à jour `apps/api/src/modules/matching/README.md` — section Leads (rôle, dépendances 001/006, endpoints conseiller, événements consommés, ADRs 0025-0026).

**Smoke test Phase 1** : `pnpm typecheck` OK, `pnpm lint` OK, gabarit email rendu sans erreur.

---

## Phase 2 : Foundational — Schéma DB, ports, wiring

**⚠️ CRITIQUE** : aucune US ne peut démarrer tant que cette phase n'est pas terminée.

### Schéma DB et migrations (séquentielles)

- [X] T006 Compléter `packages/db/prisma/schema/matching.prisma` — modèles `Lead`, `LeadTransition`, `LeadNotificationOutbox`, `ConsumedMatchingEvent` + enums (`LeadState`, `LeadAction`, `LeadTransitionActor`, `LeadNotificationStatus`) + index + CHECK position ∈ {1,2,3} + UNIQUE(conseillerId, matchingResultId) (data-model §Entités).
- [X] T007 Migration `2026XXXX_init_lead/migration.sql` — tables + enums + index + contraintes, via `prisma migrate diff` filtré sur `lead_*` / `consumed_matching_events`.
- [X] T008 Migration `2026XXXX_lead_transitions_append_only/migration.sql` — trigger Postgres `BEFORE UPDATE OR DELETE OR TRUNCATE` sur `lead_transitions` (réutilise `raise_append_only_error`).
- [X] T009 Migration `2026XXXX_lead_anonymisation_cascade/migration.sql` — trigger `AFTER UPDATE` sur `intake_voyageur_briefs` (status → `anonymized`) : `UPDATE leads SET briefId = NULL WHERE briefId = OLD.id`. **JAMAIS toucher `lead_transitions`** (audit Loi 25, cf. ADR-0023/0026).

### Shared + ports (parallélisables)

- [X] T010 [P] Créer `packages/shared/src/matching/lead-branded-ids.ts` — `LeadId`, `LeadTransitionId`, `LeadNotificationId` (branded UUID + asserts + schemas Zod).
- [X] T011 [P] Créer `apps/api/src/modules/matching/application/ports/lead-writer.port.ts` — `createLead(input)`, `appendTransition(leadId, transition, expectedState)` (guard concurrence optimiste), `closeLeadsSystem(matchingResultId, reason)`.
- [X] T012 [P] Créer `.../ports/lead-reader.port.ts` — `findById`, `listByConseiller(filter)`, `findActiveByBriefAndConseiller`, `findActiveMatchingResultsWithoutLead(limit)` (pour le sweep).
- [X] T013 [P] Créer `.../ports/lead-notification-outbox.port.ts` — `enqueue(entry)` (UNIQUE idempotencyKey), `scanPending(limit)`, `markSent/markFailed`.
- [X] T014 [P] Créer `.../ports/lead-notification-mailer.port.ts` — `sendLeadReceived(conseillerId, briefSummary)` ; résout l'adresse via le module identité (jamais stockée).
- [X] T015 [P] Créer `.../ports/consumed-event-store.port.ts` — `hasConsumed(idempotencyKey)`, `recordConsumed(idempotencyKey, eventName)`.
- [X] T016 [P] Créer `.../ports/index.ts` (leads) + tokens DI `Symbol.for(...)`.
- [X] T017 Étendre `apps/api/src/modules/matching/matching.module.ts` — providers placeholder (ajoutés au fil des phases) + imports IdentiteModule (résolution adresse conseiller).

**Smoke test Phase 2** : `pnpm db:migrate` applique les 3 migrations, `pnpm prisma:generate` OK, `pnpm typecheck` OK, aucune régression sur les tests 011 existants.

**Checkpoint** : foundation prête. Les 3 user stories peuvent démarrer.

---

## Phase 3 : User Story 1 — Le conseiller est averti d'un nouveau lead (P1) 🎯 MVP

**Goal** : consommer `matched`/`partially_matched`, créer les leads, notifier chaque conseiller vérifié (un job par destinataire), idempotent.

**Independent Test** : quickstart S1 (golden path 3 leads + 3 notifications) + S2 (partial/unmatched) + S3 (non-vérifié exclu) + dedup replay.

### 3a — Domaine (TDD strict)

- [X] T018 [P] [US1] RED : `apps/api/src/modules/matching/domain/value-objects/__tests__/lead-state.vo.test.ts` — guards `isTerminal`, parsing enum.
- [X] T019 [US1] GREEN : `.../domain/value-objects/lead-state.vo.ts`.
- [X] T020 [P] [US1] Créer `.../domain/entities/lead.entity.ts` + `lead-transition.entity.ts` + tests d'invariant (position 1-3, currentState cohérent, briefId nullable).
- [X] T021 [P] [US1] Créer `.../domain/events/lead-events.ts` — `LeadCreated`, `LeadNotificationRequested`.

### 3b — Application (TDD)

- [X] T022 [US1] RED : `.../application/use-cases/__tests__/consume-matching-event.use-case.test.ts` (fakes) — `matched` 3 conseillers vérifiés → 3 leads + 3 notifications enqueued ; `partial` → 2 ; `unmatched` → 0 + trace ; replay même idempotencyKey → no-op ; conseiller non vérifié → `skipped_unverified`, pas de notification.
- [X] T023 [US1] Créer `.../application/__tests__/_lead-fakes.ts` — fakes en mémoire des 5 ports leads + ConformiteQueryPort fake + Clock + UuidGenerator.
- [X] T024 [US1] GREEN : `.../application/use-cases/consume-matching-event.use-case.ts` (dédup → filtre verified → create leads → enqueue notifications).

### 3c — Infrastructure

- [X] T025 [P] [US1] Créer `.../infrastructure/prisma-lead-repository.ts` (implémente lead-writer + lead-reader ; transaction create lead + transition initiale `→ envoye`).
- [X] T026 [P] [US1] Créer `.../infrastructure/prisma-lead-notification-outbox.ts`.
- [X] T027 [P] [US1] Créer `.../infrastructure/prisma-consumed-event-store.ts`.
- [X] T028 [P] [US1] Créer `.../infrastructure/ses-lead-notification-mailer.ts` — rend `lead-received.tsx`, résout l'adresse via le port identité, re-check `verified`, envoie via SES.
- [X] T029 [US1] Créer `.../infrastructure/jobs/matching-events.consumer.ts` — abonnement Redis pub/sub `MATCHING_PUBSUB_CHANNEL`, route par `name`, appelle `ConsumeMatchingEventUseCase`.
- [X] T030 [US1] Créer `.../infrastructure/jobs/lead-notification.job.ts` — BullMQ **un job par destinataire** (queue `matching.lead-notifications`), retry backoff + dead-letter, appelle le mailer.
- [X] T031 [US1] Wiring DI dans `matching.module.ts` — ports→adapters leads + use case + consumer (subscribe onModuleInit) + job.

### 3d — Test d'intégration

- [X] T032 [US1] Créer `apps/api/test/integration/matching/lead-notifications.integration.test.ts` (Testcontainers Postgres + Redis) — quickstart S1 + S2 + S3 + dedup (un job/destinataire, aucune PII contact).

**Checkpoint US1** : un `matched` publié sur le bus produit leads + notifications conseiller. MVP livrable.

---

## Phase 4 : User Story 2 — Cycle de vie du lead (P2)

**Goal** : machine d'état append-only + transitions conseiller via use cases + endpoints HTTP.

**Independent Test** : quickstart S4 (nominal) + S5 (invalide rejeté) + S6 (concurrence) + S9 (append-only) + S10 (révoqué bloqué).

### 4a — Domaine machine d'état (TDD strict)

- [X] T033 [P] [US2] RED : `.../domain/services/__tests__/apply-lead-transition.test.ts` — table de transitions complète, transition hors table rejetée, no-op idempotent (vu→vu), `clore_systeme → perdu` depuis tout état non terminal.
- [X] T034 [US2] GREEN : `.../domain/services/apply-lead-transition.ts` (fonction pure `(current, action, actor) → Result<LeadState, TransitionError>`).
- [X] T035 [P] [US2] RED+GREEN : `.../domain/services/__tests__/apply-lead-transition.property.test.ts` (fast-check) — SC-003 (aucune transition illégale acceptée sur 1 000 tirages) + FR-020 (idempotence des montées).

### 4b — Application (TDD)

- [X] T036 [US2] RED : `.../application/use-cases/__tests__/record-lead-transition.use-case.test.ts` — concurrence optimiste (état obsolète → conflit), re-check verified (non vérifié → rejet), append-only transition, états terminaux.
- [X] T037 [US2] GREEN : `.../application/use-cases/record-lead-transition.use-case.ts`.
- [X] T038 [US2] RED : `.../application/use-cases/__tests__/view-lead.use-case.test.ts` — auto `envoye→vu` à la 1re lecture, idempotent (2e lecture sans nouvelle transition).
- [X] T039 [US2] GREEN : `.../application/use-cases/view-lead.use-case.ts`.

### 4c — Infrastructure + interface

- [X] T040 [US2] Étendre `prisma-lead-repository.ts` — `appendTransition` avec guard `WHERE currentState = :expected` (concurrence optimiste) + maj `currentState` transactionnelle.
- [X] T041 [US2] Créer `.../interface/http/conseiller-lead.controller.ts` — `GET /leads`, `GET /leads/:id` (auto-vu), `POST /leads/:id/{accept,refuse,quote-sent,booking-confirmed,lost}` ; `AuthGuard` + `RoleGuard @RequireRole('conseiller')` + autorisation propriétaire + Zod + `Idempotency-Key`. Codes 200/403/404/409/422 (contracts/http-endpoints.md).
- [X] T042 [US2] Wiring DI use cases + controller dans `matching.module.ts`.
- [X] T043 [P] [US2] Ajouter clés i18n `matching.lead.*` dans `apps/web/src/i18n/messages/fr-CA.json` + `en.json` (messages d'erreur HTTP : conflit, transition invalide, non vérifié, succès).

### 4d — Test d'intégration

- [X] T044 [US2] Créer `apps/api/test/integration/matching/lead-lifecycle.integration.test.ts` (Testcontainers) — quickstart S4 + S5 + S6 (concurrence) + S9 (append-only trigger) + S10 (révoqué bloqué) + **S13 (indépendance des frères : `booking-confirmed` sur un lead → les 2 frères inchangés, FR-016)**.

**Checkpoint US2** : un conseiller pilote son lead de bout en bout via l'API.

---

## Phase 5 : User Story 3 — Conformité dynamique, Loi 25, résilience (P3)

**Goal** : sweep de réconciliation, supersession re-match, all_matches_revoked, cascade anonymisation, port public lecture.

**Independent Test** : quickstart S7 (re-match) + S8 (anonymisation) + S11 (all_revoked) + S12 (SES HS).

### 5a — Réconciliation + supersession + all_revoked (TDD)

- [X] T045 [P] [US3] RED : `.../application/use-cases/__tests__/reconcile-leads.use-case.test.ts` — MR actif sans lead → recrée leads + notifications (mode dégradé bus HS).
- [X] T046 [US3] GREEN : `.../application/use-cases/reconcile-leads.use-case.ts` + `.../infrastructure/jobs/lead-reconciliation.scheduler.ts` (BullMQ repeatable).
- [X] T047 [P] [US3] RED : étendre `consume-matching-event.use-case.test.ts` — supersession re-match (FR-018/SC-008 : leads de l'ancien MR → `perdu` motif `re-matched`, nouveaux leads créés) + `all_matches_revoked` (aucune notif, leads → `perdu`).
- [X] T048 [US3] GREEN : étendre `consume-matching-event.use-case.ts` (détection MR superseded via `MatchingResultReader`, clôture système, traitement `all_matches_revoked`).

### 5b — Port public lecture

- [X] T049 [US3] Créer `.../infrastructure/prisma-lead-query-adapter.ts` — implémente `MatchingLeadQueryPort` (lecture pure, filtre verified dynamique, `null` si brief anonymisé).
- [X] T050 [US3] Exporter `MATCHING_LEAD_QUERY_PORT` depuis `MatchingModule.exports` (consommable par 014/015).

### 5c — Tests d'intégration US3

- [X] T051 [US3] Créer `apps/api/test/integration/matching/lead-rematch.integration.test.ts` — quickstart S7 (supersession, ≤ 1 lead actif par conseiller × brief).
- [X] T052 [US3] Créer `apps/api/test/integration/matching/lead-anonymisation-cascade.integration.test.ts` — quickstart S8 (briefId nullé, transitions préservées).
- [X] T053 [US3] Créer `apps/api/test/integration/matching/lead-resilience.integration.test.ts` — quickstart S11 (all_revoked) + S12 (SES HS → retry sans doublon).

**Checkpoint US3** : les 3 US sont indépendamment fonctionnelles. Module leads livrable complet.

---

## Phase 6 : Polish & Cross-Cutting

- [ ] T054 [P] Métriques OTel — `.../infrastructure/lead-metrics.ts` (counters `lead.created`, `lead.transition{to_state}`, `lead.notification_sent/failed`) branchées via port `LeadMetricsRecorder` ; dashboard `docs/dashboards/matching-leads.json` + alertes (taux échec notif, latence, taux acceptation bas).
- [ ] T055 [P] Logs Pino structurés (PII-safe) dans les use cases (info/warn/error par issue).
- [ ] T056 [P] Étendre `tools/check-no-pii-matching-audit.ts` (ou nouveau CLI) pour scanner `lead_transitions`/`lead_notification_outbox` + workflow CI hebdo.
- [ ] T057 [P] Créer `docs/runbooks/matching-lead-notifications.md` (retry/dead-letter notifications, réconciliation, SES HS) + finaliser README module.
- [ ] T058 [P] Finaliser ADR-0025 + ADR-0026 (statut Accepted) avec notes d'implémentation.
- [ ] T059 Quality gates : `pnpm check:boundaries` + `pnpm lint` + `pnpm typecheck` (17 packages) + matrice quickstart (13 scénarios) verts.
- [ ] T059b Test de charge léger en staging — créer `tools/load-test-leads.ts` (k6/autocannon : flux d'événements `matched` + transitions conseiller). Assertions **SC-005** : p95 réception événement → mise en file notification **< 5 s** ; p95 transition synchrone **< 800 ms** (Principe X). Gabarit hérité de 011 `tools/load-test-matching.ts`.
- [ ] T060 Mettre à jour `docs/roadmap.md` (012 ⏳ → 🟡) + cocher DoD `plan.md` + ouvrir PR vers `main` (Constitution Check verbatim + ADRs 0025-0026).

---

## Dependencies & Execution Order

- **Phase 1 Setup** : aucune dépendance.
- **Phase 2 Foundational** : dépend de Phase 1. DB séquentielle T006→T009 ; ports T010-T016 `[P]`.
- **Phase 3 US1 (P1 MVP)** : dépend de Phase 2. Livrable seul.
- **Phase 4 US2 (P2)** : dépend de Phase 2 ; réutilise l'entité Lead (US1) mais testable via fakes. La machine d'état (T033-T035) peut démarrer en parallèle d'US1.
- **Phase 5 US3 (P3)** : dépend de Phase 2 + US1 (étend `ConsumeMatchingEventUseCase`). Indépendante d'US2.
- **Phase 6 Polish** : dépend des phases livrées.

### TDD strict (Principe VI)

Pour toute tâche `RED` : commit séparé test rouge AVANT le commit `GREEN`. Pattern hérité de 008/011.

### Parallel Opportunities

- Phase 1 : T001-T005 `[P]`.
- Phase 2 : ports T010-T016 `[P]` après la DB.
- Phase 3 : adapters T025-T028 `[P]`.
- Machine d'état US2 (T033-T035) parallélisable avec US1.

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 (consommation + notifications) → **STOP + valider** quickstart S1 en staging.

### Incremental Delivery

- MVP US1 → demo. Add US2 (machine d'état + HTTP) → demo. Add US3 (résilience + supersession + port public) → demo. Polish → PR.

---

## Notes

- `[P]` = fichiers différents, aucune dépendance sur tâche non terminée.
- TDD strict : machine d'état + use cases ont RED avant GREEN ; property tests pour SC-003 + FR-020.
- Pas d'E2E Playwright dans 012 (pas d'UI — arrive en 014/015).
- Anonymisation cascade + append-only testés explicitement (T052/S9) — invariants Loi 25.
- Un job BullMQ par destinataire (Principe X) — vérifié en intégration (T032).

**Total tâches** : 61 (5 Setup + 12 Foundational + 15 US1 + 12 US2 + 9 US3 + 8 Polish — dont T059b test de charge SC-005).

**Suite recommandée** : `/speckit.analyze` (cohérence spec/plan/tasks) avant `/speckit.implement`.
