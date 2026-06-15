# Contract — Port public `BriefEnrichmentQueryPort` (lu par le matching)

Interface publique du module **intake** exposant les intentions enrichies d'un brief.
Couplage inter-module **uniquement** via cette interface (Principe V). Le matching ne lit
jamais la table `brief_enrichments` directement.

## Opération

```
getByBriefId(briefId: string): Promise<BriefEnrichmentView | null>
```

```
BriefEnrichmentView {
  briefId: string;
  status: 'enrichi' | 'partiel' | 'non_enrichi' | 'indisponible';
  enrichedSpeciality: Speciality | null;   // canonique, jamais 'autre'
  enrichedDestinations: string[];          // [] si aucune ; augmentent l'ensemble de scoring
  confidence: number;                       // 0..1
}
// Vue minimale : aucun texte libre, aucune PII, aucun montant. Seul ce dont le scoring a besoin.
```

- Retourne `null` si aucun enrichissement (le matching procède en déterministe — mode dégradé).
- **Aucune donnée transactionnelle ni PII** exposée (anti-marketplace + Loi 25).

## Intégration matching (sans changer les règles)

Le `BriefSnapshotReader` (matching 011) compose le snapshot déterministe **puis** appelle
`BriefEnrichmentQueryPort.getByBriefId` et applique la fonction pure
`mergeEnrichmentIntoSnapshot` (cf. data-model). Effets au MVP (sous seuil de confiance) :
(a) résoudre `speciality = 'autre'` → spécialité canonique ; (b) **augmenter** l'ensemble de
destinations (union ; déterministes toujours conservées, jamais écrasées). Poids, plafond 3,
filtre `verified` : **inchangés** (FR-008).

## Dépendance lecture seule

Read-only, best-effort : si le port échoue/retourne null, le matching n'est jamais bloqué
(Principe X). Le matching ne **dépend pas** de l'enrichissement pour s'exécuter.
