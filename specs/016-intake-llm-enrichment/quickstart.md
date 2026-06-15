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

## Statut de validation
À compléter au `/speckit.tasks` + implémentation (mapping SC-001→SC-009).
