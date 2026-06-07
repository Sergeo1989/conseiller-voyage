# Roadmap produit — Conseiller Voyage

**Document vivant.** Source de vérité pour le backlog stratégique. Chaque
entrée numérotée est destinée à devenir une spec détaillée via
`/speckit.specify` au moment opportun. Cette feuille de route peut évoluer
(ajouts, repriorisations, suppressions) ; chaque modification est
référencée par commit.

**Dernière mise à jour** : 2026-06-06 (012 notifications/état de lead mergé → PR #24 squash `a521ac7` ; 026 page d'accueil différenciante priorisée et engagée en spec — branche `013-homepage-differenciante`, hors séquence Sprint 6)

> **Note de numérotation** : les IDs de cette roadmap (001, 002, …) sont des
> identifiants logiques de feature. Les dossiers de spec sous `specs/`
> utilisent leur propre numérotation Spec Kit (`specs/<NNN>-<short-name>/`)
> qui peut diverger. Le mapping est tenu à jour dans la colonne *Spec* du
> tableau ci-dessous quand une spec a été créée.

---

## Principes produits encodés

Avant tout détail, deux invariants non-négociables qui cadrent **toutes** les
features de cette roadmap :

1. **L'intake est l'unique route de mise en relation.** Aucune page, aucun
   bouton, aucun chemin UX ne permet à un voyageur de contacter un
   conseiller en bypassant le formulaire d'intake (FR de qualification).
   *Formalisé dans [ADR-0002](adr/0002-pas-de-cta-contact-direct.md).*
2. **Le plafond de 3 conseillers par demande est appliqué côté algorithme**
   (constitution, Principe III), pas côté navigation. Cf. spec
   `001-conformite-module` pour le statut "vérifié" qui filtre l'éligibilité.

Toute feature qui transgresse l'un de ces deux invariants doit être
rejetée à la revue, quelle que soit la pression commerciale.

---

## Contexte concurrentiel (2026-06-06)

Analyse du paysage québécois pour cadrer le positionnement (features 026-027).
Trois types d'acteurs, **pas un seul** :

| Acteur | Modèle | Faille exploitable |
|---|---|---|
| **monvoyagemonagence.ca** (Voyages en Direct) | Vitrine *éducative* d'un réseau captif | Cible « pourquoi un conseiller », pas « trouver LE bon conseiller » ; SEO dépendant de la marque |
| **Club Voyages / Jaimonvoyage** | **Annuaire à facettes** (filtrer par ville, langue, spécialité, destination) | L'utilisateur fait le tri lui-même (recherche) ; réseaux captifs aussi |
| **OPC** (pes.opc.gouv.qc.ca) | Registre officiel des certifiés | Source de vérité de la vérification, mais aucun parcours de mise en relation |

**Nos différenciateurs structurels** (réels mais invisibles en surface — d'où
026-027) :

1. **Neutralité multi-réseaux** vs réseau captif : on matche tout conseiller
   `verified`, indépendants compris, sans appartenance à un réseau.
2. **Appariement algorithmique à partir d'un brief** vs annuaire à facettes :
   on présente les **3 meilleurs pour CE voyageur** (axes de scoring 011), eux
   livrent une liste à trier.
3. **Vérification OPC/TICO imposée en couche DB** (Principe I) comme argument de
   confiance visible, pas seulement une promesse marketing.
4. **Vie privée par conception (Loi 25)** : données au Canada, notifications
   conseiller sans PII de contact.

⚠️ Le danger : une page d'accueil « parlez à un conseiller humain » est un
**clone appauvri** de la vitrine captive. La différenciation doit être traduite
en messages explicites (026) et en arborescence SEO d'intention (027), sinon le
meilleur moteur reste derrière une promesse banalisée.

---

## Légende

| Symbole | Sens |
|---|---|
| ✅ | Spec mergée |
| 🟡 | Spec en cours d'écriture |
| 🔵 | Plan d'implémentation en cours |
| ⏳ | Backlog — `/speckit.specify` à venir |
| 🧊 | Différé post-MVP (Tier 5) |

Scope : **S** (1 spec, < 5 user stories) · **M** (~5 US, ~20 FR, équivalent au spec 001) · **L** (à scinder en 2-3 specs).

---

## Tier 0 — Fondations (bloquent tout)

| ID | Feature | Module | Scope | État | Spec | Pourquoi en premier |
|---|---|---|---|---|---|---|
| **001** | Module conformité (statut vérifié, source de vérité) | conformité | M | ✅ mergé (PR #1) | `specs/001-conformite-module/` | Gardien Principe I. Bloque toute visibilité publique de conseiller et toute éligibilité matching. 73 commits, 200/200 tests verts. |
| **002** | Identité — auth conseiller + admin, RBAC (base AuthGuard) | identité | M | ✅ mergé (PR #14) | `specs/006-auth-conseiller-admin/` | Bloque tout consommateur authentifié. AuthGuard NestJS partagé Auth.js v5 (ADR-0004). 7 user stories livrées (signup, login, verify email, logout, reset password, change password, admin bootstrap+invitation). `PrismaPasswordVerifier` remplace définitivement le stub 002a (résout bug_007 ultrareview). 10 commits, 84/84 tests intégration verts, 59/59 tests pure-fn `@cv/auth-domain`. ADR-0012 (audit no-FK Loi 25) + 3 runbooks ops livrés. |
| **002a** | Identité — MFA conseiller TOTP + step-up + reset admin + auto-service device + admin J1 | identité | M | ✅ mergé (PR #13) | `specs/005-mfa-conseiller/` | Extraction du scope MFA de l'ancien 002. Exigence Principe IX NON-NÉGOCIABLE. 6 user stories livrées (US1-US6), 13 commits (12 features + 1 fix ultrareview), 60 tests pure + 55 tests intégration verts. ~~Stub `PasswordVerifier` à remplacer quand 002 livre~~ **(résolu par 002 — `PrismaPasswordVerifier` wiré).** |
| 003 | Identité — notifications + courriel transactionnel | identité | M | ✅ mergé (PR #15) | `specs/003-notifications-transactionnelles/` | Bloque FR-005 conformité, rappels d'expiration, accusés de soumission. AWS SES ca-central-1 (ADR-0006). Draine `mfa_outbox_emails` (002a) + `auth_outbox_emails` (002) + outbox conformité (001). ADR-0013 (pepper hash) + ADR-0014 (templates). |
| 004 | Mentions légales, CGU, page « Comment ça marche », politique Loi 25 | transverse | M | ✅ mergé (PR #12) | `specs/004-mentions-legales/` | Obligation contractuelle dès première mise en ligne publique. Texte FR-CA. Page « Comment ça marche » = pédagogie modèle anti-marketplace (ADR-0002). 5 pages SSG + Footer + 4 use cases legal (AcceptCguB2bUseCase, CheckCguUpToDateUseCase, AcceptIntakeConsentUseCase, AnonymizeLegalAcceptancesUseCase) + facade publique `LegalAcceptanceFacade` consommée par 002-intake + middleware HMAC version-check + anonymisation Loi 25 immutable. ADR-0008 (hash salé) + ADR-0009 (middleware cookie HMAC). Bloquant **uniquement** déploiement public : T088-T089 (valeurs juridiques exactes REQ/NEQ — runbook livré). |

---

## Tier 1 — Activation conseiller (B2B)

| ID | Feature | Module | Scope | État | Spec | Dépend de |
|---|---|---|---|---|---|---|
| 005 | Profil conseiller (public + privé) | identité × SEO | M | 🔵 implémentation en cours (branche `007-profil-conseiller`) | `specs/007-profil-conseiller/` | 001, 002 |
| 006 | Facturation — onboarding abonnement (Stripe Checkout) | facturation | M | ⏳ | — | 002 |
| 007 | Facturation — récurrence, factures, TPS/TVQ | facturation | M | ⏳ | — | 006 |

**État détaillé du chantier 005 (au 2026-05-27 soir)** :

Couvert par les commits sur `007-profil-conseiller` :

- Phases 1-2 : `@cv/profil-domain` (80/80 tests pure-fn), schéma Prisma 5 modèles + 4 migrations (init_db, triggers Postgres, backfill noms légaux, seed enums), ports + symboles DI.
- Phase 3 US1 (édition profil) : ports + 11 use cases + saga upload photo S3 ↔ DB + listener conformité, page Next.js `/conseiller/profil` + Server Actions + composants ProfilForm/PhotoUpload/AfficherNomCompletSwitch.
- Phase 4 US2 (page publique) : SSG ISR `/conseiller/[slug]` + JSON-LD Person SANS contactPoint (ADR-0002) + OG image dynamique + sitemap + 404 unifié anti-énumération + cookie `cv_suggested` HMAC SHA-256 Edge runtime + middleware Next.js.
- Phase 5 US3 (dashboard) : page `/conseiller` + 4 widgets + 3 avertissements FR-012a.
- Phase 6 US4 (aperçu) : PrevisualiserProfilUseCase + page + BandeauApercu 4 variantes.
- Phase 7 US6 API (modération admin) : RetirerPhotoAdmin / MasquerProfilAdmin / RetablirProfilAdmin + ProfilAdminController + StepUpGuard.
- Phase 7 US6 UI (T121-T124 ✅) : console admin Next.js — page liste paginée `/admin/profils` (filtre statut, table 5 colonnes), page détail `/admin/profils/[id]` (identité + historique modérations + 3 actions), dialog Radix `DialogConfirmationAction` (focus trap + textarea raison ≥ 10 chars), Server Actions retirer-photo / masquer / rétablir. Backend étendu : `LireProfilAdminUseCase` (profil + audit trail), `ListerProfilsAdminUseCase` (pagination + filtre statut), 2 endpoints GET dans ProfilAdminController, port `ProfilModerationAuditReader` + adapter Prisma.
- Tests e2e Playwright (T070, T073, T074, T115, T128 ✅) : 5 fichiers spec sur 35 tests listés. Tests actifs sans seed DB (anti-énumération 404 unifié, body identique 2 slugs 404, anti-marketplace 404, cookie cv_suggested tampered rejeté, redirect non-authentifié, latence baseline). Tests `.skip` documentés avec lien vers tests intégration pour les parcours auth/seed (pattern hérité de mfa-recovery.spec.ts).
- CI a11y axe-core bloquante (T071, T094, T125 ✅) + Lighthouse CI bloquant (T076, T095 ✅) : 2 jobs GitHub Actions ajoutés à `.github/workflows/ci.yml`. Job `a11y` build apps/web → start Next.js prod → wait ready → `pnpm test:a11y` (Playwright `--grep @a11y`, 14 tests profil sur 35 a11y au total). Job `lighthouse` LHCI sur 6 URLs publiques (5 légales + slug 404) avec asserts bloquants Perf ≥ 0.9 / SEO ≥ 0.95 / A11y ≥ 0.95 + LCP ≤ 2500ms + CLS ≤ 0.1 (Principes XI WCAG 2.1 AA + XII budgets perf). Config dans `apps/web/lighthouserc.json`.
- Phase 8 US5 (Loi 25) : AnonymiserProfilLoi25UseCase idempotent + SlugReservation `conseillerIdOrigine=NULL` (ADR-0015) + ProfilInternalController.
- Phase 9 (onboarding) : EnvoyerRelanceOnboardingUseCase + BullmqOnboardingRelanceScheduler.
- Phase 10 (cleanup orphans) : CleanupOrphanPhotosJob.
- Phase 11 polish minimum : ADR-0015 + 2 runbooks (modération + anonymisation Loi 25).
- Tests intégration (Testcontainers Postgres + Redis live) : **50/50 verts** sur 8 fichiers — T053 LireProfilPrive, T072 LirePageProfilPublique (5 cas null + nominal), T077 EstProfilPublic (contract 9 cas), T111-T114 admin modération + trigger append-only, T126 AnonymiserLoi25 + 2 triggers Postgres, T127 **invariant SC-007 slug-reuse Loi 25** (immuable), T133 Bullmq scheduler, T134 worker EnvoyerRelance, T142 CleanupOrphans. Suite intégration repo complète : 152/152 verts, aucune régression.

Reste pour merger 005 vers `main` :

- Endpoint dev de seeding (auth conseiller + admin + profil pret) pour activer les tests Playwright e2e + a11y `.skip` actuellement marqués. Couverture comportementale déjà assurée par 50 tests intégration ; les `.skip` visent à valider le rendu UI authentifié sur les parcours réels.
- Polish étendu : README `@cv/profil-domain`, T146a scan adoption cron, T156 PR template Constitution Check, i18n catalogue `admin.profils` complété (libellés inline FR-CA actuellement, EN à venir avec feature 024).

**Contraintes spécifiques à 005 (profil conseiller)** — encadrement [ADR-0002](adr/0002-pas-de-cta-contact-direct.md) :

- Vue publique = bio, certifications visibles (gage de sérieux), spécialités, années d'expérience, langues, photo. Conditionnée au statut `verified` (consomme `ConformiteQueryPort`).
- **Aucun CTA de contact direct.** Le seul CTA est « Décrivez votre projet — peut-être ce conseiller, peut-être un autre mieux aligné, jusqu'à 3 maximum » et mène à l'intake.
- Section explicative « pourquoi pas de contact direct » obligatoire.
- Vue privée (dashboard conseiller) = mes leads, mon profil éditable, ma conformité, ma facturation.

**Contraintes spécifiques à 006-007 (facturation)** — encadrement Principe I :

- Stripe **uniquement** pour l'abonnement B2B conseiller. **Aucune** intégration paiement liée à un voyage ou à un client final.
- Module `facturation` isolé du module `matching`. Le matching ne consulte jamais Stripe.
- En cas d'impayé : suspension d'accès via le module identité (la session conseiller est révoquée), pas via une suppression dans conformité (le statut de conformité reste vérifié, le conseiller est juste hors-ligne).

---

## Tier 2 — Boucle économique cœur

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 008 | Intake — brief structuré, validation déterministe, brouillon + magic-link voyageur + admin filet + Loi 25 | préqualification | M | ✅ livré PR #20 (squash `f3bff79`, 5 US, 360+ tests, /ultrareview 0 finding) | — (voyageur anonyme) |
| 009 | Intake — enrichissement LLM (reformulation, extraction d'intentions) | préqualification | M | ⏳ | 008, ADR fournisseur LLM |
| 010 | Intake — soumission + magic-link de suivi voyageur | préqualification × identité | S | ⏳ | 003, 008 |
| 011 | Matching — scoring conseiller × brief (pur, TDD obligatoire) | matching | M | 🟡 livré branche `008-matching-scoring` (PR #21, US1-US3 + polish) | 001, 008. 3 US + Phase 6 polish (métriques OTel, dashboard, runbooks, ADRs 0020-0024 acceptés, CLI anti-PII, `fsa-centroids.json` complet 1 643 FSA StatCan). Avant merge prod : valider charge + migrations en staging ; T093 (drain `matching_outbox`→bus) en PR satellite Mode B (ADR-0024 §E3). |
| 012 | Matching — notifications + machine d'état de lead | matching | M | ✅ mergé (PR #24, squash `a521ac7`) | 003, 011. 3 US + Phase 6 polish. Consomme les 4 events bus 011 → leads + notifications conseiller (1 job BullMQ/destinataire, SES FR-CA sans PII), machine d'état pure append-only (ADR-0025, property-tests SC-003/FR-020), supersession re-match, sweep réconciliation (ADR-0026), cascade anonymisation Loi 25, concurrence optimiste, port public `MatchingLeadQueryPort` + endpoints HTTP conseiller. ADRs 0025-0026 acceptés. Avant merge prod : tests d'intégration Testcontainers + charge en staging (stubs documentés, convention 011). |
| 013 | Conversation conseiller ↔ voyageur (post-acceptation) | matching | M | ⏳ | 011, 012 |
| 014 | Tableau de bord conseiller (mes leads, conversations) | matching × identité | M | ⏳ | 005, 012, 013 |
| 015 | Espace voyageur post-intake (mes 3 conseillers, suivi) | matching | M | ⏳ | 010, 012, 013 |

**Contraintes spécifiques à 011-012 (matching)** — application Principe III et ADR-0002 :

- Scoring = fonction pure dans la couche domaine, **TDD obligatoire** (Principe VI).
- Plafond 3 conseillers strict, vérifié par test d'invariant. Aucun mode dégradé qui contourne ce plafond.
- Filtrage du statut `verified` via `ConformiteQueryPort.strict` (latence < 10 s pour transitions négatives, cf. spec 001 FR-022).
- Notifications : **un job BullMQ par destinataire**, idempotent, jamais un job pour les 3 destinataires (constitution, Principe X).
- Machine d'état du lead : `envoyé → vu → accepté → refusé → devis_envoyé → réservation_confirmée → perdu`, transitions horodatées et persistées append-only.
- **Signal optionnel** : un conseiller consulté publiquement par le voyageur dans les 24 h précédant le brief peut recevoir un léger boost de scoring (≤ +10 %), à inscrire dans le spec si retenu. Sans casser le top-3.

**Contraintes spécifiques à 013 (conversation)** — application Principe I :

- Échange textuel structuré + pièces jointes éventuelles.
- **Aucun** champ de paiement, aucun lien de réservation interne, aucun montant facturable transmis par la plateforme. Les devis sont des PDF que le conseiller envoie, transmis tels quels.
- Le voyageur règle directement avec le conseiller hors plateforme.
- Mention rappelée dans l'UI : « La plateforme ne participe pas à la transaction. Toute soumission et tout paiement se font directement entre vous et le conseiller. »

---

## Tier 3 — Acquisition (SEO francophone)

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 016 | Pages publiques individuelles de conseillers vérifiés | SEO | M | ⏳ | 001, 005 |
| 017 | Schemas JSON-LD + sitemaps dynamiques + hreflang | SEO | S | ⏳ | 016 |
| 018 | Pages d'atterrissage par thématique de voyage (FR-CA) | SEO | M | ⏳ | 016, 017 |
| 019 | GEO / AI search readiness (llms.txt, citabilité passages) | SEO | S | ⏳ | 016-018 |
| 026 | Page d'accueil — positionnement différenciant (neutralité, matching, confiance OPC/TICO, Loi 25) | SEO × matching | M | 🟡 spec en cours (branche `013-homepage-differenciante`, priorisée hors Sprint 6) | 011 ✅, 004 ✅, 008 ✅ ; 017 ⏳ partiel (JSON-LD homepage auto-contenu, infra sitemaps/hreflang complète différée) |
| 027 | SEO programmatique d'intention (arborescence FSA × spécialité × destination × langue) | SEO | L | ⏳ | 011, 016, 017, 018 |

**Contraintes spécifiques à 016 (pages publiques individuelles)** — application [ADR-0002](adr/0002-pas-de-cta-contact-direct.md) :

- **Anti-pattern marketplace strictement interdit.** Pas de bouton « contacter », pas de formulaire de contact, pas de chat direct, pas de numéro de téléphone affiché.
- CTA unique vers `/intake` avec copy explicite « Décrivez votre projet — peut-être ce conseiller, peut-être un autre mieux aligné. ».
- Section permanente « Pourquoi je ne peux pas contacter ce conseiller directement ? » qui explique le modèle (renvoie à `/comment-ca-marche`).
- Schémas JSON-LD `Person` / `ProfessionalService` mais **pas** de propriété `contactPoint` ni `telephone`. La seule action structurée pointe vers l'intake.

**Contraintes spécifiques à 018 (pages thématiques)** :

- Listing de conseillers vérifiés (avec filtres province / spécialité / langue), mais chaque carte renvoie à la page profil 016, jamais à un contact direct.
- Optionnel : un CTA « Décrire mon projet de voyage [thématique] » qui pré-remplit le brief avec la thématique.

**Contraintes spécifiques à 026 (page d'accueil différenciante)** — traduire les différenciateurs structurels en messages (cf. *Contexte concurrentiel*) :

- **H1 = promesse de neutralité + appariement**, pas la marque : « Décrivez votre voyage. On vous présente les 3 conseillers vérifiés faits pour vous. » Sous-titre : « Indépendant de tout réseau. Aucun frais de plus qu'en ligne. »
- **CTA principal = le brief** (« Décrire mon voyage » → `/intake`), jamais « demander une soumission » (signale qu'on travaille *pour* le voyageur). Respecte l'invariant intake-unique-route + ADR-0002.
- Section « Pourquoi 3, et pas une liste » qui explicite le matching (critères → appariement axes 011 → 3 conseillers choisis) — ce que l'annuaire ne peut pas dire.
- Bandeau confiance « Tous vérifiés OPC/TICO » lié à `/comment-ca-marche` : rend visible la garde `verified` (Principe I).
- Section « Indépendant et neutre » + bandeau Loi 25 (« Vos données restent au Canada. Aucun partage de vos coordonnées sans votre accord. »).
- **Aucun CTA de contact direct**, aucune liste de conseillers cliquables vers un contact (ADR-0002).

**Contraintes spécifiques à 027 (SEO programmatique d'intention)** — capter l'intention longue-traîne que les annuaires et la vitrine captive négligent :

- Arborescence dérivée des **axes de scoring 011** : `destination × spécialité × langue × région FSA` (1 643 FSA StatCan déjà disponibles via `fsa-centroids.json`). Cible p. ex. « conseiller voyage spécialiste Japon Montréal », « agent de voyage lune de miel Québec ».
- **Garde-fou thin-content / index bloat OBLIGATOIRE (Principe XII)** : une page n'est générée et indexable que si elle porte une valeur unique réelle (conseillers réellement appariables sur la combinaison + données locales réelles). Combinaisons vides → `noindex` ou non générées. Cf. skill `seo-programmatic` à mobiliser en phase plan.
- Chaque carte renvoie à la page profil 016 puis à l'intake ; **jamais** de contact direct (ADR-0002). CTA « Décrire mon projet [destination/spécialité] » pré-remplit le brief.
- Schémas JSON-LD (`Service` / `LocalBusiness` pour les pages régionales) sans `contactPoint` ni `telephone`.
- Scope **L** : à scinder en 2-3 specs (p. ex. pages régionales FSA, pages spécialité × destination, automatisation du maillage interne).

**Contraintes performance (constitution, *Patrons d'exécution*) sur tout le Tier 3** :

- LCP < 2,5 s, INP < 200 ms, CLS < 0,1.
- Lighthouse CI bloquant en pipeline.
- Pages indexables crawlables via CDN canadien, contenu FR-CA en source canonique, EN différé via hreflang.

---

## Tier 4 — Opérations & polish

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 020 | Compliance dashboard admin agrégé | conformité × ops | S | ⏳ | 001 |
| 021 | Observabilité centrale + 4 métriques boucle économique | transverse | M | ⏳ | 008, 011, 012 |
| 022 | Retention sweep job (anonymisation post-rétention) | conformité × transverse | S | ⏳ | 001, 010 |
| 023 | Effacement Loi 25 cross-module (orchestration) | identité × transverse | M | ⏳ | 001, 002, 008, 011 |
| 024 | Infrastructure i18n (avant ajout EN) | transverse | S | ⏳ | — |
| 025 | Design system + composants accessibles WCAG 2.1 AA | transverse | M | ⏳ | 005, 014 |

**Spécifique à 021 (observabilité)** — application Principe VII :

- Les **4 métriques de premier ordre** de la constitution sont instrumentées : taux de complétion intake, % leads acceptés, conversion lead→devis→réservation, churn conseiller.
- Seuils d'alerte définis par feature.
- Tableau de bord central lié dans `README.md` racine.

**Spécifique à 023 (effacement Loi 25)** :

- Un cas d'usage `EraseUserDataUseCase` central orchestre la propagation : conformité (anonymise profil + documents), intake (anonymise briefs), matching (anonymise leads), facturation (conserve factures pour obligation comptable), SEO (déréférence).
- **Conservation du journal d'audit 7 ans** — l'obligation légale supplante le droit à l'effacement (arbitrage déjà acté dans spec 001).
- Demande utilisateur initiée depuis l'espace voyageur ou conseiller, route authentifiée.

---

## Tier 5 — Différé post-MVP 🧊

Idées notées pour transparence ; **hors scope V1**. À reconsidérer au cas par
cas via un `/speckit.specify` quand le moment vient.

- OCR automatique des certificats (spec 001, recherche R5).
- Scan antivirus des documents soumis (spec 001, recherche R5).
- Intégration API OPC / TICO en temps réel (spec 001, recherche R1).
- Attribution multi-admin (queue claims) — quand l'équipe admin grandit.
- Application mobile native ou PWA installable.
- Multi-rôle admin (admin-conformité vs admin-tech).
- Notation / avis voyageurs sur conseillers (post-réservation).
- Suivi post-voyage / feedback boucle économique.
- Programme de parrainage conseiller.
- API publique pour partenaires (agences mère, comparateurs).
- Internationalisation au-delà du Canada (autres pays francophones).

---

## Graphe de dépendances

```
                              ┌──────────────────────────┐
                              │ 002-003 Identité (auth + │
                              │  notifs + courriel)      │
                              │ 002a MFA ✅              │
                              └────────┬─────────────────┘
                                       │ (bloque presque tout)
              ┌────────────────────────┼─────────────────────┐
              ▼                        ▼                     ▼
      ┌─────────────┐         ┌────────────────┐    ┌────────────────┐
      │ 001 Confor- │         │ 006-007        │    │ 008-009 Intake │
      │   mité  ✅   │         │  Facturation   │    │  brief + LLM   │
      └──────┬──────┘         └────────────────┘    └────────┬───────┘
             │                                               │
             │     ┌────────────────────┐                    │
             ├────►│ 005 Profil consei- │                    │
             │     │  ller pub+privé    │                    │
             │     └──────┬─────────────┘                    │
             │            │                                  │
             │            └──┬─────────────────┬─────────────┤
             │               ▼                 ▼             ▼
             │     ┌──────────────────┐   ┌─────────────────────┐
             │     │ 016-019 SEO      │   │ 011-013 Matching    │
             │     │ (anti-marketplace│   │  scoring + leads    │
             │     │  cf. ADR-0002)   │   │  + conversation     │
             │     └──────────────────┘   └──────┬──────────────┘
             │                                   │
             │                                   ▼
             │                            ┌──────────────────────┐
             │                            │ 014-015 Dashboards   │
             │                            │  conseiller + voya-  │
             │                            │  geur                │
             │                            └──────────────────────┘
             │
             ▼
       ┌─────────────────────┐
       │ 020 Compliance      │
       │  dashboard admin    │
       └─────────────────────┘

       Transverses (en parallèle dès que possible) :
         021 Observabilité   |   022 Retention sweep   |
         023 Effacement Loi 25   |   024 i18n   |   025 Design system AA
```

---

## Séquence d'implémentation suggérée

| Sprint | Features visées | Justification |
|---|---|---|
| **0** | ✅ 001 (PR #1), ✅ 002a MFA (PR #13), ✅ 002 Auth (PR #14), ✅ 003 Notifications (PR #15), ✅ 004 Mentions légales (PR #12) | **Tier 0 fermé.** Pile identité + notifications + mentions légales prête. 5 PRs mergées, foundations stables pour Tier 1. |
| **1** | 005 (profil conseiller) | **🔵 quasi-prêt à merger** sur `007-profil-conseiller`. Premier Sprint Tier 1. Dépend de 001 + 002 + 002a (toutes mergées). Vue publique anti-marketplace (ADR-0002), dashboard privé conseiller, modération admin (API ✅, UI web ✅), anonymisation Loi 25 + invariant SC-007 ✅, tests e2e Playwright ✅, CI a11y axe-core + Lighthouse bloquantes ✅. Reste endpoint dev de seeding pour activer les tests `.skip` + polish étendu (README, scan cron, PR template). PR mergeable techniquement. |
| **2** | 006, 008 | Facturation onboarding (Stripe) + intake brief. Parallélisable. |
| **3** | 009, 010, 011, 024 | Enrichissement LLM, magic-link, scoring matching, infra i18n. |
| **4** | 012, 013, 007 | Notifs + état de lead, conversation, facturation récurrence. |
| **5** | 014, 015, 020 | Dashboards conseiller, voyageur, admin. |
| **6** | 016, 017, 021, 026 | Premières pages publiques SEO + observabilité centrale (drainera aussi métriques `cv_active_admins_total` posées par 002a) + page d'accueil différenciante (dès que 011 + 017 prêts). |
| **7** | 018, 019, 022, 023, 027 | Pages thématiques, GEO/AI, retention sweep, effacement Loi 25, SEO programmatique d'intention (FSA × spécialité). |
| **8** | 025 | Design system formalisé (peut démarrer plus tôt si capacité). |
| **post** | Tier 5 selon traction | Au cas par cas. |

Cadence indicative ; le réel dépendra de la taille d'équipe et des
priorités commerciales. Chaque spec a son propre cycle Specify → Clarify →
Plan → Tasks → Implement.

---

## Mises à jour de cette roadmap

Toute modification de cette feuille de route (ajout, retrait, repriorisation,
changement de scope significatif) **DOIT** être committée avec un message
explicite et, si elle touche un invariant produit (Principes I, II, VI, IX
de la constitution ; ADR-0002), faire l'objet d'un ADR.
