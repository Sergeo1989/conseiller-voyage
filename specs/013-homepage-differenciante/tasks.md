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

- [x] T001 [P] Scaffolder le slice `features/home` ({ui/, lib/, index.ts}) dans `apps/web/src/features/home/`
- [x] T002 [P] Ajouter `http://localhost:3000/fr` aux URLs de collecte dans `apps/web/lighthouserc.json`
- [x] T003 [P] Créer le squelette du namespace i18n `home.*` (clés vides/placeholder) dans `apps/web/src/i18n/messages/fr-CA.json` et `apps/web/src/i18n/messages/en.json`

---

## Phase 2: Foundational (prérequis bloquants)

**⚠️ CRITIQUE** : aucune user story ne peut démarrer avant cette phase.

- [x] T004 Définir et réconcilier les clés i18n `home.*` FR-CA (hero.title mandaté, hero.subtitle, ctaPrimary = « Décrire mon voyage » [remplace « Décrire mon projet »], trust.{opcTicoBanner, freeForTravelers}, commentCaMarche.{heading,step1,step2,step3}, pourquoiTrois.{heading,step1,step2,step3,note}, neutralite.{heading,body}, thematiques.{heading,items[]}, faq.{heading,items[]={question,answer}}, loi25.{heading,body}, pasDeContact.{heading,body,link}, advisorAccess) dans `apps/web/src/i18n/messages/fr-CA.json` + stub EN dans `en.json`
- [x] T005 Composant partagé `CtaDecrireVoyage` (lien `next/link` locale-aware vers `/<locale>/voyage/nouveau`, libellé via `home.ctaPrimary`) dans `apps/web/src/features/home/ui/CtaDecrireVoyage.tsx`
- [x] T006 Surface publique du slice dans `apps/web/src/features/home/index.ts` (réexporte les composants de section au fil de leur création)

**Checkpoint** : i18n + CTA + surface prêts — les user stories peuvent démarrer.

---

## Phase 3: User Story 1 — Le voyageur comprend la promesse et lance un brief (P1) 🎯 MVP

