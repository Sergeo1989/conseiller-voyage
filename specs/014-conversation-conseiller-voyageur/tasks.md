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
- [x] T016 [US1] Déclencheur `lead-accepté` → ouverture du fil (idempotent, best-effort) : port `ConversationOpener` + hook in-process dans `RecordLeadTransitionUseCase` + adaptateur `infrastructure/lead-accepted-conversation-opener.ts` + wiring `matching.module.ts`. _012 n'émet aucun événement bus sur les transitions de lead (actions HTTP append-only) → hook synchrone plutôt qu'un consumer bus ; tests verts (9/9)._
- [x] T017 [US1] Job BullMQ `conversation-notification` (1/destinataire : dispatcher/sender/worker) + `SesConversationMailer` (résout adresse conseiller via identité / voyageur via intake, jamais stockée) + template react-email `conversation-new-message` (FR-CA, **sans PII de contenu/contact**, rappel neutralité) + port outbox étendu (scanPending/markSent/markFailed) + wiring `matching.module.ts` (queue + drain périodique). _178 tests verts ; tsc @cv/api + @cv/email-templates verts ; envoi réel SES vérifié en staging (T019)._
- [x] T018 [US1] Contrôleur HTTP conseiller (POST open, GET messages, POST message **idempotent**) dans `.../interface/http/conseiller-conversation.controller.ts` + wiring module. _Côté voyageur déféré à 015 (espace voyageur authentifié non livré) ; `voyageurRef = lead.briefId` comme proxy MVP._
- [x] T019 [US1] Test intégration Testcontainers (Postgres+Redis) : envoi + ordre + 1 notif/destinataire + idempotence + refus pas-avant-acceptation + cloisonnement dans `apps/api/test/integration/matching/conversation-messaging.integration.test.ts`

**Checkpoint** : MVP — conseiller et voyageur dialoguent, anti-spam + idempotence garantis.

---

## Phase 4: User Story 2 — Pièces jointes (devis PDF) transmises telles quelles (P2)

**Goal**: joindre des fichiers (S3 ca-central-1, URL signées) transmis tels quels ; aucun
montant/paiement ; mention permanente.

**Independent Test**: upload PDF (pré-signé) → finalize → lecture via URL signée, **0 champ
transactionnel** dans modèle/réponses.

### Tests (TDD — rouge AVANT vert)

- [x] T020 [P] [US2] **RED**/vert flux pièces jointes : `validateAttachment` (refus type/poids/vide) + `CreateAttachmentUpload`/`FinalizeAttachment`/`GetAttachmentUrl` (via fakes, 7 tests) dans `.../use-cases/__tests__/attachments.use-case.test.ts`

### Implémentation

- [x] T021 [US2] `CreateAttachmentUpload` use case (valide, crée `pending_upload`, URL PUT pré-signée, autorisation membre) dans `.../use-cases/create-attachment-upload.use-case.ts`
- [x] T022 [US2] `FinalizeAttachment` use case (`ready`, idempotent, autorisation membre) dans `.../use-cases/finalize-attachment.use-case.ts`
- [x] T023 [US2] `GetAttachmentUrl` use case (URL GET signée courte, membre + `ready` + non supprimé) dans `.../use-cases/get-attachment-url.use-case.ts`
- [x] T024 [P] [US2] Adapter `S3AttachmentStorage` (ca-central-1 ADR-0001 ; presign PUT/GET + delete, LocalStack-compatible) dans `.../infrastructure/s3-attachment-storage.ts` + port `AttachmentStorage` + bucket `AWS_S3_BUCKET_CONVERSATIONS`
- [x] T025 [US2] Endpoints pièces jointes conseiller (POST `:id/attachments`, POST `.../finalize`, GET `.../url`) + mention anti-transaction dans la réponse + wiring module
- [x] T026 [US2] Test intégration (stub staging/LocalStack) : upload + lecture signée + invariant 0 champ transactionnel dans `apps/api/test/integration/matching/conversation-attachments.integration.test.ts`

**Checkpoint** : US1 + US2 — devis transmissible comme fichier opaque, hors transaction.

---

## Phase 5: User Story 3 — Conformité dynamique, Loi 25, résilience (P3)

