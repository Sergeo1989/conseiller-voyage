# Feature Specification: Enrichissement LLM de l'intake voyageur

**Feature Branch**: `016-intake-llm-enrichment`

**Created**: 2026-06-15

**Status**: Draft

**Roadmap**: feature **009** (module *préqualification*). S'appuie sur **008** (intake
voyageur, brief structuré + validation déterministe) et alimente **011** (matching).
Périmètre **MVP-1** (arbitré 2026-06-15).

**Input**: User description: "Enrichissement LLM de l'intake voyageur (feature roadmap 009,
module préqualification). Au-dessus du brief structuré déjà livré par 008. Un fournisseur
d'enrichissement reformule/normalise le texte libre du voyageur et extrait des intentions
structurées (destinations, type de projet, période approximative, langue, indices de
spécialité) pour mieux alimenter le scoring de matching 011, SANS jamais bloquer la
soumission ni casser le caractère déterministe du brief. Contraintes non-négociables :
Loi 25 / région canadienne, mode dégradé obligatoire, validation déterministe = source de
vérité, idempotence et coût maîtrisé, anti-marketplace (ADR-0002) préservé."

## Clarifications

### Session 2026-06-15

- Q: Loi 25 — le voyageur doit-il être informé/consentir explicitement à l'enrichissement automatisé ? → A: **Avis explicite léger** — divulgation du traitement automatisé dans l'intake + politique Loi 25 (feature 004), **sans** porte de consentement séparée (l'enrichissement n'est pas conditionné à un opt-in dédié).
- Q: Quelles intentions enrichies alimentent le scoring au MVP ? → A: **`speciality` (résolution de `autre`) ET `destinations` enrichies** — les destinations détectées **augmentent** l'ensemble de destinations du scoring ; les destinations déterministes sont **toujours conservées** (jamais retirées/écrasées), injection sous seuil de confiance.
- Q: Faut-il stocker une reformulation en texte libre (`normalizedSummary`) ? → A: **Non** — ne persister que les **intentions structurées** (speciality canonique, destinations enrichies, confidence, statut, usage). Minimisation Loi 25 ; aucune surface de texte libre stockée.

### Session 2026-06-15 (revue tasks — angles morts)

- Q: Mécanisme de déclenchement (le wiring activation→matching n'est câblé qu'à moitié) ? → A: **Nouvel événement `voyageur.brief.enriched`** publié par l'intake (toujours, même en fallback) ; le consumer matching est **repointé** dessus. Le câblage bus prod reste un **prérequis partagé** (même gate staging que 011/012).
- Q: Les champs texte libre (`budgetNote`/`specialityOther`) envoyés au LLM peuvent contenir de la PII tapée par le voyageur ? → A: **Scrub PII déterministe avant envoi** (regex courriel/téléphone, fonction pure testée) — FR-017.
- Q: `languageDetected` (stocké mais non consommé) ? → A: **Retiré** (cohérence minimisation) ; la langue conseiller déterministe (008) régit le scoring.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Le brief est enrichi sans jamais bloquer le voyageur (Priority: P1) 🎯 MVP

Un voyageur décrit son projet de voyage en texte libre dans l'intake. Le système, en
plus de la validation déterministe existante, produit **best-effort** une version
normalisée du texte et un jeu d'**intentions structurées** (destinations, type de projet,
période approximative, langue, indices de spécialité). Si l'enrichissement échoue, tarde,
ou est indisponible, la soumission **aboutit quand même** avec le brief déterministe seul.

**Why this priority**: C'est le cœur de la valeur et l'invariant non-négociable du projet :
améliorer la qualité de l'appariement sans jamais transformer le LLM en point de
défaillance ni dégrader l'expérience de soumission. Livrable seul = MVP utile (le brief
est enrichi quand c'est possible, robuste quand ça ne l'est pas).

**Independent Test**: Soumettre un brief avec le fournisseur d'enrichissement **disponible**
→ le brief porte des intentions structurées cohérentes. Soumettre un brief identique avec
le fournisseur **coupé** → la soumission réussit, sans intentions enrichies, sans erreur ni
délai notable pour le voyageur.

**Acceptance Scenarios**:

