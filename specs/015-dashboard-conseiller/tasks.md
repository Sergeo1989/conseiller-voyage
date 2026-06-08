# Tasks: Tableau de bord conseiller (mes leads, mes conversations)

**Feature roadmap 014** · branche `015-dashboard-conseiller` · modules `matching` × `identité`.
Couche **interface/présentation** : aucune nouvelle entité / machine d'état. Consomme les
endpoints HTTP conseiller existants (012/013) + 1 endpoint ajouté (liste des fils).

Légende : `[P]` parallélisable (fichiers distincts, sans dépendance) · `[US#]` rattaché à une
user story. Aucune logique métier de domaine n'est ajoutée → tests = Server Actions/mapping
(MSW) + a11y (axe) + invariant (anti-transaction / anti-PII), pas de TDD de domaine.

## Phase 1 : Setup

- [ ] T001 [P] Scaffolding du slice `apps/web/src/features/leads/{ui,actions,hooks,schemas}/` + `index.ts` (barrels vides, surface inter-slice VIII.a)
- [ ] T002 [P] Namespaces i18n `leads.*` + `dashboard.*` (statuts, actions, états vides, erreurs) dans `apps/web/src/i18n/messages/{fr-CA,en}.json`

## Phase 2 : Foundational (bloque les user stories)

- [ ] T003 Endpoint `GET /api/matching/conseiller/conversations` (liste paginée des fils du conseiller) → délègue à `ConversationQueryPort.listForConseiller` dans `apps/api/src/modules/matching/interface/http/conseiller-conversation.controller.ts` (+ `@Inject(CONVERSATION_QUERY_PORT)` + wiring + Swagger). tsc vert.
- [ ] T004 Provider TanStack Query vérifié/ajouté pour le route group `(conseiller)` (`QueryClientProvider`) + clés de cache conventionnées (`['leads']`, `['lead',id]`, `['conversations']`, `['messages',id]`)
- [ ] T005 [P] Mappers API→vue + types partagés du dashboard (`LeadView`, `ConversationListItemView`) dans `features/leads/schemas/` (réutilise les types `@cv/shared/matching` côté conversation)

## Phase 3 : User Story 1 — Consulter mes leads (P1) 🎯 MVP

**Goal** : le conseiller voit ses leads (liste + détail, statut + résumé non nominatif, sans PII).
**Independent Test** : ouvrir *Mes leads* → uniquement mes leads, paginés, 0 PII contact ; ouvrir un lead → détail + historique.

- [ ] T006 [P] [US1] Composants présentationnels `LeadStatusBadge`, `BriefSummary`, `LeadCard` dans `features/leads/ui/` (libellés textuels, pas couleur seule)
- [ ] T007 [US1] `LeadList` + page `apps/web/src/app/[locale]/(conseiller)/leads/page.tsx` (RSC, `GET /leads`, pagination, état vide accessible)
- [ ] T008 [US1] `LeadDetail` + page `.../(conseiller)/leads/[leadId]/page.tsx` (RSC, `GET /leads/:id`, historique horodaté ; brief anonymisé rendu sans erreur)
- [ ] T009 [US1] Test mapping (MSW) : réponse API → `LeadView` non nominatif (0 PII, 0 champ transactionnel) dans `features/leads/__tests__/lead-view.mapping.test.ts`

## Phase 4 : User Story 2 — Piloter le cycle de vie d'un lead (P2)

**Goal** : actions de transition (accepter/refuser/devis/réservation/perdu) déléguées à 012, idempotentes, conflit géré.
**Independent Test** : `vu` → Accepter → `accepté` ; rejeu = sans effet ; état périmé → conflit.

- [ ] T010 [P] [US2] Server Actions par verbe dans `features/leads/actions/` (`accept|refuse|quote-sent|booking-confirmed|lost.action.ts`) : Zod, `ActionResult`, `apiClient` idempotent, mapping codes `409→CONFLICT`/`422→INVALID_TRANSITION`/`403→FORBIDDEN`
- [ ] T011 [US2] `LeadActions` (Client) : n'affiche que les actions valides selon `currentState`, confirmation des actions terminales (refuser/perdu), sur conflit → message + invalidation `['lead',id]`
- [ ] T012 [US2] Tests actions (MSW) : succès → vue mise à jour + invalidation ; `409` conflit ; `422` invalide ; double soumission sans double effet dans `features/leads/__tests__/lead-actions.test.ts`

## Phase 5 : User Story 3 — Mes conversations (P3)

**Goal** : liste des fils + fil (réutilise `features/conversation` de 013) + envoi + pièces jointes ; lecture seule si non writable ; mention de neutralité permanente.
**Independent Test** : fil ouvert → messages ordonnés, envoi, pièce jointe téléchargeable ; lead terminal-négatif → lecture seule.

- [ ] T013 [P] [US3] `ConversationList` dans `features/conversation/ui/` + page `.../(conseiller)/conversations/page.tsx` (RSC, `GET /conversations`, statut actif/lecture seule, dernier message, état vide)
- [ ] T014 [US3] Page `.../(conseiller)/conversations/[conversationId]/page.tsx` montant `ConversationThread` (013) via `GET /conversations/:id/messages` (lecture seule si `writable=false`)
- [ ] T015 [US3] Server Actions pièces jointes dans `features/conversation/actions/` (`create-attachment-upload`, `finalize-attachment`, `get-attachment-url`) + `AttachmentLink` câblé (téléchargement via URL signée à la demande)
- [ ] T016 [US3] Hooks TanStack Query `useConversationsQuery` / `useMessagesQuery` + invalidation après envoi dans `features/conversation/hooks/`

## Phase 6 : Polish & portes qualité

- [ ] T017 [P] a11y Playwright `@a11y` : `apps/web/test/a11y/dashboard.spec.ts` (leads liste/détail) + activation de `conversation.spec.ts` (route montée par T014) — skip-guardé par session E2E
- [ ] T018 [P] Invariant **anti-transaction / anti-PII** : test vérifiant que les vues/réponses du dashboard ne portent **aucun** champ montant/paiement/réservation ni PII de contact dans `apps/web/src/features/__tests__/dashboard-anti-transaction.invariant.test.ts`
- [ ] T019 [P] `metadata` `robots: noindex` sur toutes les pages `(conseiller)` du dashboard (espace privé, FR-016) + libellés FR-CA/EN vérifiés (aucun texte en dur)
- [ ] T020 `quickstart.md` § Statut de validation (SC-001→SC-008 mappés) + DoD cochée ; `tsc` (api+web) + Biome + feature-boundaries verts

## Dépendances & ordre

- **Setup (P1)** : aucune dépendance.
- **Foundational (P2)** : T003 (endpoint) débloque US3 liste ; T004/T005 débloquent le fetching front. Bloque les US.
- **US1 (P3)** : dépend de Foundational. MVP livrable seul.
- **US2 (P4)** : dépend de US1 (détail du lead).
- **US3 (P5)** : dépend de Foundational (T003) + réutilise le slice `features/conversation` (013).
- **Polish (P6)** : après les stories visées.
- ⚠️ Sérialiser ce qui touche `conseiller-conversation.controller.ts` (T003) et l'`index.ts` des slices.

## Parallélisation
- Setup : T001/T002 `[P]`.
- US1 : T006 `[P]`. US2 : T010 `[P]`. US3 : T013 `[P]`. Polish : T017/T018/T019 `[P]`.

## Stratégie
MVP = Phase 1 + 2 + **US1** (visibilité des leads). Incréments : US2 (pilotage) puis US3
(conversations). Chaque story est indépendamment testable et démontrable.
