# ADR-0021 — Algorithme distance FSA Haversine sur centroïdes

**Date** : 2026-05-31
**Statut** : accepté (implémenté feature 011, 2026-06-03)
**Décideurs** : équipe technique
**Spec lié** : [008-matching-scoring/spec.md](../../specs/008-matching-scoring/spec.md), FR-009a / FR-009b / FR-009c
**Plan lié** : [008-matching-scoring/plan.md](../../specs/008-matching-scoring/plan.md), Performance Goals
**Research lié** : [008-matching-scoring/research.md](../../specs/008-matching-scoring/research.md), R2

---

## Contexte

L'axe géographique du scoring matching (poids 0,25, cf. ADR-0020) requiert le calcul d'une distance entre le conseiller et le voyageur. Les deux côtés disposent d'un **code postal canadien** (`A1A 1A1`), dont les **3 premiers caractères forment la FSA** (Forward Sortation Area).

Une FSA couvre typiquement 3-5 km de rayon en zone urbaine (ex. `H7N` couvre Laval-Ouest). C'est suffisant pour matérialiser une préférence locale (« relation client locale, possibilité de rencontre physique »).

Trois algorithmes ont été évalués :

| Algorithme | Précision | Coût | Loi 25 |
|---|---|---|---|
| **Haversine sur centroïdes FSA** | ~1 m sur la sphère, ~3-5 km de granularité utile | O(1) par paire, ~50 µs | ✅ aucune fuite |
| **Geocoding externe (Google Maps, Mapbox)** | ~1 m précision adresse | latence réseau + coût | ❌ fuite PII vers tiers non `ca-central-1` |
| **Manhattan / Euclidean lat-lng** | ±30 % d'erreur en haute latitude (Quebec) | O(1) | ✅ |

## Décision

Implémenter `computeFsaDistance(a: FsaCode, b: FsaCode, centroids: FsaCentroidTable): number | null` comme une **fonction pure du domaine** :

```typescript
// pseudocode
function computeFsaDistance(a, b, centroids) {
  const cA = centroids.lookup(a);
  const cB = centroids.lookup(b);
  if (!cA || !cB) return null;
  return haversineKm(cA.lat, cA.lng, cB.lat, cB.lng);
}
```

Le score géo est dérivé par **5 paliers** :

| Distance | Score géo |
|---|---|
| 0 km (même FSA) | **1,00** |
| 0-25 km | **0,80** |
| 25-100 km | **0,50** |
| 100-500 km | **0,20** |
| > 500 km | **0,05** |

**Cas limites** :

- FSA voyageur null / code postal invalide / hors Canada → **score géo neutre médian 0,50** (FR-009b, ne rejette pas le conseiller).
- FSA conseiller absent → **conseiller exclu du matching** + audit `matching.conseiller_address_missing` (FR-009c, anomalie à remonter à l'admin).

Aucun appel d'API externe. La table `FsaCentroidTable` est chargée au boot du module depuis un **fichier statique embarqué** (cf. ADR-0022).

## Conséquences

### Positives

1. **Loi 25 respectée** — zéro fuite de PII voyageur (code postal) vers un tiers.
2. **Performance** — O(1) par paire, négligeable vs SLO 800 ms (80 candidats × 50 µs = 4 ms total).
3. **Fonction pure** (Principe VI) — 100 % déterministe, testable, sans I/O.
4. **Granularité suffisante** — les paliers reflètent la pratique « même quartier / même ville / même région / même province / hors province ».

### Négatives / risques

1. **Granularité FSA** — 3-5 km de rayon par FSA. Deux conseillers dans la même FSA `H7N` sont indistinguables géo (mais ils sont par construction tous deux « locaux » pour un voyageur `H7N`).
2. **Paliers durs** — un voyageur à 99 km vs 101 km tombe dans deux paliers différents (0,50 vs 0,20). Mitigation : compromis avec une décroissance progressive (sigmoid) si retours utilisateurs l'exigent (post-012).

### Mitigation

- Granularité finer-grained (rue) **non pertinente** au MVP — la relation conseiller-voyageur est numérique pour démarrer ; la rencontre physique est exceptionnelle.
- Décroissance progressive **bumpée en v1.1** si signal métier le justifie (re-pondération sans changer la signature de la fonction pure — Principe VIII Open/Closed).

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| **Google Maps Distance Matrix API** | Loi 25 fuite + coût récurrent. |
| **OSM Nominatim / Overpass** | Granularité différente (adresse), complexité d'extraction. Licence ODbL share-alike contraignante. |
| **Postes Canada Address Data** | ~10 k CAD/an. Surinvestissement MVP. |
| **Manhattan distance lat-lng** | Erreur ±30 % en haute latitude. |
| **Vincenty (ellipsoïdal)** | 10× plus coûteux que Haversine pour ~1 mm de précision en plus. Surcomplexité injustifiée. |
| **Décroissance continue (sigmoid)** | Bonne idée pour v1.1 — au MVP les 5 paliers sont plus simples à tuner et à comprendre par l'admin. |

## Statut d'implémentation (2026-06-03)

Implémenté dans `domain/services/compute-fsa-distance.ts` : `computeFsaDistance` (Haversine, rayon Terre 6371 km, retourne `null` si une FSA absente) + `distanceToGeoScore` avec les 5 paliers exacts (`<=0`→1, `<=25`→0,8, `<=100`→0,5, `<=500`→0,2, sinon 0,05 ; `null`→0,5 FR-009b). Conseiller sans FSA exclu + audit `matching.conseiller_address_missing` (FR-009c). Tests T042/T043 (15 cas). Aucun appel réseau.