1. **Given** un texte libre exploitable et le service d'enrichissement disponible, **When** le voyageur soumet son brief, **Then** le brief est accepté et porte des intentions structurées (destinations / type de projet / période approximative / langue / indices de spécialité) marquées « enrichi ».
2. **Given** le service d'enrichissement indisponible (panne/temps dépassé), **When** le voyageur soumet, **Then** la soumission réussit avec le brief déterministe seul, marqué « non enrichi », sans message d'erreur ni attente prolongée.
3. **Given** un enrichissement qui contredirait un champ validé de façon déterministe, **When** l'enrichissement est appliqué, **Then** le champ déterministe **prévaut** (l'enrichissement n'écrase jamais une donnée validée).

---

### User Story 2 — Le matching exploite les intentions enrichies (Priority: P2)

Les intentions structurées issues de l'enrichissement sont mises à disposition du module
de matching pour améliorer la pertinence de l'appariement (notamment pour les briefs au
texte vague), **sans modifier les règles déterministes** du scoring ni le plafond de 3
conseillers.

**Why this priority**: C'est ce qui transforme l'enrichissement en valeur mesurable côté
boucle économique (meilleurs leads). Dépend de US1 mais en est distincte : on peut livrer
l'enrichissement (US1) avant de le brancher pleinement sur le scoring.

**Independent Test**: Pour un brief au texte vague, comparer l'appariement **avec** et
**sans** intentions enrichies ; avec enrichissement, les conseillers proposés sont au moins
aussi alignés (idéalement mieux), et le plafond de 3 ainsi que le filtre « vérifié » restent
intacts.

**Acceptance Scenarios**:

1. **Given** un brief enrichi (`autre` résolu + destinations détectées), **When** le matching s'exécute, **Then** l'axe spécialité matche la valeur canonique et l'ensemble de destinations est augmenté des destinations enrichies (déterministes toujours présentes), **sans** changer poids, plafond de 3, ni filtre « vérifié ».
2. **Given** un brief non enrichi (mode dégradé), **When** le matching s'exécute, **Then** il fonctionne sur le brief déterministe seul, sans erreur ni dépendance dure à l'enrichissement.

---

### User Story 3 — Maîtrise du coût, idempotence et observabilité (Priority: P3)

L'enrichissement ne s'exécute **qu'une fois par version de brief** (réutilisé ensuite),
respecte un plafond de coût, et expose des métriques (taux de réussite, taux de repli en
mode dégradé, latence, usage/coût) pour le pilotage.

**Why this priority**: Garantit la soutenabilité économique et opérationnelle. Sans
idempotence ni plafond, le coût LLM dérive ; sans métriques, on ne sait pas si la garde
« mode dégradé » se déclenche trop souvent.

**Independent Test**: Re-déclencher l'enrichissement d'un brief inchangé → **aucun** nouvel
appel au fournisseur (résultat réutilisé). Consulter les métriques → taux de réussite/repli,
latence et usage sont visibles.

**Acceptance Scenarios**:

1. **Given** un brief déjà enrichi et inchangé, **When** un re-traitement est déclenché (re-soumission, re-match, rejeu), **Then** le résultat existant est réutilisé et **0** appel supplémentaire au fournisseur n'est émis.
2. **Given** une série de soumissions, **When** on consulte l'observabilité, **Then** les taux de réussite/repli, la latence et l'usage/coût d'enrichissement sont mesurables.

---

### Edge Cases

