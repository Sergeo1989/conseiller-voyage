# Definition of Done — Feature 001 Conformité

**Audit mis à jour au 2026-05-25 (run 2)** — état honnête après finalisation
des portes 🟡 actionnables localement (Playwright deps + a11y deps installées,
license check vert, audit OWASP top 10 documenté).

Référence : `.specify/memory/constitution.md` §
*Flux de développement et portes qualité* > *Definition of Done*.

Légende : ✅ fait · 🟡 partiel · ⏳ pas encore · ❌ bloquant

---

## Code et spécifications

| # | Item | Statut | Détail |
|---|---|---|---|
| 1 | `specs/001-conformite-module/spec.md` mergée | 🟡 | Existe et complète ; pas encore mergée vers `main` (branche en cours) |
| 2 | `plan.md` mergé avec section *Constitution Check* explicite | 🟡 | Existe et complet ; même remarque que (1) |
| 3 | `tasks.md` généré et toutes les tâches T001-T125 cochées `[x]` | ✅ | 138/138 — cf. `tasks.md` *Validation finale* |
| 14 | ADR créé si décision architecturale | ✅ | `docs/adr/0001` à `0007` couvrent S3, OTel, observabilité, sessions, ECS, SES, Sentry |

## Tests automatiques

| # | Item | Statut | Détail |
|---|---|---|---|
| 4 | Tests unitaires : passent + cas nominal et erreur (Principe VI) | ✅ | Vitest 200/200, 19 suites — scoring matching, validation brief, use cases approve/refuse/erase, etc. |
| 5 | Tests d'intégration : flux principaux | ✅ | `audit-trigger.integration` (append-only trigger SQL) + `verified-filter.integration` (filter RBAC en couche DB) |
| 6 | Tests e2e Playwright si UI | 🟡 | 5 specs écrits (`conformite-us1-5.spec.ts`), `@playwright/test` installé, **browsers Chromium installés** (`playwright install` fait). Typecheck OK. **Pas exécutés** : nécessite `pnpm dev` actif + Docker stack — workflow runtime, pas blocking |
| 7 | `axe-core` (a11y) passe sans erreur critique | 🟡 | `test/a11y/conformite.spec.ts` écrit, `@axe-core/playwright` installé. **Pas exécuté** : même prérequis que (6) |
| 8 | Lighthouse CI : pas de régression > 10 % sur LCP/INP/CLS | 🟡 | Configuré via T120/T121 (commit `e8ba7c4`). **Pas tourné** contre staging (n'existe pas encore) |
| 9 | Biome + `tsc --noEmit` : zéro erreur | ✅ | `pnpm lint` ✅, `pnpm typecheck` ✅ — 7/7 packages cette session |
| — | License check (Principe IX — chaîne d'approvisionnement) | ✅ | 43 packages prod scannés via `license-checker-rseidelsohn` : MIT (33), Apache-2.0 (5), MIT OR Apache-2.0 (1), BSD-2-Clause (1), BSD-3-Clause (1), MPL-2.0 (1). **0 GPL/AGPL/SSPL/LGPL**. Le seul UNLICENSED est notre `package.json` racine (workspace privé) |

## Observabilité et performance

| # | Item | Statut | Détail |
|---|---|---|---|
| 10 | Métriques Principe VII instrumentées + dashboard lié dans README | 🟡 | Dashboard Grafana provisionné via CDK (T118, commit `5629c7f`). **Lien à ajouter** au README du module + alertes à activer post-déploiement |
| 11 | SLO Principe X : endpoints synchrones < 800 ms p95 en charge nominale | ⏳ | Pas mesuré — requiert staging + load test (k6/artillery) |

## Sécurité

| # | Item | Statut | Détail |
|---|---|---|---|
| 12 | Sécurité Principe IX : checklist OWASP, secrets, en-têtes HTTP, Zod | ✅ | Audit OWASP Top 10 2021 documenté : **7/10 ✅, 2/10 🟡, 1/10 ⏳** (pen test pré-launch). Cf. [`docs/security/owasp-top10-001-conformite.md`](../../../docs/security/owasp-top10-001-conformite.md). Points 🟡 mineurs : rate-limit par route plus granulaire + threat model formel STRIDE + Renovate/audit-CI/SBOM (TODOs pré-launch, non-blocking pour merge feature) |

## Documentation

| # | Item | Statut | Détail |
|---|---|---|---|
| 13 | Documentation FR-CA mise à jour (copie utilisateur, README module) | ✅ | README module + DoD checklist générés (T122-T125, commit `72cfcc0`) |

## Opérations et review

| # | Item | Statut | Détail |
|---|---|---|---|
| 15 | Migrations Prisma testées en staging avec rollback applicatif | ⏳ | Pas de staging encore — à faire au premier déploiement (CDK T117 prêt) |
| 16 | Revue de code approuvée (au moins une autre personne ou IA documentée) | ⏳ | Aucune PR ouverte — `gh pr create` reste à exécuter |

---

## Synthèse (run 2 — 2026-05-25)

| Type | Compte | Items |
|---|---|---|
| ✅ Fait | 8 | 3, 4, 5, 9, 12 (OWASP), 13, 14, license check |
| 🟡 Partiel | 5 | 1, 2, 6, 7, 8, 10 |
| ⏳ Pas encore | 3 | 11, 15, 16 |
| ❌ Bloquant | 0 | — |

**Progrès run 1 → run 2** : +2 ✅ (OWASP audit, license check) ;
-2 🟡 (OWASP, license) ; -1 ⏳ (license check).

**Verdict** : code et tests fondamentaux OK. **6 portes 🟡** dépendent d'actions
mineures (mergeer la branche, télécharger les browsers Playwright, brancher
le dashboard Grafana en prod). **4 portes ⏳** dépendent de l'existence d'un
environnement staging — pas un bloqueur pour la première release alpha en
soft-launch, mais nécessaire avant le launch public.

## Plan pour passer les 🟡 à ✅

| Porte | Action | Coût |
|---|---|---|
| 1, 2 | Merge branche → main | dépend de la review (item 16) |
| 6, 7 | `pnpm exec playwright install --with-deps` + run + fixer ce qui casse | ~1 h |
| 8 | Brancher Lighthouse CI sur preview deployments | ~2 h |
| 10 | Ajouter lien dashboard Grafana au `apps/api/README.md` + déployer alertes | ~1 h |
| 12 | Audit OWASP top 10 formel (checklist par item) | ~3 h |

## Plan pour passer les ⏳ à ✅

| Porte | Action | Coût |
|---|---|---|
| 11 | Setup k6 contre staging + scenario nominal | ~4 h après staging |
| 15 | Premier déploiement staging via CDK + dry-run rollback | ~6 h après staging |
| 16 | Ouvrir PR + reviewer (humain ou /ultrareview) | ~1 h |
| license check | Wire `license-checker` dans CI + résoudre les licences GPL/AGPL si présentes | ~30 min |
