# Runbook — Mise à jour annuelle des centroïdes FSA

**Feature** : 011 matching scoring (branche `008-matching-scoring`)
**Cf.** [ADR-0021](../adr/0021-fsa-haversine-distance.md), [ADR-0022](../adr/0022-fsa-centroids-statcan-source.md), [research.md R2/R3](../../specs/008-matching-scoring/research.md)
**Tâche** : T090

## Pourquoi

L'axe géo du scoring (poids 0.25) calcule la distance Haversine entre le
centroïde FSA du voyageur et celui du conseiller. Cette table de centroïdes
est embarquée dans `packages/shared/src/matching/fsa-centroids.json`
(~1 622 FSA × `{lat, lng, province}`), générée à partir du *Forward
Sortation Area Boundary File* de **Statistique Canada** (licence Open
Government Licence – Canada).

Statistique Canada publie une nouvelle version (rattachée au cycle de
recensement / mises à jour postales). Une FSA peut être **ajoutée**
(nouveau quartier) ou, rarement, **retirée**. Sans mise à jour, les
nouveaux codes postaux tombent dans le fallback géo neutre (score médian
0,5, cf. FR-009b) — dégradation silencieuse de la pertinence.

> ⚠️ **État actuel** : le fichier livré est une **amorce bootstrap**
> (`meta.isBootstrap = true`, ~41 FSA métros). La table complète 1 622 FSA
> doit être régénérée (accès réseau + dépendance `shapefile`) **avant le
> merge production** de la feature 011.

## Cadence

**Annuelle** (vérification chaque T1), ou ad hoc si un volume anormal de
briefs/conseillers tombe sur le fallback géo neutre.

## Procédure

### 1. Vérifier la version source

Ouvrir la page StatCan et comparer la dernière release au champ
`meta.sourceVersion` du JSON courant :

- Source : <https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/>
- Si une version plus récente existe, mettre à jour `SOURCE_URL` et
  `SOURCE_VERSION` en tête de `tools/build-fsa-centroids.ts`.

### 2. Régénérer la table

```bash
pnpm tsx tools/build-fsa-centroids.ts
```

Le script télécharge le shapefile, calcule les centroïdes polygonaux et
réécrit `packages/shared/src/matching/fsa-centroids.json` (minifié, header
`meta` mis à jour : `sourceVersion`, `generatedAt`, `fsaCount`,
`isBootstrap: false`).

### 3. Vérifier le diff

```bash
git diff --stat packages/shared/src/matching/fsa-centroids.json
```

Points de contrôle :

- `meta.fsaCount` ≈ 1 622 (et **non** 41) ; `meta.isBootstrap = false`.
- FSA **ajoutées** : attendu (croissance postale). En noter le volume.
- FSA **retirées** : rare — vérifier qu'aucune n'est massivement référencée
  par des conseillers existants (sinon ils basculeraient sur le fallback
  `siegeSocialPostalCode` puis géo neutre).
- Validation Zod au boot : l'adapter `EmbeddedFsaCentroidReader` re-valide
  le fichier au démarrage (defense-in-depth). Un JSON malformé fait échouer
  le boot — à détecter en staging, pas en prod.

### 4. Tester

```bash
pnpm --filter @cv/shared test    # valide le schéma + parsing
pnpm --filter @cv/api test:unit  # services géo (compute-fsa-distance)
```

Puis déployer en **staging** et lancer la matrice quickstart
(`specs/008-matching-scoring/quickstart.md`) avant le merge.

### 5. Documenter

Mentionner dans le commit la version StatCan, le delta FSA
(ajoutées/retirées) et la taille du fichier. Ne **jamais** éditer le JSON à
la main — toujours régénérer via le script (traçabilité licence OGL-Canada).

## Références

- ADR-0021 — Haversine + 5 paliers de score géo
- ADR-0022 — Source StatCan + licence OGL-Canada
- `tools/build-fsa-centroids.ts`
- `apps/api/src/modules/matching/infrastructure/embedded-fsa-centroid-reader.ts`
- `apps/api/src/modules/matching/domain/services/compute-fsa-distance.ts`
