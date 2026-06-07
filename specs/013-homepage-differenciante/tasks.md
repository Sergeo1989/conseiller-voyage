---
description: "Task list — Page d'accueil publique différenciante (013 / roadmap 026)"
---

# Tasks: Page d'accueil publique différenciante

**Input**: Design documents from `specs/013-homepage-differenciante/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: INCLUS (Principe VI — logique testée ; le builder JSON-LD pur et les invariants
anti-marketplace suivent le **TDD strict** : commit du test rouge AVANT le commit vert).

**Organization**: par user story (US1 conversion, US2 différenciation/confiance, US3
trouvabilité/perf/a11y). Sur une page unique, les stories sont des incréments testables
indépendamment (chacune ajoute des sections + ses garde-fous).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = fichiers différents, aucune dépendance sur une tâche non terminée.
- **[Story]** = US1 / US2 / US3 (les phases Setup/Foundational/Polish n'ont pas de label).

## Path Conventions

Frontend `apps/web` (convention feature-slicing VIII.a) : route mince dans
`apps/web/src/app/[locale]/`, slice dans `apps/web/src/features/home/`.

---

## Phase 1: Setup (infrastructure partagée)

- [ ] T001 [P] Scaffolder le slice `features/home` ({ui/, lib/, index.ts}) dans `apps/web/src/features/home/`
- [ ] T002 [P] Ajouter `http://localhost:3000/fr` aux URLs de collecte dans `apps/web/lighthouserc.json`
- [ ] T003 [P] Créer le squelette du namespace i18n `home.*` (clés vides/placeholder) dans `apps/web/src/i18n/messages/fr-CA.json` et `apps/web/src/i18n/messages/en.json`

---

## Phase 2: Foundational (prérequis bloquants)

**⚠️ CRITIQUE** : aucune user story ne peut démarrer avant cette phase.

- [ ] T004 Définir et réconcilier les clés i18n `home.*` FR-CA (hero.title mandaté, hero.subtitle, ctaPrimary = « Décrire mon voyage » [remplace « Décrire mon projet »], trust.opcTicoBanner, pourquoiTrois.{heading,step1,step2,step3,note}, neutralite.{heading,body}, loi25.{heading,body}, pasDeContact.{heading,body,link}, advisorAccess) dans `apps/web/src/i18n/messages/fr-CA.json` + stub EN dans `en.json`
- [ ] T005 Composant partagé `CtaDecrireVoyage` (lien `next/link` locale-aware vers `/<locale>/voyage/nouveau`, libellé via `home.ctaPrimary`) dans `apps/web/src/features/home/ui/CtaDecrireVoyage.tsx`
- [ ] T006 Surface publique du slice dans `apps/web/src/features/home/index.ts` (réexporte les composants de section au fil de leur création)

**Checkpoint** : i18n + CTA + surface prêts — les user stories peuvent démarrer.

---

## Phase 3: User Story 1 — Le voyageur comprend la promesse et lance un brief (P1) 🎯 MVP

