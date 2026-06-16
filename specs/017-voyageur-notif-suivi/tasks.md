# Tasks: Notifications + magic-link de suivi voyageur

**Feature roadmap 010** · branche `017-voyageur-notif-suivi` · modules `intake` (× `identité`/`profil` en lecture).
Backend uniquement (le lien route vers la page récap 008 existante). **Mirroir du pattern
conseiller de 012** (Dispatcher/Sender/Worker + outbox + mailer SES). **TDD** (Principe VI) pour
la fonction pure : tests AVANT impl, **commits séparés visibles**.

Légende : `[P]` parallélisable · `[US#]` rattaché à une user story. Refs : spec.md (FR/SC),
plan.md, data-model.md, contracts/ports.md, research.md, docs/adr/0029.

## Phase 1 : Setup

- [x] T001 [P] Types partagés : enums `VoyageurNotificationType` / `VoyageurNotificationStatus` / `MatchOutcome` dans `packages/shared/src/intake/notification.ts` (+ barrel)
- [x] T002 [P] Port public `VoyageurMatchNotifier` (interface + symbole) dans `packages/shared/src/intake/` (consommé par matching, cf. contracts/ports.md)
- [x] T003 [P] Port `ConseillerPublicDisplayReader` (interface + symbole : `getPublicDisplay(ids) → [{conseillerId, prenom, specialites}]`) dans `packages/shared/src/profil-public/`
- [x] T004 [P] Modèle Prisma `VoyageurNotification` (`idempotencyKey` UNIQUE, briefId, type, status, outcome, conseillerIds jsonb, attempts, lastError) + enums dans `packages/db/prisma/schema/intake.prisma` + **migration** `migrate dev`
- [x] T005 Scaffolding : dossiers `apps/api/src/modules/intake/{domain/services,application/ports,application/use-cases,infrastructure/jobs}` + `packages/email-templates/src/intake/`

## Phase 2 : Foundational (bloque les user stories)

- [x] T006 Port interne `VoyageurNotificationOutbox` (`enqueue`/`scanPending`/`markSent`/`markFailed`/`cancelPendingForBrief`) + symbole dans `application/ports/` (mirroir `LeadNotificationOutbox` de 012)
- [x] T007 `PrismaVoyageurNotificationOutbox` (`infrastructure/prisma-voyageur-notification-outbox.ts`) : enqueue idempotent (`ON CONFLICT (idempotencyKey)`), scan pending
- [x] T008 [P] Adapter `PrismaConseillerPublicDisplayReader` (`infrastructure/`) : lit prénom + spécialités via la surface publique profil 007 ; ne retourne que les conseillers **publics+vérifiés** (re-check)
- [x] T009 Enregistrement file BullMQ `intake.voyageur-notifications` (module) + DI des ports (T006/T008)

## Phase 3 : User Story 1 — Notification « conseillers prêts / on cherche » (P1) 🎯 MVP

**Goal** : sur événement de matching, le voyageur reçoit une notification adaptée (prêts / partiel / on cherche), prénoms+spécialités publics, lien de suivi, sans contact ; idempotent ; mode dégradé.
**Independent Test** : event `matched` → 1 courriel FR-CA avec prénoms/spécialités + lien suivi, 0 contact ; rejeu → pas de doublon ; SES HS → réessai non bloquant.

### Tests d'abord (TDD — commit AVANT impl)
- [x] T010 [P] [US1] **(TDD)** Tests `selectNotificationForOutcome` dans `domain/services/__tests__/select-notification-for-outcome.test.ts` : matched/partiel → `conseillers_prets` ; unmatched → `recherche_en_cours` ; issue inchangée → **supprimée** (anti-spam). **Commit avant impl.**
- [x] T011 [P] [US1] **(TDD)** Test invariant anti-PII/anti-marketplace du rendu courriel (0 contact/0 montant ; prénom+spécialité seulement) dans `__tests__/voyageur-notification-anti-transaction.invariant.test.ts`.

### Implémentation
- [x] T012 [US1] Implémenter `selectNotificationForOutcome` (pure) dans `domain/services/select-notification-for-outcome.ts` (fait passer T010)
- [x] T013 [US1] `VoyageurMatchNotifier` (impl du port public T002) = use case `NotifyBriefOutcomeUseCase` (`application/use-cases/`) : applique `selectNotificationForOutcome`, enqueue idempotent (anti-spam si issue inchangée) ; best-effort (ne throw pas vers matching)
- [x] T014 [US1] Brancher le **consumer matching** (`matching/application/use-cases/consume-matching-event.use-case.ts`) pour appeler `VoyageurMatchNotifier.onBriefOutcome(...)` après son traitement (cross-module via port public ; MatchingModule importe déjà IntakeModule)
- [x] T015 [P] [US1] Templates react-email FR-CA/EN `voyageur-advisors-ready.tsx` + `voyageur-still-searching.tsx` dans `packages/email-templates/src/intake/` (prénoms+spécialités, CTA lien suivi, **aucun contact**)
- [x] T016 [US1] `SesVoyageurNotificationMailer` (`infrastructure/`) : au send → résout prénom/spécialité (`ConseillerPublicDisplayReader`), génère un magic-link `view_brief_status` (008), rend le template, envoie SES ca-central-1 ; **skip si brief anonymisé**
- [x] T017 [US1] `VoyageurNotificationDispatcher` + `Sender` + `Worker` (`infrastructure/jobs/voyageur-notification.job.ts`, mirroir 012) : 1 job/notification (`jobId=id`), re-throw sur échec SES → backoff
- [x] T018 [US1] Enregistrement DI complet (module) : notifier, use case, mailer, jobs ; export du port public `VoyageurMatchNotifier` (consommé par matching)
- [x] T019 [US1] Test intégration Testcontainers : event matched → notification persistée + (stub mailer) envoyée, 0 doublon au rejeu (SC-001) ; unmatched → `recherche_en_cours` ; SES stub HS → reste `en_attente` (SC-003)

