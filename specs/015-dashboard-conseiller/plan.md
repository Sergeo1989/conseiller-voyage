# Implementation Plan: Tableau de bord conseiller (mes leads, mes conversations)

**Branch**: `015-dashboard-conseiller` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-dashboard-conseiller/spec.md`

## Summary

Tableau de bord conseiller = **couche interface/présentation** (front App Router VIII.a)
au-dessus du backbone déjà livré. Deux parcours : **Mes leads** (liste + détail + actions
de transition) et **Mes conversations** (liste + fil + envoi + pièces jointes). Le front
consomme les **endpoints HTTP conseiller existants** (012 leads : liste/détail/5 transitions ;
013 conversation : fil/envoi/pièces jointes), via `apiClient` (session + Idempotency-Key).
**Aucune logique métier ré-implémentée**, **aucune nouvelle table / machine d'état**.

Seul **ajout backend** : un endpoint **`GET /api/matching/conseiller/conversations`**
(liste paginée des fils du conseiller) qui expose le port public **déjà existant**
`ConversationQueryPort.listForConseiller` (013) — purement interface. Tout le reste est
front : route group `(conseiller)`, slices `features/leads` + réutilisation de
`features/conversation` (livré par 013), Server Actions par verbe, RSC + TanStack Query,
i18n FR-CA/EN, a11y WCAG 2.1 AA.

## Technical Context

**Language/Version**: TypeScript ≥ 5 strict.

**Primary Dependencies**: Next.js App Router (RSC) · next-intl · TanStack Query (state
serveur client) · react-hook-form + Zod resolver · shadcn/ui (Radix) · Tailwind v4 ·
lucide-react · date-fns (fr-CA). Côté API (1 endpoint) : NestJS + Fastify · `@nestjs/swagger`.

**Storage**: **Aucun** nouveau stockage. Lecture via ports/endpoints existants
(PostgreSQL derrière 012/013, S3 ca-central-1 pour les pièces jointes — non touchés ici).

**Testing**: Vitest (Server Actions / mapping de vues via MSW), Playwright + axe-core
(écrans dashboard, tag `@a11y`), test d'invariant anti-transaction sur les réponses/vues
exposées au front. Le seul endpoint API ajouté est couvert par un stub d'intégration
(convention 011/012, exécution staging).

**Target Platform**: Next.js (CloudFront) + API NestJS (ECS Fargate ca-central-1).

**Project Type**: Web (monolithe modulaire — front `apps/web` + 1 endpoint `apps/api`
module `matching`).

**Performance Goals**: rendu utile initial des vues < **2 s** (SC-008), budgets CWV du
projet (LCP/INP/CLS). Endpoint liste conversations p95 < **800 ms** (SLO X).

**Constraints**: anti-marketplace (0 montant/paiement/réservation affiché — ADR-0002) ;
0 PII de contact voyageur (Loi 25) ; cloisonnement strict (un conseiller ne voit que ses
leads/fils) ; espace privé `noindex` ; a11y AA ; idempotence + gestion de conflit sur les
actions de transition (déléguées à 012).

**Scale/Scope**: régime de démarrage (dizaines de leads/fils par conseiller) ; ~6–8 écrans.

## Constitution Check

*GATE : passer avant Phase 0, re-vérifier après Phase 1.*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE) — ✅ PASS

Le dashboard **n'affiche aucune transaction** : zéro montant, paiement, lien de réservation
(FR-013, SC-002). Le devis reste un **fichier opaque** (lien de téléchargement à durée
limitée, aucune donnée structurée). Mention permanente de neutralité dans la vue
conversation (FR-012, SC-007). Les conseillers ne sont jamais affichés hors statut
**vérifié** (les ports 012/013 filtrent déjà ; le dashboard ne contourne rien). Aucune
écriture transactionnelle.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ PASS

**Aucune PII de contact du voyageur** n'est exposée au conseiller : seul un **résumé non
nominatif** du brief (destinations, période, type) est affiché (FR-003, SC-002), tel que
fourni par les ports (012/013) qui n'exposent pas la PII. Données déjà en région
canadienne ; l'anonymisation est cascadée par 012/013 — le dashboard rend simplement les
champs neutralisés (corps null, résumé vide, pièce jointe indisponible) sans erreur
(edge case). Aucune nouvelle collecte ni rétention.

### III. Qualité de lead avant volume — ✅ PASS (indirect)

Aucune ré-implémentation du matching/plafond. Le dashboard **rend** la traçabilité d'état
de lead déjà instrumentée (012) ; il facilite l'acceptation rapide (SC-003), améliorant la
boucle. Pas de logique de scoring.

### IV. Français d'abord — ✅ PASS

Toute la copie en **FR-CA** par défaut, clés i18n next-intl, **EN** via catalogue (FR-018).
Formats date `fr-CA`. Aucun texte en dur.

### V. Architecture : monolithe modulaire — ✅ PASS

Front consomme les **interfaces publiques** (endpoints HTTP) des modules `matching`
(012/013). Le seul ajout backend expose un **port public existant** (`ConversationQueryPort`)
via un contrôleur mince du module `matching` — pas de couplage cross-module nouveau. Pas
de LLM.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ PASS (pas de logique métier nouvelle)

Cette feature **n'introduit aucune logique métier sensible** (scoring/validation/machine
d'état) : elle délègue intégralement à 012/013. Les seules unités testables sont du
**mapping de vues** + **autorisation déjà couverte par les ports**. Pas de TDD de domaine
requis (aucune fonction de domaine ajoutée) ; tests de mapping + a11y + invariant
anti-transaction à la place.

### VII. Observabilité de la boucle économique — ✅ PASS

Métriques touchées : **taux d'acceptation** des leads (visibilité accrue → action). Les
compteurs existent déjà (012 `cv.matching.lead.transition`, 013 `cv.matching.conversation.*`)
— le dashboard les **déclenche** via les endpoints existants ; pas de nouvelle métrique
backend requise. Logs structurés conservés côté API.

### VIII. Clean Architecture et SOLID — ✅ PASS

**Front VIII.a** : route group `(conseiller)`, feature slicing
`apps/web/src/features/{leads,conversation}/{ui,actions,hooks,schemas,index.ts}`, routing
mince (`app/` = layouts/pages/boundaries), Server Actions par verbe (validation Zod, retour
`ActionResult`), state boundaries (RSC + TanStack Query serveur, react-hook-form forms,
`useState` local). Réutilisation du slice `features/conversation` (013) et de `packages/ui`.
Côté API : contrôleur mince déléguant au port (interface → application).

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ PASS

Auth conseiller (006, Auth.js v5) + RBAC `requireConseiller` + middleware CGU (004) **déjà
en place** sur `(conseiller)`. Cloisonnement garanti par les ports (un conseiller ne lit que
ses leads/fils — SC-001). Server Actions : validation **Zod côté serveur**, jamais de
`throw` métier. Le nouvel endpoint réutilise `AuthGuard + RoleGuard('conseiller')`. Pages
`noindex` (FR-016). Aucun secret, aucun SQL brut.

### X. Fiabilité et résilience — ✅ PASS

Actions de transition **idempotentes** (Idempotency-Key déjà exigé par 012) et gestion de
**conflit** (409 → invitation à rafraîchir, FR-006/FR-007, SC-004). Envoi de message
idempotent (013). Modes dégradés : API/SES/S3 HS → messages d'erreur clairs, états vides,
lien de pièce jointe régénérable. SLO p95 < 800 ms sur le endpoint liste.

### Definition of Done

DoD de la constitution cochée avant merge : Vitest (mapping/actions) + Playwright axe-core
verts, lint Biome, tsc, a11y (axe CI bloquant), perf (CWV/Lighthouse — espace privé mais
budgets respectés), invariant anti-transaction, sécurité (RBAC/cloisonnement/Zod), copie
FR-CA + i18n EN, pas d'ADR requis (aucune décision structurante nouvelle), endpoint ajouté
documenté (Swagger) + stub d'intégration.

## Project Structure

### Documentation (this feature)

```text
specs/015-dashboard-conseiller/
├── plan.md              # This file
├── research.md          # Phase 0 — décisions (fetching, concurrence, réutilisation)
├── data-model.md        # Phase 1 — vues consommées (aucune nouvelle entité)
├── quickstart.md        # Phase 1 — parcours de validation
├── contracts/
│   ├── http-endpoints.md        # endpoints consommés + 1 ajouté (liste conversations)
│   └── ui-routes-actions.md     # routes (conseiller) + Server Actions par verbe
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── app/[locale]/(conseiller)/
│   ├── leads/
│   │   ├── page.tsx                 # US1 — liste de mes leads (RSC)
│   │   └── [leadId]/page.tsx         # US1/US2 — détail + actions
│   └── conversations/
│       ├── page.tsx                 # US3 — liste de mes fils (RSC)
│       └── [conversationId]/page.tsx # US3 — fil (réutilise features/conversation)
├── features/
│   ├── leads/                        # NOUVEAU slice
│   │   ├── ui/ (LeadList, LeadCard, LeadDetail, LeadStatusBadge, LeadActions, BriefSummary)
│   │   ├── actions/ (accept|refuse|quote-sent|booking-confirmed|lost.action.ts)
│   │   ├── hooks/ (useLeadsQuery, useLeadQuery — TanStack Query)
│   │   ├── schemas/ (lead-action.schema.ts)
│   │   └── index.ts
│   └── conversation/                 # RÉUTILISÉ (013) + ajouts mineurs
│       ├── ui/ (ConversationList [NOUVEAU], + ConversationThread/MessageList/… existants)
│       ├── actions/ (send-message [existant], create-attachment, finalize, get-attachment-url [ajouts])
│       ├── hooks/ (useConversationsQuery, useMessagesQuery)
│       └── index.ts
├── shared/lib/http (apiClient — existant) · shared/auth (requireConseiller — existant)
└── i18n/messages/{fr-CA,en}.json  (namespaces leads.* + dashboard.* ; conversation.* existant)

