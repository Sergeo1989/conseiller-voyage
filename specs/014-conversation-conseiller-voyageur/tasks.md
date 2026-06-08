---
description: "Task list — Conversation conseiller ↔ voyageur post-acceptation (014 / roadmap 013)"
---

# Tasks: Conversation conseiller ↔ voyageur (post-acceptation)

**Input**: Design documents from `specs/014-conversation-conseiller-voyageur/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: INCLUS (Principe VI — logique métier testée ; `conversation-policy` pur + use
cases suivent le **TDD strict** : commit du test rouge AVANT le commit vert ; pattern 012).

**Organization**: par user story (US1 messages texte MVP · US2 pièces jointes · US3
conformité/Loi 25/résilience). Module `matching`, 4 couches (VIII.a).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = fichiers différents, aucune dépendance sur une tâche non terminée.
- **[Story]** = US1 / US2 / US3 (Setup/Foundational/Polish sans label).

## Path Conventions

Backend `apps/api/src/modules/matching/{domain,application,infrastructure,interface}` ;
contrats publics `packages/shared/src/matching/` ; schéma `packages/db/prisma/schema/matching.prisma` ;
UI minimale `apps/web/src/features/conversation/`.

---

## Phase 1: Setup (infrastructure partagée)

- [x] T001 [P] Schéma Prisma : modèles `Conversation`, `ConversationMessage`, `ConversationAttachment`, `ConversationNotificationOutbox`, `ConsumedConversationEvent` + enums (`ConversationParticipant`, `ConversationNotifStatus`) — **aucun champ transactionnel** — dans `packages/db/prisma/schema/matching.prisma`
- [x] T002 [P] Branded ids `ConversationId`/`MessageId`/`AttachmentId` dans `packages/shared/src/matching/conversation-branded-ids.ts` + réexport `packages/shared/src/matching/index.ts`
- [x] T003 Migration Prisma (`migrate dev`) pour les tables conversation dans `packages/db/prisma/migrations/`

---

## Phase 2: Foundational (prérequis bloquants)

**⚠️ CRITIQUE** : aucune user story avant cette phase.

- [x] T004 [P] **RED** domaine : tests purs `conversation-policy` (`canWrite(leadState, verifie)`, `validateMessage(body)`, `validateAttachment(mime,size)`, `isMember`) dans `apps/api/src/modules/matching/domain/services/__tests__/conversation-policy.test.ts`
- [x] T005 **GREEN** domaine : `conversation-policy.ts` (pur) + VO `message-body.vo.ts` + `attachment-meta.vo.ts` dans `apps/api/src/modules/matching/domain/` → rend T004 vert
- [x] T006 [P] Entités domaine `conversation.entity.ts` + `conversation-message.entity.ts` (invariants) dans `apps/api/src/modules/matching/domain/entities/`
- [x] T007 Ports applicatifs (`conversation-repo`, `attachment-storage`, `conversation-notification-outbox`, `conversation-mailer`, `lead-eligibility-reader` [adapte `MatchingLeadQueryPort`], `conseiller-verification-reader` [adapte `ConformiteQueryPort`]) + `ports/index.ts` dans `apps/api/src/modules/matching/application/ports/`
- [x] T008 Fakes de test in-memory (repo / storage / outbox / lead+verif readers) dans `apps/api/src/modules/matching/application/__tests__/_conversation-fakes.ts`

**Checkpoint** : schéma + domaine pur + ports + fakes prêts.

---

## Phase 3: User Story 1 — Messages texte après acceptation (P1) 🎯 MVP

**Goal**: fil ouvert à l'acceptation ; envoi/lecture de messages texte ; 1 notification par
destinataire ; idempotence ; cloisonnement.

**Independent Test**: sur un lead `accepté`, envoyer un message → visible/horodaté + 1 notif
vers le destinataire ; rejouer (même clé) → pas de doublon ; tenter sur lead non accepté → refus.

### Tests (TDD — rouge AVANT vert)

- [x] T009 [P] [US1] **RED** `SendMessage` use case : autorisation membre, `canWrite`, idempotence (dedup), **1 entrée d'outbox par destinataire** (via fakes) dans `apps/api/src/modules/matching/application/use-cases/__tests__/send-message.use-case.test.ts`
- [x] T010 [P] [US1] **RED** `OpenConversationOnLeadAccepted` : idempotent, **1 fil par lead** dans `.../__tests__/open-conversation-on-accept.use-case.test.ts`

### Implémentation

- [x] T011 [US1] `OpenConversationOnLeadAccepted` use case dans `apps/api/src/modules/matching/application/use-cases/open-conversation-on-accept.use-case.ts` → rend T010 vert
- [x] T012 [US1] `SendMessage` use case (lit éligibilité lead + vérifié, valide, persiste, crée outbox 1/destinataire) dans `.../use-cases/send-message.use-case.ts` → rend T009 vert
- [x] T013 [US1] `ListConversationMessages` use case (pagination ordonnée, autorisation membre) dans `.../use-cases/list-messages.use-case.ts`
- [x] T014 [P] [US1] Adapter `PrismaConversationRepository` dans `apps/api/src/modules/matching/infrastructure/prisma-conversation-repository.ts`
- [x] T015 [P] [US1] Adapter `PrismaConversationNotificationOutbox` dans `.../infrastructure/prisma-conversation-notification-outbox.ts`
- [ ] T016 [US1] Consumer `lead-accepted` (ouvre le fil, idempotent) + wiring DI dans `.../infrastructure/jobs/lead-accepted.consumer.ts` + `matching.module.ts`
- [ ] T017 [US1] Job BullMQ `conversation-notification` (1/destinataire) + `SesConversationMailer` + template react-email (FR-CA, sans PII de contenu) dans `.../infrastructure/jobs/conversation-notification.job.ts` + `.../infrastructure/ses-conversation-mailer.ts`
- [ ] T018 [US1] Contrôleurs HTTP conseiller + voyageur (GET fils, GET messages, POST message **idempotent**) dans `.../interface/http/{conseiller,voyageur}-conversation.controller.ts` + wiring module
- [x] T019 [US1] Test intégration Testcontainers (Postgres+Redis) : envoi + ordre + 1 notif/destinataire + idempotence + refus pas-avant-acceptation + cloisonnement dans `apps/api/test/integration/matching/conversation-messaging.integration.test.ts`

**Checkpoint** : MVP — conseiller et voyageur dialoguent, anti-spam + idempotence garantis.

---

## Phase 4: User Story 2 — Pièces jointes (devis PDF) transmises telles quelles (P2)

**Goal**: joindre des fichiers (S3 ca-central-1, URL signées) transmis tels quels ; aucun
montant/paiement ; mention permanente.

**Independent Test**: upload PDF (pré-signé) → finalize → lecture via URL signée, **0 champ
transactionnel** dans modèle/réponses.

### Tests (TDD — rouge AVANT vert)

- [ ] T020 [P] [US2] **RED** flux pièces jointes : `validateAttachment` (refus type/poids) + `CreateAttachmentUpload`/`FinalizeAttachment`/`GetAttachmentUrl` (via fakes) dans `.../use-cases/__tests__/attachments.use-case.test.ts`

### Implémentation

- [ ] T021 [US2] `CreateAttachmentUpload` use case (valide, crée `PENDING_UPLOAD`, demande URL pré-signée) dans `.../use-cases/create-attachment-upload.use-case.ts` → rend T020 (partie) vert
- [ ] T022 [US2] `FinalizeAttachment` use case (`READY`, rattache au message) dans `.../use-cases/finalize-attachment.use-case.ts`
- [ ] T023 [US2] `GetAttachmentUrl` use case (URL signée courte, autorisation membre + disponible) dans `.../use-cases/get-attachment-url.use-case.ts`
- [ ] T024 [P] [US2] Adapter `S3AttachmentStorage` (ca-central-1 ADR-0001 ; URL pré-signée d'upload + URL signée de lecture) dans `.../infrastructure/s3-attachment-storage.ts`
- [ ] T025 [US2] Endpoints pièces jointes (POST upload, POST finalize, GET url) dans les contrôleurs + mention anti-transaction (contrat) ; wiring
- [ ] T026 [US2] Test intégration : upload PDF tel quel + lecture URL signée + **invariant 0 champ montant/paiement** dans `apps/api/test/integration/matching/conversation-attachments.integration.test.ts`

**Checkpoint** : US1 + US2 — devis transmissible comme fichier opaque, hors transaction.

---

## Phase 5: User Story 3 — Conformité dynamique, Loi 25, résilience (P3)

**Goal**: re-filtrage verified + lecture seule sur lead terminal-négatif ; cascade Loi 25
(audit préservé) ; notifications résilientes ; port public.

**Independent Test**: révoquer un conseiller → écriture refusée ; anonymiser une partie →
PII neutralisée + pièces jointes supprimées, audit présent ; panne SES → reprise sans doublon.

### Tests (TDD — rouge AVANT vert)

- [ ] T027 [P] [US3] **RED** re-filtrage `verified` (conseiller révoqué → écriture refusée) + lead `refusé`/`perdu` → lecture seule dans `.../use-cases/__tests__/send-message.authz.test.ts`
- [ ] T028 [P] [US3] **RED** anonymisation Loi 25 : corps PII → null + pièces jointes supprimées (S3), **audit préservé**, idempotent dans `.../use-cases/__tests__/anonymize-conversation.use-case.test.ts`

### Implémentation

- [ ] T029 [US3] `AnonymizeConversationLoi25` use case (neutralise messages PII + supprime objets S3, conserve métadonnées d'audit) dans `.../use-cases/anonymize-conversation-loi25.use-case.ts` → rend T028 vert
- [ ] T030 [US3] Renforcement `SendMessage` : re-filtrage `verified` dynamique + statut d'écriture **dérivé** (`canWrite`) du lead lu via `MatchingLeadQueryPort` → rend T027 vert
- [ ] T031 [US3] Résilience notification : retry outbox + reprise SES (au moins une fois, sans doublon perçu) dans le job + outbox
- [ ] T032 [US3] **Port public** `ConversationQueryPort` (types + token) dans `packages/shared/src/matching/conversation-query.port.ts` + adapter `PrismaConversationQueryAdapter` dans `apps/api/.../infrastructure/prisma-conversation-query-adapter.ts` + export shared (consommé par 014/015)
- [ ] T033 [US3] Test intégration : verified-révoqué + cascade Loi 25 + résilience notif dans `apps/api/test/integration/matching/conversation-resilience.integration.test.ts`

**Checkpoint** : flux durci (conformité, vie privée, résilience) ; port public prêt pour 014/015.

---

## Phase 6: UI minimale & Polish

- [ ] T034 [P] UI minimale slice `apps/web/src/features/conversation/` (`ConversationThread`, `MessageList`, `MessageComposer`, `AntiTransactionNotice`, `AttachmentLink`) + `actions/send-message.action.ts` (Zod, `ActionResult`) + clés i18n FR-CA/EN
- [ ] T035 [P] Test a11y Playwright `@a11y` sur la vue fil minimale dans `apps/web/test/a11y/conversation.spec.ts`
- [ ] T036 [P] Métriques OTel (fils ouverts, messages envoyés, devis transmis) + logs structurés (pattern 012)
- [ ] T037 [P] **ADR-0027** (pièces jointes anti-transaction + URL signées + rétention/effacement) dans `docs/adr/0027-conversation-attachments.md` + lien depuis le plan
- [ ] T038 Invariant **anti-transaction** : test/outil vérifiant **0** champ montant/prix/paiement/réservation (modèle Prisma + réponses API) — `tools/` ou test dédié
- [ ] T039 Exécuter `quickstart.md` (SC-001 à SC-009) + cocher la DoD ; test de charge léger SLO p95 envoi < 800 ms

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** : aucune dépendance ; T003 (migration) après T001 (schéma).
- **Foundational (P2)** : dépend du Setup ; **bloque** les user stories. T005 après T004 (TDD) ; T007/T008 après T006.
- **US1 (P3)** : dépend de Foundational. MVP.
- **US2 (P4)** : dépend de Foundational + US1 (messages existants pour rattacher les pièces jointes).
- **US3 (P5)** : dépend de US1 (durcit SendMessage) + US2 (Loi 25 supprime aussi les pièces jointes).
- **Polish (P6)** : après les stories visées.

### Within Each User Story (TDD strict)

- Les tests rouges (T004, T009, T010, T020, T027, T028) sont committés **avant** leur implémentation.
- Domaine pur → ports → use cases → adapters → contrôleurs.

### Parallel Opportunities

- Setup : T001/T002 `[P]`.
- Foundational : T004 `[P]` ; T006 `[P]`.
- US1 : T009/T010 `[P]` (tests) ; T014/T015 `[P]` (adapters, fichiers distincts).
- US2 : T020 `[P]` ; T024 `[P]`.
- US3 : T027/T028 `[P]`.
- Polish : T034/T035/T036/T037 `[P]`.
- ⚠️ Sérialiser ce qui touche `send-message.use-case.ts` (T012 → T030) et `matching.module.ts` (wiring T016/T018/T025).

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 (messages texte) → **STOP + valider**
   (envoi/réception, 1 notif/destinataire, idempotence, pas-avant-acceptation).

### Incremental Delivery

MVP US1 → US2 (pièces jointes/devis) → US3 (conformité/Loi 25/résilience + port public) → UI minimale + Polish → PR.

---

## Notes

- `[P]` = fichiers différents, aucune dépendance sur une tâche non terminée.
- TDD strict : T004/T009/T010/T020/T027/T028 rouges avant vert (commits séparés, Principe VI).
- **Anti-marketplace (ADR-0002)** vérifié par test (T026/T038) : 0 montant/paiement/réservation ; devis = fichier opaque.
- **012 = source de vérité** du cycle de lead : lecture via `MatchingLeadQueryPort`, **aucune** transition écrite ici (FR-015).
- Notifications : **1 job/destinataire** (Principe X), outbox + retry (T017/T031).
- Loi 25 : cascade messages + pièces jointes S3, audit préservé (T028/T029).
- ADR-0027 requis avant merge (pièces jointes) ; scan antivirus différé (Tier 5, risque noté).

**Total tâches** : 39 (3 Setup + 5 Foundational + 11 US1 + 7 US2 + 7 US3 + 6 Polish).

**Suite recommandée** : `/speckit.analyze` (cohérence spec/plan/tasks) puis `/speckit.implement`.
