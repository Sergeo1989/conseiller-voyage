# ADR-0024 — Extensions cross-module pour 011 matching

**Date** : 2026-05-31
**Statut** : proposé
**Décideurs** : équipe technique
**Spec lié** : [008-matching-scoring/spec.md](../../specs/008-matching-scoring/spec.md), Assumptions (dépendances cross-module)
**Plan lié** : [008-matching-scoring/plan.md](../../specs/008-matching-scoring/plan.md), Décisions architecturales
**Tasks liés** : T015, T015b, T069, T093 (cf. [tasks.md](../../specs/008-matching-scoring/tasks.md))

---

## Contexte

La feature 011 matching nécessite des extensions cross-module potentielles. Le `/speckit-analyze` (pass 1) a identifié 3 zones où 011 doit écrire / étendre des modules amont (001 conformité, 007 profil conseiller, 008 intake) ou en aval (003 notifications). Sans cadre formel, ces extensions risquent :

1. De **mélanger les responsabilités** dans une PR fourre-tout (011 modifie 001 + 003 + 007 + 008 + son propre code).
2. De **violer le Principe V** (frontières modulaires) — un module ne doit pas étendre librement les internes d'un autre.
3. De **désorganiser la séquence d'implémentation** — bloquer le démarrage de 011 sur des PR amont coordonnées.

Les 3 extensions identifiées :

| # | Module touché | Extension | Justification | Tâche concernée |
|---|---|---|---|---|
| E1 | **001 conformité** | Éventuel `siegeSocialPostalCode` sur `conformite_compliances` si absent | Source fallback adresse conseiller pour calcul Haversine FSA (hiérarchie Q2 clarify) | T015 |
| E2 | **008 intake** | Éventuel `suggestedConseillerId` sur `voyageur_briefs` si absent | Capture l'intention voyageur au moment de la soumission (cookie cv_suggested HMAC posé par 007) — figée pour le matching | T069 |
| E3 | **003 notifications** | Extension `OutboxPublisherJob` pour scanner `matching_outbox_entries` | Publication des 4 events outbox matching vers le bus interne (consommé par 012 futur) | T093 |
| E4 | **007 profil** | Vérification présence champs `languages`/`specialities`/`destinations`/`experienceTier` sur `ConseillerProfile`. Migration mineure si absent ou si mapping de terminologie | Alimentation des 4 axes scorés + filtre langue | T015b |

## Décision

Adopter une **stratégie de livraison à 2 modes** selon la trivialité de l'extension :

### Mode A — Inclusion dans la PR 011 (pour extensions triviales)

**Critères** :

- Migration DB ≤ 1 fichier SQL, ≤ 20 lignes.
- Aucune modification de logique métier dans le module amont.
- Aucun nouveau test côté module amont (les tests d'extension vivent côté 011).
- Pas de breaking change.

**Exemples Mode A** : E1 (ajout colonne `siegeSocialPostalCode` nullable), E2 (ajout colonne `suggestedConseillerId` nullable).

**Procédure** :

1. La migration cross-module est créée dans `packages/db/prisma/migrations/` avec un nom qui mentionne l'extension (`2026XXXX_conformite_siege_postal_code_for_matching`).
2. La PR 011 inclut la migration + l'update du schéma Prisma du module amont (`packages/db/prisma/schema/conformite.prisma`).
3. La PR 011 mentionne explicitement dans la description la liste des extensions cross-module Mode A.
4. Le mainteneur du module amont (ou le porteur produit en mode solo) review la PR avec attention sur la migration cross-module.

### Mode B — PR satellite coordonnée (pour extensions non-triviales)

**Critères** :

- Migration DB > 20 lignes OU modification de logique métier OU nouveau test côté module amont.
- Modification du worker `OutboxPublisherJob` 003 (logique métier non triviale).
- Breaking change potentiel (rare en MVP).

**Exemples Mode B** : E3 (extension `OutboxPublisherJob` 003), E4 si une migration substantielle sur `ConseillerProfile` est nécessaire.

**Procédure** :

1. Ouvrir une PR séparée sur la branche `<module>-<extension>` (ex. `003-outbox-publisher-matching-extension`) **avant** ou **en parallèle** de la PR 011.
2. La PR satellite est self-contained — passe les tests CI du module amont.
3. La PR 011 dépend logiquement de la PR satellite mais peut être mergée séparément.
4. Une issue GitHub coordonne le merge order si nécessaire.

### Cas E1 / E2 / E4 — décision dépend de la vérification

Au début de la Phase 2 (T015, T015b, T069), un dev vérifie l'état actuel du schéma des modules amont :

- Si le champ est **déjà présent** : note dans le tasks.md + skip de l'extension.
- Si le champ est **absent et trivial à ajouter** : Mode A (inclusion PR 011).
- Si le champ est **absent et nécessite logique** : Mode B (PR satellite).

### Cas E3 — toujours Mode B

L'extension `OutboxPublisherJob` 003 touche la logique métier du worker (ajout d'une table à scanner, gestion des erreurs spécifiques, tests dédiés). PR satellite obligatoire.

## Conséquences

### Positives

1. **Frontières modulaires préservées** (Principe V) — chaque extension est explicitement documentée et justifiée.
2. **Pas de PR fourre-tout** — la PR 011 reste lisible. Les extensions complexes ont leur propre revue.
3. **Traçabilité** — toute extension cross-module est listée dans cet ADR + référencée dans les tâches concernées.
4. **Aucun blocage strict** — un dev peut démarrer 011 en parallèle des PR satellites Mode B (les tests d'intégration sont les seuls à requérir tout en place).

### Négatives / risques

1. **Coordination** — Mode B implique une coordination merge order. Mitigation : issue GitHub dédiée par extension.
2. **Surface de revue** étendue temporairement — 3 ou 4 PRs au lieu d'1 pour livrer 011 complètement. Mitigation : checklist Phase 6 polish vérifie que tout est mergé avant ouverture PR 011 finale.

### Mitigation

- Tâches T015, T015b, T069 commencent par une **vérification de présence** avant tout ALTER TABLE — évite les migrations inutiles.
- L'extension `OutboxPublisherJob` (T093) est typée Mode B dans tasks.md dès le départ.

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| **Toutes les extensions dans la PR 011** | Risque PR fourre-tout ; revue dégradée ; violation Principe V difficile à juger. |
| **Toutes les extensions en PR satellite Mode B** | Sur-coordination ; un ALTER TABLE trivial ne mérite pas une PR séparée. |
| **Mode unique selon le module touché** (ex. 001 → satellite, 008 → inclusion) | Logique arbitraire ; ne reflète pas la complexité réelle de chaque extension. |
| **Pas d'ADR — laisser chaque dev décider** | Risque d'incohérence dans le temps. Toute extension future entre 011 et X bénéficie de ce cadre. |
