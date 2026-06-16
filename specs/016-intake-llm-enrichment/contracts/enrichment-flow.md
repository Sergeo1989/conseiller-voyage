# Contract — Flux d'enrichissement (déclencheur → job → matching)

Décrit le câblage. Tout est **post-activation, en arrière-plan** : la soumission/vérification
du voyageur n'est jamais touchée (SC-001).

## Déclencheur & repoint (révision 2026-06-15)

`voyageur.brief.activated` (publié par `VerifyMagicLinkUseCase`, intake 008). **État réel** :
le `BriefActivatedConsumer` du matching expose `handleBriefActivated(briefId)` mais son
**câblage bus effectif est différé** (`brief-activated.consumer.ts` : « wiring effectif T093 »).

**Mécanisme retenu** :
1. Un **consumer intake** consomme `voyageur.brief.activated` → `EnrichBriefJob`.
2. Le job publie un **nouvel événement `voyageur.brief.enriched`** (toujours, même fallback).
3. Le `BriefActivatedConsumer` du matching est **repointé** pour consommer
   `voyageur.brief.enriched` (au lieu de `.activated`) → `PerformMatchingUseCase`. Scoring/règles
   inchangés (FR-008).

> Le **câblage bus prod** (drain outbox → bus → consumer) est un **prérequis partagé** avec 011
> (déjà différé) — même gate staging/infra. En dev/test, le chaînage est exercé en in-process.

## `EnrichBriefJob` (BullMQ, module intake)

Idempotent par `briefId`. Étapes :
1. Si un `BriefEnrichment` existe déjà pour `briefId` → **réutiliser**, 0 appel LLM (SC-005),
   passer à l'étape 6.
2. Lire le brief ; **expurger la PII** du texte libre (`scrubContactPii`, fonction pure —
   regex courriel/téléphone, FR-017) car le voyageur peut taper une coordonnée dans un champ libre.
3. Construire un payload **non identifiant** (texte **scrubé** de `budgetNote`/`specialityOther`/
   notes de région + champs structurés non identifiants ; **exclut** `voyageurContactId` — FR-004).
4. `LlmProvider.extractStructured(...)` sous budget (`timeoutMs`, `maxOutputTokens`).
5. Valider la sortie Zod → `EnrichedIntentions` ; calculer `confidence`/`status` ;
   **persister** `BriefEnrichment` (succès, partiel, ou `indisponible` avec `failureReason`).
6. **Toujours publier `voyageur.brief.enriched`** — succès comme échec d'enrichissement
   (le matching ne dépend jamais du LLM, Principe X).

**Retry** : l'appel LLM n'est **pas** retenté agressivement (coût ; 1 tentative sous budget →
sinon `indisponible`). La **publication de `voyageur.brief.enriched`** suit la politique de
retry/backoff de l'outbox (fiable) ; en dernier recours, le sweep garantit l'appariement.

## Filet de réconciliation (pattern 012)

Sweep périodique : tout brief `activated` sans appariement après N minutes → déclencher
l'appariement. Garantit qu'une perte du job d'enrichissement (infra) ne bloque jamais le
matching durablement. Pas de re-match si l'appariement a déjà eu lieu (idempotence 011).

## Modes dégradés (Principe X)

| Panne | Comportement |
|---|---|
| LLM timeout / indisponible | `BriefEnrichment.status = indisponible`, matching déclenché en déterministe |
| Sortie LLM hors schéma | rejetée, `failureReason = schema_invalid`, déterministe |
| Confiance < seuil | `status = partiel/non_enrichi`, spécialité non résolue, déterministe |
| Job d'enrichissement perdu | sweep de réconciliation déclenche le matching |
| Texte d'entrée vide | `failureReason = empty_input`, 0 appel LLM, déterministe |

## Idempotence & coût

- 1 `BriefEnrichment` par `briefId` (unicité DB). Re-déclenchement = réutilisation (0 appel).
- `maxOutputTokens` + troncature d'entrée bornent le coût ≤ 0,05 USD/req (Principe V).
