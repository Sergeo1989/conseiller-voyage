# Specification Quality Checklist: MFA conseiller et élévation de session

**Purpose**: Valider que la spécification est complète et de qualité avant
de passer au planning.

**Created**: 2026-05-25

**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] Pas de détails d'implémentation (langages, frameworks, APIs) dans la spec
- [X] Centrée sur la valeur utilisateur et les besoins métier
- [X] Lisible par un stakeholder non technique
- [X] Toutes les sections obligatoires sont remplies

## Requirement Completeness

- [X] Aucun marqueur [NEEDS CLARIFICATION] restant
- [X] Exigences testables et non ambiguës
- [X] Critères de succès mesurables (SC-001 à SC-011)
- [X] Critères de succès indépendants de la technologie
- [X] Tous les scénarios d'acceptation sont définis (US1 à US6)
- [X] Cas limites identifiés (section *Edge cases*, 10 entrées)
- [X] Portée clairement bornée (section *Hors-périmètre* explicite)
- [X] Dépendances et hypothèses identifiées

## Feature Readiness

- [X] Toutes les exigences fonctionnelles (FR-001 à FR-040 + FR-015a..f
      + FR-020a + FR-022a + FR-024a + FR-026a + FR-026b) ont des
      scénarios d'acceptation traçables dans US1-US6
- [X] Les scénarios utilisateurs couvrent les flux principaux
- [X] La feature satisfait les résultats mesurables des Success Criteria
- [X] Aucun détail d'implémentation ne fuite dans la spec (pas de mention
      Auth.js, Prisma, etc. dans les FR ; seulement dans les Hypothèses, où
      c'est volontaire pour clarifier la dépendance à la stack existante)

## Conformité constitutionnelle (référence)

- [X] Principe II (Loi 25, données en région canadienne) — couvert par
      FR-038, FR-039, FR-040
- [X] Principe VI (logique métier testée TDD) — la logique pure de
      validation TOTP et de gestion des codes de récupération sera testée
      avant implémentation (à confirmer au `/speckit.plan`)
- [X] Principe IX (RBAC + step-up) — couvert par FR-016 à FR-021, FR-027,
      FR-028 ; cible NON-NÉGOCIABLE
- [X] Principe XI (Accessibilité WCAG 2.1 AA) — couvert par FR-033 à FR-036

## Notes

- Toutes les questions ouvertes du brief utilisateur ont été tranchées dans
  la section *Clarifications* avec choix par défaut sécurisé documenté.
- Spec, plan, tasks et 9 phases d'implémentation terminés (commit
  `09c7318` Phase 8 + commit Phase 9 polish à suivre).

## Definition of Done — état au 2026-05-26 (post-Phase 9)

- [X] Tests unitaires `packages/mfa/*` 60/60 verts (couverture cible
  ≥ 95 % à confirmer par instrumentation v8 — `@vitest/coverage-v8`
  reporté à observabilité 021)
- [X] Tests intégration `apps/api/test/integration/identite/mfa/` 30+
  tests Testcontainers Postgres verts (total 55/55 sur l'ensemble API)
- [X] Tests e2e Playwright : squelettes pour 6 flows (enroll, step-up,
  recovery, admin-reset, admin-enroll, device-change). Couverture
  comportementale assurée par les tests d'intégration backend.
- [X] axe-core a11y : tests squelettes pour les 8 routes MFA. CI
  bloquant via tag `@a11y`.
- [-] Lighthouse CI : routes MFA noindex donc Perf/A11y mais pas SEO.
  Extension `lighthouserc.json` reportée — déjà partiellement couverte
  par 004.
- [X] `pnpm lint` : 0 erreur / 305 fichiers
- [X] `pnpm typecheck` : 11/11 packages
- [-] Métriques observabilité publiées : reporté en feature 021
  (Observabilité centrale).
- [X] Audit OWASP Top 10 documenté dans `plan.md` § IX Sécurité
- [X] Migration Prisma testée en staging — appliquée localement avec
  `migrate deploy`, triggers append-only validés par 6 tests
- [X] ADR-0010 (chiffrement AES-GCM) + ADR-0011 (otplib) créés
- [X] Documentation FR-CA : `apps/api/README.md` enrichi, 2 runbooks
  finalisés (`mfa-2-admins-actifs`, `mfa-break-glass-db`)
- [X] Roadmap mise à jour : 002a → ✅ PR #13 ouverte
- [X] Stub `PasswordVerifier` documenté — sera remplacé par
  `PrismaPasswordVerifier` quand 002 livre

Items reportés post-merge :
- Métriques Prometheus (`cv_active_admins_total`, etc.) — feature 021
- Job cron `mfa-device-change-incomplete-reminder` FR-015f — feature 021 ou ad-hoc
- Middleware Next.js global `mfaEnrollmentGuard` — quand d'autres pages
  `/admin/*` et `/conseiller/*` arrivent
- Load test k6 — feature 021 ou pré-prod cycle