**Goal**: re-filtrage verified + lecture seule sur lead terminal-négatif ; cascade Loi 25
(audit préservé) ; notifications résilientes ; port public.

**Independent Test**: révoquer un conseiller → écriture refusée ; anonymiser une partie →
PII neutralisée + pièces jointes supprimées, audit présent ; panne SES → reprise sans doublon.

### Tests (TDD — rouge AVANT vert)

- [x] T027 [P] [US3] **RED**/vert re-filtrage `verified` dynamique (conseiller révoqué → refusé) + lead `refusé`/`perdu` → lecture seule (4 tests) dans `.../use-cases/__tests__/send-message.authz.test.ts`
- [x] T028 [P] [US3] **RED**/vert anonymisation Loi 25 : corps PII → null + pièces jointes supprimées (S3), **audit préservé**, idempotent (3 tests) dans `.../use-cases/__tests__/anonymize-conversation.use-case.test.ts`

### Implémentation

- [x] T029 [US3] `AnonymizeConversationLoi25` use case (corps → null, objets S3 supprimés best-effort + `deletedAt`, refs voyageur neutralisées ; audit préservé, idempotent) dans `.../use-cases/anonymize-conversation-loi25.use-case.ts` + méthodes repo + adaptateur Prisma
- [x] T030 [US3] Renforcement `SendMessage` : **déjà satisfait par T012** — re-filtrage `verified` interrogé à chaque envoi (`conformiteQuery.getVerificationStatus`) + statut d'écriture dérivé `canWrite(état lead, vérifié)`. Couverture durcie ajoutée par T027.
- [x] T031 [US3] Résilience notification : **par conception** — job BullMQ idempotent (`jobId = notificationId`), re-throw SES → backoff/retry, dispatcher périodique re-scanne les `pending` (reprise sans doublon, `markSent/markFailed`).
- [x] T032 [US3] **Port public** `ConversationQueryPort` (types + token `CONVERSATION_QUERY_PORT`) dans `packages/shared/src/matching/conversation-query.port.ts` + adapter `PrismaConversationQueryAdapter` (writable dérivé) + export shared + export module (consommé par 014/015)
- [x] T033 [US3] Test intégration (stub staging/LocalStack) : verified-révoqué + cascade Loi 25 + résilience notif dans `apps/api/test/integration/matching/conversation-resilience.integration.test.ts`

**Checkpoint** : flux durci (conformité, vie privée, résilience) ; port public prêt pour 014/015.

---

## Phase 6: UI minimale & Polish

- [x] T034 [P] UI minimale slice `apps/web/src/features/conversation/` (`ConversationThread`, `MessageList`, `MessageComposer`, `AntiTransactionNotice`, `AttachmentLink`) + `actions/send-message.action.ts` (Zod, `ActionResult`, apiClient idempotent) + `schemas/` + `index.ts` + clés i18n FR-CA/EN. _tsc web vert ; feature-boundaries 0 violation._
- [x] T035 [P] Test a11y Playwright `@a11y` `apps/web/test/a11y/conversation.spec.ts` (markup sémantique : `<ol>/<li>`, `<time>`, label/aria-live, `role=note`). _Skip guardé tant que 014/015 ne montent pas la route (E2E_CONVERSATION_ROUTE) — même convention que les stubs d'intégration._
- [x] T036 [P] Métriques OTel (fils ouverts, messages envoyés, devis transmis) port `ConversationMetricsRecorder` + `OtelConversationMetricsRecorder` (meter `cv.matching.conversation`) ; instrumentation via dep optionnelle no-op
- [x] T037 [P] **ADR-0027** (pièces jointes anti-transaction + URL signées + rétention/effacement) dans `docs/adr/0027-conversation-attachments.md` (référencé par le plan, DoD)
- [x] T038 Invariant **anti-transaction** : test dédié scannant modèles Prisma `Conversation*` + vues `ConversationQueryPort` → **0** champ montant/prix/paiement/réservation (5 tests)
- [x] T039 `quickstart.md` § Statut de validation : SC-001→SC-009 mappés aux tests (197 verts) + DoD cochée ; **test de charge SLO p95 < 800 ms différé au staging** (convention 011/012, infra réelle)

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