**Goal**: héro (H1 + sous-titre + CTA unique vers l'intake) au-dessus de la flottaison ;
remplace le squelette de soft-launch.

**Independent Test**: charger `/fr` → H1 mandaté présent, exactement un CTA primaire vers
`/fr/voyage/nouveau`, zéro coordonnée de contact ; clic CTA → intake.

### Tests (TDD — rouge AVANT vert)

- [x] T007 [P] [US1] Test RED des invariants héro/CTA : un seul `<h1>`, **exactement un** CTA primaire avec `href` vers `/voyage/nouveau`, **0** `mailto:`/`tel:`/formulaire de contact (contrat U1/U3/I1/I2/I3/I5) dans `apps/web/src/features/home/ui/__tests__/home-invariants.test.tsx`

### Implémentation

- [x] T008 [US1] Composant `Hero` (RSC) : `<h1>` `home.hero.title`, sous-titre `home.hero.subtitle`, `<CtaDecrireVoyage>`, message « gratuit/sans engagement » `home.trust.freeForTravelers` (FR-021), micro-confiance `home.trust.opcTicoBanner` ; aucune image (LCP = H1) dans `apps/web/src/features/home/ui/Hero.tsx`
- [x] T009 [US1] Route mince `app/[locale]/page.tsx` : RSC statique rendant `<main>` + `Hero` (remplace le squelette inline-styles) dans `apps/web/src/app/[locale]/page.tsx` → rend T007 vert
- [x] T010 [US1] Vérifier le rendu **sans JavaScript** (composants RSC, CTA = `Link`) — contrôle manuel + assertion dans `home-invariants.test.tsx` (contrat J1, SC-009)

**Checkpoint** : MVP — la home convertit (héro + CTA), anti-marketplace garanti par test.

---

## Phase 4: User Story 2 — Pourquoi le modèle est différent et digne de confiance (P2)

**Goal**: sections de différenciation + confiance, inspirées du lead-gen mais adaptées à la
mise en relation : « Comment ça marche » (3 étapes), pourquoi 3, neutralité, OPC-TICO,
Loi 25, anti-contact, FAQ, teaser thématiques + CTA répété + pied de page SEO.

**Independent Test**: toutes les sections présentes avec leur contenu ; bandeau OPC/TICO,
mention anti-contact et FAQ pointent/expliquent correctement ; aucune mécanique de devis.

### Tests (TDD — rouge AVANT vert)

- [x] T011 [P] [US2] Test RED présence sections + liens : commentCaMarche (3 étapes, sans devis), pourquoiTrois (« jusqu'à 3 »), neutralite, loi25, pasDeContact, bandeau OPC/TICO → `/comment-ca-marche`, FAQ (≥ 4 Q/R), teaser thématiques → intake (contrat U4–U8, U11–U14, I6) dans `apps/web/src/features/home/ui/__tests__/home-sections.test.tsx`

### Implémentation

- [x] T012 [P] [US2] Composant `SectionCommentCaMarche` (3 étapes : décrire → ≤3 conseillers vérifiés → échanger/choisir, SANS devis) dans `apps/web/src/features/home/ui/SectionCommentCaMarche.tsx`
- [x] T013 [P] [US2] Composant `TrustBannerOpcTico` (lien → `/<locale>/comment-ca-marche`) dans `apps/web/src/features/home/ui/TrustBannerOpcTico.tsx`
- [x] T014 [P] [US2] Composant `SectionPourquoiTrois` (note « pas une liste à trier », copie « jusqu'à 3 ») dans `apps/web/src/features/home/ui/SectionPourquoiTrois.tsx`
- [x] T015 [P] [US2] Composant `SectionNeutralite` (multi-réseaux, indépendants compris) dans `apps/web/src/features/home/ui/SectionNeutralite.tsx`
- [x] T016 [P] [US2] Composant `SectionThematiquesTeaser` (items → intake pré-rempli, jamais contact ; optionnel/dégradable) dans `apps/web/src/features/home/ui/SectionThematiquesTeaser.tsx`
- [x] T017 [P] [US2] Composant `SectionFaq` (≥ 4 Q/R, passages courts citables) dans `apps/web/src/features/home/ui/SectionFaq.tsx`
- [x] T018 [P] [US2] Composant `BandeauLoi25` (résidence des données + non-partage) dans `apps/web/src/features/home/ui/BandeauLoi25.tsx`
- [x] T019 [P] [US2] Composant `MentionPasDeContact` (lien → `/<locale>/comment-ca-marche`) dans `apps/web/src/features/home/ui/MentionPasDeContact.tsx`
- [x] T019b [P] [US2] Composant `SectionAvantageConseiller` (FR-025 — côté humain : accompagnement, suivi pro, expertise, loin du bruit des comparateurs) dans `apps/web/src/features/home/ui/SectionAvantageConseiller.tsx`
- [x] T020 [US2] Composer toutes les sections dans l'ordre du squelette + CTA répété + `Footer` partagé + lien secondaire « Espace conseiller » dans `apps/web/src/app/[locale]/page.tsx` → rend T011 vert

**Checkpoint** : US1 + US2 — page de positionnement complète côté contenu.

---

## Phase 5: User Story 3 — Trouvable, rapide et accessible (P3)

**Goal**: métadonnées + JSON-LD (Organization/WebSite + FAQPage), génération statique +
cacheabilité (millions/jour), budgets CWV, WCAG 2.1 AA.

**Independent Test**: Lighthouse (Perf≥90/SEO≥95/A11y≥95, LCP<2.5s, CLS<0.1) + axe (0
violation) + JSON-LD valide (sans `contactPoint`) + FAQPage valide + home statique cacheable.

### Tests (TDD — rouge AVANT vert)

- [x] T021 [P] [US3] Test RED `buildHomepageJsonLd` : `Organization` + `WebSite`, `@context` schema.org, **absence** de `contactPoint`/`telephone`/`email`, pureté (contrat L1–L7, SC-007) dans `apps/web/src/features/home/lib/__tests__/homepage-jsonld.test.ts`
- [x] T022 [P] [US3] Test RED `buildFaqJsonLd` : `FAQPage` avec `Question`/`acceptedAnswer`, pureté (contrat L9–L11, SC-012) dans `apps/web/src/features/home/lib/__tests__/faq-jsonld.test.ts`

### Implémentation

- [x] T023 [US3] Fonction pure `buildHomepageJsonLd(locale, baseUrl)` dans `apps/web/src/features/home/lib/homepage-jsonld.ts` → rend T021 vert
- [x] T024 [US3] Fonction pure `buildFaqJsonLd(faqItems)` dans `apps/web/src/features/home/lib/faq-jsonld.ts` → rend T022 vert
- [x] T025 [US3] `generateMetadata` (title/description i18n, `alternates.canonical`, `openGraph`, `twitter`, `robots` indexable) + injection des `<script type="application/ld+json">` (homepage + FAQPage) dans `apps/web/src/app/[locale]/page.tsx` (contrat M1–M6, L8, L9)
- [x] T026 [P] [US3] Test a11y Playwright + axe-core tag `@a11y` sur `/fr` (0 violation sérieuse/critique, un seul `<h1>`, repères sémantiques, opérabilité clavier) dans `apps/web/test/a11y/home.spec.ts`
- [x] T027 [US3] Valider la porte Lighthouse CI sur `/fr` (Perf≥90/SEO≥95/A11y≥95, LCP≤2500, CLS≤0.1) — exécuter `lhci` localement, ajuster si dépassement (contrat SC-004/005)
- [x] T028 [US3] **Cacheabilité à l'échelle** (millions/jour) : `generateStaticParams` (fr, en), rendu statique sans fonction dynamique par requête (aucun `cookies()`/`headers()`), `Cache-Control` long + revalidation à la demande dans `apps/web/src/app/[locale]/page.tsx` (contrat S1–S4, FR-017/018, SC-010/011)
- [~] T029 [P] [US3] **Magnétisme SEO/GEO** : métadonnées OpenGraph/Twitter + citabilité (passages FAQ courts) FAITS ; **image OG dédiée** (`opengraph-image`) reste à produire (polish/025) (contrat S5, FR-019)

**Checkpoint** : les 3 stories fonctionnent ; a11y + perf vertes ; home statique cacheable ; FAQPage indexable.

---

## Phase 6: Polish & transverse

- [~] T030 [P] Libellé certification : **« OPC/TICO » retenu** (cohérent constitution Porte I) dans `home.trust.opcTicoBanner` ; ratification juridique exacte par conformité avant **lancement public** (non bloquant pour la PR).
- [x] T031 [P] Catalogue EN des clés `home.*` complété (FR-CA source canonique ; EN affiné en 024) dans `apps/web/src/i18n/messages/en.json`
- [x] T032 Portes qualité passées : Biome lint (CI-strict), `tsc`, Vitest 18/18, `next build` EXIT 0 (`/[locale]` SSG), `/fr` 200 (2 JSON-LD + canonical/OG), page existante non régressée. DoD applicable cochée (a11y/Lighthouse vérifiés en CI sur `/`).
- [~] T033 [P] Audit lecteur d'écran : recommandé avant lancement public (Principe XI) — sémantique + axe-core en place ; passe NVDA/VoiceOver à planifier.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** : aucune dépendance.
- **Foundational (P2)** : dépend du Setup ; **bloque** toutes les user stories (i18n + CTA + surface).
- **US1 (P3)** : dépend de Foundational. MVP.
- **US2 (P4)** : dépend de Foundational ; T020 compose `page.tsx` (étend T009).
- **US3 (P5)** : dépend de Foundational ; T025/T028 étendent `page.tsx` (après T009/T020).
- **Polish (P6)** : après les stories visées.

### Within Each User Story (TDD strict)

- Les tests rouges (`T007`, `T011`, `T021`, `T022`) sont committés AVANT leur implémentation.
- Composants de section avant la composition dans `page.tsx`.

### Parallel Opportunities

- Setup : T001-T003 `[P]`.
- US2 : composants de section T012-T019 `[P]` (fichiers distincts) ; T020 (compose `page.tsx`) après.
- US3 : T021/T022/T026 `[P]` (tests purs + test a11y, fichiers distincts).
- ⚠️ Sérialiser tout ce qui touche `apps/web/src/app/[locale]/page.tsx` (T009 → T020 → T025 → T028) : même fichier.

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
- TDD strict : T007/T011/T021/T022 rouges avant vert (commits séparés visibles, Principe VI).
- Anti-marketplace (ADR-0002) vérifié **par test** (T007/T011) : 0 contact, 0 devis, CTA unique. « 3 conseillers », jamais « 3 soumissions ».
- Inspiration lead-gen (soumissionrenovation.ca) adaptée : « Comment ça marche », FAQ + FAQPage, teaser thématiques — sans aucune mécanique de devis/contact.
- Pas de migration, pas de nouvel ADR (couvert par ADR-0002), pas de Server Action.
- Réconciliations de copie (CTA, OPC/TICO) traitées en T004/T030 — ne pas inventer le libellé légal.

**Total tâches** : 33 (3 Setup + 3 Foundational + 4 US1 + 10 US2 + 9 US3 + 4 Polish).

**Suite recommandée** : `/speckit.analyze` (cohérence spec/plan/tasks) puis `/speckit.implement`.
