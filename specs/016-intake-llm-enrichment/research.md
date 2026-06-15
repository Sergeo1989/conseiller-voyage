# Research — Enrichissement LLM de l'intake voyageur (016 / roadmap 009)

Phase 0. Résout les inconnues techniques de la spec. Source de vérité : `spec.md` +
`.specify/memory/constitution.md`. Grounding codebase confirmé (intake 008, matching 011).

## R1 — Quelle est réellement la « surface de texte libre » à enrichir ?

**Décision** : le brief 008 est **majoritairement structuré**. Les seuls champs en texte
libre sont `budgetNote` (≤ 500 c.), `specialityOther` (≤ 200 c., utilisé quand
`speciality = 'autre'`), et les notes de `region` dans `destinations`. L'enrichissement
ne parse donc **pas** un grand blob ; ses cibles concrètes :

1. **Résoudre `speciality = 'autre'` + `specialityOther`** → une valeur **canonique** de la
   taxonomie matching (`croisiere | aventure_outdoor | lune_de_miel | famille_avec_enfants |
   mobilite_reduite | multigenerationnel | culturel_historique | luxe | road_trip |
   voyage_affaires`). C'est le gain le plus direct : l'axe *speciality* (poids 0,25,
   ADR-0020) est un match binaire sur l'enum — aujourd'hui `autre` ne matche rien.
2. **Extraire des destinations additionnelles** depuis `budgetNote` / `specialityOther` /
   notes de région → **consommées** par l'axe destination du scoring (union, déterministes
   toujours conservées — clarification 2026-06-15), + la langue.
3. *(Retiré, clarification 2026-06-15)* : aucune reformulation/texte libre n'est persistée
   (minimisation Loi 25). Seules les intentions **structurées** sont stockées.

**Rationale** : maximise la valeur matching mesurable (SC-006) sans sur-promettre un
parsing de blob inexistant. **Alternatives rejetées** : enrichir tous les champs
structurés (inutile — déjà validés déterministes, FR-003) ; ajouter un grand champ
texte libre au brief (changerait 008, hors périmètre).

## R2 — Placement de l'enrichissement dans le flux (timing : la décision déférée du spec)

**Décision** : **enrichissement en amont du scoring, dans le pipeline d'appariement
déclenché par `voyageur.brief.activated`, avec budget de temps strict et filet de
réconciliation** — *jamais* sur le chemin de soumission/vérification du voyageur.

Flux retenu :
1. `voyageur.brief.activated` (publié par 008 `VerifyMagicLinkUseCase`) déclenche un job
   d'enrichissement (BullMQ, idempotent par `briefId`).
2. Le job tente l'enrichissement best-effort sous **budget court** (timeout). Quel que
   soit le résultat (succès / partiel / timeout / indisponible), il persiste un
   `BriefEnrichment` (statut explicite) **puis déclenche l'appariement** (`PerformMatchingUseCase`).
3. Un **sweep de réconciliation** (réutilise le pattern 012 « sweep bus HS ») garantit que
   tout brief activé non apparié sous N minutes est apparié (filet anti-perte si le job
   d'enrichissement disparaît).
4. Le scoring lit les intentions enrichies **si présentes** (sinon brief déterministe).

**Rationale** : (a) la soumission/vérification voyageur n'est **jamais** ralentie (SC-001,
tout est post-activation, en arrière-plan) ; (b) **pas de course** entre deux consommateurs
du même event ni de re-match qui supprimerait/re-notifierait des leads (anti-churn 012) ;
(c) le matching ne dépend **jamais durablement** du LLM (timeout + sweep → il s'exécute
toujours, Principe X mode dégradé). **Alternatives rejetées** :
- *Synchrone à la vérification magic-link* : ajoute la latence LLM à une étape voyageur. Rejeté (SC-001).
- *Consommateur d'enrichissement parallèle + re-match à la complétion* : plus découplé mais
  réintroduit du re-match (supersession 012) → churn de leads/notifications conseiller. Rejeté
  pour le MVP (complexité + UX conseiller).

