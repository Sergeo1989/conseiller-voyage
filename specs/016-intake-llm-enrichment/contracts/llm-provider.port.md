# Contract — Port `LlmProvider` (nouveau, domaine)

Abstraction du fournisseur LLM (constitution : *tout LLM derrière `LlmProvider`*). Interface
**pure** (zéro SDK, zéro import infrastructure). Adaptateur concret = AWS Bedrock
`ca-central-1` (ADR-0028). Testable via fake déterministe.

## Opération

```
extractStructured(input: {
  text: string;                 // texte non identifiant uniquement (PII de contact exclue)
  schema: JsonSchema;           // schéma cible (EnrichedIntentions)
  maxOutputTokens: number;      // borne de coût (plafond ≤ 0,05 USD/req)
  timeoutMs: number;            // budget strict ; au-delà → LlmUnavailable
}): Promise<LlmResult>
```

```
type LlmResult =
  | { kind: 'ok'; raw: unknown; inputTokens: number; outputTokens: number; providerVersion: string }
  | { kind: 'unavailable'; reason: 'timeout' | 'service' }   // jamais throw métier
```

## Garanties exigées de l'adaptateur

- **Région CA** stricte (Loi 25) ; aucune sortie de région.
- **Jamais de throw** non maîtrisé : panne/timeout → `{ kind: 'unavailable' }` (mode dégradé, Principe X).
- `raw` n'est **pas** fiable : l'appelant le valide Zod contre `EnrichedIntentions` (FR-006).
- Respecte `maxOutputTokens` / `timeoutMs` (coût + latence bornés).
- Ne journalise jamais le `text` d'entrée en clair (PII-safe ; logs Pino structurés sans contenu).

## Consommateur

`EnrichBriefUseCase` (application, module intake) — seul appelant. La validation de la
sortie, le calcul de `confidence`/`status` et la persistance vivent dans le use case, pas
dans le port.