**Goal**: héro (H1 + sous-titre + CTA unique vers l'intake) au-dessus de la flottaison ;
remplace le squelette de soft-launch.

**Independent Test**: charger `/fr` → H1 mandaté présent, exactement un CTA primaire vers
`/fr/voyage/nouveau`, zéro coordonnée de contact ; clic CTA → intake.

### Tests (TDD — rouge AVANT vert)

- [ ] T007 [P] [US1] Test RED des invariants héro/CTA : un seul `<h1>`, **exactement un** CTA primaire avec `href` vers `/voyage/nouveau`, **0** `mailto:`/`tel:`/formulaire de contact (contrat U1/U3/I1/I2/I3/I5) dans `apps/web/src/features/home/ui/__tests__/home-invariants.test.tsx`

### Implémentation

- [ ] T008 [US1] Composant `Hero` (RSC) : `<h1>` `home.hero.title`, sous-titre `home.hero.subtitle`, `<CtaDecrireVoyage>`, micro-confiance `home.trust.opcTicoBanner` ; aucune image (LCP = H1) dans `apps/web/src/features/home/ui/Hero.tsx`
- [ ] T009 [US1] Route mince `app/[locale]/page.tsx` : RSC statique rendant `<main>` + `Hero` (remplace le squelette inline-styles) dans `apps/web/src/app/[locale]/page.tsx` → rend T007 vert
- [ ] T010 [US1] Vérifier le rendu **sans JavaScript** (composants RSC, CTA = `Link`) — contrôle manuel + assertion dans `home-invariants.test.tsx` (contrat J1, SC-009)

**Checkpoint** : MVP — la home convertit (héro + CTA), anti-marketplace garanti par test.

---

## Phase 4: User Story 2 — Pourquoi le modèle est différent et digne de confiance (P2)

**Goal**: sections de différenciation (pourquoi 3 / neutralité / OPC-TICO / Loi 25 /
anti-contact) + CTA répété + pied de page.

**Independent Test**: les 4 sections présentes avec leur contenu ; bandeau OPC/TICO et
mention anti-contact pointent vers `/comment-ca-marche`.

### Tests (TDD — rouge AVANT vert)

- [ ] T011 [P] [US2] Test RED présence sections + liens : pourquoiTrois (copie « jusqu'à 3 »), neutralite, loi25, pasDeContact, bandeau OPC/TICO → `/comment-ca-marche` (contrat U4–U8, I6) dans `apps/web/src/features/home/ui/__tests__/home-sections.test.tsx`

### Implémentation

- [ ] T012 [P] [US2] Composant `TrustBannerOpcTico` (lien → `/<locale>/comment-ca-marche`) dans `apps/web/src/features/home/ui/TrustBannerOpcTico.tsx`
- [ ] T013 [P] [US2] Composant `SectionPourquoiTrois` (3 étapes, note « pas une liste à trier », copie « jusqu'à 3 ») dans `apps/web/src/features/home/ui/SectionPourquoiTrois.tsx`
- [ ] T014 [P] [US2] Composant `SectionNeutralite` (multi-réseaux, indépendants compris) dans `apps/web/src/features/home/ui/SectionNeutralite.tsx`
- [ ] T015 [P] [US2] Composant `BandeauLoi25` (résidence des données + non-partage) dans `apps/web/src/features/home/ui/BandeauLoi25.tsx`
- [ ] T016 [P] [US2] Composant `MentionPasDeContact` (lien → `/<locale>/comment-ca-marche`) dans `apps/web/src/features/home/ui/MentionPasDeContact.tsx`
- [ ] T017 [US2] Composer les sections + CTA répété (`CtaDecrireVoyage`) + `Footer` partagé + lien secondaire « Espace conseiller » (`home.advisorAccess`) dans `apps/web/src/app/[locale]/page.tsx` → rend T011 vert

**Checkpoint** : US1 + US2 — page de positionnement complète côté contenu.

---

## Phase 5: User Story 3 — Trouvable, rapide et accessible (P3)

**Goal**: métadonnées + JSON-LD, budgets CWV, WCAG 2.1 AA.

**Independent Test**: Lighthouse (Perf≥90/SEO≥95/A11y≥95, LCP<2.5s, CLS<0.1) + axe (0
violation) + JSON-LD valide sans `contactPoint`.

### Tests (TDD — rouge AVANT vert)

- [ ] T018 [P] [US3] Test RED du builder JSON-LD pur : nœuds `Organization` + `WebSite`, `@context` schema.org, **absence** de `contactPoint`/`telephone`/`email`, pureté (contrat L1–L7, SC-007) dans `apps/web/src/features/home/lib/__tests__/homepage-jsonld.test.ts`

### Implémentation

- [ ] T019 [US3] Fonction pure `buildHomepageJsonLd(locale, baseUrl)` dans `apps/web/src/features/home/lib/homepage-jsonld.ts` → rend T018 vert
- [ ] T020 [US3] `generateMetadata` (title/description i18n, `alternates.canonical`, `openGraph`, `twitter`, `robots` indexable) + injection du `<script type="application/ld+json">` via `buildHomepageJsonLd` dans `apps/web/src/app/[locale]/page.tsx` (contrat M1–M6, L8)
- [ ] T021 [P] [US3] Test a11y Playwright + axe-core tag `@a11y` sur `/fr` (0 violation sérieuse/critique, un seul `<h1>`, repères sémantiques, opérabilité clavier) dans `apps/web/tests/a11y/home.spec.ts`
- [ ] T022 [US3] Valider la porte Lighthouse CI sur `/fr` (Perf≥90/SEO≥95/A11y≥95, LCP≤2500, CLS≤0.1) — exécuter `lhci` localement, ajuster si dépassement (contrat SC-004/005)

**Checkpoint** : les 3 stories fonctionnent ; portes a11y + perf vertes.

---

## Phase 6: Polish & transverse

- [ ] T023 [P] Confirmer le libellé exact de certification (**OPC/TICO** vs « CCV/TICO ») avec le module conformité (001) et figer `home.trust.opcTicoBanner` dans `apps/web/src/i18n/messages/fr-CA.json`
- [ ] T024 [P] Compléter le stub EN des clés `home.*` (repli acceptable, complété en 024) dans `apps/web/src/i18n/messages/en.json`
- [ ] T025 Exécuter `quickstart.md` (vérifications SC-001 à SC-009) et cocher la DoD constitution avant PR
- [ ] T026 [P] Audit lecteur d'écran de la home (recommandé, Principe XI) — consigner le résultat dans le PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** : aucune dépendance.
- **Foundational (P2)** : dépend du Setup ; **bloque** toutes les user stories (i18n + CTA + surface).
- **US1 (P3)** : dépend de Foundational. MVP.
- **US2 (P4)** : dépend de Foundational ; partage `page.tsx` avec US1 (T017 étend T009).
- **US3 (P5)** : dépend de Foundational ; T020 étend `page.tsx` (après T009/T017).
- **Polish (P6)** : après les stories visées.

### Within Each User Story (TDD strict)

- Le test rouge (`T007`, `T011`, `T018`) est committé AVANT son implémentation.
- Composants de section avant la composition dans `page.tsx`.

### Parallel Opportunities

- Setup : T001-T003 `[P]`.
- US2 : composants de section T012-T016 `[P]` (fichiers distincts) ; T017 (compose `page.tsx`) après.
- US3 : T018/T021 `[P]` (test pur + test a11y, fichiers distincts).
- ⚠️ Sérialiser tout ce qui touche `apps/web/src/app/[locale]/page.tsx` (T009 → T017 → T020) : même fichier.

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 (héro + CTA) → **STOP + valider**
   (`/fr` convertit, 0 contact, rendu sans JS).

### Incremental Delivery

MVP US1 → ajouter US2 (sections différenciation) → ajouter US3 (SEO/perf/a11y) → Polish → PR.

---

## Notes

- `[P]` = fichiers différents, aucune dépendance sur une tâche non terminée.
- TDD strict : T007/T011/T018 rouges avant vert (commits séparés visibles, Principe VI).
- Anti-marketplace (ADR-0002) vérifié **par test** (T007/T011) : 0 contact, CTA unique.
- Pas de migration, pas de nouvel ADR (couvert par ADR-0002), pas de Server Action.
- Réconciliations de copie (CTA, OPC/TICO) traitées en T004/T023 — ne pas inventer le libellé légal.

**Total tâches** : 26 (3 Setup + 3 Foundational + 4 US1 + 7 US2 + 5 US3 + 4 Polish).

**Suite recommandée** : `/speckit.analyze` (cohérence spec/plan/tasks) puis `/speckit.implement`.
