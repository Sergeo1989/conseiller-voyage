# Runbook — Enrichissement LLM de l'intake (feature 016 / roadmap 009)

## Vue d'ensemble

Enrichissement **best-effort** du brief d'intake (008) au service du matching (011).
Sur `voyageur.brief.activated`, `EnrichBriefJob` : expurge la PII du texte libre →
appelle le `LlmProvider` (Bedrock ca-central-1) sous budget → valide la sortie (Zod) →
persiste un `BriefEnrichment` → publie **toujours** `voyageur.brief.enriched`. Le matching
(repointé) consomme cet événement ; le scoring lit l'enrichi via `BriefEnrichmentQueryPort`
(résout `speciality='autre'` + augmente les destinations). Le matching ne dépend **jamais**
du LLM.

## Mode dégradé (par défaut tant que Bedrock n'est pas branché)

Le provider par défaut est `DegradedLlmProvider` (retourne toujours `unavailable`) →
chaque brief est marqué `indisponible` et le matching s'exécute en **déterministe**. C'est
le comportement **sûr** attendu tant que **T031** (adaptateur `BedrockLlmProvider`) n'est
pas livré. Aucune action requise ; l'intake et le matching fonctionnent normalement.

## Brancher le LLM réel (T031, gated AWS)

1. Implémenter `BedrockLlmProvider` (`infrastructure/llm/`) — région `ca-central-1`, ne throw
   jamais (panne → `{ kind: 'unavailable' }`), respecte `maxOutputTokens`/`timeoutMs`.
2. Dans `intake.module`, remplacer `{ provide: LLM_PROVIDER, useExisting: DegradedLlmProvider }`
   par une sélection conditionnelle (Bedrock si configuré, fallback dégradé sinon).
3. Secret Bedrock via AWS Secrets Manager (prod) / 1Password (dev). Jamais en clair.
4. Calibrer le **seuil de confiance** (`ENRICHMENT_CONFIDENCE_THRESHOLD`, défaut 0,7) et le
   modèle (ADR-0028, point ouvert).

## Observabilité

Métriques OTel (meter `cv.intake.enrichment`) :
- `attempts` — tentatives.
- `outcome` (labels `status`, `failure_reason`) — surveiller un **taux de repli** élevé
  (`indisponible`/`timeout`) = panne fournisseur.
- `latency_ms`, `tokens` — coût/latence (budget ≤ 0,05 USD/req).

## Réconciliation (filet anti-perte de job)

`EnrichmentReconciliationSweep.sweep()` re-déclenche l'enrichissement des briefs activés
restés **sans** `BriefEnrichment` après 5 min (job perdu). Idempotent. À planifier
(@nestjs/schedule / BullMQ repeatable, ~quelques minutes). Le câblage bus de bout en bout
(drain outbox → consumer) reste le **prérequis partagé** avec 011 (gate staging).

## Loi 25

- **Aucune PII de contact** envoyée au LLM (payload non identifiant + scrub FR-017).
- **Aucun texte libre** persisté (seules intentions structurées) — surface anti-PII minimale.
- **Cascade** : trigger `brief_enrichment_anonymise_cascade` neutralise `enrichedDestinations`
  + pose `redactedAt` quand le brief passe `anonymized`. Audit préservé.
- Scan hebdo `tools/check-no-pii-matching-audit.ts` couvre `intake_brief_enrichments`.
- **Avis de traitement automatisé** (FR-016) : à intégrer côté intake + politique Loi 25
  (feature 004) — **T034**.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Tous les briefs `indisponible` | Bedrock non branché (mode dégradé) ou panne | normal si T031 non livré ; sinon vérifier Bedrock/secret/région |
| Briefs activés non enrichis | job perdu / bus non câblé | le sweep réconcilie ; vérifier le câblage bus (prérequis staging) |
| `schema_invalid` fréquent | dérive du prompt vs `EnrichedIntentions` | ajuster le prompt de l'adaptateur ; le schéma `.strict()` est la source de vérité |
| Coût LLM élevé | seuil/troncature | vérifier `MAX_OUTPUT_TOKENS` / `MAX_INPUT_CHARS` |
