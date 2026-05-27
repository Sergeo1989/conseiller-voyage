# Specification Quality Checklist: Profil conseiller (public + privé)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- All quality items pass on first iteration.
- `/speckit-clarify` exécuté le 2026-05-27 (session unique, 5 questions) — décisions actées et intégrées à la section *Clarifications* du spec :
  - Slug : `prenom-nom` slugifié FR-CA + suffixe numérique en cas de collision (Q1)
  - CTA `?suggested=` : boost soft ≤ +10 % cumulé, validité 24 h, sans override du plafond 3 (Q2)
  - Onboarding profil : facultatif avec relances email J+3/J+7/J+14 (Q3)
  - Nom affiché : `Prénom + initiale-nom` par défaut, opt-in nom complet, aucun pseudonyme (Q4)
  - Modération : extension de la console conformité existante (Q5)
- **Passe de cohérence 2026-05-27** (post-clarify, après interruption de session) : 11 écarts détectés et corrigés — US2 description et scenario 4 (alignés sur Q2 et Q4), US3 scenario `verified` + `incomplet` ajouté, US6 « Admin modère un profil » créée avec 4 acceptance scenarios pour cadrer FR-023/FR-024, edge cases « renomme titre/pseudonyme » + « asymétrie slug ↔ nom affiché » + « modération photo » + « re-vérification » reformulés ou ajoutés, FR-003 enum statut étendu (`incomplet`/`prêt`/`masqué_admin`/`anonymisé`), FR-005 clarifié (terminal vs masquage), FR-007 liste 404 explicite, FR-008a mécanique middleware Next.js précisée, FR-016 liste PII anonymisées détaillée, Key Entities `ConseillerProfile` champs typés et statut/raisonMasquageAdmin ajoutés, naming `masqué_admin` aligné (suppression de `profil_masqué_admin` et `non-visible`).
