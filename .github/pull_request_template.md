<!--
Constitution v2.3.0 — Conseiller Voyage
Le PR est rejeté à la revue si :
  • la spec/plan associé (sauf hotfix prod) n'est pas mergé au préalable ;
  • un principe NON-NÉGOCIABLE (I, II, VI, IX, XI, XII) n'est pas adressé.
Pour un changement non-fonctionnel (refactor, docs, chore, ci),
cocher uniquement les principes pertinents et marquer les autres "N/A".
-->

## Résumé

<!-- 1-3 bullet points sur ce que ce PR fait + pourquoi maintenant. -->

-

## Spec liée

<!-- Lien vers specs/<NNN>-feature/spec.md + plan.md, ou "N/A si refactor/chore/docs". -->

- Spec :
- Plan :
- ADR (si décision structurante) :

## Constitution Check — 12 principes

Cocher chaque principe **pertinent** au scope du PR. Marquer **N/A**
avec justification courte si vraiment non pertinent. Les principes
NON-NÉGOCIABLES (I, II, VI, IX, XI, XII) ne peuvent **JAMAIS** être
en violation, même temporairement.

### NON-NÉGOCIABLES (rejet automatique si non adressé)

- [ ] **I — Conformité OPC/TICO** : aucune touche à la transaction de voyage (réservation, paiement client, versement fournisseur). Conseillers visibles uniquement si statut `verified` filtré en couche DB.
- [ ] **II — Vie privée / Loi 25** : données personnelles en région canadienne. Consentement explicite. Effacement implémenté. Rétention selon table constitution. Anonymisation propagée backups + caches + dérivés analytiques.
- [ ] **VI — Logique métier déterministe et testée** : scoring/validation = fonctions pures. Tests écrits **AVANT** implémentation (commits séparés visibles dans git). Cas nominal + cas erreur couverts.
- [ ] **IX — Sécurité applicative** : RBAC en couche application. Validation Zod côté serveur. En-têtes HTTP (CSP, HSTS, X-CTO, Referrer-Policy, Permissions-Policy). Pas de SQL brut sans ADR. Pas de secret en clair. OWASP Top 10 reviewée. Idempotence sur mutations sensibles.
- [ ] **XI — Accessibilité WCAG 2.1 AA** : axe-core CI vert. Contraste ≥ 4.5:1 (3:1 large/composants). Navigation clavier intégrale. Sémantique HTML + landmarks. Erreurs annoncées (`aria-live`). `prefers-reduced-motion` respecté.
- [ ] **XII — Optimisation SEO** : SSR/SSG sur toute page publique. CWV LCP < 2.5s / INP < 200ms / CLS < 0.1. Lighthouse CI (Perf ≥ 90, SEO ≥ 95, A11y ≥ 95). Métadonnées + JSON-LD Schema.org complets. Hreflang. robots.txt + sitemap.xml + llms.txt explicites.

### Architectural & opérationnels

- [ ] **III — Qualité de lead avant volume** : plafond 3 conseillers max par demande. Machine d'états lead tracée append-only. Métriques boucle économique instrumentées.
- [ ] **IV — Français d'abord** : copie FR-CA prioritaire. EN via i18n (clés/catalogues séparés). Formats régionaux `fr-CA`, dates `dd MMMM yyyy`, monnaie `1 234,56 $`.
- [ ] **V — Architecture : monolithe modulaire** : imports cross-module via interface publique uniquement (`ModuleX/interface/public-api/*.facade.ts`). Pas de microservice sans preuve mesurée d'un goulot. `tools/check-module-boundaries.ts` vert.
- [ ] **VII — Observabilité boucle économique** : compteurs des 4 métriques (complétion intake, % acceptés, conversion devis→réservation, churn conseiller) instrumentés si feature touche un parcours concerné. Tableau de bord lié dans README du module.
- [ ] **VIII — Clean Architecture et SOLID** : 4 couches (interface → application → domaine ← infrastructure). Cas d'usage = 1 action métier. Ports granulaires (reader/writer séparés si utile). DI explicite. **VIII.a (front)** : feature slicing, routing mince, Server Actions `<verbe>.action.ts`, frontières d'état, barrels uniquement cross-feature. `tools/check-feature-boundaries.ts` vert.
- [ ] **X — Fiabilité et résilience** : SLO 99.5% / p95 < 800ms hors LLM. Idempotence (lead, notification, paiement, effacement). Modes dégradés (LLM HS, courriel HS, DB primaire HS). Circuit breakers sur appels externes. `/healthz` + `/readyz` exposés.

## Definition of Done

- [ ] `pnpm typecheck` zéro erreur
- [ ] `pnpm lint` (Biome strict `--error-on-warnings`) zéro erreur
- [ ] `pnpm test` unit + intégration verts
- [ ] `pnpm test:e2e` (Playwright) couvre les parcours UI modifiés
- [ ] `pnpm test:a11y` (axe-core) zéro violation serious/critical
- [ ] `pnpm build` réussi (70 pages SSG validées sur apps/web)
- [ ] Lighthouse CI : Perf ≥ 90, SEO ≥ 95, A11y ≥ 95 (régression ≤ 10 %)
- [ ] Migrations Prisma testées en staging avec rollback applicatif vérifié (si schéma touché)
- [ ] Documentation FR-CA mise à jour (copie utilisateur, README de module)
- [ ] ADR créé dans `docs/adr/` si décision architecturale
- [ ] Revue de code approuvée par ≥ 1 personne (ou revue IA documentée si mono-dev)

## Test plan

<!-- Bulleted checklist de TODOs manuels post-merge (smoke test, etc.). -->

- [ ]
