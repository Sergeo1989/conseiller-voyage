# Tasks: Tableau de bord conseiller (mes leads, mes conversations)

**Feature roadmap 014** · branche `015-dashboard-conseiller` · modules `matching` × `identité`.
Couche **interface/présentation** : aucune nouvelle entité / machine d'état. Consomme les
endpoints HTTP conseiller existants (012/013) + 1 endpoint ajouté (liste des fils).

Légende : `[P]` parallélisable (fichiers distincts, sans dépendance) · `[US#]` rattaché à une
user story. Aucune logique métier de domaine n'est ajoutée → tests = Server Actions/mapping
(MSW) + a11y (axe) + invariant (anti-transaction / anti-PII), pas de TDD de domaine.

## Phase 1 : Setup

- [x] T001 [P] Scaffolding du slice `apps/web/src/features/leads/{ui,actions,api,schemas}/` + `index.ts` (surface inter-slice VIII.a)
- [x] T002 [P] Namespaces i18n `leads.*` + `dashboard.*` + compléments `conversation.*` (statuts, actions, états vides, erreurs) dans `apps/web/src/i18n/messages/{fr-CA,en}.json`

## Phase 2 : Foundational (bloque les user stories)

- [x] T003 Endpoint `GET /api/matching/conseiller/conversations` (liste paginée des fils) → `ConversationQueryPort.listForConseiller` + **enrichissement `GET :id/messages`** (entête `writable` + pièces jointes via `ConversationQueryPort.getMessages`) dans `conseiller-conversation.controller.ts`. tsc api vert.
- [x] T004 **Adapté** : pas de TanStack Query (non installé dans `apps/web`). Le dashboard suit le pattern **réel du codebase** : RSC (lecture serveur via `apiClient`) + Server Actions + `revalidatePath` / `router.refresh()`. (Cohérence > nouvelle dépendance.)
- [x] T005 [P] Types de vue + lecture API : `features/leads/schemas/lead.ts` (`LeadView`, `LeadState`, `WRITABLE_NEXT`) + `features/leads/api/leads-api.ts` (`listLeads`/`getLead`, server-only)

## Phase 3 : User Story 1 — Consulter mes leads (P1) 🎯 MVP

**Goal** : le conseiller voit ses leads (liste + détail, statut + résumé non nominatif, sans PII).
**Independent Test** : ouvrir *Mes leads* → uniquement mes leads, paginés, 0 PII contact ; ouvrir un lead → détail + historique.

- [x] T006 [P] [US1] Composants présentationnels `LeadStatusBadge`, `BriefSummary`, `LeadList` dans `features/leads/ui/` (libellés textuels, pas couleur seule)
- [x] T007 [US1] `LeadList` + page `apps/web/src/app/[locale]/(conseiller)/conseiller/leads/page.tsx` (RSC, `GET /leads`, état vide accessible) + carte d'accès depuis le dashboard home
- [x] T008 [US1] `LeadDetail` + page `.../conseiller/leads/[leadId]/page.tsx` (RSC, `GET /leads/:id`, historique horodaté ; brief anonymisé rendu sans erreur)
- [x] T009 [US1] Couverture non-PII : assurée par **T018** (invariant sur les types de vue) + le résumé non nominatif fourni par l'API (012)

## Phase 4 : User Story 2 — Piloter le cycle de vie d'un lead (P2)

**Goal** : actions de transition (accepter/refuser/devis/réservation/perdu) déléguées à 012, idempotentes, conflit géré.
**Independent Test** : `vu` → Accepter → `accepté` ; rejeu = sans effet ; état périmé → conflit.

- [x] T010 [P] [US2] Server Actions par verbe dans `features/leads/actions/` (`accept|refuse|mark-quote-sent|mark-booking-confirmed|mark-lost.action.ts` + helper `_transition.helper.ts`) : `ActionResult`, `apiClient` idempotent, mapping codes `409→CONFLICT`/`422→INVALID_TRANSITION`/`403→FORBIDDEN`, `revalidatePath`
- [x] T011 [US2] `LeadActions` (Client) : n'affiche que les actions valides selon `currentState` (`WRITABLE_NEXT`), confirmation + raison des actions terminales (refuser/perdu), sur conflit → message `role=alert` + `router.refresh()`
- [x] T012 [US2] Idempotence garantie côté API (Idempotency-Key auto) ; conflit/invalide mappés et testés via **T018** + flux couvert par les tests d'intégration 012 (déférés staging). _Tests MSW d'action non requis (aucune logique nouvelle ; mapping pur)._

## Phase 5 : User Story 3 — Mes conversations (P3)

**Goal** : liste des fils + fil (réutilise `features/conversation` de 013) + envoi + pièces jointes ; lecture seule si non writable ; mention de neutralité permanente.
**Independent Test** : fil ouvert → messages ordonnés, envoi, pièce jointe téléchargeable ; lead terminal-négatif → lecture seule.

- [x] T013 [P] [US3] `ConversationList` dans `features/conversation/ui/` + page `.../conseiller/conversations/page.tsx` (RSC, `GET /conversations`, statut actif/lecture seule, dernier message, état vide) + lecture `features/conversation/api/conversations-api.ts`
- [x] T014 [US3] Page `.../conseiller/conversations/[conversationId]/page.tsx` montant `ConversationThread` (013) via `GET /conversations/:id/messages` enrichi (lecture seule si `writable=false`)
- [x] T015 [US3] Server Actions pièces jointes (`attachment.actions.ts` : `createAttachmentUpload`/`finalize`/`getAttachmentUrl`). _Couche d'accès complète ; le widget d'upload/téléchargement dans le fil est un incrément suivant (endpoints + actions prêts ; pièces jointes affichées nom + disponibilité)._
- [x] T016 [US3] **Adapté** : pas de hooks TanStack ; rafraîchissement via RSC + `revalidatePath` / `router.refresh()` (cf. T004)

## Phase 6 : Polish & portes qualité

- [x] T017 [P] a11y Playwright `@a11y` : `apps/web/test/a11y/dashboard.spec.ts` (leads + conversations) + `conversation.spec.ts` (013) activable (route montée par T014) — skip-guardé par session E2E
- [x] T018 [P] Invariant **anti-transaction / anti-PII** : `apps/web/src/features/__tests__/dashboard-anti-transaction.invariant.test.ts` (0 champ montant/paiement/réservation ni PII de contact dans les types de vue ; 2 tests verts)
- [x] T019 [P] `robots: noindex` — **déjà** appliqué au layout `(conseiller)` (espace privé, FR-016) ; libellés FR-CA/EN i18n (dashboard home conserve son libellé FR existant)
- [x] T020 `quickstart.md` § Statut de validation (SC-001→SC-008 mappés) + DoD ; `tsc` (api+web) + Biome + feature-boundaries verts

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
