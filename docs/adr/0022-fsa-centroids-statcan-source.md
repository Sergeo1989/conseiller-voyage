# ADR-0022 — Source des centroïdes FSA : Statistique Canada (OGL-Canada)

**Date** : 2026-05-31
**Statut** : accepté (implémenté feature 011, 2026-06-03 — voir note d'implémentation)
**Décideurs** : équipe technique
**Spec lié** : [008-matching-scoring/spec.md](../../specs/008-matching-scoring/spec.md), Assumptions (Géocodage)
**Plan lié** : [008-matching-scoring/plan.md](../../specs/008-matching-scoring/plan.md), Primary Dependencies
**Research lié** : [008-matching-scoring/research.md](../../specs/008-matching-scoring/research.md), R3

---

## Contexte

L'ADR-0021 décide d'utiliser les centroïdes FSA canadiens comme base de calcul Haversine. Il faut **une source de données** :

- couvrant les ~1 622 FSA canadiens actifs ;
- distribuée sous une **licence compatible** avec un usage commercial SaaS (constitution *Chaîne d'approvisionnement* — licences autorisées : MIT, Apache-2.0, BSD, ISC, MPL-2.0) ;
- **stable** dans le temps (Postes Canada révise les frontières FSA annuellement).

3 sources évaluées :

| Source | Licence | Couverture | Coût |
|---|---|---|---|
| **Statistique Canada — Forward Sortation Area Centroids** | OGL-Canada | 1 622 FSA | gratuit |
| **OpenStreetMap (Overpass / Geofabrik)** | ODbL share-alike | partielle, granularité variable | gratuit mais juridiquement contraignant |
| **Postes Canada Address Data** | commerciale | 100 % adresses | ~10 k CAD/an |

## Décision

Adopter **Statistique Canada — Forward Sortation Area Geographic Centroids**, distribuée sous **Open Government Licence – Canada** (OGL-Canada).

L'OGL-Canada autorise « use, share, alter for any purpose, including commercial » avec attribution simple. Elle est compatible avec :

- Le SaaS commercial de la plateforme.
- Les licences autorisées par la constitution (équivalent fonctionnel à MIT pour la réutilisation, plus permissive que CC-BY-4.0 déjà acceptée).

### Implémentation

1. **Acquisition** : téléchargement depuis le portail StatCan (URL stable, mise à jour annuelle).
2. **Transformation** : `tools/build-fsa-centroids.ts` (CLI Node + tsx) consomme le fichier source StatCan (shapefile ou CSV), calcule les centroïdes lat/lng par FSA, exporte un JSON minifié.
3. **Distribution** : fichier embarqué dans `packages/shared/src/matching/fsa-centroids.json` (~150 KB). Validé Zod au boot du module matching (defense-in-depth contre corruption).
4. **Attribution** : header du fichier JSON + section dédiée dans le README module + footer de l'app (à confirmer si requis légalement).
5. **Mise à jour** : annuelle, via `pnpm run build-fsa-centroids` (procédure documentée dans `docs/runbooks/matching-fsa-update.md`).

## Conséquences

### Positives

1. **Loi 25 zéro fuite** — fichier statique embarqué, aucun appel réseau à un tiers.
2. **Pas de coût récurrent** — gratuit et libre de droits commerciaux.
3. **Stabilité** — frontières FSA évoluent lentement (~5-10 FSA ajoutés/supprimés/an), mise à jour annuelle suffit.
4. **Performance** — chargement statique au boot, lookup O(1) en mémoire pour les ~50 ms de la fonction pure.
5. **Couverture complète** Canada — 1 622 FSA pour 100 % du territoire.

### Négatives / risques

1. **Attribution** — l'OGL-Canada exige une attribution. À documenter dans le footer public de l'app (mentions légales).
2. **Pas de granularité plus fine** — la FSA est la plus petite unité gratuite ; précision rue nécessiterait Postes Canada Address Data.
3. **Mise à jour manuelle** — si la procédure annuelle est oubliée, les nouveaux FSA seront `null` (FR-009b → score géo neutre, dégradation gracieuse mais pas optimale).

### Mitigation

- Alerte calendrier annuelle (`docs/runbooks/matching-fsa-update.md`) + tâche issue tracker.
- Test d'invariant en CI : `fsa-centroids.json` contient ≥ 1 500 entrées (catch corruption ou téléchargement partiel).

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| **OpenStreetMap (Overpass / Geofabrik)** | Granularité différente (codes postaux complets). Licence ODbL share-alike pose des questions juridiques sur la réutilisation interne. |
| **Postes Canada Address Data** | ~10 k CAD/an. Surinvestissement pour un MVP. |
| **Centroïdes provinciaux uniquement** | Granularité 1 niveau trop grossière (toute Quebec = 1 centroïde) — supprimerait toute valeur du signal géo. |
| **Geocoding API commercial (Google, Mapbox)** | Rejet Loi 25 + coût + latence. |

## Statut d'implémentation (2026-06-03)

Décision adoptée. `tools/build-fsa-centroids.ts` + `packages/shared/src/matching/fsa-centroids.json` (header `meta` : source, URL, version StatCan 2021, licence OGL-Canada) + `EmbeddedFsaCentroidReader` (validation Zod au boot). Procédure annuelle dans `docs/runbooks/matching-fsa-update.md`.

⚠️ **Reste à faire avant merge prod** : le fichier livré est une **amorce bootstrap** (`meta.isBootstrap = true`, 41 FSA métros) — suffisante pour les tests unitaires/intégration mais pas pour la prod. Régénérer la table complète (~1 622 FSA) via le script (accès réseau + dépendance `shapefile`) et activer l'invariant CI « ≥ 1 500 entrées » une fois `isBootstrap:false`.
