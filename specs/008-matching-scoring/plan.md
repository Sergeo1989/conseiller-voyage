# Implementation Plan: Matching scoring conseiller × brief (top 3)

**Branch**: `008-matching-scoring` | **Date**: 2026-05-31 | **Spec**: [`spec.md`](./spec.md)

**Input**: Feature specification from `specs/008-matching-scoring/spec.md`

**Note** : ce plan suit l'exécution `/speckit-plan`. Phase 0 (`research.md`) et Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`) sont générés à la suite. Phase 2 (tasks) déclenche `/speckit-tasks`.

## Summary

Implémente le matching scoring conseiller × brief pour la feature 011 de la roadmap (Tier 2, boucle économique cœur). Le module `matching` consomme l'événement outbox `voyageur.brief.activated` (publié par feature 008), calcule via une **fonction pure du domaine** un score par conseiller `verified` (4 axes pondérés : destination, géo, spécialité, familiarité — la langue est un **filtre dur** appliqué AVANT scoring), applique un boost ≤ +10 % si le cookie `cv_suggested` (HMAC posé par 007) désigne un conseiller éligible, et persiste le top 3 trié dans `matching_results` (append-only, idempotent par briefId). Le module émet 4 événements outbox distincts (`voyageur.brief.matched` / `partially_matched` / `unmatched` / `all_matches_revoked`) consommés par feature 012 (notifications) et par l'extension US5 du dashboard admin de 008. Aucune UI livrée dans 011 — la lecture côté voyageur arrivera en feature 015.

## Technical Context

