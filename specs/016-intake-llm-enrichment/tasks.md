# Tasks: Enrichissement LLM de l'intake voyageur

**Feature roadmap 009** · branche `016-intake-llm-enrichment` · module `intake` (préqualification).
Backend uniquement. S'appuie sur 008 (brief + activation) et alimente 011 (matching) via un
port public. **TDD obligatoire** (Principe VI) pour les fonctions pures : tests AVANT
implémentation, **commits séparés visibles**.

Légende : `[P]` parallélisable (fichiers distincts, sans dépendance) · `[US#]` rattaché à une
user story. Refs : spec.md (FR/SC), plan.md (Constitution Check), data-model.md, contracts/,
research.md, docs/adr/0028.

## Phase 1 : Setup

- [ ] T001 [P] Types partagés : `EnrichmentStatus` + schéma Zod `EnrichedIntentions` (speciality canonique, destinations, language, confidence — **sans** champ texte libre) + vue `BriefEnrichmentView` dans `packages/shared/src/intake/enrichment.ts` (+ export barrel)
- [ ] T002 [P] Modèle Prisma `BriefEnrichment` (1:1 `briefId` UNIQUE) + enum `EnrichmentStatus` dans `packages/db/prisma/schema/intake.prisma` + migration `migrate dev` (table `brief_enrichments`, aucun champ texte libre)
- [ ] T003 Scaffolding du sous-domaine enrichissement dans `apps/api/src/modules/intake/{domain/value-objects,domain/services,application/ports,application/use-cases,infrastructure/llm,infrastructure/jobs}/`

## Phase 2 : Foundational (bloque les user stories)

- [ ] T004 Port `LlmProvider` (interface pure + symbole DI) dans `apps/api/src/modules/intake/application/ports/llm-provider.port.ts` (op. `extractStructured`, retour `ok | unavailable`, cf. contracts/llm-provider.port.md) — `@Inject(Class)` (pas de type-injection, cf. mémoire DI)
- [ ] T005 Ports `BriefEnrichmentRepository` (interne) + `BriefEnrichmentQueryPort` (**public**, lu par matching) + symboles DI dans `application/ports/` (cf. contracts/brief-enrichment.port.md)
- [ ] T006 [P] Fake `LlmProvider` déterministe (test double, aucun appel réseau) dans `apps/api/src/modules/intake/infrastructure/llm/__fakes__/fake-llm-provider.ts` (succès / unavailable / sortie hors schéma paramétrables)

## Phase 3 : User Story 1 — Enrichissement non bloquant + mode dégradé (P1) 🎯 MVP

**Goal** : un brief est enrichi best-effort ; toute panne LLM (timeout/indispo/hors schéma) → soumission + appariement aboutissent quand même en déterministe.
**Independent Test** : LLM dispo → `BriefEnrichment` `enrichi` ; LLM coupé → soumission OK + matching déterministe, sans latence voyageur (SC-001/002).

- [ ] T007 [P] [US1] **(TDD)** Tests Vitest de validation/sanitisation `EnrichedIntentions` dans `apps/api/src/modules/intake/domain/value-objects/__tests__/enriched-intentions.test.ts` : valide, malformé→rejet, clé PII/montant→rejet, vide. **Commit avant impl.**
- [ ] T008 [P] [US1] **(TDD)** Tests Vitest `mergeEnrichmentIntoSnapshot` (axe spécialité) dans `domain/services/__tests__/merge-enrichment-into-snapshot.test.ts` : déterministe≠autre→inchangé, autre+enrichi+confiance≥seuil→canonique, confiance<seuil→autre, enrichment null/non fiable→déterministe. **Commit avant impl.**
- [ ] T009 [US1] Implémenter VO + schéma Zod `EnrichedIntentions` + sanitisation dans `domain/value-objects/enriched-intentions.ts` (fait passer T007)
- [ ] T010 [US1] Implémenter `mergeEnrichmentIntoSnapshot` (résolution spécialité uniquement à ce stade) dans `domain/services/merge-enrichment-into-snapshot.ts` (fait passer T008 ; fonction pure, zéro I/O)
- [ ] T011 [US1] `EnrichBriefUseCase` dans `application/use-cases/enrich-brief.use-case.ts` : construit le payload **non identifiant** (exclut `voyageurContactId`/PII — FR-004), appelle `LlmProvider` sous budget, valide la sortie, calcule `status`/`confidence`, persiste `BriefEnrichment` (best-effort, **ne throw jamais**)
- [ ] T012 [US1] `PrismaBriefEnrichmentRepository` dans `infrastructure/prisma-brief-enrichment-repository.ts` (upsert idempotent par `briefId`)
- [ ] T013 [US1] `EnrichBriefJob` (BullMQ) dans `infrastructure/jobs/enrich-brief.job.ts` : consomme `voyageur.brief.activated`, exécute `EnrichBriefUseCase`, **puis déclenche `PerformMatchingUseCase` quel que soit le résultat** (chaînage, cf. contracts/enrichment-flow.md) ; re-câble le déclencheur matching existant
- [ ] T014 [US1] Sweep de réconciliation (pattern 012) : brief `activated` non apparié sous N min → appariement, dans `infrastructure/jobs/enrichment-reconciliation.sweep.ts` (filet anti-perte de job)
- [ ] T015 [US1] Test intégration Testcontainers `__tests__/enrich-brief.integration.test.ts` : (a) LLM indisponible → activation réussit + matching déterministe (SC-001/002) ; (b) LLM dispo → `BriefEnrichment` persisté ; (c) déterministe jamais écrasé (FR-003)

## Phase 4 : User Story 2 — Consommation par le matching (P2)

