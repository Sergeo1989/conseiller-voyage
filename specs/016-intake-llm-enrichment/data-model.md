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
| `enrichedDestinations` | jsonb (string[]) | destinations/pays additionnels détectés (indicatif ; le déterministe reste maître) |
| `languageDetected` | enum `ConseillerLanguage` \| null | langue détectée du texte |
| `periodHints` | text \| null | indices de période non structurés normalisés (jamais une date faisant autorité) |
| `normalizedSummary` | text \| null | reformulation neutre, **sans PII ni montant** (anti-marketplace) |
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
- Aucun champ ne contient de PII de contact ni de montant/prix (FR-004/011, SC-004 — scan).
- `redactedAt != null` ⇒ `normalizedSummary`, `enrichedDestinations`, `periodHints` neutralisés.

## Objet de valeur : `EnrichedIntentions` (sortie validée du LLM)

Schéma **cible** imposé au `LlmProvider` et **validé Zod** avant persistance (FR-006).
La sortie brute du modèle qui ne valide pas → rejetée → `status = indisponible`,
`failureReason = schema_invalid`.

```
EnrichedIntentions {
  speciality?: Speciality (hors 'autre')   // null/absent autorisé
  destinations?: string[]                  // pays/villes normalisés
  language?: ConseillerLanguage
  periodHints?: string                     // ≤ 200 c., normalisé
  summary?: string                         // ≤ 500 c., neutre, sans PII/montant
  confidence: number (0..1)
}
```

## Fonction pure : `mergeEnrichmentIntoSnapshot` (logique testée Principe VI)

Entrée : `BriefSnapshot` déterministe (matching 011) + `BriefEnrichment | null`.
Sortie : `BriefSnapshot` effectif pour le scoring.

Règles (TDD, cas nominal + erreur) :
- `speciality` : si déterministe ≠ `autre` → **inchangé** (déterministe prévaut, FR-003).
  Si déterministe = `autre` **et** `enrichment.status ∈ {enrichi}` **et** `enrichedSpeciality != null`
  → utiliser `enrichedSpeciality`. Sinon → `autre` (inchangé).
- Autres axes (destination, geo, familiarity, langue) : **inchangés** par défaut au MVP
  (enrichi = indicatif). `enrichedDestinations` non injecté dans le scoring MVP (évite de
  fausser l'axe destination déterministe) — réservé à un incrément ultérieur.
- `enrichment = null` ou non `enrichi` → snapshot déterministe tel quel.

> Le scoring lui-même (poids, plafond 3, filtre vérifié) n'est **pas** modifié (FR-008).
> Seule l'**entrée** `speciality` peut être résolue quand elle valait `autre`.

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
`UPDATE brief_enrichments SET normalizedSummary=NULL, enrichedDestinations='[]',
periodHints=NULL, redactedAt=now()` pour le `briefId`. L'audit d'intake (008) reste maître
de la traçabilité ; aucune PII n'était stockée ici de toute façon.

## Migration

Nouvelle migration Prisma : table `brief_enrichments` + enum `EnrichmentStatus` +
trigger de cascade. Aucune modification de `voyageur_briefs` ni des tables matching.
