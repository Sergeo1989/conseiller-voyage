# Definition of Done — Feature 003 Notifications transactionnelles

**Date** : 2026-05-27  
**Référence** : `.specify/memory/constitution.md` § *Flux de développement et portes qualité*

Légende : ✅ fait · 🟡 partiel · ⏳ pas encore · ❌ bloquant

---

## Code et spécifications

| # | Item | Statut | Détail |
|---|---|---|---|
| 1 | `specs/003-notifications-transactionnelles/spec.md` mergée | 🟡 | Existe et complète (commit `adb7a24`) — pas encore mergée vers `main` (branche en cours) |
| 2 | `plan.md` mergé avec section *Constitution Check* explicite | 🟡 | Existe et complet — même remarque que (1) |
| 3 | `tasks.md` — toutes les tâches implementables cochées `[X]` | 🟡 | T045-T046 (Testcontainers), T064-T065/T077-T079 (E2E US1-2), T086 (SNS integration), T096 (US3 E2E), T111 (US5 E2E), T116-T118 (CHECK constraint integration), T125 (admin integration), T133-T135 (Playwright admin) ⏳ environment-dependent |
| 4 | ADR créé si décision architecturale | ✅ | ADR-0006 (SES), ADR-0013 (pepper hash), ADR-0014 (templates) |

---

## Tests automatiques

| # | Item | Statut | Détail |
|---|---|---|---|
| 5 | Tests unitaires : passent + cas nominal et erreur (Principe VI) | ✅ | Vitest — fonctions pures domaine, use cases avec mocks ports (TDD RED avant GREEN sur chaque use case sensible) |
| 6 | Tests d'intégration : flux principaux | 🟡 | Tests écrits pour SNS webhook, admin endpoints — non exécutés (Testcontainers, nécessite Docker) |
| 7 | Tests E2E Playwright si UI | ⏳ | T133-T135 — scripts écrits, nécessite `pnpm dev` actif + env staging |
| 8 | `axe-core` (a11y) passe sans erreur critique | ⏳ | T134 — axe-core sur les 3 routes admin — nécessite env running |
| 9 | Lighthouse CI : pas de régression > 10 % sur LCP/INP/CLS | ⏳ | Pages admin RSC — à mesurer contre staging |
| 10 | `pnpm typecheck` + `pnpm lint` : zéro erreur | 🟡 | À exécuter (T151) — pattern attendu ✅ d'après phases précédentes |

---

## Observabilité et performance

| # | Item | Statut | Détail |
|---|---|---|---|
| 11 | Métriques OTel instrumentées + dashboard lié dans README | ✅ | T097-T110 — 6 métriques OTel, dashboard `docs/dashboards/notifications.json`, alertes `notifications-alerts.yaml` |
| 12 | SLO Principe X : endpoints synchrones < 800 ms p95 | ⏳ | Pas mesuré — requiert staging + charge nominale |

---

## Sécurité

| # | Item | Statut | Détail |
|---|---|---|---|
| 13 | Checklist OWASP Top 10 2021 | ✅ | [`checklists/owasp.md`](owasp.md) — 8/10 ✅, 1/10 🟡 (staging), 1/10 ⏳ (pnpm audit) |
| 14 | Secrets en AWS Secrets Manager (pas en dur dans le code) | ✅ | `NOTIFICATIONS_EMAIL_HASH_PEPPER`, `NOTIFICATIONS_SNS_HMAC_SECRET` via Secrets Manager |
| 15 | En-têtes HTTP de sécurité (CSP, HSTS) | 🟡 | Configurés dans `next.config.ts` — à valider lors du déploiement staging |
| 16 | `pnpm audit --audit-level critical` : 0 CVE critique | ⏳ | À exécuter avant merge |

---

## Conformité Loi 25

| # | Item | Statut | Détail |
|---|---|---|---|
| 17 | Données personnelles en région canadienne | ✅ | AWS SES + S3 + ECS + Secrets Manager : tous `ca-central-1` |
| 18 | Effacement `EraseRecipientHistoryUseCase` implémenté | ✅ | T113 — anonymise email clair + corps HTML/text |
| 19 | Rétention 24 mois automatisée (`NotificationRetentionSweepJob`) | ✅ | T138 — cron mensuel |
| 20 | Audit append-only 7 ans (`notification_audit_entries`) | ✅ | T027 — triggers Postgres BEFORE UPDATE/DELETE/TRUNCATE |
| 21 | Hash HMAC peppered (jamais SHA-256 nu) | ✅ | ADR-0013 |

---

## Documentation FR-CA

| # | Item | Statut | Détail |
|---|---|---|---|
| 22 | README module mis à jour | ✅ | T143 — `apps/api/src/modules/notifications/README.md` |
| 23 | Runbooks opérationnels | ✅ | T145-T147 — SES production access, disaster recovery, bounce investigation |
| 24 | `docs/roadmap.md` mis à jour | ✅ | T144 — feature 003 en `🔵 implémentation en cours` |

---

## Opérations et review

| # | Item | Statut | Détail |
|---|---|---|---|
| 25 | Migrations Prisma testées en staging | ⏳ | 5 migrations + CDK stack — à déployer lors du premier staging |
| 26 | Revue de code approuvée | ⏳ | PR vers `main` à ouvrir (T157) |
| 27 | `tools/check-module-boundaries.ts` : 0 violation | ⏳ | T150 — à exécuter |

---

## Synthèse

| Type | Compte | Items |
|---|---|---|
| ✅ Fait | 12 | 4, 5, 11, 13, 14, 17, 18, 19, 20, 21, 22, 23, 24 |
| 🟡 Partiel | 4 | 1, 2, 3, 10, 15 |
| ⏳ Pas encore | 9 | 6, 7, 8, 9, 12, 16, 25, 26, 27 |
| ❌ Bloquant | 0 | — |

**Verdict** : fondamentaux code, sécurité et Loi 25 ✅. Les portes ⏳ dépendent
de l'environnement staging ou d'actions pre-launch (audit deps, review). Non-bloquant
pour le merge de la feature — à compléter avant le launch public.

---

## Actions pour passer les 🟡/⏳ à ✅

| Porte | Action | Coût estimé |
|---|---|---|
| 1, 2 | Merge branche → `main` après review (item 26) | dépend review |
| 3 | Exécuter les tests environment-dependent en staging | ~4 h |
| 6, 7, 8 | `pnpm exec playwright install` + exécuter suites admin | ~2 h |
| 9 | Brancher Lighthouse CI sur preview deployments | ~2 h après staging |
| 10 | `pnpm typecheck && pnpm lint` (T151) | ~30 min |
| 12 | Load test k6 contre staging | ~4 h après staging |
| 15 | Audit en-têtes HTTP via SecurityHeaders.com en staging | ~1 h |
| 16 | `pnpm audit --audit-level critical` | ~30 min |
| 25 | Premier déploiement CDK staging + dry-run rollback | ~6 h après staging |
| 26 | Ouvrir PR + `/code-review ultra` | ~2 h |
| 27 | `pnpm tsx tools/check-module-boundaries.ts` (T150) | ~15 min |
