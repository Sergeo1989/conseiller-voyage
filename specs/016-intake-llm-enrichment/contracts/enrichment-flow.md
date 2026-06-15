# Contract — Flux d'enrichissement (déclencheur → job → matching)

Décrit le câblage. Tout est **post-activation, en arrière-plan** : la soumission/vérification
du voyageur n'est jamais touchée (SC-001).

## Déclencheur (inchangé côté 008)

`voyageur.brief.activated` (publié par `VerifyMagicLinkUseCase`, intake 008). Aujourd'hui
consommé par `matching/.../brief-activated.consumer` → `PerformMatchingUseCase`.

**Changement** : le consommateur de cet événement enqueue d'abord `EnrichBriefJob` ; c'est
le job qui déclenchera l'appariement (chaînage enrichissement → matching). Le scoring et ses
règles ne changent pas (FR-008).

## `EnrichBriefJob` (BullMQ, module intake)

Idempotent par `briefId`. Étapes :
1. Si un `BriefEnrichment` existe déjà pour `briefId` → **réutiliser**, 0 appel LLM (SC-005),
   passer à l'étape 5.
2. Lire le brief ; construire un payload **non identifiant** (texte de `budgetNote`,
   `specialityOther`, notes de région + champs structurés non identifiants ; **exclut**
   `voyageurContactId` et toute PII de contact — FR-004).
3. `LlmProvider.extractStructured(...)` sous budget (`timeoutMs`, `maxOutputTokens`).
4. Valider la sortie Zod → `EnrichedIntentions` ; calculer `confidence`/`status` ;
   **persister** `BriefEnrichment` (succès, partiel, ou `indisponible` avec `failureReason`).
5. **Toujours** déclencher `PerformMatchingUseCase({ briefId })` — succès comme échec
   d'enrichissement (le matching ne dépend jamais du LLM, Principe X).

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
