# Module `matching` — Scoring conseiller × brief (top 3)

Feature 011 roadmap (Tier 2 — boucle économique cœur). Branche d'implémentation : `008-matching-scoring`.

Fonction pure du domaine (Principe VI TDD obligatoire) qui calcule le top 3 conseillers vérifiés pour un brief activé, via 4 axes pondérés (destination, géo Haversine FSA, spécialité, familiarité) + filtre dur langue + boost ≤ +10 % sur cookie `cv_suggested` (007). Plafond 3 strict, idempotence par briefId, append-only Loi 25, 4 événements outbox distincts consommés par feature 012 + admin US5 extension de 008.

## Périmètre

- ✅ **US1** (P1 MVP) — calcul top 3 (filtre langue + 4 axes pondérés), persistance append-only, 1 event outbox parmi `matched`/`partially_matched`/`unmatched`.
- ✅ **US2** (P2) — boost soft cookie `cv_suggested` ≤ +10 %, capping strict.
- ✅ **US3** (P3) — filtrage dynamique lecture (verified actuel) + re-matching admin manuel + scheduler détection cascade révocation.
- ✅ **Polish** — métriques OTel + logs Pino structurés, dashboard Grafana, runbooks, CLI PII scan hebdo, ADRs finalisés.

> Aucune UI livrée dans 011 — la lecture côté voyageur arrivera en feature 015.

## Leads — notifications conseiller + machine d'état (feature 012)

Extension **aval** du module `matching` (même module premier niveau, Principe V).
012 **consomme** les 4 événements publiés par 011 sur le bus `matching.events`,
crée une entité **Lead** par (conseiller vérifié × MatchingResultEntry), notifie
chaque conseiller individuellement (un job BullMQ par destinataire, courriel
FR-CA SES sans PII de contact) et pilote une **machine d'état de lead**
append-only `envoye → vu → accepte → refuse → devis_envoye → reservation_confirmee → perdu`
(fonction pure du domaine, TDD strict Principe VI).

**Rôle** : transformer un matching calculé en opportunités traçables côté
conseiller. Anti-marketplace strict (aucune donnée transactionnelle, ADR-0002),
re-filtrage `verified` dynamique, cascade anonymisation Loi 25 (audit préservé),
concurrence optimiste, idempotence at-least-once.

**Événements consommés** (canal Redis pub/sub `MATCHING_PUBSUB_CHANNEL`) :

| Événement | Action 012 |
|---|---|
| `voyageur.brief.matched` / `partially_matched` | 1 lead + 1 notification par conseiller vérifié ; supersession des leads de l'ancien MR (`perdu`, motif `re-matched`) |
| `voyageur.brief.unmatched` | trace seule, aucun lead/notification |
| `voyageur.brief.all_matches_revoked` | aucun conseiller notifié, leads → `perdu` ; alerte admin réutilise le mécanisme 008/011 |

**Endpoints conseiller** (`/api/matching/conseiller`, `AuthGuard` +
`RoleGuard @RequireRole('conseiller')`) : `GET /leads`, `GET /leads/:id`
(auto-`vu`), `POST /leads/:id/{accept,refuse,quote-sent,booking-confirmed,lost}`.
Consommés par 014 (dashboard).

**Port public** : `MATCHING_LEAD_QUERY_PORT` (lecture seule, exporté pour 014/015).

**Dépendances** : `conformite` (001, `CONFORMITE_QUERY_PORT` re-filtrage verified),
`identité` (006/007, AuthGuard + résolution adresse conseiller), `@cv/email-templates`
(`lead-received.tsx`) + SES (ADR-0006).

**Migrations** : `2026XXXX_init_lead` (tables `leads`, `lead_transitions`,
`lead_notification_outbox`, `consumed_matching_events`) + `2026XXXX_lead_transitions_append_only`
(trigger) + `2026XXXX_lead_anonymisation_cascade` (trigger brief anonymisé → `briefId = NULL`).

**ADRs** : [ADR-0025](../../../../docs/adr/0025-lead-state-machine.md) (machine d'état
pure) + [ADR-0026](../../../../docs/adr/0026-lead-bus-consumption-reconciliation.md)
(consommation bus + sweep de réconciliation).

## Architecture (Principe VIII — 4 couches)

```text
src/modules/matching/
├── domain/                  ← pur, zéro framework
│   ├── entities/            (MatchingResult, MatchingResultEntry)
│   ├── value-objects/       (Score, ScoreComponents, FsaCode, MatchingStatus, WeightsConfig)
│   ├── services/            (calculate-score, apply-boost, select-top-three, compute-fsa-distance)
│   └── events/              (matching-events — types domain)
├── application/
│   ├── ports/               (8 ports : Reader/Writer/Audit/Outbox/SnapshotReader/FsaReader/RedisLock)
│   └── use-cases/           (PerformMatching, TriggerRematch, QueryMatchingResult, DetectAllMatchesRevoked)
├── infrastructure/
│   ├── prisma-*.ts          (5 adapters)
│   ├── embedded-fsa-centroid-reader.ts
│   ├── redis-rematch-lock.ts
│   └── jobs/                (BriefActivatedConsumer, AllMatchesRevokedScheduler)
└── interface/
    └── http/                (admin-matching.controller.ts — POST re-match)
```

