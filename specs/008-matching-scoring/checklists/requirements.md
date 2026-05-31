# Specification Quality Checklist: Matching scoring conseiller × brief (top 3)

**Purpose** : Validate specification completeness and quality before proceeding to planning

**Created** : 2026-05-31

**Last updated** : 2026-05-31 (post `/speckit-clarify` session 5/5 résolues)

**Feature** : [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — **5 résolues post-clarify** (Q1 axes scoring, Q2 source adresse conseiller, Q3 langue filtre dur, Q4 trigger re-matching, Q5 taxonomie événements outbox)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded (calcul + persistence + boost ; PAS dans 011 : notifications, dashboard, conversation)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (P1 calcul top 3, P2 boost cookie, P3 mode dégradé verified évolue)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- ✅ Toutes les clarifications résolues. Voir section `## Clarifications` de spec.md pour le détail des 5 Q&A (session 2026-05-31).
- Dépendances cross-module à valider en `/speckit-plan` :
  - `ConformiteQueryPort` (feature 001 — statut `verified` + siège social fallback adresse).
  - `ConseillerProfile.address` (feature 007 — source primaire adresse, hiérarchie Q2).
  - `ConseillerProfile.languages` + `ConseillerProfile.specialities` + `ConseillerProfile.destinations` (feature 007 — alimentent 4 des 5 axes scoring).
  - Cookie `cv_suggested` HMAC (feature 007 — boost ≤ +10 %).
  - Outbox `voyageur.brief.activated` (feature 008 — trigger unique du matching).
  - Outbox aval consommée par feature 012 + extension US5 du dashboard admin de 008 :
    `voyageur.brief.matched` / `partially_matched` / `unmatched` / `all_matches_revoked`.
- Suite logique : `/speckit-plan` pour matérialiser l'architecture 4 couches + ADRs sur (a) pondération scoring (b) source adresse 007 vs 001 (c) fichier FSA centroid embedded (d) algorithme de distance (Haversine).