- **Texte libre vide ou trop court** : aucun enrichissement tenté ; brief déterministe seul, marqué « non enrichi ».
- **Temps d'enrichissement dépassé / service coupé** : repli automatique, soumission non bloquée (US1).
- **Sortie du fournisseur malformée ou hors schéma** : rejetée, jamais persistée ni utilisée ; repli sur le brief brut (frontière de confiance — la sortie LLM est non fiable par défaut).
- **Sortie contenant des coordonnées, un prix, un lien de réservation, ou du contenu hors-sujet** : neutralisée/écartée (anti-marketplace ADR-0002 + Loi 25 préservés).
- **Texte non francophone** : pris en charge sans perte ; la langue détectée devient une intention structurée.
- **Conflit intention enrichie vs champ déterministe** : le déterministe prévaut.
- **Effacement Loi 25 du brief** : les données d'enrichissement sont anonymisées/effacées en cascade avec le brief (audit préservé selon la politique de rétention).
- **Texte libre très long** : borné dans la limite de coût (troncature/résumé maîtrisé), sans casser la soumission.
- **Intentions de faible confiance** : ne pas fabriquer de données ; replier sur les champs déterministes et marquer l'enrichissement « partiel/indisponible ».

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT, à partir du texte libre d'un brief, produire best-effort des **intentions structurées** : **spécialité canonique** (résolvant `speciality = 'autre'`) et **destinations** détectées. Aucune **reformulation en texte libre n'est persistée** (minimisation Loi 25) ; toute normalisation interne reste transitoire. Aucun champ **langue détectée** n'est persisté (révision 2026-06-15).
- **FR-002**: L'enrichissement DOIT être **non bloquant** : la soumission d'un brief DOIT réussir même si l'enrichissement échoue, dépasse son budget de temps, ou est indisponible (repli sur le brief déterministe).
- **FR-003**: La **validation déterministe** du brief (008) DOIT rester la **source de vérité** : l'enrichissement NE DOIT NI modifier l'acceptation de la soumission, NI écraser/invalider un champ validé de façon déterministe.
- **FR-004**: Le système NE DOIT JAMAIS transmettre de **PII de contact** du voyageur (nom, courriel, téléphone, adresse) au fournisseur d'enrichissement ; seuls le texte de projet de voyage et des champs non identifiants sont transmis.
- **FR-005**: Tout traitement et toute donnée d'enrichissement DOIVENT rester en **région canadienne** (Loi 25).
- **FR-006**: Le système DOIT **valider la sortie du fournisseur contre un schéma attendu** avant toute persistance ou utilisation ; une sortie malformée, hors schéma ou non sûre DOIT être écartée avec repli sur le brief brut (la sortie LLM est traitée comme non fiable).
- **FR-007**: L'enrichissement DOIT être **idempotent par version de brief** : un re-traitement d'un brief inchangé NE DOIT PAS émettre d'appel redondant et DOIT réutiliser le résultat existant.
- **FR-008**: Les intentions enrichies DOIVENT être **mises à disposition du matching** via une interface définie. Au MVP le scoring consomme : (a) la **spécialité canonique** quand le brief valait `autre` ; (b) les **destinations enrichies**, qui **augmentent** l'ensemble de destinations (union) — les destinations déterministes sont **toujours conservées**, jamais retirées ni écrasées, et l'injection est conditionnée à un **seuil de confiance**. Les **poids**, le **plafond de 3** et le filtre « vérifié » restent **inchangés**.
- **FR-016**: Le voyageur DOIT être **informé du traitement automatisé** (enrichissement LLM) de sa description, via une divulgation dans l'intake et la politique Loi 25 (feature 004) ; **aucune** porte de consentement dédiée n'est ajoutée et l'enrichissement n'est **pas** conditionné à un opt-in séparé (clarification 2026-06-15).
- **FR-009**: Le système DOIT **enregistrer des métriques** d'enrichissement : taux de réussite, taux de repli (mode dégradé), latence, usage/coût.
- **FR-010**: La capacité d'enrichissement DOIT être exposée **derrière une abstraction de fournisseur**, afin que le fournisseur LLM concret puisse changer sans impacter l'intake ni le matching. *(Le choix du fournisseur concret et de sa région est une décision structurante à acter en ADR au `/speckit.plan`.)*
- **FR-011**: L'enrichissement DOIT **préserver les invariants anti-marketplace** (ADR-0002) : aucune coordonnée, aucun montant/prix, aucun lien ou donnée de réservation introduits.
- **FR-012**: Le système DOIT prendre en charge une **saisie non francophone sans perte** (le texte est traité tel quel, pas de rejet). La **langue conseiller déterministe** (`conseillerLanguage`, 008) régit le scoring ; **aucun** champ « langue détectée » n'est persisté (révision 2026-06-15, cohérence minimisation).
- **FR-017**: Le texte libre (`budgetNote`, `specialityOther`, notes de région) DOIT être **expurgé de toute PII de contact** (courriel, téléphone) par un **filtre déterministe** AVANT l'envoi au fournisseur LLM (renforce FR-004 ; le voyageur peut taper une coordonnée dans un champ libre). Filtre = fonction pure testée.
- **FR-013**: En cas d'intentions de **faible confiance ou vides**, le système DOIT replier proprement (champs déterministes + marquage « non/partiellement enrichi ») plutôt que de **fabriquer** des données.
- **FR-014**: Un **plafond de coût/d'usage** par brief DOIT être respecté ; le texte trop long DOIT être borné sans casser la soumission.
- **FR-015**: L'effacement Loi 25 d'un brief DOIT **cascader** sur ses données d'enrichissement (anonymisation/effacement), l'audit étant préservé selon la politique de rétention.

