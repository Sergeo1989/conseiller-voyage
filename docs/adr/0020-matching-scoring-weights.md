# ADR-0020 — Pondération initiale des 4 axes de scoring matching

**Date** : 2026-05-31
**Statut** : accepté (implémenté feature 011, 2026-06-03)
**Décideurs** : équipe technique, porteur produit
**Spec lié** : [008-matching-scoring/spec.md](../../specs/008-matching-scoring/spec.md), FR-009
**Plan lié** : [008-matching-scoring/plan.md](../../specs/008-matching-scoring/plan.md), Performance Goals + Constitution Check Principe VI
**Research lié** : [008-matching-scoring/research.md](../../specs/008-matching-scoring/research.md), R1

---

## Contexte

Le scoring matching (feature 011 roadmap) calcule pour chaque brief × conseiller `verified` un score brut ∈ [0, 1] à partir de **4 axes** (la langue est un filtre dur appliqué AVANT scoring, cf. Q3 clarify). Les axes scorés sont :

1. **Destination match** — alignement entre les pays/régions du brief et les destinations déclarées par le conseiller (feature 007).
2. **Proximité géographique** — distance Haversine entre les centroïdes FSA de l'adresse conseiller (hiérarchie profil 007 → siège 001, cf. ADR-0024) et du code postal voyageur (008).
3. **Spécialité** — alignement enum `TravelSpeciality` (lune_de_miel, aventure, culture, etc.) entre brief et conseiller.
4. **Familiarité voyageur** — mapping `TravelFamiliarity` voyageur (novice / experimented / expert) × tier conseiller (mentor / pair / pair_expert).

Le score boosté ∈ [0, 1,10] (boost ≤ +10 % sur cookie `cv_suggested`, FR-011).

La pondération doit refléter la hiérarchie naturelle d'un dossier voyage selon la pratique observée dans les agences canadiennes : **destination > spécialité ≈ proximité > familiarité**.

## Décision

Pondération initiale (algorithme `v1.0`) :

| Axe | Poids |
|---|---|
| **Destination match** | **0,35** |
| **Proximité géographique** | **0,25** |
| **Spécialité** | **0,25** |
| **Familiarité voyageur** | **0,15** |
| **Total** | **1,00** (normalisé) |

Les poids sont **injectés via `WeightsConfig`** (lu depuis les env vars `MATCHING_WEIGHT_*` au boot — apps/api/src/env.ts T003) et **validés au boot** (invariant somme = 1,0 ± 10⁻⁶ via superRefine Zod).

Tout changement de pondération **doit** :

1. Être documenté par un **nouvel ADR** (0020 reste, le nouvel ADR « remplace » au sens MADR).
2. Bumper `MATCHING_ALGORITHM_VERSION` (v1.0 → v1.1 ou v2.0 selon ampleur).
3. Persister la nouvelle version dans `matching_results.algorithmVersion` pour traçabilité historique.
4. Être validé par les tests de propriété SC-002 (déterminisme) + SC-003 (plafond 3).

## Conséquences

### Positives

1. **Hiérarchie naturelle** matérialisée — un spécialiste Cuba pour un brief Cuba est de loin le meilleur match.
2. **Pondération injectable** (Principe VIII Open/Closed) — re-pondérer en prod sans modifier la fonction pure de scoring.
3. **Traçabilité** via `algorithmVersion` persistée par MR — un MR calculé en v1.0 reste lisible et auditable même après bump v1.1.
4. **Aucune dépendance ML** (Principe VI déterminisme) — le scoring reste 100 % testable par invariant.

### Négatives / risques

1. **Pondération arbitraire au MVP** — pas de validation empirique. Risque : si les conversions lead → devis ne suivent pas, il faudra ré-pondérer (signal métier nécessaire post-feature 012).
2. **Familiarité 0,15 faible** — risque que le match novice / expert soit mal capté. À surveiller via métrique `matching.boost_applied` + retours conseillers post-012.

### Mitigation

- Suivi mensuel via le dashboard `docs/dashboards/matching.json` (répartition status ok/partial/empty, taux boost, latence) — un excès de `empty`/`partial` signale une pondération ou une couverture conseillers à revoir.
- Re-pondération possible **sans toucher au code** (juste env vars `MATCHING_WEIGHT_*` + bump `MATCHING_ALGORITHM_VERSION` + nouvel ADR).

## Statut d'implémentation (2026-06-03)

Implémenté tel que décidé : `WeightsConfig.DEFAULT_WEIGHTS_V1` = 0,35 / 0,25 / 0,25 / 0,15, lu depuis `MATCHING_WEIGHT_*` (défauts `env.ts`), invariant somme = 1,0 ± 10⁻⁶ vérifié au boot (superRefine Zod) + `weights-config.vo` (tests T040/T041). `algorithmVersion` persisté sur chaque `matching_results`. Filtre langue dur appliqué avant scoring (Q3).

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| **Apprentissage automatique (ML)** | Aucune donnée d'entraînement au MVP. Opacité non alignée Principe VI. Reportée post-012 (signal lead acceptance disponible). |
| **Pondération uniforme (0,25 × 4)** | Ne reflète pas la hiérarchie pratique ; sous-évalue la destination. |
| **Destination = 1,0, reste = 0** | Réduit le matching à un filtre ; perd la nuance utile au plafond 3. |
| **Familiarité = 0,30** | Sur-pondère un signal difficile à objectiver côté conseiller en MVP. |
