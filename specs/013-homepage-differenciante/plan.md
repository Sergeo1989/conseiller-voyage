# Implementation Plan: Page d'accueil publique différenciante

**Branch**: `013-homepage-differenciante` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-homepage-differenciante/spec.md`

## Summary

Remplacer le squelette de soft-launch (`apps/web/src/app/[locale]/page.tsx`) par une
**page d'accueil voyageur de positionnement**, rendue côté serveur/statique, qui traduit
les 4 différenciateurs structurels (neutralité multi-réseaux, appariement algorithmique,
vérification OPC/TICO, vie privée Loi 25) en messages explicites. Aucune donnée persistée,
aucun appel matching en direct : c'est du **contenu statique** piloté par le catalogue
i18n FR-CA. Approche technique : route mince RSC (`page.tsx` + `generateMetadata`) +
slice front `features/home` (composants de section RSC purs) + builder JSON-LD pur testé
(`Organization` + `WebSite`). Portes qualité existantes (Lighthouse CI + axe-core, héritées
de 005) étendues à l'URL `/`. Strict respect d'ADR-0002 (aucun contact direct, CTA unique
vers l'intake) et de l'invariant *intake = unique route de mise en relation*.

## Technical Context

**Language/Version**: TypeScript ≥ 5 strict.

**Primary Dependencies**: Next.js App Router (RSC par défaut) · next-intl · Tailwind CSS v4 ·
primitives `apps/web/src/shared/ui` (shadcn/Radix) · lucide-react · `next/link`. Aucune
dépendance nouvelle.

**Storage**: N/A — aucune entité persistée. Le contenu vit dans `apps/web/src/i18n/messages/fr-CA.json` (namespace `home.*`).

**Testing**: Vitest (builder JSON-LD pur + invariants de contenu) · Playwright + axe-core (a11y, job CI `a11y` existant) · Lighthouse CI (job `lighthouse` existant).

**Target Platform**: Web public (Next.js prod derrière CloudFront/CDN canadien), pré-rendu statique/ISR.

**Project Type**: Web frontend (`apps/web`), convention feature-slicing Principe VIII.a.

**Performance Goals**: LCP < 2,5 s · INP < 200 ms · CLS < 0,1 · Lighthouse Perf ≥ 90 / SEO ≥ 95 / A11y ≥ 95 (portes bloquantes) · **taux de hit CDN ≥ 95 % · TTFB cache-hit p95 < 200 ms**.

**Constraints**: **génération entièrement statique** (par langue) servie au CDN, **aucune fonction de rendu dynamique par requête** (pas de `cookies()`/`headers()` sur la route home) → origine non sollicitée par visiteur ; `Cache-Control` long + revalidation à la demande ; contenu principal + CTA fonctionnels **sans JavaScript client** ; copie 100 % FR-CA via i18n (EN différé 024, jamais de fork) ; anti-marketplace strict (0 coordonnée de contact, 0 conseiller cliquable — ADR-0002) ; un seul CTA primaire vers `/voyage/nouveau`.

**Scale/Scope**: **plusieurs millions de visites/jour** absorbées par le **CDN (CloudFront ca-central-1)** ; la home étant statique, l'origine est quasi non sollicitée. 1 route publique (`/[locale]`) × langues ; ~7 sections ; trafic anonyme non authentifié ; aucune personnalisation.

## Constitution Check

*GATE : doit passer avant Phase 0 et être re-vérifié après Phase 1.*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE) — ✅ PASS

La page **ne touche à aucune transaction** (réservation, paiement, versement). Elle
**n'affiche aucun conseiller** (ni nom, ni carte cliquable, ni liste), seulement le
*concept* d'appariement « jusqu'à 3 ». Le filtre `verified` n'est pas applicable : aucune
donnée conseiller n'est interrogée (page statique). Le bandeau « Tous vérifiés OPC/TICO »
est un message de réassurance renvoyant vers `/comment-ca-marche` ; il n'expose aucune
identité. **Aucun moyen de contact direct** (ADR-0002). CTA unique vers l'intake.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ PASS

**Aucune donnée personnelle collectée ni traitée** : page anonyme, sans formulaire, sans
champ, sans authentification, sans cookie fonctionnel nouveau. Pas de PII → effacement et
rétention sans objet pour cette feature. Le bandeau Loi 25 est informatif. Aucun
sous-traitant nouveau. (Le cookie `cv_suggested` de 007 n'est ni lu ni écrit ici.)

### III. Qualité de lead avant volume — ✅ N/A justifié

Aucune interaction avec le matching ni les leads : la page ne déclenche pas de scoring et
ne crée pas de lead. La copie « jusqu'à 3 » reflète le plafond (Principe III) sans le
calculer. Pas d'instrumentation de lead dans cette feature.

### IV. Français d'abord — ✅ PASS

Toute copie en **FR-CA via clés i18n** (`home.*`). EN différé à 024 par catalogue séparé,
jamais par fork de gabarit. Aucun format date/monnaie sensible sur la page.

### V. Architecture : monolithe modulaire — ✅ PASS

Feature front isolée `apps/web/src/features/home`. Réutilise uniquement `shared/ui`,
`shared/i18n` et `next-intl` — **aucun import profond cross-feature** (la pédagogie
anti-contact est ré-écrite dans le slice `home`, pas importée de `profil-public`). Aucun
module backend touché. Pas de LLM.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ PASS (TDD ciblé)

La page est surtout déclarative, mais deux éléments testables existent et suivent le
**TDD strict** (test rouge committé avant l'implémentation) :
1. **Builder JSON-LD pur** (`homepage-jsonld.ts`) — fonction sans I/O, testée (forme
   `Organization`+`WebSite`, **absence** de `contactPoint`/`telephone`) → SC-007.
2. **Invariants de contenu** — tests vérifiant *exactement un* CTA primaire vers l'intake
   (SC-003) et *zéro* coordonnée de contact / lien conseiller-contact (SC-002).

### VII. Observabilité de la boucle économique — ✅ N/A justifié

La home est le haut de l'entonnoir ; le clic CTA mène à l'intake (008) qui porte la
métrique « complétion intake ». **Aucune nouvelle métrique** de boucle économique n'est
introduite par 013 ; l'instrumentation analytics fine relève de 021. Noté, non bloquant.

### VIII / VIII.a. Clean Architecture + conventions front — ✅ PASS

- **Routing mince** : `app/[locale]/page.tsx` = RSC + `generateMetadata`, zéro logique
  métier, zéro fetch, zéro Prisma.
- **Slice** : `features/home/{ui,lib,index.ts}` ; composants de section RSC purs.
- **State boundaries** : RSC uniquement (aucun state client, aucun Zustand, aucune query).
- **Server Actions** : aucune (page statique).
- **Design system** : réutilise primitives `shared/ui` ; pas de nouveau design system (025 différé).

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ PASS

Aucun endpoint, aucune entrée utilisateur, aucune authz (page publique anonyme). En-têtes
HTTP de sécurité déjà posés globalement (middleware). Aucun secret, aucun SQL, aucune
désérialisation d'entrée. Surface d'attaque ≈ contenu statique. OWASP : sans objet
nouveau.

### X. Fiabilité et résilience — ✅ PASS (renforcé échelle)

Page **entièrement statique** → servie par le CDN, **indépendante de l'origine** : soutient
plusieurs millions de visites/jour sans charge applicative (FR-017), pics absorbés au bord
(FR-018). Mode dégradé naturel : la home reste servie même si DB/Redis/SES/app sont HS
(SC-011). Aucune fonction dynamique par requête sur la route (pas de `cookies()`/`headers()`)
pour garantir la cacheabilité totale. Idempotence sans objet (aucune écriture). Repli i18n
si une clé manque.

### Definition of Done — engagement

La DoD constitution sera cochée avant merge : tests (Vitest + Playwright axe), lint
(Biome), type-check (tsc), a11y (axe-core CI bloquant), perf (Lighthouse CI bloquant sur
`/`), copie FR-CA, **aucun nouvel ADR requis** (décisions couvertes par ADR-0002), pas de
migration. Une revue lecteur d'écran est recommandée (page publique majeure, Principe XI).

**Verdict** : aucune violation. Pas de section *Complexity Tracking* requise.

## Project Structure

### Documentation (this feature)

```text
specs/013-homepage-differenciante/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions techniques
├── data-model.md        # Phase 1 — modèle de contenu (pas de DB)
├── quickstart.md        # Phase 1 — comment lancer/vérifier
├── contracts/           # Phase 1 — contrats UI + métadonnées/JSON-LD
│   ├── homepage-ui.contract.md
│   └── metadata-jsonld.contract.md
└── tasks.md             # Phase 2 (/speckit-tasks — non créé ici)
```

### Source Code (repository root)

```text
apps/web/src/
├── app/[locale]/
│   └── page.tsx                       # Route MINCE : RSC + generateMetadata + JSON-LD inline
│                                      #   (remplace le squelette de soft-launch)
├── features/home/
│   ├── ui/
│   │   ├── Hero.tsx                   # ② H1 + sous-titre + CTA + « gratuit/sans engagement » + micro-confiance
│   │   ├── SectionCommentCaMarche.tsx # ③ 3 étapes (décrire → ≤3 conseillers → échanger), SANS devis
│   │   ├── TrustBannerOpcTico.tsx     # ④ bandeau « Tous vérifiés OPC/TICO » → /comment-ca-marche
│   │   ├── SectionPourquoiTrois.tsx   # ⑤ « Pourquoi 3, et pas une liste »
│   │   ├── SectionNeutralite.tsx      # ⑥ « Indépendant et neutre »
│   │   ├── SectionThematiquesTeaser.tsx # ⑦ teaser thématiques → intake (optionnel, dégradable)
│   │   ├── SectionFaq.tsx             # ⑧ FAQ (passages courts citables)
│   │   ├── BandeauLoi25.tsx           # ⑨ résidence des données + non-partage
│   │   ├── MentionPasDeContact.tsx    # ⑩ pédagogie anti-contact → /comment-ca-marche
│   │   └── CtaDecrireVoyage.tsx       # ②/⑪ CTA réutilisable (lien vers /voyage/nouveau)
│   ├── lib/
│   │   ├── homepage-jsonld.ts         # Builder PUR Organization + WebSite (testé, TDD)
│   │   └── faq-jsonld.ts              # Builder PUR FAQPage depuis les Q/R i18n (testé, TDD)
│   └── index.ts                       # Surface publique du slice (composants exportés)
├── i18n/messages/
│   ├── fr-CA.json                     # namespace home.* étendu (source canonique)
│   └── en.json                        # clés EN stub (repli FR, complété en 024)
└── shared/ui/
    └── Footer.tsx                     # ⑩ réutilisé tel quel