## Endpoints HTTP

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/matching/admin/briefs/:briefId/re-match` | admin RBAC + Idempotency-Key | Re-trigger manuel après révocation cascade (FR-016) |

> Endpoint voyageur `GET /api/matching/voyageur/briefs/:briefId` à venir en feature 015.

## Dépendances cross-module

| Module | Port consommé | Usage |
|---|---|---|
| `conformite` (001) | `CONFORMITE_QUERY_PORT.getVerificationStatus` | Filtre verified AVANT scoring (FR-006) |
| `profil` (007) | Read `ConseillerProfile.{address, languages, specialities, destinations, experienceTier}` | Alimente snapshot conseiller |
| `intake` (008) | Read `VoyageurBrief` + outbox `voyageur.brief.activated` | Trigger unique du matching |
| `identité` | `AuthGuard` + `RoleGuard` + `AUTH_SESSION_READER` | Endpoint admin re-trigger |
| `common` | `Clock`, `UuidGenerator`, `REDIS_CLIENT` | Testabilité + verrou idempotence |

Publication via le port `MATCHING_QUERY_PORT` (consommé par 012 notifications futures + 015 espace voyageur + extension US5 admin de 008).

## Événements outbox publiés

4 events distincts (Q5 clarify) écrits dans `matching_outbox_entries`. Le drainage
vers le bus interne (extension de l'`OutboxPublisherJob` 003) est livré en **PR
satellite Mode B** (cf. [ADR-0024](../../../../docs/adr/0024-matching-cross-module-extensions.md), tâche T093) — hors PR 011.

- `voyageur.brief.matched` — top 3 complet (`matchedCount = 3`, status `ok`)
- `voyageur.brief.partially_matched` — 1 ou 2 entrées (status `partial`)
- `voyageur.brief.unmatched` — 0 entrée (status `empty`)
- `voyageur.brief.all_matches_revoked` — détection cascade révocation post-calcul

## Migrations DB

3 migrations Prisma append-only (Phase 2 T012-T014) :

1. `2026XXXX_init_matching` — 4 tables + enums + indexes + contraintes CHECK
2. `2026XXXX_matching_audit_append_only` — trigger Postgres + rôle `app_matching` least privilege
3. `2026XXXX_matching_anonymisation_cascade` — trigger Postgres cascade brief anonymisé → matching (cf. ADR-0023)

## Variables d'environnement

Cf. `apps/api/src/env.ts` (T003) :

| Var | Défaut | Description |
|---|---|---|
| `MATCHING_ALGORITHM_VERSION` | `v1.0` | Bumpée à chaque changement de pondération (ADR-0020) |
| `MATCHING_WEIGHT_DESTINATION` | `0.35` | Poids axe destination (ADR-0020) |
| `MATCHING_WEIGHT_GEO` | `0.25` | Poids axe géo Haversine FSA |
| `MATCHING_WEIGHT_SPECIALITY` | `0.25` | Poids axe spécialité |
| `MATCHING_WEIGHT_FAMILIARITY` | `0.15` | Poids axe familiarité voyageur |
| `MATCHING_BOOST_FACTOR_MAX` | `1.10` | Plafond boost cookie cv_suggested (FR-011) |

Invariant boot : `WEIGHT_DESTINATION + WEIGHT_GEO + WEIGHT_SPECIALITY + WEIGHT_FAMILIARITY = 1.0 ± 1e-6` (vérifié par superRefine Zod).

## ADRs

- [ADR-0020](../../../../docs/adr/0020-matching-scoring-weights.md) — Pondération initiale 4 axes (0.35/0.25/0.25/0.15)
- [ADR-0021](../../../../docs/adr/0021-fsa-haversine-distance.md) — Algorithme Haversine sur centroïdes FSA + 5 paliers
- [ADR-0022](../../../../docs/adr/0022-fsa-centroids-statcan-source.md) — Source FSA Statistique Canada (OGL-Canada)
- [ADR-0023](../../../../docs/adr/0023-matching-anonymisation-cascade.md) — Trigger Postgres anonymisation cascade
- [ADR-0024](../../../../docs/adr/0024-matching-cross-module-extensions.md) — Stratégie extensions cross-module 001/007/008/003

## Observabilité (Principe VII)

- **Métriques OTel** (`infrastructure/otel-metrics-recorder.ts`, meter `cv.matching`) :
  counter `matching.matched_count` (labelé status), histogram `matching.duration_ms`,
  counter `matching.boost_applied`, gauge `matching.candidates_evaluated`. Branchées
  via le port `MetricsRecorder` (couche application découplée d'OTel).
- **Logs Pino structurés** (`PerformMatchingUseCase`) : `info` (ok) / `warn` (partial) /
  `error` (empty), champs PII-safe (`briefId`, `matchingResultId`, `status`,
  `matchedCount`, `durationMs`, `algorithmVersion`, `boostApplied`).
- **Dashboard** : `docs/dashboards/matching.json` + alertes `docs/dashboards/matching-alerts.yaml`.

## Runbooks

- [`docs/runbooks/matching-rematch.md`](../../../../docs/runbooks/matching-rematch.md) — procédure admin re-trigger
- [`docs/runbooks/matching-fsa-update.md`](../../../../docs/runbooks/matching-fsa-update.md) — mise à jour annuelle FSA StatCan

## Tests

- **Unit** : domain VOs + services + use cases avec fakes en mémoire (Vitest).
- **Property-based** : 4 invariants (SC-002 déterminisme, SC-003 plafond 3, SC-005 verified 100 %, SC-006 idempotence 10k replays — fast-check).
- **Integration** : 5 fichiers Testcontainers Postgres + Redis (perform-matching, boost, trigger-rematch, anonymisation-cascade, append-only-trigger, query-port).
- **Charge** : `tools/load-test-matching.ts` staging (T101b, p95 < 800 ms calcul + < 2 s e2e).

## Sécurité / Loi 25

- **CLI anti-PII** : `tools/check-no-pii-matching-audit.ts` + workflow CI hebdo
  `.github/workflows/scan-matching-pii.yml` — scanne `matching_audit_entries.payload`
  et `matching_result_entries.scoreComponents` (post-anonymisation) contre tout
  pattern email/téléphone/prénom (FR-020, SC-009).
