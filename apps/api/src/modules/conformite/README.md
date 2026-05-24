# Module Conformité

Module monolithique du domaine **conformité réglementaire** (Principe I —
OPC/Québec + TICO/Ontario). Couvre la vérification, l'expiration
automatique, la consultation interne, la révocation manuelle, l'espace
personnel conseiller et l'effacement Loi 25.

---

## Spec Kit — source de vérité

| Artefact | Chemin |
|---|---|
| Spec fonctionnelle | [`specs/001-conformite-module/spec.md`](../../../../../specs/001-conformite-module/spec.md) |
| Plan d'implémentation | [`specs/001-conformite-module/plan.md`](../../../../../specs/001-conformite-module/plan.md) |
| Recherche (R1-R11) | [`specs/001-conformite-module/research.md`](../../../../../specs/001-conformite-module/research.md) |
| Modèle de données | [`specs/001-conformite-module/data-model.md`](../../../../../specs/001-conformite-module/data-model.md) |
| Contrats HTTP | [`specs/001-conformite-module/contracts/http-endpoints.md`](../../../../../specs/001-conformite-module/contracts/http-endpoints.md) |
| Tâches | [`specs/001-conformite-module/tasks.md`](../../../../../specs/001-conformite-module/tasks.md) |

**Toute évolution structurante** ⇒ ADR sous [`docs/adr/`](../../../../../docs/adr/) +
amendement de la [constitution v2.2.0](../../../../../.specify/memory/constitution.md).

---

## Architecture en 4 couches (Principe VIII)

```
interface/    ← contrôleurs HTTP, ConformiteQueryFacade (port public)
application/  ← use cases + ports (interfaces)
domain/       ← entités, value objects, fonctions pures (zéro framework)
infrastructure/ ← adapters Prisma, S3, Redis, BullMQ
```

**Règle d'or** : `domain/` n'importe AUCUN framework. Le test
[`tools/check-module-boundaries.ts`](../../../../../tools/check-module-boundaries.ts)
fait sauter le build si un module externe importe autre chose que la
facade `ConformiteQueryPort` (`@cv/shared/conformite/contracts`).

---

## Use cases livrés

| Use case | US | Description |
|---|---|---|
| `RequestUploadUrlsUseCase` | US1 | Génère N URLs signées S3 PUT + persiste UploadIntent (B2) |
| `SubmitDossierUseCase` | US1 | Soumission complète transactionnelle (cert + affil + audit + outbox) |
| `ApproveDossierUseCase` | US1 | Approbation admin + transition statut + cascade |
| `RefuseDossierUseCase` | US1 | Refus avec motif ≥ 20 chars |
| `SendExpirationRemindersUseCase` | US2 | Rappels J-60/J-30/J-7 |
| `PropagateExpirationsUseCase` | US2 | Bascule verified→suspended à l'expiration |
| `GetVerificationStatusUseCase` | US3 | Lecture publique avec cache 60s + bypass strict |
| `DeclarePermitRevokedUseCase` | US3 | Cascade FR-015 (retrait permis → N suspensions) |
| `RevokeConseillerUseCase` | US4 | Révocation manuelle admin (état final) |
| `ViewConseillerDossierUseCase` | US5 | Espace personnel + audit paginé curseur |
| `RequestErasureUseCase` | N | Étape 1 sync Loi 25 (marque demande) |
| `EraseConseillerDataUseCase` | N | Étape 2 async (delete S3 + anonymise) |

---

## Endpoints HTTP

Cf. [`contracts/http-endpoints.md`](../../../../../specs/001-conformite-module/contracts/http-endpoints.md).

Préfixe `/api/conformite/...` — auth obligatoire (cookie session
Auth.js), CSRF via header `X-Requested-By: web`, Idempotency-Key sur
mutations.

OpenAPI doc : `GET /api/docs` (dev/staging only).

---

## Jobs de background (BullMQ ou setInterval transition)

| Job | Trigger | Description |
|---|---|---|
| `OutboxPublisherJob` | toutes les 5s | Draine `conformite_outbox` vers Redis pub/sub |
| `ExpirationSweepJob` | quotidien 02:00 | Rappels expiration + bascule auto suspended |
| `UploadIntentCleanupJob` | quotidien 02:30 | Supprime intents > 7j non consommés + S3 |
| `DataRetentionSweepJob` | quotidien 03:00 | Draine les demandes d'effacement Loi 25 |

