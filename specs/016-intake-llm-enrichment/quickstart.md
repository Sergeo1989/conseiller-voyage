# Quickstart — Enrichissement LLM de l'intake (016 / roadmap 009)

## Prérequis
- Stack dev : `docker compose -f docker-compose.dev.yml up -d` (Postgres + Redis + LocalStack).
- API : `pnpm --filter @cv/api start:dev`.
- Migration appliquée (table `brief_enrichments`).
- `LlmProvider` : en dev, **fake déterministe** (pas d'appel Bedrock) ; en prod, Bedrock `ca-central-1`.

## Parcours de validation

### US1 — Enrichissement non bloquant + mode dégradé
1. Soumettre puis activer (magic-link) un brief avec `speciality = autre` et un
   `specialityOther` parlant (p. ex. « safari photo en famille »). → un `BriefEnrichment`
   `enrichi` est créé, `enrichedSpeciality` = une valeur canonique (p. ex. `aventure_outdoor`
   ou `famille_avec_enfants`).
2. Couper le `LlmProvider` (fake en mode « unavailable »). Activer un brief. → la soumission/
   activation réussit, `BriefEnrichment.status = indisponible`, l'appariement s'exécute en
   déterministe. **Aucune** latence ajoutée côté voyageur.
3. Vérifier qu'un champ déterministe (`speciality != autre`) n'est **jamais** modifié par l'enrichi.

### US2 — Consommation par le matching
4. Pour un brief `autre` enrichi en `culturel_historique`, vérifier que l'axe *speciality*
   du scoring matche désormais (via `mergeEnrichmentIntoSnapshot`), sans changer poids ni
   plafond 3 ni filtre vérifié.
5. Brief non enrichi → matching fonctionne sur le déterministe, sans erreur.

### US3 — Idempotence, coût, observabilité
6. Re-déclencher l'enrichissement d'un brief déjà enrichi → **0** appel LLM (réutilisation).
7. Consulter les métriques `cv.intake.enrichment.*` : attempts / success / fallback(cause) /
   latency / tokens.

## Tests
```bash
# Fonctions pures (TDD AVANT impl) : mergeEnrichmentIntoSnapshot + validation/sanitisation sortie
pnpm --filter @cv/api test -- enrichment

# Intégration (Testcontainers) : job idempotent, cascade Loi 25, mode dégradé
pnpm --filter @cv/api test -- enrich-brief

# Anti-PII (scan étendu aux tables d'enrichissement)
pnpm exec tsx tools/check-no-pii-matching-audit.ts   # ou le scan jumeau intake
```

## DoD avant PR
- Tests purs (fusion + frontière de confiance) écrits **avant** impl (commits séparés, Principe VI).
- 0 PII de contact dans le payload LLM et dans `brief_enrichments` (FR-004, SC-004 — scan vert).
- Région CA (Bedrock ca-central-1) ; coût ≤ 0,05 USD/req ; cache idempotent (SC-005/008).
- Mode dégradé prouvé (LLM coupé → soumission + matching OK) (SC-001/002).
- Déterminisme : champ validé jamais écrasé (FR-003).
- ADR-0028 (fournisseur LLM + placement) mergé. Revue juridique Loi 25 (avis traitement automatisé) tranchée.
- i18n FR-CA ; lint/tsc/boundaries/a11y verts ; migration testée en staging.

## Statut de validation (2026-06-15)

Implémenté et vérifié (40 tests verts dont 3 d'intégration contre Postgres Docker ;
2 migrations appliquées ; AppModule boote ; tsc/Biome/boundaries propres).

| SC | Critère | Couverture |
|---|---|---|
| SC-001 | Soumission jamais retardée | enrichissement **post-activation, arrière-plan** (job) — chemin voyageur intouché |
| SC-002 | 100 % soumissions OK si LLM HS | `DegradedLlmProvider` par défaut + test use case « indisponible » + intégration |
| SC-003 | ≥ 90 % enrichis si dispo | observable via `cv.intake.enrichment.*` (staging) |
| SC-004 | 0 PII au LLM / stockée | scrub FR-017 (test payload) + invariant T035 + scan T033 + schéma sans texte libre |
| SC-005 | Re-traitement → 0 appel | court-circuit idempotent (test unit + sweep idempotent) |
| SC-006 | Pertinence ≥, pas de régression | merge testé + intégration (`autre`→canonique, union destinations) |
| SC-007 | Observabilité | métriques OTel T029 (attempts/outcome/latency/tokens) |
| SC-008 | Données région CA | Bedrock ca-central-1 (T031, gated AWS) ; mode dégradé d'ici là |
| SC-009 | Sortie validée avant usage | `parseEnrichedIntentions` Zod `.strict()` (8 tests) |

**Reste avant prod** : **T031** (adaptateur Bedrock ca-central-1, AWS) · **T034** (avis FR-016,
copie juridique feature 004) · validations staging (charge) · calibration seuil/modèle.
D'ici là l'app tourne en **mode dégradé sûr** (matching toujours déterministe).

## DoD
tsc + Biome + boundaries ✓ · fonctions pures TDD ✓ · invariant anti-PII/anti-marketplace ✓ ·
cascade Loi 25 (trigger testé) ✓ · idempotence ✓ · i18n FR-CA (avis FR-016 = T034) ⏳ ·
ADR-0028 accepté ✓ · migration testée (Docker ; staging ⏳) · Bedrock + charge **staging** ⏳.
