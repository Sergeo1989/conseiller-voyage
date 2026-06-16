# Tasks: Enrichissement LLM de l'intake voyageur

**Feature roadmap 009** · branche `016-intake-llm-enrichment` · module `intake` (préqualification).
Backend uniquement. S'appuie sur 008 (brief + activation) et alimente 011 (matching) via un
port public + le nouvel événement `voyageur.brief.enriched`. **TDD obligatoire** (Principe VI)
pour les fonctions pures : tests AVANT implémentation, **commits séparés visibles**.

Légende : `[P]` parallélisable (fichiers distincts, sans dépendance) · `[US#]` rattaché à une
user story. Refs : spec.md (FR/SC), plan.md, data-model.md, contracts/, research.md, docs/adr/0028.
Révisé après revue d'angles morts (2026-06-15) : déclencheur via `voyageur.brief.enriched` +
repoint matching, scrub PII texte libre (FR-017), `languageDetected` retiré, tâches DI explicites.

## Phase 1 : Setup

- [x] T001 [P] Types partagés : `EnrichmentStatus` + schéma Zod `EnrichedIntentions` (**spécialité canonique + destinations + confidence** — PAS de langue, PAS de texte libre) + vue `BriefEnrichmentView` dans `packages/shared/src/intake/enrichment.ts` (+ barrel)
- [x] T002 [P] Modèle Prisma `BriefEnrichment` (1:1 `briefId` UNIQUE) + enum `EnrichmentStatus` dans `packages/db/prisma/schema/intake.prisma` + **migration table** `migrate dev` (aucun champ texte libre ni langue)
- [x] T003 Scaffolding du sous-domaine enrichissement dans `apps/api/src/modules/intake/{domain/value-objects,domain/services,application/ports,application/use-cases,infrastructure/llm,infrastructure/jobs}/`

## Phase 2 : Foundational (bloque les user stories)