---

## Observabilité

- **Grafana dashboard** : [`docs/dashboards/conformite.json`](../../../../../docs/dashboards/conformite.json)
- **Alertes Grafana** : [`docs/dashboards/conformite-alerts.yaml`](../../../../../docs/dashboards/conformite-alerts.yaml)
- **Métriques exposées** (Prometheus, à brancher) :
  - `conformite_submission_age_business_days{status}`
  - `conformite_status_propagation_seconds{transition_kind}`
  - `conformite_submissions_pending_total`
  - `conformite_outbox_unpublished_total`
  - `conformite_job_failures_total{job_name}`
  - `conformite_permit_cascade_total`
  - `conformite_erasures_completed_total`

---

## Tests

```bash
# Unit (Vitest, mocks via fakes)
pnpm --filter @cv/api test:unit

# Intégration Prisma (Postgres réel, voir test/integration/README.md)
pnpm --filter @cv/api test:integration

# E2E Playwright (apps + infra up, voir test/e2e/README.md)
pnpm --filter @cv/api test:e2e

# A11y axe-core WCAG 2.1 AA (Principe XI)
pnpm --filter @cv/web test:a11y

# Lighthouse CI (Principe XII budgets CWV)
lhci autorun
```

**Tests invariants** (NE PAS SUPPRIMER sans amendement constitution) :

- T063 / T081c — Audit payload R10 (pas de PII) + admin attribution FR-018
- T081a — Filtre matériel verified-only FR-007 / U1
- T081b — Trigger DB append-only FR-019 / U2

---

## Definition of Done (cocher avant merge)

### Checklist constitution (Flux qualité)

- [ ] Tests unitaires + intégration GREEN
- [ ] Lint Biome `error-on-warnings` clean
- [ ] Typecheck `tsc --noEmit` clean
- [ ] axe-core CI bloquant pour pages touchées (Principe XI)
- [ ] Lighthouse CI scores Perf ≥ 90, A11y ≥ 95, SEO ≥ 95 (Principe XII)
- [ ] CWV LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1
- [ ] Métriques produit instrumentées (Pino + OTel)
- [ ] Sécurité OWASP Top 10 cochée par endpoint modifié
- [ ] Documentation FR-CA des nouveaux libellés
- [ ] ADR créé si décision architecturale
- [ ] Migration Prisma testée en staging

### Items spécifiques feature (C1/C2/C3 du review)

- [ ] Checklist OWASP Top 10 cochée pour chaque endpoint HTTP modifié
      (référencer la grille par endpoint dans `contracts/http-endpoints.md`)
- [ ] Premier test de restauration de backup réussi en staging
      (RPO 24h validé) avant la première mise en production
- [ ] DPA Loi 25 signé avec Grafana Labs et archivé dans
      `docs/legal/dpa/grafana-cloud-dpa.pdf` (cf. ADR-0003)
- [ ] Audit pen test externe planifié dans les 90 jours suivant
      la mise en production publique (cf. constitution Principe IX)

---

## Validation manuelle (T123)

Suivre [`specs/001-conformite-module/quickstart.md`](../../../../../specs/001-conformite-module/quickstart.md)
sur l'environnement staging — un parcours bout-en-bout :

1. Conseiller s'inscrit, soumet dossier (1 cert CCV + 1 affiliation OPC)
2. Admin examine, approuve → statut conseiller `verified` propagé < 60s
3. Admin déclare retrait permis OPC → cascade → statut `suspended` < 10s
4. Conseiller demande effacement Loi 25 → confirmation 30j → vérifier
   anonymisation effective côté DB + S3 vide

---

## Liens rapides

- [Constitution v2.2.0](../../../../../.specify/memory/constitution.md)
- [Roadmap stratégique](../../../../../docs/roadmap.md)
- [ADRs](../../../../../docs/adr/)
- Swagger OpenAPI : `/api/docs` (dev/staging only)
- Dashboard Grafana : `https://grafana.cv.example.ca/d/cv-conformite-health`