**Goal** : le scoring consomme la spécialité résolue (`autre`→canonique) **et** les destinations enrichies (union, déterministes conservées, sous seuil), sans changer poids/plafond 3/filtre vérifié.
**Independent Test** : brief `autre` enrichi → axe spécialité matche + destinations augmentées ; non enrichi → déterministe pur (SC-006).

- [ ] T016 [P] [US2] **(TDD)** Tests `mergeEnrichmentIntoSnapshot` (axe destinations) dans le fichier de test existant : union déterministe ∪ enrichies sous seuil, déterministes **toujours** conservées, dédup, ordre stable, confiance<seuil→déterministe. **Commit avant impl.**
- [ ] T017 [US2] Étendre `mergeEnrichmentIntoSnapshot` avec l'union des destinations (fait passer T016 ; FR-003 préservé — augmente, n'écrase jamais)
- [ ] T018 [US2] Adapter `BriefEnrichmentQueryPort` (Prisma) dans `infrastructure/prisma-brief-enrichment-query.ts` retournant la `BriefEnrichmentView` (speciality + destinations + confidence + status ; **aucun texte libre/PII**)
- [ ] T019 [US2] Étendre le `BriefSnapshotReader` du matching (`apps/api/src/modules/matching/...`) pour composer le snapshot déterministe **puis** appliquer `mergeEnrichmentIntoSnapshot` via le port public — scoring (poids/plafond 3/`verified`) **inchangé** (FR-008)
- [ ] T020 [US2] Test intégration : brief `autre` enrichi → axe spécialité matche + destinations enrichies présentes (déterministes conservées) ; règles de scoring inchangées (SC-006)

## Phase 5 : User Story 3 — Idempotence, coût, observabilité (P3)

**Goal** : 1 enrichissement par `briefId` (réutilisé, 0 ré-appel), coût borné, métriques exposées.
**Independent Test** : re-déclencher un brief enrichi → 0 appel LLM ; métriques visibles (SC-005/007).

- [ ] T021 [US3] Idempotence : court-circuit dans `EnrichBriefUseCase` si `BriefEnrichment` existe pour `briefId` (réutilise, 0 appel) — s'appuie sur l'unicité DB T002
- [ ] T022 [US3] Maîtrise du coût : `maxOutputTokens` + troncature du texte d'entrée (≤ 0,05 USD/req, Principe V) dans `EnrichBriefUseCase` / l'appel `LlmProvider`
- [ ] T023 [US3] Métriques OTel `cv.intake.enrichment.*` (attempts / success / fallback **par cause** / latency / tokens) dans le use case + job
- [ ] T024 [US3] Test intégration : re-déclenchement → **0** appel LLM (fake compteur) ; métriques émises (SC-005/007)

## Phase 6 : Polish & portes qualité (transverses — requises pour la DoD)

- [ ] T025 [P] Adaptateur concret `BedrockLlmProvider` (`infrastructure/llm/bedrock-llm-provider.ts`) — **région ca-central-1**, ne throw jamais (→ `unavailable`), respecte budget/tokens (ADR-0028 ; secret via Secrets Manager)
- [ ] T026 [P] Cascade Loi 25 : trigger Postgres (pattern ADR-0023) neutralisant `enrichedDestinations` + `redactedAt` quand le brief passe `anonymized` (migration) + test intégration
- [ ] T027 [P] Étendre le scan anti-PII (`tools/check-no-pii-matching-audit.ts` ou scan jumeau intake) à `brief_enrichments` (FR-004, SC-004) — CI hebdo
- [ ] T028 [P] **FR-016** Avis de traitement automatisé : copie **FR-CA** + clés i18n (EN), divulgation dans l'intake + politique Loi 25 (feature 004)
- [ ] T029 [P] Invariant anti-transaction/anti-PII : test sur la `BriefEnrichmentView` + les types persistés (0 champ montant/contact/texte libre — ADR-0002, SC-004)
- [ ] T030 README enrichissement (module intake) + runbook ops + ADR-0028 → *accepté* + `quickstart.md` § Statut de validation (SC-001→SC-009) + DoD cochée

## Dépendances & ordre

- **Setup (P1)** : T001/T002 `[P]` ; T003 ensuite. Aucune dépendance externe.
- **Foundational (P2)** : T004/T005 (ports) + T006 (fake) → débloquent les US. Bloque tout.
- **US1 (P3)** : dépend de Foundational. TDD : T007/T008 **avant** T009/T010. T011→T012→T013→T014. MVP livrable seul.
- **US2 (P4)** : dépend de US1 (merge + repo + query port). TDD : T016 **avant** T017. T019 touche le module matching.
- **US3 (P5)** : dépend de US1.
- **Polish (P6)** : après les stories. T026/T027/T029 = Loi 25 / anti-PII (NON-NÉGOCIABLES, requis DoD, pas optionnels).
- ⚠️ Sérialiser ce qui touche `merge-enrichment-into-snapshot.ts` (T010 puis T017) et le `BriefSnapshotReader` matching (T019).

## Parallélisation
- Setup : T001/T002 `[P]`. Foundational : T006 `[P]`. US1 : T007/T008 `[P]` (tests). US2 : T016 `[P]`. Polish : T025/T026/T027/T028/T029 `[P]`.

## Stratégie
MVP = Phase 1 + 2 + **US1** (enrichissement best-effort + mode dégradé prouvé). Incréments :
US2 (consommation matching : spécialité + destinations) puis US3 (idempotence/coût/observabilité).
Chaque story est indépendamment testable. **TDD** des fonctions pures (T007/T008/T016) non
négociable. Avant prod : validations staging (Testcontainers + charge) + secret
`DATABASE_URL_STAGING` pour activer le scan PII + calibration seuil de confiance/modèle Bedrock.