- [x] T004 Port `LlmProvider` (interface pure + symbole DI) dans `application/ports/llm-provider.port.ts` (op. `extractStructured`, retour `ok | unavailable`, cf. contracts/llm-provider.port.md) — injection `@Inject(Class)` (mémoire : Biome `import type` casse la DI NestJS)
- [x] T005 Ports `BriefEnrichmentRepository` (interne) + `BriefEnrichmentQueryPort` (**public**, lu par matching) + symboles DI dans `application/ports/`
- [x] T006 [P] Fake `LlmProvider` déterministe dans `infrastructure/llm/__fakes__/fake-llm-provider.ts` (succès / unavailable / sortie hors schéma + compteur d'appels paramétrables)
- [x] T007 Ajouter l'`eventType` `voyageur.brief.enriched` au port outbox intake (`application/ports/intake-outbox-writer.port.ts`) + tuyauterie de publication (foundational : le job le publie, le matching le consomme)

## Phase 3 : User Story 1 — Enrichissement non bloquant + mode dégradé (P1) 🎯 MVP

**Goal** : un brief est enrichi best-effort ; toute panne LLM → soumission + appariement aboutissent en déterministe ; texte libre expurgé de PII avant envoi.
**Independent Test** : LLM coupé → activation OK + `voyageur.brief.enriched` publié + matching déterministe, sans latence voyageur (SC-001/002).

### Tests d'abord (TDD — commit AVANT impl)
- [x] T008 [P] [US1] **(TDD)** Tests `scrubContactPii` (FR-017) dans `domain/services/__tests__/scrub-contact-pii.test.ts` : courriel/téléphone expurgés, texte propre inchangé, formats NA, faux positifs UUID. **Commit avant impl.**
- [x] T009 [P] [US1] **(TDD)** Tests validation/sanitisation `EnrichedIntentions` dans `domain/value-objects/__tests__/enriched-intentions.test.ts` : valide, malformé→rejet, clé PII/montant→rejet, vide. **Commit avant impl.**
- [x] T010 [P] [US1] **(TDD)** Tests `mergeEnrichmentIntoSnapshot` (axe **spécialité**) dans `domain/services/__tests__/merge-enrichment-into-snapshot.test.ts` : déterministe≠autre→inchangé, autre+enrichi+confiance≥seuil→canonique, confiance<seuil→autre, enrichment null/non fiable→déterministe. **Commit avant impl.**

### Implémentation
- [x] T011 [US1] Implémenter `scrubContactPii` (fonction **pure**) dans `domain/services/scrub-contact-pii.ts` (réutilise les patterns regex du scan anti-PII existant ; fait passer T008)
- [x] T012 [US1] Implémenter VO + schéma Zod `EnrichedIntentions` + sanitisation dans `domain/value-objects/enriched-intentions.ts` (fait passer T009)
- [x] T013 [US1] Implémenter `mergeEnrichmentIntoSnapshot` (résolution spécialité seulement) dans `domain/services/merge-enrichment-into-snapshot.ts` (fait passer T010 ; pure, zéro I/O)
- [x] T014 [US1] `EnrichBriefUseCase` (`application/use-cases/enrich-brief.use-case.ts`) : **scrub** le texte libre (T011) → construit le payload **non identifiant** (exclut `voyageurContactId`/PII — FR-004) → `LlmProvider` sous budget → valide la sortie → calcule `status`/`confidence` → persiste `BriefEnrichment` (best-effort, **ne throw jamais**)
- [x] T015 [US1] Test unitaire **payload anti-PII** (FR-004/FR-017) : `enrich-brief.use-case` n'envoie ni `voyageurContactId` ni PII de contact au `LlmProvider` (fake espion), texte libre scrubé
- [x] T016 [US1] `PrismaBriefEnrichmentRepository` (`infrastructure/prisma-brief-enrichment-repository.ts`) : upsert idempotent par `briefId` (`ON CONFLICT`)
- [x] T017 [US1] Consumer intake `infrastructure/jobs/brief-activated.consumer.ts` (consomme `voyageur.brief.activated` → `EnrichBriefJob`) + `infrastructure/jobs/enrich-brief.job.ts` (BullMQ) : scrub→LLM→persist **puis publie `voyageur.brief.enriched`** quel que soit le résultat. **Retry** : LLM 1 tentative sous budget (pas de retry coûteux) ; publication de l'événement via la politique outbox fiable
- [x] T018 [US1] **Repoint matching** : `matching/infrastructure/jobs/brief-activated.consumer.ts` consomme désormais `voyageur.brief.enriched` (au lieu de `voyageur.brief.activated`) → `PerformMatchingUseCase` (cross-module ; scoring inchangé)
- [ ] T019 [US1] Sweep de réconciliation (pattern 012) dans `infrastructure/jobs/enrichment-reconciliation.sweep.ts` : brief `activated` non apparié sous N min → appariement (filet anti-perte de job)
- [x] T020 [US1] **Enregistrement DI** : `intake.module.ts` (use case, repo, job, sweep, consumer, ports, **sélection provider** fake en dev / Bedrock en prod via token) ; `matching.module.ts` (injection `BriefEnrichmentQueryPort` + repoint consumer)
- [x] T021 [US1] Test intégration Testcontainers : (a) LLM indisponible → activation OK + `voyageur.brief.enriched` publié + matching déterministe (SC-001/002) ; (b) LLM dispo → `BriefEnrichment` persisté ; (c) déterministe jamais écrasé (FR-003)

## Phase 4 : User Story 2 — Consommation par le matching (P2)

**Goal** : le scoring consomme la spécialité résolue **et** les destinations enrichies (union, déterministes conservées, sous seuil), sans changer poids/plafond 3/filtre vérifié.
**Independent Test** : brief `autre` enrichi → axe spécialité matche + destinations augmentées ; non enrichi → déterministe pur (SC-006).

- [x] T022 [P] [US2] **(TDD)** Tests `mergeEnrichmentIntoSnapshot` (axe **destinations**) : union déterministe ∪ enrichies sous seuil, déterministes **toujours** conservées, dédup, ordre stable, confiance<seuil→déterministe. **Commit avant impl.**
- [x] T023 [US2] Étendre `mergeEnrichmentIntoSnapshot` avec l'union des destinations (fait passer T022 ; FR-003 — augmente, n'écrase jamais)
- [x] T024 [US2] Adapter `BriefEnrichmentQueryPort` (Prisma) dans `infrastructure/prisma-brief-enrichment-query.ts` → `BriefEnrichmentView` (speciality + destinations + confidence + status ; **aucun texte libre/PII**)
- [x] T025 [US2] Étendre le `BriefSnapshotReader` du matching pour composer le snapshot déterministe **puis** appliquer `mergeEnrichmentIntoSnapshot` via le port public — scoring (poids/plafond 3/`verified`) **inchangé** (FR-008)
- [x] T026 [US2] Test intégration : brief `autre` enrichi → axe spécialité matche + destinations enrichies présentes (déterministes conservées) ; règles de scoring inchangées (SC-006)

## Phase 5 : User Story 3 — Idempotence, coût, observabilité (P3)

**Goal** : 1 enrichissement par `briefId` (réutilisé, 0 ré-appel), coût borné, métriques exposées.
**Independent Test** : re-déclencher un brief enrichi → 0 appel LLM ; métriques visibles (SC-005/007).

