# Data Model — Enrichissement LLM de l'intake (016 / roadmap 009)

Phase 1. Module **intake** (préqualification). Aucune modification du brief 008 ;
l'enrichissement est une **table additive** liée au brief. Région CA (Loi 25).

## Entité : `BriefEnrichment` (nouvelle)

Artefact dérivé best-effort d'un brief. **Relation 1:1 idempotente** avec un brief
(`briefId` unique). Persisté quel que soit le résultat (statut explicite).

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `briefId` | uuid | **UNIQUE**, FK logique → `voyageur_briefs.id` (cloisonnement intake). Clé d'idempotence. |
| `status` | enum `EnrichmentStatus` | `enrichi` \| `partiel` \| `non_enrichi` \| `indisponible` |
| `enrichedSpeciality` | enum `Speciality` \| null | spécialité **canonique** inférée (jamais `autre`) quand le brief était `autre` + texte ; null sinon |
| `enrichedDestinations` | jsonb (string[]) | destinations/pays additionnels détectés ; **consommés** par le scoring (augmentent l'ensemble, cf. fusion). Le déterministe reste toujours présent. |
| `languageDetected` | enum `ConseillerLanguage` \| null | langue détectée du texte |
| `confidence` | numeric(3,2) | 0.00–1.00 ; en dessous d'un seuil → traité comme `partiel`/`non_enrichi` |
| `providerVersion` | text | provenance (modèle + version de prompt) pour traçabilité/rejeu |
| `inputTokens` / `outputTokens` | int | usage (coût/observabilité) |
| `failureReason` | enum \| null | `timeout` \| `unavailable` \| `schema_invalid` \| `low_confidence` \| `empty_input` (si non `enrichi`) |
| `createdAt` | timestamptz | |
| `redactedAt` | timestamptz \| null | posé par la cascade Loi 25 |

**Invariants** (testés) :
- `briefId` unique → idempotence (R4, SC-005).
- `enrichedSpeciality` ∈ taxonomie **sans** `autre` (la résolution de `autre` est tout l'intérêt).
- `status = enrichi` ⇒ au moins une intention exploitable + `confidence ≥ seuil`.
- Aucun champ ne contient de PII de contact ni de montant/prix (FR-004/011, SC-004 — scan). **Aucun champ texte libre persisté** (clarification 2026-06-15) → surface anti-PII minimale.
- `redactedAt != null` ⇒ `enrichedDestinations` neutralisé (`[]`).

## Objet de valeur : `EnrichedIntentions` (sortie validée du LLM)

Schéma **cible** imposé au `LlmProvider` et **validé Zod** avant persistance (FR-006).
La sortie brute du modèle qui ne valide pas → rejetée → `status = indisponible`,
`failureReason = schema_invalid`.

```
EnrichedIntentions {
  speciality?: Speciality (hors 'autre')   // null/absent autorisé
  destinations?: string[]                  // pays/villes normalisés (consommés par le scoring)
  language?: ConseillerLanguage
  confidence: number (0..1)
}
// Pas de champ texte libre (summary/periodHints retirés — clarification 2026-06-15,
// minimisation Loi 25). Toute normalisation interne reste transitoire, jamais persistée.
```

## Fonction pure : `mergeEnrichmentIntoSnapshot` (logique testée Principe VI)

Entrée : `BriefSnapshot` déterministe (matching 011) + `BriefEnrichment | null`.
Sortie : `BriefSnapshot` effectif pour le scoring.

Règles (TDD, cas nominal + erreur) — clarification 2026-06-15 :
- `speciality` : si déterministe ≠ `autre` → **inchangé** (déterministe prévaut, FR-003).
  Si déterministe = `autre` **et** `enrichment.status = enrichi` **et** `enrichedSpeciality != null`
  **et** `confidence ≥ seuil` → utiliser `enrichedSpeciality`. Sinon → `autre` (inchangé).
- `destinations` : **union** des destinations déterministes (TOUJOURS conservées) et des
  `enrichedDestinations`, **uniquement** si `confidence ≥ seuil`. L'enrichi **augmente**
  l'ensemble, ne **retire/écrase jamais** une destination déterministe (FR-003). Dédupliqué,
  ordre stable.
- Autres axes (geo, familiarity, langue) : **inchangés** au MVP.
- `enrichment = null` ou non `enrichi` → snapshot déterministe tel quel.

> Le scoring lui-même (poids, plafond 3, filtre vérifié) n'est **pas** modifié (FR-008).
> Seules les **entrées** `speciality` (si `autre`) et `destinations` (par union) sont enrichies,
> de façon **pure et déterministe** une fois la sortie LLM validée. La fonction est testée
> AVANT implémentation (Principe VI) : cas déterministe-prévaut, union destinations,
> confiance < seuil, enrichment absent/non fiable.

## Flux & événements

- **Déclencheur** : `voyageur.brief.activated` (intake 008, inchangé) → job d'enrichissement.
- **Job** `EnrichBriefJob` (BullMQ, idempotent `briefId`) : lit le brief, construit le
  payload **non identifiant**, appelle `LlmProvider` sous budget, valide la sortie, persiste
  `BriefEnrichment`, **puis** déclenche `PerformMatchingUseCase({ briefId })`.
- **Filet** : sweep de réconciliation (pattern 012) — brief activé non apparié sous N min → apparié.
- Aucun nouvel événement outbox public requis au MVP (l'enrichissement précède le scoring
  dans le même pipeline ; le matching publie déjà ses events 011/012).

## Cascade Loi 25

Trigger Postgres (aligné ADR-0023) : `voyageur_briefs.status → 'anonymized'` ⇒
`UPDATE brief_enrichments SET enrichedDestinations='[]', redactedAt=now()` pour le `briefId`.
L'audit d'intake (008) reste maître de la traçabilité ; aucun texte libre ni PII n'est stocké
ici (minimisation), la cascade ne neutralise donc que les destinations enrichies.

## Migration

Nouvelle migration Prisma : table `brief_enrichments` + enum `EnrichmentStatus` +
trigger de cascade. Aucune modification de `voyageur_briefs` ni des tables matching.