**Language/Version** : TypeScript ≥ 5 strict (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitAny: true`) — conforme *Stack canonique* constitution v2.3.0.

**Primary Dependencies** :

- **Backend NestJS + Fastify** (`apps/api`) — module `matching` ajouté.
- **Prisma** — extension du schéma multi-fichier (`packages/db/prisma/schema/matching.prisma`) ; 3 nouvelles tables append-only via triggers Postgres (cf. ADR à créer).
- **BullMQ** — consumer du topic `voyageur.brief.activated` ; émission d'events outbox via `IntakeOutboxWriter` existant (réutilisable) ou outbox dédiée matching à trancher en Phase 0.
- **ioredis** — cache du candidate set conseillers vérifiés (TTL court, invalidation explicite sur changement statut conformité, cf. Principe X).
- **Zod** (`@cv/shared/matching`) — schemas payloads outbox + DTOs HTTP admin.
- **`@cv/shared/conformite`** — consomme `CONFORMITE_QUERY_PORT.getVerificationStatus` (feature 001).
- **`@cv/profil-domain`** — accès aux `ConseillerProfile.languages` / `.specialities` / `.destinations` / `.address` (feature 007).
- **Aucune nouvelle lib tierce attendue** ; un fichier statique de centroïdes FSA canadien (~50 KB JSON) sera embarqué.

**Storage** :

- **PostgreSQL 16** (`ca-central-1`, Loi 25) — 3 tables nouvelles : `matching_results`, `matching_result_entries`, `matching_audit_entries`.
- **Triggers Postgres append-only** sur `matching_audit_entries` (UPDATE/DELETE/TRUNCATE bloqués) ; sur `matching_results` triggers de propagation cascade pour anonymisation Loi 25 quand `voyageur_briefs.status` passe à `anonymized` (ADR à créer).
- **Redis** : sliding cache des `ConseillerSnapshot` reconstitués (TTL ≤ 60 s, invalidation sur événements `conformite.status_changed` consommés via BullMQ). Pas obligatoire pour MVP — à trancher en Phase 0 selon perf measurée.
- **Centroïdes FSA** : fichier JSON statique embarqué dans `packages/shared/src/matching/fsa-centroids.json` (~1 600 FSA × lat/lng/province). Source d'origine : Statistique Canada (à valider licence en Phase 0).

**Testing** :

- **Vitest** pour domain (fonction pure, TDD strict Principe VI — RED avant GREEN, commits séparés) et application (use cases avec fakes en mémoire).
- **Testcontainers Postgres + Redis** pour tests intégration (golden path consume `voyageur.brief.activated` → MatchingResult en DB → outbox event publié).
- **Tests de propriété** (vitest-fast-check ou équivalent) pour invariants SC-002 (déterminisme), SC-003 (plafond 3), SC-005 (verified à 100 %).
- **Pas d'E2E Playwright** dans 011 (pas d'UI livrée). Les e2e du flux complet voyageur → matching → notification → conseiller arriveront avec 012 + 015.
- **A11y** : n/a (pas d'UI dans 011).

**Target Platform** : AWS ECS Fargate `ca-central-1` (constitution *Infrastructure et opérations* + ADR-0005). Workers BullMQ déployés en tant que tâche ECS séparée du serveur HTTP (pattern hérité de 003 notifications).

**Project Type** : Monolithe modulaire (Principe V). Nouveau module **`matching`** premier niveau (conforme roadmap : *conformité · préqualification (intake) · matching · SEO · facturation · identité*).

**Performance Goals** :

- **p95 < 800 ms** sur le **calcul + persistence** seul d'un MatchingResult, mesurée depuis l'entrée du worker BullMQ jusqu'à l'émission du payload en `matching_outbox_entries`. C'est le SLO du calcul pur, cohérent avec Principe X pour endpoints synchrones.
- **p95 < 2 s end-to-end** (SC-001) : depuis la publication initiale de `voyageur.brief.activated` dans `intake_outbox_entries` jusqu'à la persistance du `MatchingResult` — inclut le délai BullMQ (file consumer). Décomposition cible : ≤ 1,2 s file BullMQ + ≤ 800 ms calcul. Mesure : métrique OTel `matching.e2e_duration_ms` p95.
- **Déterminisme strict** : la fonction pure produit le même score à 10⁻⁶ près pour deux exécutions identiques (SC-002 ; testé par invariant property-based).
- **Throughput nominal** : 1 000 briefs activés/jour MVP, peak factor ×5 (5 000 briefs/jour, ~3 500/h en burst). Burst worker pool BullMQ : 4-8 concurrents.

**Constraints** :

- **Fonction pure** (Principe VI) : zéro I/O, zéro horloge système hors injection, zéro aléa. Tous les snapshots `BriefSnapshot` + `ConseillerSnapshot[]` assemblés par l'adapter infrastructure AVANT l'appel.
- **Append-only** sur les 3 tables matching (Loi 25 + audit Principe IX).
- **Idempotence stricte** par briefId (réception double event → 1 seul MatchingResult).
- **Async total** : la réception de l'event ne renvoie aucune réponse HTTP voyageur ; tout passe par BullMQ + outbox events (Principe X, mode dégradé propre si Redis HS).
- **Anonymisation cascade** : un brief anonymisé (Loi 25, feature 008 FR-022 / FR-022a) doit propager au MatchingResult (briefId → null, scoreComponents redacted).

**Scale/Scope** :

- ~100-500 conseillers vérifiés en jour 1 (croissance progressive).
- ~1 000 briefs activés/jour MVP, ~30 000/mois.
- Candidate set après filtre `verified` + filtre `langue` : typiquement 20-80 conseillers à scorer par brief.
- Fonction pure scoring : O(N) sur N conseillers candidats, complexité négligeable (~50 µs par conseiller en TypeScript V8).
- Distance Haversine sur centroïdes FSA : O(1) par paire, table hash de 1 600 FSA en mémoire (~50 KB).

## Constitution Check

> *GATE — Évaluation pré-Phase 0. Re-évaluation post-Phase 1 en fin de plan.*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

✅ **Conforme**. Le matching :

- **Ne touche jamais à la transaction** (zéro paiement, zéro réservation, zéro versement).
- **Filtre `verified` en couche de données** : tous les conseillers candidats passent par `ConformiteQueryPort.getVerificationStatus` (publié par feature 001) AVANT scoring. La lecture exposée au voyageur (à venir en 015) re-filtre dynamiquement à chaque accès (FR-015).
- **N'expose aucun conseiller non vérifié** au voyageur, même cas extrême : si tous les 3 du top 3 perdent leur statut après calcul, la lecture retourne vide (et émet `voyageur.brief.all_matches_revoked` pour admin).

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

✅ **Conforme**. Toutes les données restent en `ca-central-1` (Postgres + Redis + BullMQ + outbox SES par 003). La table `matching_audit_entries` ne contient **aucune PII voyageur** (FR-020) : seulement `briefId` + `voyageurContactId` en référence (FK), `eventType`, payload technique. La propagation d'anonymisation Loi 25 (brief anonymisé) cascade au MatchingResult via trigger Postgres ou job dédié — à trancher en Phase 0 (cf. ADR à créer). Rétention `matching_audit_entries` : 7 ans (audit conformité, table d'audit par construction).

### III. Qualité de lead avant volume

✅ **Conforme**. Le plafond 3 est un **invariant testé** (SC-003) — la fonction pure `selectTopThree` retourne au maximum 3 entries, mesuré par test de propriété sur 1 000 tirages aléatoires. La machine d'état lead arrive en feature 012 ; 011 émet seulement l'event `voyageur.brief.matched` qui amorce cette machine. Traçabilité instrumentée dès J1 : `matching_audit_entries` capture chaque calcul.

### IV. Français d'abord

✅ **Conforme (n/a directement)**. 011 = backend pur, aucun contenu utilisateur livré (pas d'UI). Les noms d'événements outbox sont en anglais (convention technique : `voyageur.brief.matched`) ; les messages d'erreur HTTP admin sont en FR-CA via i18n (réutilisation du namespace `matching.*` à créer).

### V. Architecture : monolithe modulaire

✅ **Conforme**. Nouveau module premier niveau `matching` (sur la liste explicite de la constitution). Imports cross-module via interfaces publiques :

- Consomme `@cv/shared/conformite.ConformiteQueryPort` (feature 001 — déjà publié).
- Consomme `@cv/profil-domain` ou un nouveau port `ConseillerSnapshotReader` à publier par 007 (à trancher en Phase 0 — éviter le couplage profond).
- Publie un nouveau port `@cv/shared/matching.MatchingQueryPort` (consommé par 012 + admin US5 de 008).

Aucun LLM dans 011 (fonction pure déterministe). Pas de plafond coût LLM à respecter ici (Phase 9 sera le LLM enrichissement intake, indépendant).

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

✅ **Conforme par construction**. Le scoring **est précisément** le type de logique métier sensible visé par ce principe :

- Fonction pure `calculateScore(briefSnapshot, conseillerSnapshot, weights) → ScoreComponents` zéro I/O.
- Tests **écrits AVANT** implémentation (RED commits visibles dans l'historique git, suivi des cas nominal + erreur de chaque axe).
- Tests de propriété pour les invariants (SC-002 déterminisme, SC-003 plafond 3, SC-004 boost ≤ +10 %, SC-005 verified 100 %).
- Couverture par cas nominal ET cas d'erreur pour chaque axe + boost + filtre langue + statut verified.

### VII. Observabilité de la boucle économique

✅ **Conforme**. Le matching touche directement la métrique 2 (« % leads acceptés ») et la métrique 3 (« Conversion lead → devis → réservation »). Instrumentation prévue :

- Métriques OTel : `matching.duration_ms` (histogramme p50/p95/p99), `matching.candidates_evaluated` (gauge), `matching.matched_count` (counter par status `ok`/`partial`/`empty`), `matching.boost_applied` (counter).
- Logs Pino structurés : `level=info` pour `ok`, `warn` pour `partial`, `error` pour `empty` ou échec technique.
- Dashboard Grafana `docs/dashboards/matching.json` (versionné JSON) — créé en tâche Phase 2 polish.
- Alertes : taux `empty` > 5 % sur 24 h → WARN ; taux `partial` > 15 % sur 7 j → WARN ; p95 > 1 200 ms (50 % au-dessus de la cible) → WARN.

### VIII. Clean Architecture et SOLID

✅ **Conforme par construction**. Le module suit le pattern 4 couches déjà éprouvé par 001 / 005 / 006 / 007 / 008 :

```
modules/matching/
├── domain/          ← pur, zéro framework
│   ├── entities/    (MatchingResult, MatchingResultEntry)
│   ├── value-objects/  (Score, ScoreComponents, FsaCode, MatchingStatus, MatchingAlgorithmVersion)
│   ├── services/    (calculateScore, applyBoost, selectTopThree, computeDistance)
│   └── events/      (BriefMatchedEvent, BriefPartiallyMatchedEvent, BriefUnmatchedEvent, AllMatchesRevokedEvent)
├── application/
│   ├── ports/       (10+ ports : ConformiteQueryPort consumed, ConseillerSnapshotReader, MatchingResultWriter, etc.)
│   └── use-cases/   (PerformMatching, TriggerRematch, QueryMatchingResult)
├── infrastructure/
│   ├── prisma-matching-result-repository.ts
│   ├── prisma-matching-audit-writer.ts
│   ├── prisma-conseiller-snapshot-reader.ts
│   ├── fsa-centroid-distance.ts (+ JSON embedded)
│   └── jobs/        (BriefActivatedConsumer, AllMatchesRevokedDetector)
└── interface/
    └── http/        (admin-matching.controller.ts — POST re-trigger ; GET matching-result/:briefId à venir 015)
```

**SOLID** :

- **S** : un cas d'usage = une action métier (`PerformMatchingUseCase`, `TriggerRematchUseCase`, `QueryMatchingResultUseCase`).
- **O** : la pondération des axes est injectée comme `WeightsConfig` ; un nouvel axe = nouveau composant `ScoreComponents` sans modifier les autres.
- **L** : ports avec contrats explicites ; `InMemoryMatchingResultRepository` substituable au `PrismaMatchingResultRepository`.
- **I** : ports granulaires — `ConseillerSnapshotReader` (read-only) séparé de tout futur `ConseillerSnapshotWriter`.
- **D** : application dépend de ports abstraits, jamais de Prisma directement.

#### VIII.a — Conventions front

**N/A pour 011** : aucune livraison front. Ce plan ne touche pas `apps/web`. La feature 015 (espace voyageur post-intake) sera la première à exposer un `MatchingResult` en UI.

### IX. Sécurité applicative (NON-NÉGOCIABLE)

✅ **Conforme**.

- **RBAC** : endpoint admin `POST /api/matching/admin/briefs/:briefId/re-match` protégé par `AuthGuard` (Auth.js v5 + session DB, ADR-0004) + `RoleGuard` + décorateur `@RequireRole('admin')` (pattern hérité de 008 US5).
- **Validation Zod côté serveur** sur le payload admin (briefId UUID v4, raison de re-trigger texte 10-500 chars).
- **OWASP Top 10 review** : la surface HTTP de 011 est minimale (1 endpoint admin). Pas de SQL brut (Prisma). Pas de secret. CSRF couvert par middleware existant. Audit append-only Loi 25.
- **Secrets** : aucun nouveau secret introduit. Le cookie `cv_suggested` (HMAC) utilise la clé déjà gérée par 007 (`PROFIL_SUGGESTED_COOKIE_SECRET` dans Secrets Manager).
- **En-têtes HTTP** : hérités du middleware global (Helmet middleware déjà actif sur `apps/api`).

### X. Fiabilité et résilience

✅ **Conforme**.

- **SLO p95 < 800 ms** mesuré sur le calcul + persistence (de event in à event out). Cible SC-001.
- **Idempotence** stricte par briefId (FR-004) : contrainte unique DB sur `matching_results.briefId WHERE supersededAt IS NULL` + verrou Redis SETNX par briefId pendant le calcul (TTL 30 s).
- **Modes dégradés** :
  - **Redis HS** : le matching tourne sans cache (lit ConseillerSnapshot direct DB chaque fois) — performance dégradée mais fonctionnel.
  - **DB primaire HS** : le worker BullMQ retries avec backoff exponentiel ; après 5 échecs, dead-letter + alerte admin ; le brief reste `active` côté 008, l'admin re-trigger manuel après remise en service.
  - **Cookie `cv_suggested` HS** (signature HMAC invalide ou cookie absent) : scoring brut sans boost, audit `boostApplied=false`, no-op (FR-013).
- **Circuit breakers** : appel à `ConformiteQueryPort` protégé (5 échecs en 60 s → ouvert 30 s) — mais comme la port est in-process via DI, pas de circuit breaker réseau nécessaire ; le `ConformiteQueryPort` interne devrait avoir son propre fallback (à valider avec feature 001).
- **Health checks** : `/healthz` (worker BullMQ vivant), `/readyz` (peut lire Postgres + Redis). Endpoints exposés par `apps/api` global, étendus avec un check `matching.bullmq.consumer_lag` (alerte si > 100 jobs en queue).

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE)

**N/A** pour 011 — aucune livraison UI. Cette obligation s'appliquera à feature 015 (espace voyageur post-intake).

### XII. Optimisation SEO (NON-NÉGOCIABLE)

**N/A** pour 011 — aucune page publique. Aucun impact CWV / Lighthouse.

### Definition of Done

La DoD complète sera cochée avant merge :

- [x] `specs/008-matching-scoring/spec.md` mergée (à venir)
- [ ] `specs/008-matching-scoring/plan.md` mergé (ce fichier — à valider via `/speckit-analyze`)
- [ ] `tasks.md` généré et 100 % coché
- [ ] Tests unitaires (Vitest) : couvrent les 4 axes, le boost, le filtre langue, les 4 events outbox, l'idempotence, les modes dégradés
- [ ] Tests intégration (Testcontainers Postgres + Redis) : golden path event-in → event-out
- [ ] Pas d'E2E Playwright (n/a 011)
- [ ] `axe-core` n/a (n/a 011)
- [ ] Lighthouse CI n/a (n/a 011)
- [ ] `pnpm lint` + `pnpm typecheck` zéro erreur
- [ ] Métriques OTel instrumentées + dashboard Grafana lié dans README module
- [ ] SLO p95 < 800 ms validé en charge nominale (test de charge léger en staging)
- [ ] Sécurité Principe IX : OWASP revu, Zod validation, RBAC admin endpoint, audit Loi 25
- [ ] Documentation FR-CA : module README + runbook rotation cookie cv_suggested mis à jour si besoin
- [ ] 4 ADRs créés (cf. *Décisions architecturales* ci-dessous)
- [ ] Migrations Prisma testées en staging avec rollback applicatif vérifié
- [ ] PR ouverte avec Constitution Check verbatim de ce plan

## Project Structure

### Documentation (this feature)

```text
specs/008-matching-scoring/
├── plan.md              # Ce fichier (/speckit-plan)
├── spec.md              # Le QUOI (/speckit-specify + /speckit-clarify)
├── research.md          # Phase 0 (/speckit-plan)
├── data-model.md        # Phase 1 (/speckit-plan)
├── quickstart.md        # Phase 1 (/speckit-plan)
├── contracts/           # Phase 1 (/speckit-plan)
│   ├── matching-query.port.md
│   ├── http-endpoints.md
│   └── outbox-events.md
├── checklists/
│   └── requirements.md  # Quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NON créé ici)
```

### Source Code (repository root)

```text
apps/api/
└── src/modules/matching/
    ├── domain/
    │   ├── entities/
    │   │   ├── matching-result.entity.ts
    │   │   └── matching-result-entry.entity.ts
    │   ├── value-objects/
    │   │   ├── score.vo.ts                  ← decimal, immutable
    │   │   ├── score-components.vo.ts       ← {destination, geo, speciality, familiarity}
    │   │   ├── fsa-code.vo.ts               ← H7N, M5V, etc. (validation regex)
    │   │   ├── matching-status.vo.ts        ← ok | partial | empty
    │   │   ├── matching-algorithm-version.vo.ts ← bumpé par ADR
    │   │   └── weights-config.vo.ts         ← {destination: 0.30, geo: 0.20, ...}
    │   ├── services/
    │   │   ├── calculate-score.ts           ← fonction pure, signature : (BriefSnapshot, ConseillerSnapshot, WeightsConfig) → ScoreComponents
    │   │   ├── apply-boost.ts               ← fonction pure : (ScoreComponents, suggestedConseillerId?, conseillerId) → ScoreFinal
    │   │   ├── select-top-three.ts          ← fonction pure : (ScoredConseiller[]) → TopThreeResult
    │   │   └── compute-fsa-distance.ts      ← fonction pure : (FsaCode, FsaCode, FsaCentroidTable) → km
    │   └── events/                          ← types domain
    │       └── matching-events.ts
    ├── application/
    │   ├── ports/
    │   │   ├── conseiller-snapshot-reader.port.ts
    │   │   ├── matching-result-writer.port.ts
    │   │   ├── matching-result-reader.port.ts
    │   │   ├── matching-audit-writer.port.ts
    │   │   ├── matching-outbox-writer.port.ts
    │   │   ├── fsa-centroid-reader.port.ts
    │   │   ├── brief-snapshot-reader.port.ts    ← lit depuis intake module
    │   │   └── index.ts                          ← Symbol.for(...) tokens DI
    │   └── use-cases/
    │       ├── perform-matching.use-case.ts      ← orchestre : lit candidate set + appelle fonction pure + persiste + outbox
    │       ├── trigger-rematch.use-case.ts       ← admin re-trigger
    │       ├── query-matching-result.use-case.ts ← lecture pour 015 (déjà préparé)
    │       └── detect-all-matches-revoked.use-case.ts ← scan périodique
    ├── infrastructure/
    │   ├── prisma-matching-result-repository.ts
    │   ├── prisma-matching-audit-writer.ts
    │   ├── prisma-conseiller-snapshot-reader.ts
    │   ├── prisma-brief-snapshot-reader.ts
    │   ├── prisma-matching-outbox-writer.ts
    │   ├── embedded-fsa-centroid-reader.ts   ← lit le JSON statique
    │   └── jobs/
    │       ├── brief-activated.consumer.ts   ← BullMQ consumer du topic voyageur.brief.activated
    │       └── all-matches-revoked.scheduler.ts ← cron daily scan
    ├── interface/
    │   └── http/
    │       └── admin-matching.controller.ts  ← POST re-trigger (AuthGuard + RoleGuard admin)
    └── matching.module.ts                    ← wiring DI complet

packages/shared/src/matching/
├── branded-ids.ts        ← MatchingResultId, MatchingResultEntryId, MatchingAuditEntryId
├── schemas.ts            ← Zod : OutboxMatchedPayload, OutboxPartialPayload, OutboxUnmatchedPayload, OutboxAllRevokedPayload, AdminRematchRequest
├── contracts.ts          ← MatchingQueryPort (interface pour consommateurs 012, 015) + tokens DI
├── fsa-centroids.json    ← ~1 600 entrées FSA × {lat, lng, province}
└── index.ts

packages/db/prisma/schema/
└── matching.prisma       ← 3 modèles : MatchingResult, MatchingResultEntry, MatchingAuditEntry + enums MatchingStatus, MatchingOutboxEventType

apps/api/test/integration/matching/
├── perform-matching.integration.test.ts
├── trigger-rematch.integration.test.ts
├── append-only-trigger.integration.test.ts
└── anonymisation-cascade.integration.test.ts

docs/adr/
├── 0020-matching-scoring-weights.md      ← pondération initiale des 4 axes
├── 0021-fsa-haversine-distance.md        ← algorithme géographique
├── 0022-fsa-centroids-statcan-source.md  ← source des données FSA + licence
└── 0023-matching-anonymisation-cascade.md ← trigger Postgres vs job applicatif

docs/dashboards/
└── matching.json         ← dashboard Grafana versionné

docs/runbooks/
└── matching-rematch.md   ← procédure admin re-trigger
```

**Structure Decision** : module backend pur `apps/api/src/modules/matching/` en 4 couches (Principe VIII), shared cross-module via `packages/shared/src/matching/`, schéma DB dans `packages/db/prisma/schema/matching.prisma` (pattern multi-fichier déjà éprouvé sur 001 / 008). Aucune touche à `apps/web`. Convention identique aux features 001 / 005 / 006 / 007 / 008.

## Complexity Tracking

> *Aucune violation Constitution Check détectée à ce stade. Cette section est laissée vide.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(aucune)* | — | — |

## Décisions architecturales (ADRs à créer)

| ADR | Titre | Phase | Justification |
|---|---|---|---|
| 0020 | Pondération initiale des 4 axes de matching | Phase 0 (research) | Décision irréversible à court terme avec impact direct sur la valeur utilisateur — re-pondérer en prod = bump `algorithmVersion` + tests d'invariant + communication. |
| 0021 | Algorithme distance FSA (Haversine sur centroïdes) | Phase 0 | Tradeoff précision vs simplicité. Haversine sur centroïdes FSA donne précision ~3-5 km, suffisant pour matching local Québec/Ontario. Alternatives évaluées : geocoding API externe (rejeté Loi 25 + coût), Manhattan distance lat/lng (moins précis). |
| 0022 | Source du fichier FSA centroïdes | Phase 0 | Licence de réutilisation Statistique Canada (Open Government Licence Canada — compatible). Alternatives : OpenStreetMap (couvre, mais granularité différente), commercial geocoding (rejet Loi 25 + coût). |
| 0023 | Stratégie d'anonymisation cascade brief → matching | Phase 0 | Trigger Postgres (pattern hérité 008) ou job applicatif (plus testable mais latence). À trancher en Phase 0 après bench. |
| 0024 | Extensions cross-module 011 (siegeSocialPostalCode + suggested_conseiller_id + OutboxPublisher) | Phase 1 setup | Couvre la stratégie de livraison des 3 extensions touchant 001 + 008 + 003 (PR satellite vs PR 011 unifiée). Documenté pour traçabilité revue. Ajouté post-`/speckit-analyze` finding C2. |

## Re-évaluation Constitution Check (post-Phase 1)

État après Phase 1 (`research.md` + `data-model.md` + `contracts/` + `quickstart.md`) :

✅ **Aucune divergence détectée**. Tous les 12 principes restent conformes :

- **Principes I, II, VI, IX (NON-NÉGOCIABLES)** : confirmés. Le design préserve le filtre verified en couche données, la résidence canadienne stricte, la fonction pure scoring TDD-able, et la surface admin minimale avec Zod + RBAC.
- **Principe III** : confirmé. Le data-model matérialise le plafond 3 par CHECK constraints + UNIQUE INDEX au niveau DB — invariant testable.
- **Principe V** : confirmé. Le port public `MatchingQueryPort` est l'unique surface d'intégration avec 012 et 015 ; aucun couplage profond.
- **Principe VII** : confirmé. Les 4 événements outbox alimentent les compteurs des métriques #2 et #3 de la boucle économique.
- **Principe VIII** : confirmé. La structure 4 couches du module est conforme et identique au pattern 001/008.
- **Principe X** : confirmé. Idempotence DB (UNIQUE INDEX partiel) + Redis SETNX 30s couvre les deux niveaux. SLO p95 < 800 ms tenu par fonction pure rapide + Haversine O(1).
- **Principe XI / XII** : n/a (pas d'UI dans 011).

Les **4 ADRs identifiés** (0020 pondération, 0021 Haversine, 0022 source FSA StatCan, 0023 trigger anonymisation cascade) seront créés en début d'implémentation (Phase 2) — aucun n'affaiblit un principe.

**Décisions structurantes confirmées** :
- Outbox matching dédié (R7) au lieu de réutiliser celui d'intake — séparation modules cohérente Principe V.
- Pas de cache Redis MVP (R6) — simplicité ; ré-évaluation post-MVP si SLO tendu.
- Adresse conseiller hiérarchie 007 → 001 (Q2 + R5) — pas de migration MAJEURE attendue, juste éventuellement un `ALTER TABLE` mineur sur `conformite_compliances` si le code postal du siège social n'y est pas déjà présent (à vérifier en Phase 2 T0XX setup).

**Verdict** : plan prêt pour `/speckit-tasks`.