### Key Entities *(include if feature involves data)*

- **Brief** *(existant, 008)* : intake structuré + texte libre du voyageur ; source de vérité déterministe. L'enrichissement s'y rattache sans le modifier.
- **Enrichissement de brief** : artefact dérivé d'un brief — **intentions structurées uniquement** (spécialité canonique, destinations enrichies) + niveau de confiance + statut (`enrichi` / `partiel` / `non_enrichi` / `indisponible`) + provenance + usage. **Aucun texte libre ni langue détectée persistés** (minimisation). Relation **1:1 idempotente** avec un brief (immuable post-soumission → `briefId` suffit).
- **Intention structurée** : champs extraits alimentant le matching — **spécialité canonique** (résolution de `autre`) et **destinations** (alignées sur la taxonomie / le filtre destination du matching 011).
- **Métrique d'enrichissement** : indicateurs de réussite/repli/latence/usage pour l'observabilité (Principe VII).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La soumission d'un brief n'est **jamais retardée** au-delà de son budget de temps actuel par l'enrichissement ; au-delà du budget, la soumission aboutit sans enrichissement (l'enrichissement peut se compléter ultérieurement).
- **SC-002**: **100 %** des soumissions réussissent même lorsque le service d'enrichissement est totalement indisponible.
- **SC-003**: Lorsque le service est disponible et le texte exploitable, des intentions structurées sont produites pour **≥ 90 %** des briefs.
- **SC-004**: **0** occurrence de PII de contact du voyageur transmise au fournisseur ou stockée dans les données d'enrichissement (vérifiable par scan/audit, cohérent avec la garde anti-PII matching existante).
- **SC-005**: Le re-traitement d'un brief inchangé émet **0** appel supplémentaire au fournisseur (idempotence).
- **SC-006**: Pour les briefs au texte vague, la pertinence de l'appariement **ne se dégrade pas** et s'améliore de façon mesurable lorsque l'enrichissement est présent (alignement du top-3 / taux d'acceptation).
- **SC-007**: Les indicateurs réussite/repli/latence/usage d'enrichissement sont **observables** en continu.
- **SC-008**: **100 %** des données d'enrichissement résident en région canadienne ; **0** traitement hors région (Loi 25).
- **SC-009**: **100 %** des sorties du fournisseur sont validées contre le schéma avant utilisation ; une sortie non conforme n'est **jamais** persistée ni exposée au matching.

## Assumptions

- S'appuie sur le brief et le flux d'activation de brief de **008** (l'événement d'activation alimente déjà le matching 011) ; l'enrichissement enrichit ce flux sans le remplacer.
- **Timing** exprimé en résultat (SC-001), pas en architecture : le choix « enrichissement synchrone avec budget de temps + repli » vs « asynchrone avec ré-appariement quand prêt » est une décision de `/speckit.plan` ; les deux satisfont « ne jamais bloquer la soumission ».
- Le **fournisseur LLM concret et sa région** (p. ex. Bedrock `ca-central-1`) sont décidés en **ADR** au `/speckit.plan`, derrière le port `LlmProvider` (Stack canonique).
- Les **indices de spécialité** extraits sont alignés sur la **taxonomie de spécialités du matching 011** (plutôt que des étiquettes libres), pour une intégration directe au scoring.
- L'enrichissement est **interne et best-effort** ; une **UI de visualisation/correction par le voyageur** est hors périmètre de cette feature.
- **Loi 25 (résolu, clarification 2026-06-15)** : un **avis explicite léger** de traitement automatisé est ajouté (divulgation dans l'intake + politique Loi 25 / feature 004) — FR-016 ; **pas** de porte de consentement dédiée, l'enrichissement n'est pas conditionné à un opt-in.
- Le caractère **déterministe et testé** de la validation de brief (Principe VI) n'est pas touché : l'enrichissement est une couche additive de métadonnées.
