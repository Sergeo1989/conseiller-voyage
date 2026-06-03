---
description: "Task list — feature 011 matching scoring conseiller × brief (top 3)"
---

# Tasks : Matching scoring conseiller × brief (top 3)

**Input** : Design documents from `/specs/008-matching-scoring/`

**Prerequisites** : `plan.md` ✅, `spec.md` ✅, `research.md` ✅, `data-model.md` ✅, `contracts/` ✅, `quickstart.md` ✅.

**Tests** : OUI — TDD strict obligatoire (Constitution Principe VI NON-NÉGOCIABLE). RED commits séparés AVANT GREEN sur tout le scoring domain. Tests de propriété requis pour invariants SC-002/003/004/005/006.

**Organization** : tâches groupées par User Story (US1 P1 / US2 P2 / US3 P3) — chaque US livrable et testable indépendamment. **MVP = US1 seule** (déjà valeur cœur : un brief → un top 3 persisté).

## Format : `[ID] [P?] [Story] Description`

- **[P]** : exécutable en parallèle (fichiers différents, pas de dépendance sur tâche non terminée)
- **[Story]** : US1 / US2 / US3 — phase user story uniquement (Setup/Foundational/Polish n'ont pas de label)
- Chemin de fichier exact dans chaque description

---

## Phase 1 : Setup — Infrastructure partagée

**Purpose** : namespace shared, env vars, ADRs, fichier FSA centroïdes téléchargé et préparé.

- [X] T001 [P] Créer le namespace `@cv/shared/matching` — créer `packages/shared/src/matching/index.ts` (placeholder vide), ajouter exports `./matching` + `./matching/*` dans `packages/shared/package.json`, créer `packages/shared/src/matching/README.md` avec rôle + dépendances
- [X] T002 [P] Créer le placeholder schéma DB — créer `packages/db/prisma/schema/matching.prisma` vide (juste header `generator client` ré-utilisé du multi-fichier preview). Sera enrichi en Phase 2.
- [X] T003 [P] Ajouter env vars matching dans `apps/api/src/env.ts` — `MATCHING_ALGORITHM_VERSION` (défaut `"v1.0"`), `MATCHING_WEIGHT_DESTINATION` (défaut `0.35`), `MATCHING_WEIGHT_GEO` (défaut `0.25`), `MATCHING_WEIGHT_SPECIALITY` (défaut `0.25`), `MATCHING_WEIGHT_FAMILIARITY` (défaut `0.15`), `MATCHING_BOOST_FACTOR_MAX` (défaut `1.10`). superRefine prod-safe : sum weights = 1.0 ± 10⁻⁶.
- [X] T004 Télécharger + traiter le fichier FSA centroïdes Statistique Canada — créer `tools/build-fsa-centroids.ts` (CLI Node) qui lit le shapefile/CSV StatCan publié sous OGL-Canada, calcule les centroïdes, génère `packages/shared/src/matching/fsa-centroids.json` (~150 KB minifié, 1 622 FSA × {lat, lng, province}). Documenter source + version dans le header JSON.
- [X] T005 [P] Configurer `turbo.json` pour passer les env vars `MATCHING_*` au runtime — ajouter à `globalPassThroughEnv`.
- [X] T006 [P] Créer `docs/adr/0020-matching-scoring-weights.md` (statut Proposed) — pondération initiale 0.35 / 0.25 / 0.25 / 0.15 + référence research.md R1.
- [X] T007 [P] Créer `docs/adr/0021-fsa-haversine-distance.md` (statut Proposed) — Haversine + 5 paliers + référence research.md R2.
- [X] T008 [P] Créer `docs/adr/0022-fsa-centroids-statcan-source.md` (statut Proposed) — source StatCan + licence OGL-Canada + référence research.md R3.
- [X] T009 [P] Créer `docs/adr/0023-matching-anonymisation-cascade.md` (statut Proposed) — trigger Postgres `AFTER UPDATE` sur `voyageur_briefs` + référence research.md R4.
- [X] T009b [P] Créer `docs/adr/0024-matching-cross-module-extensions.md` (statut Proposed) — stratégie cross-module : décrit explicitement les 3 extensions cross-module que 011 introduit (1) éventuel `siegeSocialPostalCode` sur `conformite_compliances` si absent (T015), (2) éventuel `suggested_conseiller_id` sur `voyageur_briefs` si absent (T069), (3) extension du `OutboxPublisherJob` de feature 003 (T093). Précise que chacune sera livrée soit dans la PR 011 si trivial, soit en PR satellite coordonnée. Couvre **finding C2** de `/speckit-analyze`.
- [X] T010 [P] Créer `apps/api/src/modules/matching/README.md` placeholder — rôle, dépendances (001 conformité, 007 profil, 008 intake outbox, 003 outbox publisher), endpoints (1 admin), ADRs 0020-0024.

**Smoke test Phase 1** : `pnpm typecheck` 17 packages OK, `pnpm lint` OK, fichier `fsa-centroids.json` présent et lisible Zod.

---

## Phase 2 : Foundational — Schéma DB, ports, wiring module

**⚠️ CRITIQUE** : aucune US ne peut commencer tant que cette phase n'est pas terminée.

### Schéma DB et migrations (séquentielles)

- [X] T011 Compléter `packages/db/prisma/schema/matching.prisma` — 4 modèles (`MatchingResult`, `MatchingResultEntry`, `MatchingAuditEntry`, `MatchingOutboxEntry`) + 3 enums (`MatchingStatus`, `MatchingAuditEventType`, `MatchingOutboxEventType`), indexes, contraintes CHECK conformes à `data-model.md`.
- [X] T012 Générer migration `packages/db/prisma/migrations/2026XXXX_init_matching/migration.sql` via `prisma migrate diff --from-empty --to-schema-datamodel --script` filtré sur tables `matching_*`. Inclure les CHECK constraints + UNIQUE INDEX partiel `idx_matching_results_brief_active`.
- [X] T013 Créer migration `packages/db/prisma/migrations/2026XXXX_matching_audit_append_only/migration.sql` — trigger Postgres `BEFORE UPDATE OR DELETE OR TRUNCATE` sur `matching_audit_entries` (réutilise fonction `raise_append_only_error('matching_audit_entries')` déjà déployée par 001/008) + création rôle DB `app_matching` least privilege (SELECT sur `voyageur_briefs`/`conseiller_profiles`/`conformite_compliances`, INSERT/SELECT sur `matching_*`).
- [X] T014 Créer migration `packages/db/prisma/migrations/2026XXXX_matching_anonymisation_cascade/migration.sql` — trigger Postgres `AFTER UPDATE` sur `voyageur_briefs` quand `status` transitionne vers `anonymized` : set `matching_results.briefId = NULL`, `suggestedConseillerId = NULL`, redact `matching_result_entries.scoreComponents` en `'{"redacted":"loi25"}'::jsonb`. **JAMAIS toucher à `matching_audit_entries`** (audit Loi 25 préservé).
- [X] T015 Vérifier présence champ adresse + code postal sur `conformite_compliances` (feature 001) — lecture `packages/db/prisma/schema/conformite.prisma`. **Si absent** : créer migration mineure `2026XXXX_conformite_siege_postal_code` ajoutant `siegeSocialPostalCode String?` ; soit l'inclure dans la PR 011 (avec mention dans Constitution Check cross-module ADR-0024), soit ouvrir une PR satellite courte sur 001. **Si présent** : noter dans le tasks.md « OK déjà présent ».
- [X] T015b Vérifier présence des 4 champs requis pour `ConseillerSnapshot` sur `ConseillerProfile` (feature 007) — lecture `packages/db/prisma/schema/profil.prisma` : (a) `languages` (liste de `'fr' | 'en'`), (b) `specialities` (liste enum `TravelSpeciality` aligné 008), (c) `destinations` (liste de `{country, regions?}`), (d) un champ représentant l'expérience/séniorité du conseiller (nommage à confirmer — la `data-model.md` utilise `experienceTier: 'mentor' | 'pair' | 'pair_expert'` ; 007 peut utiliser un autre nom, ex. `experienceLevel`). Documenter le mapping ou la migration mineure nécessaire dans ADR-0024. Couvre **findings U3 + L1**.

### Shared package (parallélisable)

- [X] T016 [P] Créer `packages/shared/src/matching/branded-ids.ts` — `MatchingResultId`, `MatchingResultEntryId`, `MatchingAuditEntryId`, `MatchingOutboxEntryId`, `FsaCode` (branded UUID/string + helpers `assert*` + schemas Zod brandés).
- [X] T017 [P] Créer `packages/shared/src/matching/schemas.ts` — 4 schemas Zod outbox payloads (OutboxMatched, OutboxPartial, OutboxUnmatched, OutboxAllRevoked) + AdminRematchRequest selon `contracts/outbox-events.md`.
- [X] T018 [P] Créer `packages/shared/src/matching/contracts.ts` — interface `MatchingQueryPort` + types `MatchingResultPublicView`/`MatchingResultAdminView`/`BriefRevocationSummary` selon `contracts/matching-query.port.md` + token DI `MATCHING_QUERY_PORT = Symbol.for('MATCHING_QUERY_PORT')`.
- [X] T019 [P] Créer `packages/shared/src/matching/event-names.ts` — mapping `MatchingOutboxEventType` (enum DB snake_case) ⇄ event bus name kebab-case (`voyageur.brief.matched`, etc.) + fonction `toEventBusName(enum) → string` + `fromEventBusName(string) → enum`.
- [X] T020 [P] Compléter `packages/shared/src/matching/index.ts` — re-exports propres des 4 modules ci-dessus.

### Ports applicatifs (parallélisable)

- [X] T021 [P] Créer `apps/api/src/modules/matching/application/ports/conseiller-snapshot-reader.port.ts` — interface `ConseillerSnapshotReader` avec méthode `readAllVerifiedSnapshots(filterLanguage: 'fr' | 'en'): Promise<ConseillerSnapshot[]>` + type `ConseillerSnapshot` immutable selon data-model §5.
- [X] T022 [P] Créer `apps/api/src/modules/matching/application/ports/brief-snapshot-reader.port.ts` — interface `BriefSnapshotReader` avec `readByBriefId(briefId): Promise<BriefSnapshot | null>` + type `BriefSnapshot` immutable selon data-model §5.
- [X] T023 [P] Créer `apps/api/src/modules/matching/application/ports/matching-result-writer.port.ts` — interface avec `create(matchingResult, entries) → MatchingResultId`, `markSuperseded(id, newId)`. Idempotence par briefId via UNIQUE INDEX (contrainte DB).
- [X] T024 [P] Créer `apps/api/src/modules/matching/application/ports/matching-result-reader.port.ts` — interface avec `findActiveByBriefId(briefId): Promise<MatchingResultEntity | null>`, `findActiveResultsForAllMatchesRevokedDetection(): Promise<MatchingResultEntity[]>` (pour scheduler US3).
- [X] T025 [P] Créer `apps/api/src/modules/matching/application/ports/matching-audit-writer.port.ts` — interface avec `append(auditEntry)` + variantes pour 7 event types `matching.*` du data-model.
- [X] T026 [P] Créer `apps/api/src/modules/matching/application/ports/matching-outbox-writer.port.ts` — interface avec `enqueue(eventType, payload, idempotencyKey) → Promise<void>` (insert dans `matching_outbox_entries`, contrainte UNIQUE sur idempotencyKey gère le replay).
- [X] T027 [P] Créer `apps/api/src/modules/matching/application/ports/fsa-centroid-reader.port.ts` — interface avec `lookup(fsaCode): {lat, lng, province} | null` + `getAll(): FsaCentroidTable`. L'implémentation embedded charge le JSON au boot.
- [X] T028 [P] Créer `apps/api/src/modules/matching/application/ports/redis-lock.port.ts` — interface avec `acquireRematchLock(briefId, ttlMs): Promise<boolean>` (SETNX) + `releaseRematchLock(briefId)`. Pour FR-016 + idempotence re-matching admin.
- [X] T029 [P] Créer `apps/api/src/modules/matching/application/ports/index.ts` — re-exports + tokens DI `Symbol.for(...)` pour les 8 ports.

### Module placeholder + wiring AppModule

- [X] T030 Créer `apps/api/src/modules/matching/matching.module.ts` (placeholder vide pour l'instant, providers ajoutés au fil des phases).
- [X] T031 Wirer `MatchingModule` dans `apps/api/src/app.module.ts` — ajouter à la liste `imports`.

**Smoke test Phase 2** : `pnpm db:migrate` applique les 3 migrations sans erreur, `pnpm prisma:generate` régénère client, `pnpm typecheck` 17 packages OK, `pnpm test:unit` continue à passer (aucune régression sur les 360 tests existants).

**Checkpoint** : foundation prête. Les 3 user stories peuvent démarrer en parallèle si capacité d'équipe.

---

## Phase 3 : User Story 1 — Voyageur reçoit ses 3 conseillers vérifiés (Priority : P1) 🎯 MVP

**Goal** : un brief activé déclenche le calcul du top 3 (filtre langue + 4 axes pondérés), persistance append-only + 1 event outbox parmi `matched`/`partially_matched`/`unmatched`.

**Independent Test** : scénario 1 de `quickstart.md` (golden path Cuba + FR). Vérifie que `matching_results` contient une ligne `status=ok`, `matching_result_entries` 3 lignes triées, `matching_outbox_entries` 1 event `voyageur_brief_matched` en pending.

### 3a — Domain Value Objects (TDD strict, RED → GREEN séparés)

- [X] T032 [P] [US1] RED : `apps/api/src/modules/matching/domain/value-objects/__tests__/score.vo.test.ts` — decimal immutable [0, 1.1], helpers `Score.fromNumber`, `Score.zero`, comparison, multiplyByFactor (cap 1.1).
- [X] T033 [US1] GREEN : `apps/api/src/modules/matching/domain/value-objects/score.vo.ts`
- [X] T034 [P] [US1] RED : `apps/api/src/modules/matching/domain/value-objects/__tests__/score-components.vo.test.ts` — record {destination, geo, speciality, familiarity}, méthode `toScoreBrut(weights): Score`, validation sum normalisée.
- [X] T035 [US1] GREEN : `apps/api/src/modules/matching/domain/value-objects/score-components.vo.ts`
- [X] T036 [P] [US1] RED : `apps/api/src/modules/matching/domain/value-objects/__tests__/fsa-code.vo.test.ts` — regex `^[A-Z]\d[A-Z]$` (3 chars), normalisation case, equality, parse depuis postal code complet `H7N 1A1` → `H7N`.
- [X] T037 [US1] GREEN : `apps/api/src/modules/matching/domain/value-objects/fsa-code.vo.ts`
- [X] T038 [P] [US1] RED : `apps/api/src/modules/matching/domain/value-objects/__tests__/matching-status.vo.test.ts` — guards `isOk`, `isPartial`, `isEmpty`, dérivation depuis `matchedCount`.
- [X] T039 [US1] GREEN : `apps/api/src/modules/matching/domain/value-objects/matching-status.vo.ts`
- [X] T040 [P] [US1] RED : `apps/api/src/modules/matching/domain/value-objects/__tests__/weights-config.vo.test.ts` — invariant sum = 1.0 ± 10⁻⁶, rejet si != 1.
- [X] T041 [US1] GREEN : `apps/api/src/modules/matching/domain/value-objects/weights-config.vo.ts` (factory `fromEnv(env): WeightsConfig` qui lit les 4 `MATCHING_WEIGHT_*`).

### 3b — Domain services (TDD strict)

- [X] T042 [P] [US1] RED : `apps/api/src/modules/matching/domain/services/__tests__/compute-fsa-distance.test.ts` — Haversine, FSA identiques → 0, FSA voisins → ~5 km, FSA opposés Canada → ~5 000 km, FSA inconnu dans table → null. 5 paliers de score géo (data-model + research R2).
- [X] T043 [US1] GREEN : `apps/api/src/modules/matching/domain/services/compute-fsa-distance.ts` (fonction pure `computeFsaDistance(a, b, centroids) → number | null` + `distanceToGeoScore(km) → number`).
- [X] T044 [P] [US1] RED : `apps/api/src/modules/matching/domain/services/__tests__/calculate-score.test.ts` — 4 axes scorés individuellement, intégration : destination match parfait + géo proche + spécialité exacte + familiarité alignée → score brut élevé. Edge cases nommés : destination unknown → 0, **FR-009b explicite** : FSA voyageur null / code postal invalide / hors Canada → score géo neutre médian (0,5) sans rejeter le conseiller, familiarité mismatch → score réduit. Couvre **finding L2**.
- [X] T045 [US1] GREEN : `apps/api/src/modules/matching/domain/services/calculate-score.ts` (signature : `(brief, conseiller, weights, fsaCentroids) → ScoreComponents`, fonction pure 100 %).
- [X] T046 [P] [US1] RED : `apps/api/src/modules/matching/domain/services/__tests__/select-top-three.test.ts` — tri décroissant scoreFinal, plafond 3 strict (10 conseillers in → 3 out), partial (2 conseillers → 2 out + status partial), empty (0 conseillers → empty), ties broken par position alphabétique de conseillerId (déterminisme SC-002).
- [X] T047 [US1] GREEN : `apps/api/src/modules/matching/domain/services/select-top-three.ts` (fonction pure `(scoredConseillers[]) → TopThreeResult`).

### 3c — Domain entities + events

- [X] T048 [P] [US1] Créer `apps/api/src/modules/matching/domain/entities/matching-result.entity.ts` + tests d'invariant (briefId valide ou null post-anonymisation, status cohérent avec matchedCount).
- [X] T049 [P] [US1] Créer `apps/api/src/modules/matching/domain/entities/matching-result-entry.entity.ts` + tests d'invariant (position ∈ {1,2,3}, scoreFinal ≤ scoreBrut × 1.10).
- [X] T050 [P] [US1] Créer `apps/api/src/modules/matching/domain/events/matching-events.ts` — 4 types domain `BriefMatchedEvent`, `BriefPartiallyMatchedEvent`, `BriefUnmatchedEvent` (US1) + stub `AllMatchesRevokedEvent` (utilisé par US3).

### 3d — Application use case (TDD)

- [X] T051 [US1] RED : `apps/api/src/modules/matching/application/use-cases/__tests__/perform-matching.use-case.test.ts` avec fakes en mémoire — golden path 3 conseillers verified Cuba+FR → status=ok 3 entries + audit + outbox `voyageur_brief_matched`. Edge : 0 conseiller éligible → empty + audit + outbox `voyageur_brief_unmatched`. Edge : 2 conseillers → partial. Idempotence : replay même briefId → audit `matching.replay_ignored`, aucune nouvelle ligne.
- [X] T052 [US1] Créer `apps/api/src/modules/matching/application/__tests__/_fakes.ts` — fakes en mémoire pour les 8 ports + Clock + UuidGenerator + FsaCentroidTable de test (10 FSA Quebec couvrant les tests).
- [X] T053 [US1] GREEN : `apps/api/src/modules/matching/application/use-cases/perform-matching.use-case.ts` (orchestration : lit brief snapshot + candidate set verified + filtre langue + boucle scoring + select top 3 + persistance atomique + outbox dans la même transaction).

### 3e — Tests d'invariant property-based (SC-002/003/005)

- [X] T054 [P] [US1] RED + GREEN dans un commit : `apps/api/src/modules/matching/application/__tests__/perform-matching.property.test.ts` — fast-check ou équivalent. Propriétés :
  - **SC-002 déterminisme** : 1 000 tirages aléatoires de briefs × conseillers, 2 exécutions consécutives produisent le même score brut à 10⁻⁶ près.
  - **SC-003 plafond 3** : sur 1 000 tirages, aucun résultat n'a `matchedCount > 3`.
  - **SC-005 verified 100 %** : sur 1 000 tirages avec mix verified/non-verified, aucun non-verified n'apparaît dans le résultat.
  - **SC-006 idempotence 10 000 replays** : pour 1 brief donné, 10 000 invocations consécutives de `PerformMatchingUseCase.execute({briefId})` n'aboutissent qu'à 1 seul `MatchingResult` actif en base — vérifié via fakes en mémoire qui simulent la contrainte UNIQUE INDEX partielle de DB. Couvre **finding C1**.

### 3f — Infrastructure adapters

- [X] T055 [P] [US1] Créer `apps/api/src/modules/matching/infrastructure/prisma-matching-result-repository.ts` — implémente `MatchingResultWriter` + `MatchingResultReader`. Transaction Prisma : insert `matching_results` + N × `matching_result_entries`, contrainte UNIQUE partielle protège l'idempotence.
- [X] T056 [P] [US1] Créer `apps/api/src/modules/matching/infrastructure/prisma-matching-audit-writer.ts`.
- [X] T057 [P] [US1] Créer `apps/api/src/modules/matching/infrastructure/prisma-matching-outbox-writer.ts`.
- [X] T058 [P] [US1] Créer `apps/api/src/modules/matching/infrastructure/prisma-brief-snapshot-reader.ts` — lit `voyageur_briefs` + extrait FSA depuis `VoyageurContact.postalCode` via `FsaCode.parseFromPostalCode`.
- [X] T059 [US1] Créer `apps/api/src/modules/matching/infrastructure/prisma-conseiller-snapshot-reader.ts` — lit `ConseillerProfile` + `ConformiteCompliance`, **filtre verified via `ConformiteQueryPort.getVerificationStatus`** (cross-module via interface publique), applique **filtre dur langue** (Q3) sur `profile.languages`, résout FSA via hiérarchie `profile.address.postalCode` → `compliance.siegeSocialPostalCode` (R5), retourne `ConseillerSnapshot[]`.
- [X] T060 [P] [US1] Créer `apps/api/src/modules/matching/infrastructure/embedded-fsa-centroid-reader.ts` — implémente `FsaCentroidReaderPort`, charge le JSON statique `@cv/shared/matching/fsa-centroids.json` au boot (singleton DI), validation Zod du fichier au boot (defense-in-depth).
- [X] T061 [US1] Créer `apps/api/src/modules/matching/infrastructure/redis-rematch-lock.ts` — implémente `RedisLockPort` via SETNX EX 30s sur clé `matching:rematch:${briefId}`.

### 3g — BullMQ consumer + wiring

- [X] T062 [US1] Créer `apps/api/src/modules/matching/infrastructure/jobs/brief-activated.consumer.ts` — BullMQ consumer qui écoute le topic `voyageur.brief.activated` (publié par 003 OutboxPublisher draining `intake_outbox_entries`). À chaque event, appelle `PerformMatchingUseCase.execute({briefId})`. Retry avec backoff exponentiel max 5, dead-letter après échec.
- [X] T063 [US1] Compléter le wiring DI dans `apps/api/src/modules/matching/matching.module.ts` — 8 ports → adapters + use case + consumer + Clock + UuidGenerator + WeightsConfig depuis env. Pattern hérité de `intake.module.ts` (useFactory + inject explicite).

### 3h — Test d'intégration end-to-end

- [X] T064 [US1] Créer `apps/api/test/integration/matching/perform-matching.integration.test.ts` (Testcontainers Postgres + Redis, `skipIf docker !running`) — golden path quickstart scénario 1 + partial scénario 3 + idempotence scénario 4.

**Checkpoint US1** : un brief activé en local produit un `MatchingResult` complet en base + 1 event outbox. MVP livrable même sans US2 + US3.

---

## Phase 4 : User Story 2 — Boost soft cookie `cv_suggested` (Priority : P2)

**Goal** : un voyageur ayant consulté un conseiller publiquement dans les 24 h précédant son brief voit ce conseiller bénéficier d'un boost ≤ +10 % au scoring.

**Independent Test** : scénario 2 de `quickstart.md` (B initialement 4e en brut, promu top 3 après boost).

### 4a — Apply-boost service + tests

- [ ] T065 [P] [US2] RED : `apps/api/src/modules/matching/domain/services/__tests__/apply-boost.test.ts` — boost appliqué si `suggestedConseillerId` correspond + conseiller verified, no-op si suggestedConseillerId absent, no-op si conseiller suggéré non-verified, plafond strict ×1.10. Test d'invariant : scoreFinal ≤ scoreBrut × 1.10.
- [X] T066 [US2] GREEN : `apps/api/src/modules/matching/domain/services/apply-boost.ts` (fonction pure `(scoreBrut, suggestedConseillerId | null, conseillerId, isVerified, factor) → ScoreFinal`).

### 4b — Étendre PerformMatchingUseCase

- [X] T067 [US2] RED : étendre `perform-matching.use-case.test.ts` avec cas boost (cookie présent valide → boost appliqué + audit `boostApplied: true`, cookie absent → no-op, cookie pointant non-verified → no-op).
- [X] T068 [US2] GREEN : modifier `apps/api/src/modules/matching/application/use-cases/perform-matching.use-case.ts` — après calcul ScoreComponents par conseiller, appliquer `applyBoost` si `brief.suggestedConseillerId` est présent et le conseiller match. Persister `MatchingResult.boostApplied` + `MatchingResultEntry.boosted`.

### 4c — Brief snapshot capture suggestedConseillerId

- [X] T069 [US2] Étendre `prisma-brief-snapshot-reader.ts` (T058) — lire `voyageur_briefs.suggested_conseiller_id` (champ à ajouter feature 008 si absent — vérifier via lecture schema `intake.prisma`). Si le champ est absent : créer migration mineure `2026XXXX_voyageur_briefs_add_suggested_conseiller_id` (extension feature 008 acceptable via ADR ou tâche follow-up à coordonner).
- [X] T070 [US2] Étendre 008 `submit-brief.use-case.ts` (feature intake) — lire le cookie `cv_suggested` HMAC posé par 007, valider la signature avec `PROFIL_SUGGESTED_COOKIE_SECRET` (déjà géré par 007), si valide persister `suggestedConseillerId` sur le brief créé. **Pré-requis** : confirmer que cette logique n'est pas déjà présente dans 008 (relire R2 du intake research).

### 4d — Test d'intégration boost

- [X] T071 [US2] Créer `apps/api/test/integration/matching/boost.integration.test.ts` — scénario 2 quickstart, vérifie promotion du 4e en top 3 + invariant scoreFinal ≤ scoreBrut × 1.10.

**Checkpoint US2** : le boost est testable indépendamment de US3. Combiné avec US1, le matching MVP est complet pour la majorité des voyageurs.

---

## Phase 5 : User Story 3 — Mode dégradé + re-matching admin (Priority : P3)

**Goal** : la lecture exposée au voyageur filtre dynamiquement les conseillers non-verified ; quand les 3 conseillers d'un MR sont tous révoqués, un event outbox alerte l'admin qui peut déclencher un re-matching manuel.

**Independent Test** : scénarios 5 (re-matching admin) et 6 (anonymisation cascade) de `quickstart.md`.

### 5a — QueryMatchingResultUseCase (lecture filtrée + admin)

- [X] T072 [P] [US3] RED : `apps/api/src/modules/matching/application/use-cases/__tests__/query-matching-result.use-case.test.ts` — `getByBriefIdForVoyageur` exclut un conseiller révoqué après calcul, retourne null si brief anonymisé. `getByBriefIdForAdmin` retourne tout l'état historique + `currentVerifiedStatus` par entry.
- [X] T073 [US3] GREEN : `apps/api/src/modules/matching/application/use-cases/query-matching-result.use-case.ts`.

### 5b — TriggerRematchUseCase (admin re-matching FR-016)

- [X] T074 [P] [US3] RED : `apps/api/src/modules/matching/application/use-cases/__tests__/trigger-rematch.use-case.test.ts` — verrou Redis SETNX (concurrent rematch → 409), supersede ancien MR + chaînage `supersededByMatchingResultId`, audit `matching.recomputed` avec actor + reason, nouvel event outbox publié selon nouveau statut.
- [X] T075 [US3] GREEN : `apps/api/src/modules/matching/application/use-cases/trigger-rematch.use-case.ts`.

### 5c — DetectAllMatchesRevokedScheduler

- [X] T076 [P] [US3] RED : `apps/api/src/modules/matching/application/use-cases/__tests__/detect-all-matches-revoked.use-case.test.ts` — scan MR actifs, pour chaque MR top 3 : check verified status courant des 3 conseillers, si tous 3 révoqués → émet event `voyageur.brief.all_matches_revoked` + audit `matching.all_matches_revoked_detected`. Idempotence : ne ré-émet pas le même event (UNIQUE sur idempotency key).
- [X] T077 [US3] GREEN : `apps/api/src/modules/matching/application/use-cases/detect-all-matches-revoked.use-case.ts`.
- [X] T078 [US3] Créer `apps/api/src/modules/matching/infrastructure/jobs/all-matches-revoked.scheduler.ts` — BullMQ repeatable daily cron 02:00 ca-central-1 (pattern hérité de jobs 008 expiration sweep).

### 5d — Infrastructure MatchingQueryPort

- [X] T079 [US3] Créer `apps/api/src/modules/matching/infrastructure/prisma-matching-query-adapter.ts` — implémente `MatchingQueryPort` (interface publique exportée depuis `@cv/shared/matching`). Filtre dynamique via `ConformiteQueryPort.getVerificationStatus`. **Cette classe est le point d'intégration public pour 012 + 015 + admin US5 extension de 008**.
- [X] T080 [US3] Exporter `MatchingQueryPort` depuis `MatchingModule.exports` + token DI → consommable par les modules clients qui importeront `MatchingModule`.

### 5e — Admin HTTP endpoint (re-trigger)

- [X] T081 [US3] Créer `apps/api/src/modules/matching/interface/http/admin-matching.controller.ts` — `POST /api/matching/admin/briefs/:briefId/re-match` avec `AuthGuard` + `RoleGuard` + `@RequireRole('admin')` + `ZodValidationPipe(AdminRematchRequest)` + `Idempotency-Key` header obligatoire. Délègue à `TriggerRematchUseCase`. Réponses 200/202/400/401/403/404/409/422 selon `contracts/http-endpoints.md`.

### 5f — Tests d'intégration US3

- [X] T082 [US3] Créer `apps/api/test/integration/matching/trigger-rematch.integration.test.ts` (Testcontainers) — scénario 5 quickstart.
- [X] T083 [US3] Créer `apps/api/test/integration/matching/anonymisation-cascade.integration.test.ts` — scénario 6 quickstart, vérifie cascade trigger Postgres (briefId nullé, scoreComponents redacted, audit préservé).
- [X] T084 [US3] Créer `apps/api/test/integration/matching/append-only-trigger.integration.test.ts` — vérifie que UPDATE/DELETE/TRUNCATE sur `matching_audit_entries` sont rejetés par le trigger Postgres (pattern hérité 008).
- [X] T085 [US3] Créer `apps/api/test/integration/matching/query-matching-port.integration.test.ts` — vérifie filtre dynamique verified (`getByBriefIdForVoyageur` exclut révoqués) + vue admin (`getByBriefIdForAdmin` retourne tout).

**Checkpoint US3** : les 3 user stories sont indépendamment fonctionnelles. Le module matching est livrable complet.

---

## Phase 6 : Polish & Cross-Cutting Concerns

### 6a — Observabilité (Principe VII)

- [X] T086 [P] Instrumenter métriques OpenTelemetry — port `MetricsRecorder` (`application/ports/metrics-recorder.port.ts`) + adapter `infrastructure/otel-metrics-recorder.ts` (counter `matching.matched_count` labelé status, histogram `matching.duration_ms`, counter `matching.boost_applied`, gauge `matching.candidates_evaluated`). Branché depuis `perform-matching.use-case.ts` (dep optionnelle, no-op par défaut) + wiring DI. Tests : 2 cas (métrique enregistrée / replay sans métrique).
- [X] T087 [P] Logs structurés Pino — `PerformMatchingUseCase` log `info` (ok) / `warn` (partial) / `error` (empty), champs `briefId`, `matchingResultId`, `status`, `matchedCount`, `candidatesEvaluated`, `durationMs`, `algorithmVersion`, `boostApplied` (PII-safe). Pattern hérité de `editer-profil.use-case.ts`.
- [X] T088 [P] Créer `docs/dashboards/matching.json` + `docs/dashboards/matching-alerts.yaml` — dashboard Grafana versionné : panels p50/p95/p99 duration, répartition status, taux boost, taux empty/partial vs ok. Alertes WARN > 5 % `empty` sur 24h + WARN > 15 % `partial` sur 7j + WARN p95 > 1 200 ms.

### 6b — Runbooks et documentation FR-CA

- [X] T089 [P] Créer `docs/runbooks/matching-rematch.md` — procédure admin re-trigger : (1) consulter file `voyageur.brief.all_matches_revoked` dans dashboard 008-US5, (2) `POST /api/matching/admin/briefs/:id/re-match` (codes 200/404/409/422), (3) vérifier nouveau MR créé + ancien superseded.
- [X] T090 [P] Créer `docs/runbooks/matching-fsa-update.md` — procédure annuelle mise à jour FSA centroïdes : version StatCan, `pnpm tsx tools/build-fsa-centroids.ts`, vérifier diff (FSA ajoutés/supprimés, `isBootstrap:false`), tester en staging. **Note : fichier actuel = amorce bootstrap 41 FSA, régénération complète 1 622 FSA requise avant merge prod.**
- [X] T091 [P] Finaliser `apps/api/src/modules/matching/README.md` — statuts US1-US3+Polish ✅, observabilité, runbooks liés, tests, section sécurité PII, note T093 satellite.
- [X] T092 [P] Ajouter clés i18n `matching.admin.*` dans `apps/web/src/i18n/messages/fr-CA.json` et `en.json` — messages re-match + erreurs HTTP admin (succès, 409 verrou, 404, 422 brief inactif, 400, 401, 403). FR-CA prioritaire (Principe IV).

### 6c — Outbox publisher extension (cross-module, coordination 003)

- [ ] T093 ⏭️ **DIFFÉRÉ — PR satellite Mode B** (ADR-0024 §E3, toujours Mode B). Étendre `OutboxPublisherJob` (feature 003, situé dans `modules/conformite/infrastructure/jobs/outbox-publisher.job.ts`) pour drainer `matching_outbox_entries` vers le bus Redis → consommable par 012. **Hors PR 011** : l'outbox intake (`voyageur.brief.activated`) n'est lui-même pas encore drainé, donc le wiring bus end-to-end est une intégration cross-module séparée à coordonner (issue dédiée). Les events matching sont déjà écrits en base par le use case (testé) ; seul le drainage est différé.
- [X] T093b [P] Créer `tools/check-no-pii-matching-audit.ts` (CLI tsx) — scan SQL `matching_audit_entries.payload` JSONB + `matching_result_entries.scoreComponents` post-anonymisation, regex email/téléphone (séparateurs obligatoires, anti-faux-positif UUID) + clés JSON PII, snippet masqué, skip non bloquant si DB absente, exit 1 si match. Logs Pino → Grafana Loki (hors scope FS). Créé `.github/workflows/scan-matching-pii.yml` (cron lundi 06:00 UTC + workflow_dispatch) contre DB staging. Couvre **findings U1 + L5 + FR-020 + SC-009**.

### 6d — Finalisation ADRs (statut Accepted)

- [X] T094 [P] ADR-0020 statut accepté + note d'implémentation (WeightsConfig 0.35/0.25/0.25/0.15, bump algorithmVersion, mitigation alignée sur dashboard réel).
- [X] T095 [P] ADR-0021 statut accepté + note d'implémentation (5 paliers vérifiés identiques au code `compute-fsa-distance.ts`, FR-009b/c).
- [X] T096 [P] ADR-0022 statut accepté + note d'implémentation + **avertissement bootstrap 41 FSA → régénération 1 622 avant merge prod**.
- [X] T097 [P] ADR-0023 statut accepté + note d'implémentation (migration réelle `intake_voyageur_briefs`, ordre redact→nullify, tests T083/T084).

### 6e — Quality gates finaux

- [ ] T098 Vérifier `pnpm check:boundaries` — le module `matching` respecte les frontières Principe V (imports cross-module uniquement via interfaces publiques). Si false positives sur regex heuristique, étendre l'allowlist (mémoire `feedback_module_boundaries_false_positives`).
- [ ] T099 Vérifier `pnpm lint` zéro erreur (cognitive complexity max 10 — si une fonction de scoring dépasse, refactor en helpers privés, cf. pattern intake submit-brief).
- [ ] T100 Vérifier `pnpm typecheck` 17 packages OK + nouveau package `@cv/shared/matching` typé proprement (export sans cycle).
- [ ] T101 Lancer matrice complète des 6 scénarios `quickstart.md` en local — vérifier tous green.
- [ ] T101b Test de charge léger en staging avant ouverture PR — créer `tools/load-test-matching.ts` (k6 ou autocannon, 1 brief/s pendant 60s soit 60 briefs activés simulés, mesure histogramme `matching.e2e_duration_ms`). Assertions : **p95 < 800 ms** sur le calcul + persistance et **p95 < 2 s** end-to-end incluant délai BullMQ (SC-001 + plan Performance Goals + DoD Principe X). Couvre **finding U4**.
- [ ] T102 Mettre à jour `docs/roadmap.md` — feature 011 ⏳ → 🟡 livré branche `008-matching-scoring`.

### 6f — PR + Constitution Check

- [ ] T103 Ouvrir PR vers `main` avec Constitution Check verbatim depuis `plan.md` + **cocher intégralement la DoD de `plan.md`** (chaque case validée avec preuve : test count, coverage, ADRs liés, runbooks créés, dashboard versionné) + 5 ADRs liés (0020-0024) + diff résumé (estimation : ~30-40 fichiers, ~6 000-8 000 lignes). Bloquante avant merge : tests verts en CI (Vitest unit + integration + lint + typecheck + boundaries + license + SCA), pas de E2E Playwright dans 011 (n/a pas d'UI), pas de Lighthouse (n/a). Couvre **finding L3**.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** : aucune dépendance — peut démarrer immédiatement.
- **Phase 2 Foundational** : dépend de Phase 1 (besoin du namespace + ADRs initiaux + FSA centroids fichier).
- **Phase 3 US1 (P1)** : dépend de Phase 2. **Constitue le MVP — livrable seul**.
- **Phase 4 US2 (P2)** : dépend de Phase 2 + Phase 3 (étend `PerformMatchingUseCase`).
- **Phase 5 US3 (P3)** : dépend de Phase 2 + Phase 3 (consomme `MatchingResultReader` + `MatchingResultWriter`). Indépendante de US2.
- **Phase 6 Polish** : dépend des phases livrées (3 minimum, 4 et 5 idéalement).

### User Story Dependencies

- **US1** : aucune dépendance autre que Foundational.
- **US2** : étend US1 (modifie `PerformMatchingUseCase`). Mais testable indépendamment grâce aux fakes en mémoire.
- **US3** : indépendante de US2. Peut être livrée AVANT US2 si besoin.

### TDD strict (Principe VI)

Pour **toute** tâche `[US?] RED` : commit séparé avec test rouge AVANT le commit GREEN d'implémentation. Pattern hérité de 008 intake (commits `test(008): TXXX RED — …` puis `feat(008): TXXX GREEN — …`).

### Parallel Opportunities

- **Phase 1** : T001-T010 quasi tous `[P]` (fichiers différents) — un dev peut tout pousser en une session.
- **Phase 2** :
  - DB sequential : T011 → T012 → T013 → T014 → T015
  - Shared package parallel : T016-T020 `[P]`
  - Ports parallel : T021-T029 `[P]`
- **Phase 3 US1** :
  - Domain VOs RED parallel : T032, T034, T036, T038, T040 `[P]`
  - Domain VOs GREEN dans la foulée de chaque RED
  - Domain services RED parallel : T042, T044, T046 `[P]`
  - Adapters parallel : T055-T058, T060 `[P]`
- **Phase 5 US3** :
  - 3 use cases en parallèle : T072, T074, T076 `[P]`

### Within Each User Story

- Tests RED commités **AVANT** GREEN.
- Domain pur **AVANT** application.
- Application **AVANT** infrastructure.
- Infrastructure **AVANT** interface HTTP.
- Tests intégration **EN DERNIER** (validation E2E du wiring).
- Commit après chaque tâche ou groupe TDD RED+GREEN cohérent.

---

## Parallel Example — Phase 3 US1, Domain VOs RED

```bash
# Lancer tous les tests RED VO en parallèle (5 fichiers différents)
Task: "RED score.vo.test.ts — apps/api/src/modules/matching/domain/value-objects/__tests__/score.vo.test.ts"
Task: "RED score-components.vo.test.ts — …"
Task: "RED fsa-code.vo.test.ts — …"
Task: "RED matching-status.vo.test.ts — …"
Task: "RED weights-config.vo.test.ts — …"

# Une fois RED commités, lancer GREEN en parallèle (toujours fichiers différents)
Task: "GREEN score.vo.ts — …"
Task: "GREEN score-components.vo.ts — …"
…
```

---

## Implementation Strategy

### MVP First (US1 seule)

1. **Phase 1 Setup** (10 tâches) — 1 dev × 1 journée
2. **Phase 2 Foundational** (21 tâches) — 1 dev × 2-3 jours (migrations + ports)
3. **Phase 3 US1** (33 tâches T032-T064) — 1 dev × 4-5 jours (TDD strict, domain + use case + adapters + integration test)
4. **STOP + validate** : quickstart scénario 1 (golden path) doit passer en staging.

Total MVP : ~64 tâches, ~7-9 jours dev solo.

### Incremental Delivery

- MVP US1 → demo / déploiement.
- Add US2 (Phase 4, 7 tâches) → demo.
- Add US3 (Phase 5, 14 tâches) → demo.
- Polish (Phase 6, 18 tâches) → PR.

### Parallel Team Strategy

Avec 2 devs après Foundational :
- Dev A : Phase 3 US1 (MVP)
- Dev B : Phase 5 US3 (préparation re-matching admin + scheduler, indépendant)
- Une fois US1 livrée, Dev A enchaîne Phase 4 US2.

---

## Notes

- `[P]` tasks = fichiers différents, aucune dépendance sur tâche non terminée.
- `[US1]` / `[US2]` / `[US3]` mappent à la spec — chaque US livrable indépendamment.
- TDD strict (Principe VI) : tous les services domain + use cases ont RED commit AVANT GREEN.
- Tests de propriété (T054) pour invariants SC-002/003/005 — fast-check ou équivalent.
- Pas d'E2E Playwright dans 011 (pas d'UI). E2E arrivera avec feature 015.
- Anonymisation cascade testée explicitement (T083) — Loi 25 invariant.
- Outbox publisher T093 = coordination cross-module avec 003 (extension mineure).

**Total tâches** : 107 (11 Setup + 22 Foundational + 33 US1 + 7 US2 + 14 US3 + 20 Polish) — post-remédiation des 6 findings MEDIUM de `/speckit-analyze`.

**Suite recommandée** : `/speckit-analyze` pour détecter d'éventuelles incohérences spec/plan/tasks avant `/speckit-implement`.
