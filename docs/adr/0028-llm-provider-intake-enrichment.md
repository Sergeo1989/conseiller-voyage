# ADR-0028 — Fournisseur LLM (`LlmProvider`) et placement de l'enrichissement d'intake

**Date** : 2026-06-15
**Statut** : accepté (implémenté feature 016, 2026-06-15 — sauf l'adaptateur Bedrock T031
et l'avis FR-016, gated AWS/juridique ; l'app tourne en mode dégradé sûr d'ici là)
**Décideurs** : équipe technique, équipe conformité
**Spec lié** : [016-intake-llm-enrichment/spec.md](../../specs/016-intake-llm-enrichment/spec.md)
**Plan lié** : [016-intake-llm-enrichment/plan.md](../../specs/016-intake-llm-enrichment/plan.md), Constitution Check Principes II / V / VI / IX / X
**Research lié** : [016-intake-llm-enrichment/research.md](../../specs/016-intake-llm-enrichment/research.md), R2 + R3

---

## Contexte

Feature 016 enrichit le brief d'intake (008) pour améliorer l'appariement (011). C'est la
**première** introduction d'un LLM dans le produit. La constitution (Stack canonique +
Principe V) impose : *tout LLM derrière un port `LlmProvider`*, **région canadienne**,
**plafond de coût ≤ 0,05 USD/requête**, **cache**. La Loi 25 (Principe II) interdit toute
PII de contact hors région et exige minimisation + effacement.

Deux décisions structurantes (> 1 module : intake produit l'enrichissement, matching le
consomme) doivent être actées :

1. **Quel fournisseur LLM concret**, et comment l'abstraire.
2. **Où placer l'enrichissement dans le flux** sans bloquer le voyageur ni rendre le LLM
   point de défaillance du matching.

## Décision

### 1. Port `LlmProvider` + adaptateur AWS Bedrock `ca-central-1`

- Port domaine `LlmProvider` (interface pure, zéro SDK) exposant une opération d'extraction
  structurée (texte non identifiant + schéma cible → sortie brute + usage, ou `unavailable`).
- Adaptateur concret **AWS Bedrock, région `ca-central-1`** (cohérent S3/SES/ECS du projet,
  ADR-0001/0005/0006 ; résidence canadienne native, pas de sortie de région).
- La **sortie du modèle est non fiable** : validée Zod contre `EnrichedIntentions` avant tout
  usage/persistance (frontière de confiance, Principe IX). Une sortie hors schéma → écartée.
- **Coût borné** : `maxOutputTokens` + troncature de l'entrée → ≤ 0,05 USD/req. **Cache** =
  l'entité `BriefEnrichment` idempotente par `briefId` (0 ré-appel).

### 2. Enrichissement en amont du scoring, via un nouvel événement `voyageur.brief.enriched`

- Déclencheur : un consumer **intake** sur `voyageur.brief.activated` (008) → `EnrichBriefJob`
  (BullMQ, idempotent `briefId`).
- Le job **expurge la PII** du texte libre (FR-017, filtre déterministe) avant l'appel LLM,
  tente l'enrichissement sous **budget strict**, persiste `BriefEnrichment`, **puis publie
  `voyageur.brief.enriched`** (toujours, même en fallback).
- Le `BriefActivatedConsumer` du matching est **repointé** sur `voyageur.brief.enriched`
  (au lieu de `.activated`) → `PerformMatchingUseCase`. *Révision 2026-06-15 : le câblage
  bus `activated → matching` était lui-même déjà différé (`brief-activated.consumer` :
  « wiring effectif T093 ») ; le repoint hérite de ce prérequis bus prod (gate staging partagée).*
- **Sweep de réconciliation** (pattern feature 012) : tout brief activé non apparié sous
  N minutes est apparié → le matching n'est **jamais** durablement bloqué si le job échoue.
- Le matching lit l'enrichi via le port public `BriefEnrichmentQueryPort` et applique une
  **fonction pure** (`mergeEnrichmentIntoSnapshot`). Effets au MVP (sous seuil de confiance,
  clarification 2026-06-15) : (a) résoudre `speciality = 'autre'` → canonique ; (b) **augmenter**
  l'ensemble de destinations (union ; déterministes **toujours** conservées, jamais écrasées —
  FR-003). Poids, plafond 3, filtre `verified` **inchangés**.

## Conséquences

**Positives** :
- Le chemin de soumission/vérification voyageur n'est **jamais** ralenti (tout est post-activation).
- Le matching ne dépend **jamais** du LLM (timeout + sweep → mode dégradé garanti, Principe X).
- Pas de re-match → **aucun churn** de leads/notifications conseiller.
- Couplage inter-module propre (port public uniquement, Principe V) ; déterminisme préservé
  (le LLM n'écrase jamais un champ validé, Principe VI).
- Résidence CA + minimisation + frontière de confiance → conformité Loi 25 / sécurité.

**Négatives / coûts** :
- Insère une étape (enrichissement) avant l'appariement → légère latence d'appariement
  (bornée par le timeout ; le voyageur ne la perçoit pas).
- Dépendance opérationnelle nouvelle (Bedrock) : à surveiller via `cv.intake.enrichment.*`.
- Verrou fournisseur partiel mitigé par le port (changement d'adaptateur sans toucher au domaine).

## Alternatives rejetées

| Alternative | Pourquoi rejetée |
|---|---|
| **Enrichir en synchrone à la vérification magic-link** | Ajoute la latence LLM à une étape voyageur (viole SC-001). |
| **Consommateur d'enrichissement parallèle + re-match à la complétion** | Réintroduit re-match (supersession 012) → churn de leads et re-notifications conseiller. |
| **Appeler un SDK LLM directement depuis l'application** | Couple le domaine au fournisseur (viole VIII + Principe V « derrière `LlmProvider` »). |
| **Fournisseur hors région CA (ex. API publique US)** | Viole Loi 25 (résidence) — rédhibitoire. |

## Décisions de clarification (2026-06-15)

- **Loi 25 (résolu)** : **avis de traitement automatisé léger** — divulgation dans l'intake +
  politique Loi 25 (feature 004), **sans** porte de consentement dédiée (l'enrichissement n'est
  pas conditionné à un opt-in). Encodé FR-016.
- **Périmètre scoring (résolu)** : le MVP consomme `speciality` **et** `destinations` enrichies
  (union, déterministes conservées) — pas seulement la spécialité.
- **Minimisation (résolu)** : **aucun texte libre persisté** (pas de reformulation) ; seules les
  intentions structurées sont stockées.

### Révisions de revue tasks (2026-06-15)

- **Déclenchement** : nouvel événement `voyageur.brief.enriched` (intake) + repoint du consumer
  matching ; le câblage bus prod reste un prérequis partagé (gate staging).
- **Scrub PII (FR-017)** : le texte libre est expurgé (filtre déterministe) avant l'appel LLM —
  un champ libre peut contenir une coordonnée tapée par le voyageur.
- **`languageDetected` retiré** : champ sans consommateur → non persisté (cohérence minimisation).

## Points ouverts (calibration implémentation)

- Choix précis du modèle Bedrock + **seuil de `confidence`** (commun à la résolution de
  spécialité et à l'injection de destinations) : à calibrer en implémentation.
