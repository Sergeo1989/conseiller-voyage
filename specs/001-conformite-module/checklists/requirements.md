# Checklist Qualité de Spécification : Module Conformité

**Objet** : valider la complétude et la qualité de la spec avant `/speckit.plan`
**Créé le** : 2026-05-22
**Feature** : [spec.md](../spec.md)

## Qualité du contenu

- [x] Aucun détail d'implémentation (langage, framework, API)
- [x] Centré sur la valeur utilisateur et les besoins métier
- [x] Rédigé pour des parties prenantes non techniques
- [x] Toutes les sections obligatoires sont remplies

## Complétude des exigences

- [x] Aucun marqueur `[NEEDS CLARIFICATION]` restant
- [x] Les exigences sont testables et non ambiguës
- [x] Les critères de succès sont mesurables
- [x] Les critères de succès sont indépendants de la technologie
- [x] Tous les scénarios d'acceptation sont définis
- [x] Les cas limites sont identifiés
- [x] Le périmètre est clairement borné (section *Hors scope*)
- [x] Les dépendances et hypothèses sont identifiées

## Prêt pour planification

- [x] Toutes les exigences fonctionnelles ont des critères d'acceptation clairs
- [x] Les *user stories* couvrent les flux primaires
- [x] La feature répond aux résultats mesurables définis dans *Critères de succès*
- [x] Aucun détail d'implémentation ne fuit dans la spec

## Vérifications additionnelles spécifiques au projet (Constitution)

- [x] Principe I (frontière réglementaire) : aucune exigence ne franchit la
      frontière (réservation, paiement client, versement fournisseur)
- [x] Principe I : statut « vérifié » comme condition préalable explicite (FR-007)
- [x] Principe II : minimisation et résidence canadienne mentionnées (FR-020)
- [x] Principe II : consentement explicite (FR-016) et droit à l'effacement
      avec arbitrage légal (FR-017) traités
- [x] Principe V : interface publique du module nommée (FR-006), pas de JOIN
      cross-module
- [x] Principe VII : événements traçables pour audit (FR-011, FR-012) — la
      métrique d'observabilité de la boucle économique sera adressée par les
      modules consommateurs (matching), pas par ce module foundational

## Notes

- Les items non cochés exigent une mise à jour du spec avant `/speckit.clarify`
  ou `/speckit.plan`.
- Cette spec a passé la validation au premier tour sans `[NEEDS CLARIFICATION]`
  parce que les questions de scope (multi-affiliation, OCR, cross-province) ont
  des défauts raisonnables documentés dans la section *Hypothèses*.
- La couverture de l'authentification multifacteur du conseiller (exigée par
  Principe IX) est explicitement déléguée au module identité — sera adressée
  dans le spec et le plan de ce module.

## Session de clarification du 2026-05-22

5 questions de clarification posées et appliquées via `/speckit.clarify` :

1. **Source de référence des permis OPC/TICO** → option B : saisie texte libre
   + numéro de permis, validation manuelle admin. Pas d'entité Agence partagée.
   Impacte : FR-001, FR-015, *Entités clés*, *Cas limites*.
2. **État `under_review`** → option A : supprimé du MVP. Machine d'état
   réduite à `pending`/`verified`/`suspended`/`revoked`. Transitions
   explicitées. Impacte : *Entités clés > Statut de conformité du conseiller*.
3. **Volume année 1** → option B : 50 à 500 conseillers. File admin paginée
   (20/page) avec filtre par statut. Impacte : FR-003, *Hypothèses*.
4. **Format/taille documents** → option A : 5 MB × 5 fichiers, formats
   PDF/JPG/PNG/HEIC. Impacte : *Hypothèses* (clarifiée), nouvelle FR-021.
5. **Latence de propagation des changements de statut** → option B : < 60 s
   pour toute transition, < 10 s pour transitions négatives. Impacte :
   *Cas limites* (alignement), nouvelle FR-022, nouvelle SC-010.

Nouvelle volumétrie après clarification :
- 22 exigences fonctionnelles (était 20)
- 10 critères de succès mesurables (était 9)
- Machine d'état réduite à 4 valeurs avec transitions explicites