- [ ] T027 [US3] Idempotence : court-circuit dans `EnrichBriefUseCase` si `BriefEnrichment` existe pour `briefId` (0 appel) ; gère la livraison **at-least-once** concurrente (contrainte unique T002 + court-circuit)
- [ ] T028 [US3] Maîtrise du coût : `maxOutputTokens` + troncature du texte d'entrée (≤ 0,05 USD/req, Principe V) dans `EnrichBriefUseCase` / l'appel `LlmProvider`
- [ ] T029 [US3] Métriques OTel `cv.intake.enrichment.*` (attempts / success / fallback **par cause** / latency / tokens ; option : taux de détection PII pré-scrub)
- [ ] T030 [US3] Test intégration : re-déclenchement → **0** appel LLM (compteur du fake) ; métriques émises (SC-005/007)

## Phase 6 : Polish & portes qualité (transverses — requises pour la DoD)

- [ ] T031 [P] Adaptateur concret `BedrockLlmProvider` (`infrastructure/llm/bedrock-llm-provider.ts`) — **région ca-central-1**, ne throw jamais (→ `unavailable`), respecte budget/tokens (ADR-0028 ; secret via Secrets Manager)
- [x] T032 [P] Cascade Loi 25 : trigger Postgres (pattern ADR-0023) neutralisant `enrichedDestinations` + `redactedAt` à `anonymized` — **2e migration séparée** (ne PAS éditer la migration T002 déjà appliquée, mémoire « migrations scellées ») + test intégration
- [x] T033 [P] Étendre le scan anti-PII (`tools/check-no-pii-matching-audit.ts` ou jumeau intake) à `brief_enrichments` (FR-004, SC-004) — CI hebdo
- [ ] T034 [P] **FR-016** Avis de traitement automatisé : copie **FR-CA** + clés i18n (EN), divulgation dans l'intake + politique Loi 25 (feature 004)
- [x] T035 [P] Invariant anti-transaction/anti-PII : test sur la `BriefEnrichmentView` + les types persistés (0 champ montant/contact/texte libre — ADR-0002, SC-004)
- [ ] T036 README enrichissement (module intake) + runbook ops + ADR-0028 → *accepté* + `quickstart.md` § Statut de validation (SC-001→SC-009) + DoD cochée

## Dépendances & ordre

- **Setup (P1)** : T001/T002 `[P]` ; T003 ensuite.
- **Foundational (P2)** : T004/T005 + T006 + T007 (event) → débloquent les US. Bloque tout.
- **US1 (P3)** : dépend de Foundational. TDD T008/T009/T010 **avant** T011/T012/T013. T014→T015→T016→T017→T018→T019→T020→T021. T018 touche le module matching.
- **US2 (P4)** : dépend de US1. TDD T022 **avant** T023. T025 touche le matching.
- **US3 (P5)** : dépend de US1.
- **Polish (P6)** : après les stories. T032/T033/T035 (Loi 25 / anti-PII) = NON-NÉGOCIABLES, requis DoD.
- ⚠️ Sérialiser : `merge-enrichment-into-snapshot.ts` (T013 puis T023) ; le `BriefActivatedConsumer` matching (T018) ; le `BriefSnapshotReader` matching (T025) ; l'`intake.module.ts` (T020).

## Prérequis partagé (hors périmètre code 016)

⚠️ Le **câblage bus prod** `voyageur.brief.activated` / `voyageur.brief.enriched` → consumer
(drain outbox → bus → handler) est **déjà différé côté 011** (`brief-activated.consumer` :
« wiring effectif T093 », aujourd'hui appelé in-process par les tests). 016 introduit
`voyageur.brief.enriched` + le repoint, mais **hérite du même prérequis** : le câblage bus prod
de bout en bout reste à finaliser à la **même gate staging/infra** que 011/012. En dev/test, le
chaînage est exercé en in-process.

## Parallélisation
- Setup : T001/T002 `[P]`. Foundational : T006 `[P]`. US1 (tests) : T008/T009/T010 `[P]`. US2 : T022 `[P]`. Polish : T031-T035 `[P]`.

## Stratégie
MVP = Phase 1 + 2 + **US1** (enrichissement best-effort + scrub PII + mode dégradé prouvé +
publication `voyageur.brief.enriched`). Incréments : US2 (consommation matching : spécialité +
destinations) puis US3 (idempotence/coût/observabilité). Chaque story indépendamment testable.
**TDD** des fonctions pures (T008/T009/T010/T022) non négociable. Avant prod : validations
staging (Testcontainers + charge) + finalisation du câblage bus (prérequis partagé) + secret
`DATABASE_URL_STAGING` (scan PII) + calibration seuil de confiance / modèle Bedrock.