## R3 — Le port `LlmProvider` (n'existe pas encore)

**Décision** : créer un port domaine `LlmProvider` (interface pure, zéro SDK) exposant une
opération d'**extraction structurée** (entrée : texte non identifiant + schéma cible ;
sortie : objet validé ou échec). Adaptateur infrastructure concret = **AWS Bedrock
`ca-central-1`** (Stack canonique + ADR-0028). Sortie LLM **toujours validée Zod** contre
le schéma d'intentions avant usage (FR-006, frontière de confiance).

**Rationale** : conforme constitution (LLM derrière `LlmProvider`, région CA) ; testable
via un fake déterministe (MSW/stub) sans appel réseau. **Alternatives rejetées** : appeler
un SDK directement depuis l'application (couple le domaine au fournisseur, viole VIII) ;
choisir le fournisseur dans la spec (décision structurante → ADR).

## R4 — Idempotence & maîtrise du coût

**Décision** : `BriefEnrichment` est **1:1 idempotent par `briefId`** (clé d'unicité DB) ;
un re-déclenchement réutilise l'existant (0 appel). Plafond de coût constitution
**≤ 0,05 USD/requête** respecté (modèle économique + `maxTokens` borné + troncature du
texte d'entrée). Cache au niveau de la persistance (le `BriefEnrichment` EST le cache).

**Rationale** : SC-005 + Principe V (plafond coût + cache LLM). **Alternatives rejetées** :
cache externe (Redis) séparé — redondant, le brief n'est enrichi qu'une fois.

## R5 — Loi 25 : minimisation, région, anti-PII, effacement

**Décision** :
- **Aucune PII de contact** transmise au LLM : le `voyageurContactId` et tout identifiant
  de contact sont exclus du payload ; seuls `budgetNote`, `specialityOther`, notes de
  région et champs structurés non identifiants sont envoyés (FR-004).
- Traitement **région CA** (Bedrock ca-central-1) (FR-005, SC-008).
- **Étendre `tools/check-no-pii-matching-audit.ts`** (ou un scan jumeau) pour couvrir la
  table d'enrichissement (le scan ne couvre pas l'intake aujourd'hui) — garde defense-in-depth.
- **Cascade d'anonymisation** : trigger Postgres aligné sur le pattern intake/matching
  (ADR-0023) — quand le brief passe `anonymized`, le `BriefEnrichment` est redacté
  (`normalizedSummary` → null, intentions → redacted), audit préservé.

**Rationale** : Loi 25 NON-NÉGOCIABLE. **Alternatives rejetées** : envoyer tout le brief
au LLM (viole minimisation) ; effacement applicatif seul (le pattern projet est trigger DB).

## R6 — Déterminisme préservé (Principe VI)

**Décision** : la logique sensible testée en TDD ici est la **fusion intentions enrichies →
entrée de scoring** (fonction pure : (a) si `speciality = autre` + confiance ≥ seuil → spécialité
canonique, sinon déterministe ; (b) `destinations` = **union** déterministe ∪ enrichies sous
seuil, déterministes toujours conservées — clarification 2026-06-15) et la
**validation/sanitisation de la sortie LLM**. La validation de brief 008 reste inchangée.

**Rationale** : Principe VI — la seule nouvelle logique métier (règle de fusion + frontière
de confiance) est pure, testée AVANT implémentation, cas nominal + erreur. **Alternatives
rejetées** : laisser l'enrichi écraser le déterministe (viole FR-003).

## R7 — Observabilité

**Décision** : métriques OTel `cv.intake.enrichment.*` : `attempts`, `success`, `fallback`
(par cause : timeout / indisponible / schéma invalide / faible confiance), `latency`,
`tokens`/`cost`. Pas de nouvelle métrique de boucle économique (l'enrichissement agit en
amont du taux d'acceptation déjà instrumenté par 012).

**Rationale** : Principe VII + SC-007. Permet de surveiller si le mode dégradé se déclenche
trop (signal de panne fournisseur).
