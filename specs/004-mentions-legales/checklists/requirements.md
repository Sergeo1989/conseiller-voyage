# Specification Quality Checklist : Mentions légales, CGU, politique de confidentialité et page « Comment ça marche »

**Purpose** : Validate specification completeness and quality before proceeding to planning
**Created** : 2026-05-25
**Feature** : [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — Next.js mentionné dans le contexte/dépendances comme constat de stack existante (héritée de la constitution), pas comme prescription d'implémentation. Les exigences fonctionnelles restent agnostiques (URL routes, comportements, contenus requis).
- [x] Focused on user value and business needs — chaque US lie l'exigence à un acteur (voyageur, conseiller, inspecteur OPC) et un bénéfice (compréhension du modèle, conformité légale, traçabilité Loi 25).
- [x] Written for non-technical stakeholders — la spec est lisible par un juriste, un product owner et un inspecteur réglementaire sans aucune lecture du code.
- [x] All mandatory sections completed — Scénarios utilisateurs et tests ✅, Cas limites ✅, Exigences fonctionnelles ✅, Critères de succès ✅, Hypothèses ✅, Hors scope ✅.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — 3 questions initiales (FR-002 format CGU, FR-006 identité éditeur, FR-007 juridiction) résolues par le porteur du projet le 2026-05-25 : Q1=B (deux CGU séparées B2B/B2C), Q2=A (personne morale Québec avec NEQ — valeurs exactes différées au `/speckit.tasks`), Q3=A (juridiction Montréal). Spec mise à jour en cohérence (FR-002, FR-005, FR-006, FR-007, FR-009 à FR-013, US3, US4, SC-001 à SC-003, SC-009, hypothèses).
- [x] Requirements are testable and unambiguous — chaque FR-### est formulé avec un verbe d'action testable (« DOIT publier », « DOIT collecter », « DOIT persister »).
- [x] Success criteria are measurable — chaque SC-### contient une métrique quantitative (%, ms, count) ou une procédure de vérification automatisée (crawler, test d'intégration CI).
- [x] Success criteria are technology-agnostic — formulés en termes utilisateur / business (pages chargées, audits passés, acceptations enregistrées). Le seul SC technique (SC-005 axe-core) est explicitement nommé par la constitution comme outil bloquant.
- [x] All acceptance scenarios are defined — 5 user stories, chacune avec au moins un scénario Given/When/Then explicite.
- [x] Edge cases are identified — 8 cas limites listés (changement de version, refus de consentement, JS désactivé, robot d'indexation, effacement Loi 25, etc.).
- [x] Scope is clearly bounded — section Hors scope avec 6 items explicitement exclus.
- [x] Dependencies and assumptions identified — sections Dépendances (4 items) et Hypothèses (6 items) complètes.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — chaque FR-### est rattaché soit à une US (scénarios Given/When/Then), soit à un SC mesurable, soit à une contrainte constitutionnelle déjà testée en CI.
- [x] User scenarios cover primary flows — US1 (page modèle), US2 (footer permanent), US3 (signup CGU), US4 (consentement intake), US5 (audit OPC) couvrent les 4 acteurs (voyageur, conseiller, inspecteur, robot).
- [x] Feature meets measurable outcomes defined in Success Criteria — les 10 SC sont alignés avec les FR et les US (traçabilité matrice US ↔ FR ↔ SC implicite).
- [x] No implementation details leak into specification — les pages sont décrites par leur URL et leur contenu attendu, pas par leur composant React ou leur méthode de rendu (sauf SSG qui est une exigence de performance, pas un détail d'impl).

## Notes

- 3 questions initiales résolues le 2026-05-25 par le porteur du projet (Q1=B, Q2=A, Q3=A) — spec mise à jour en cohérence.
- 2 questions secondaires (juriste vs template, bandeau cookies) résolues par des hypothèses explicites documentées en section Hypothèses de la spec.
- 15/15 items du checklist validés. La spec est prête pour `/speckit.clarify` (si questions résiduelles à creuser) ou directement pour `/speckit.plan`.
- Le merge de cette spec n'est pas bloquant pour la feature 002-voyageur-intake en cours, mais l'entité `LegalAcceptance` qu'elle définit conditionne le consentement Loi 25 côté intake (US4) — coordination de timing à prévoir au moment du `/speckit.tasks`.
