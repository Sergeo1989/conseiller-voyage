# Specification Quality Checklist — Auth conseiller + admin (006)

**Purpose** : Validate specification completeness and quality before proceeding to `/speckit.clarify` or `/speckit.plan`

**Created** : 2026-05-26

**Feature** : [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed (User Scenarios, Requirements, Success Criteria)

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — **3 markers résolus par /speckit.specify : TTL reset = 1 h (OWASP), lockout = 5/15min/compte + 20/1h/IP (double bucket), bootstrap admin = enrôlement MFA au 1er login (politique J1 unifiée)**
- [x] Requirements are testable and unambiguous (chaque FR est mesurable)
- [x] Success criteria are measurable (10 SC quantifiés)
- [x] Success criteria are technology-agnostic (pas de framework / DB / outil cité)
- [x] All acceptance scenarios are defined (7 user stories × 3-8 scénarios chacune)
- [x] Edge cases are identified (8 cas limites listés)
- [x] Scope is clearly bounded (sections « Hors scope explicite » et « Dépendances »)
- [x] Dependencies and assumptions identified (8 assumptions + 3 catégories de dépendances)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria (39 FR + 7 US avec scénarios Given/When/Then)
- [x] User scenarios cover primary flows (signup, login, vérification, déconnexion, reset, changement, création admin)
- [x] Feature meets measurable outcomes defined in Success Criteria (alignement SC ↔ FR vérifié)
- [x] No implementation details leak into specification (revue manuelle effectuée — pas de mention NestJS, Prisma, Auth.js dans les FR ; seul le « Contexte produit » mentionne 002a et Auth.js par référence historique, ce qui est acceptable car c'est de la trace de décision passée)

## Notes

### Décompte des [NEEDS CLARIFICATION] markers

**0 marker restant** — les 3 décisions de scope/sécurité ont été arbitrées en clôture de `/speckit.specify` :

1. **US5 scénario 1 + FR-019** — TTL du lien de réinitialisation : **1 heure** (défaut OWASP, balance UX/sécurité).
2. **FR-009 + US2 scénarios 5-7** — Politique de verrouillage : **double bucket** — 5 échecs/15 min/compte (aligné avec MFA verify de 002a) + 20 échecs/1 h/IP (rempart anti-credential stuffing distribué).
3. **US7 scénario 3** — Bootstrap admin : **enrôlement MFA forcé au 1er login** (politique J1 unifiée, pas de chemin spécial CLI ; audit `admin_bootstrap` enregistre l'absence d'acteur).

### Items reportés post-merge

(à formaliser dans le plan)
- TTL exact du lien d'invitation admin (FR-030, mention 72 h dans Hypothèses — à confirmer)
- Liste exhaustive des templates de courriel FR-CA (à délimiter dans le plan)
- Format précis du runbook de bootstrap admin (SC-009 — ≤ 1 page)

### Prochaine étape recommandée

Spec prêt pour `/speckit.plan` directement (les 3 clarifications ont été résolues en clôture de `/speckit.specify`). `/speckit.clarify` peut tout de même être lancé en option si tu souhaites une seconde passe d'ambiguïté avant le plan, mais ce n'est pas bloquant.