## Phase 4 : User Story 2 — Accusé d'activation (P2)

**Goal** : à l'activation du brief (post-vérification 008), un accusé distinct est envoyé.
**Independent Test** : activer un brief → 1 notification `accuse_activation`, distincte du courriel de vérification.

- [ ] T020 [US2] Enqueue de l'accusé dans le use case d'activation 008 (`verify-magic-link.use-case.ts`) : `VoyageurNotificationOutbox.enqueue(type=accuse_activation, key=activation:{briefId})`
- [ ] T021 [P] [US2] Template react-email FR-CA/EN `voyageur-activation-ack.tsx` (« demande confirmée, on cherche ») + lien de suivi
- [ ] T022 [US2] Test intégration : activation → 1 accusé enqueue/envoyé (idempotent), distinct du verify

## Phase 5 : User Story 3 — Lien de suivi durable / renvoyable (P2)

**Goal** : le voyageur revient via le lien de suivi ; expiré → renvoi.
**Independent Test** : lien valide → page récap ; expiré → ResendMagicLink → nouvel accès.

- [ ] T023 [US3] Vérifier/cadrer la génération du lien `view_brief_status` dans le mailer (T016) comme **renvoyable** ; brancher le renvoi sur `ResendMagicLinkUseCase` (008) depuis le courriel/échec
- [ ] T024 [US3] Test intégration : lien de suivi route vers `/voyage/[token]` (récap) ; expiré → renvoi fonctionnel (réutilise les tests magic-link 008)

## Phase 6 : Polish & portes qualité (transverses — requises pour la DoD)

- [ ] T025 [US3] Cascade Loi 25 : étendre `RequestBriefErasureUseCase` (008) pour `cancelPendingForBrief(briefId)` (FR-010) + test (notification en attente → `annulee`, 0 envoi ultérieur, SC-005)
- [ ] T026 [P] Métriques OTel `cv.intake.voyageur_notification.*` (enqueued/sent/failed/cancelled par type) + ré-engagement (SC-007/009)
- [ ] T027 [P] Étendre le scan anti-PII (`tools/check-no-pii-matching-audit.ts`) à `intake_voyageur_notifications` (colonne `lastError` ; `conseillerIds` = UUIDs) — SC-004
- [ ] T028 [P] README intake (section notifications voyageur) + runbook `docs/runbooks/` + ADR-0029 → *accepté* + `quickstart.md` § Statut de validation (SC-001→009) + DoD
- [ ] T029 Revue de copie FR-CA des 3 templates avec ton rassurant pour `recherche_en_cours` (FR-003/SC-008) ; clés i18n EN

## Dépendances & ordre

- **Setup (P1)** : T001-T004 `[P]` ; T005 ensuite.
- **Foundational (P2)** : T006/T007 (outbox) + T008 (reader) + T009 (file/DI) → bloque les US.
- **US1 (P3)** : dépend de Foundational. TDD T010/T011 **avant** T012+. T014 touche le module matching. MVP livrable.
- **US2 (P4)** : dépend de Foundational (outbox) ; indépendante d'US1.
- **US3 (P5)** : dépend de T016 (le mailer génère le lien) + infra magic-link 008.
- **Polish (P6)** : après les stories. T025 (Loi 25) + T027 (scan) = requis DoD.
- ⚠️ Sérialiser ce qui touche `consume-matching-event.use-case.ts` (T014), `intake.module.ts` (T009/T018), et `verify-magic-link.use-case.ts` (T020).

## Parallélisation
- Setup : T001/T002/T003/T004 `[P]`. Foundational : T008 `[P]`. US1 : T010/T011 `[P]` (tests), T015 `[P]`. US2 : T021 `[P]`. Polish : T026/T027 `[P]`.

## Stratégie
MVP = Phase 1 + 2 + **US1** (notification « prêts/on cherche » prouvée + idempotence + mode
dégradé). Incréments : US2 (accusé) puis US3 (lien durable). **TDD** de `selectNotificationForOutcome`
(T010) + invariant anti-PII (T011) non négociables. Avant prod : validations staging (charge) +
secret `DATABASE_URL_STAGING` (scan) + revue de copie FR-CA conformité (contenu « prêts »).
