# ADR-0028 — Fournisseur LLM (`LlmProvider`) et placement de l'enrichissement d'intake

**Date** : 2026-06-15
**Statut** : proposé (feature 016 / roadmap 009)
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

### 2. Enrichissement en amont du scoring, en arrière-plan, chaîné sur l'activation

- Déclencheur : `voyageur.brief.activated` (008, inchangé) → `EnrichBriefJob` (BullMQ,
  idempotent `briefId`).
- Le job tente l'enrichissement sous **budget strict** ; quel que soit le résultat, il
  persiste `BriefEnrichment` **puis déclenche l'appariement** (`PerformMatchingUseCase`).
- **Sweep de réconciliation** (pattern feature 012) : tout brief activé non apparié sous
  N minutes est apparié → le matching n'est **jamais** durablement bloqué si le job échoue.
- Le matching lit l'enrichi via le port public `BriefEnrichmentQueryPort` et applique une
  **fonction pure** (`mergeEnrichmentIntoSnapshot`) : effet borné = résoudre `speciality =
  'autre'` → canonique. Poids, plafond 3, filtre `verified` **inchangés**.

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

## Points ouverts (à trancher avant merge)

- **Revue juridique Loi 25** : un *avis de traitement automatisé* explicite côté voyageur
  est-il requis, ou le consentement d'intake existant (008/004) suffit-il ? Si requis →
  ajouter la divulgation (probablement dans la politique Loi 25, feature 004).
- Choix précis du modèle Bedrock + seuil de `confidence` : à calibrer en implémentation.