apps/api/src/modules/matching/interface/http/
└── conseiller-conversation.controller.ts  # + GET '' (liste fils) → ConversationQueryPort
```

**Structure Decision**: Web (front-dominant). Le gros de la feature vit dans `apps/web`
selon la convention VIII.a (route group `(conseiller)` déjà protégé, feature slicing). Un
seul ajout `apps/api` : exposer `ConversationQueryPort.listForConseiller` via un GET mince
dans le contrôleur conversation existant. Aucune migration, aucune entité.

## Phasing

- **Phase 0 — research.md** : stratégie de fetching (RSC initial + TanStack Query pour
  invalidation après action), gestion de la concurrence optimiste / conflit 409, mapping
  des réponses API → vues UI, réutilisation du slice conversation, endpoint liste à ajouter.
- **Phase 1 — data-model.md + contracts/ + quickstart.md** : vues consommées (sans PII),
  contrat des endpoints (existants + 1 ajouté), routes `(conseiller)` + Server Actions par
  verbe, scénarios de validation (SC-001→SC-008).
- **Phase 2 — tasks.md** (`/speckit-tasks`) : Setup → Foundational (endpoint liste + slice
  scaffolding) → US1 → US2 → US3 → Polish (a11y, invariant, i18n, quickstart/DoD).

## Complexity Tracking

> Aucune violation de la Constitution Check. Pas de *Complexity Tracking* requis.