apps/web/  (tests + config)
├── src/features/home/lib/__tests__/homepage-jsonld.test.ts   # SC-007 (TDD rouge d'abord)
├── src/features/home/lib/__tests__/faq-jsonld.test.ts        # SC-012 FAQPage (TDD rouge d'abord)
├── src/features/home/ui/__tests__/home-invariants.test.tsx   # SC-002 / SC-003 (TDD rouge d'abord)
├── src/features/home/ui/__tests__/home-sections.test.tsx     # US2 présence sections + FAQ
├── test/a11y/home.spec.ts                                     # Playwright + axe @a11y (SC-006)
└── lighthouserc.json                                          # + "http://localhost:3000/fr" (SC-004/005)
```

**Structure Decision** : feature-slicing Principe VIII.a. La route reste mince ; toute la
présentation vit dans `features/home`. Le builder JSON-LD est isolé en `lib/` pour être pur
et testable (Principe VI). La pédagogie anti-contact est **ré-implémentée** dans le slice
`home` (i18n) plutôt qu'importée de `profil-public` (respect de l'interdiction d'import
profond cross-feature). Si une 3ᵉ surface réutilise ce bloc, on promouvra le pattern vers
`shared/ui` (extraction sur preuve, pas par anticipation).

## Layout agréé (squelette)

Ordre vertical validé (héro **texte centré**, cf. Clarifications spec ; inspiration lead-gen
soumissionrenovation.ca adaptée à la mise en relation) :
`① en-tête sobre → ② héro (H1 + sous-titre + CTA + « gratuit, sans engagement » + micro-confiance) →
③ Comment ça marche (3 étapes) → ④ bandeau OPC/TICO → ⑤ pourquoi 3 (différenciateur) →
⑥ neutralité → ⑦ teaser thématiques (→ intake, optionnel) → ⑧ FAQ (+ FAQPage JSON-LD) →
⑨ bandeau Loi 25 → ⑩ mention anti-contact → ⑪ CTA répété → ⑫ pied de page SEO`.
Un seul `<h1>` (héro) ; les sections portent des `<h2>` avec `aria-labelledby`. Héro
texte-only → LCP = le H1, CLS nul, aucune dépendance image/025. **Aucune mécanique de
devis/soumission ni de contact direct** à aucun niveau (ADR-0002).

## Stratégie d'échelle & magnétisme (plusieurs M visites/jour)

- **Génération statique par langue** : `generateStaticParams` (fr, en) + rendu statique
  (RSC sans API dynamique par requête). Vérifier qu'aucun `cookies()`/`headers()` n'est
  appelé sur la route (cela opterait Next en rendu dynamique et casserait la cacheabilité).
  L'accès « Espace conseiller » est un **simple lien statique** (aucune vérif de session sur
  la home) — la personnalisation/auth reste hors de cette route.
- **Cache CDN** : `Cache-Control` long + **revalidation à la demande** (revalidation
  déclenchée lors d'un changement de copie/déploiement). Objectif : hit ratio ≥ 95 %,
  origine non sollicitée par visiteur (FR-017/018, SC-010/011).
- **Résilience** : la home survit à une panne d'origine (servie depuis le bord).
- **Magnétisme SEO/GEO** : contenu sémantique citable (passages courts, titres clairs),
  métadonnées + JSON-LD complets, image de partage social (FR-019). La home est l'entrée
  phare ; l'arborescence SEO de masse (016-019/027) et la lecture GEO fine (019) sont des
  features distinctes différées — ne pas les réimplémenter ici.
- **Hors scope** : CDN/infra (CloudFront, invalidation) est déjà la cible constitution ;
  013 garantit seulement que la home est *cacheable de bout en bout* et le documente.

## Réconciliations de copie (à traiter en implémentation, non bloquantes)

- **CTA** : la clé existante `home.ctaPrimary` = « Décrire mon projet » ; le spec/roadmap
  mandate « **Décrire mon voyage** ». → Aligner sur le spec (FR-001).
- **Certification** : la clé existante `home.trust.certificates` = « CCV (Québec) et TICO
  (Ontario) » ; le spec dit « **OPC/TICO** ». → Confirmer le libellé exact avec le module
  conformité (001) avant gel de copie ; ne pas inventer. Repris en tâche de recherche.

## Complexity Tracking

Aucune violation de la Constitution → section sans objet.
