# Contrat — Routes `(conseiller)` + Server Actions

Front App Router VIII.a. Route group `(conseiller)` **déjà** protégé (auth 006 + CGU 004 +
vérifié 001). Pages **privées** (`noindex`). i18n FR-CA défaut + EN.

## Routes (RSC par défaut)

| Route | Vue | US | Données (RSC initial) |
|---|---|---|---|
| `/[locale]/(conseiller)/leads` | Liste de mes leads | US1 | `GET /leads` |
| `/[locale]/(conseiller)/leads/[leadId]` | Détail + actions | US1/US2 | `GET /leads/:id` |
| `/[locale]/(conseiller)/conversations` | Liste de mes fils | US3 | `GET /conversations` |
| `/[locale]/(conseiller)/conversations/[conversationId]` | Fil (réutilise `features/conversation`) | US3 | `GET /conversations/:id/messages` |

- Chaque page : layout `require-conseiller` (déjà en place), `metadata` `robots: noindex`.
- Boundaries : `loading.tsx` (squelette accessible) + `error.tsx` (message clair, pas de
  détail technique) par segment.

## Server Actions (un fichier par verbe ; Zod ; `ActionResult`)

### Slice `features/leads/actions/`
| Action | Endpoint | Entrée (Zod) | Retour |
|---|---|---|---|
| `acceptLeadAction` | `POST /leads/:id/accept` | `{ leadId }` | `ActionResult<LeadView>` |
| `refuseLeadAction` | `POST /leads/:id/refuse` | `{ leadId, reason? }` | `ActionResult<LeadView>` |
| `markQuoteSentAction` | `POST /leads/:id/quote-sent` | `{ leadId }` | `ActionResult<LeadView>` |
| `markBookingConfirmedAction` | `POST /leads/:id/booking-confirmed` | `{ leadId }` | `ActionResult<LeadView>` |
| `markLostAction` | `POST /leads/:id/lost` | `{ leadId, reason? }` | `ActionResult<LeadView>` |

- `apiClient.post(..., { idempotent: true })` → Idempotency-Key auto (X).
- Mapping des codes : `409 → CONFLICT` (« l'état a changé, rafraîchissez »), `422 →
  INVALID_TRANSITION`, `403 → FORBIDDEN` (non vérifié/non propriétaire). Jamais de `throw`
  métier — toujours `ActionResult`.
- Après succès : invalidation TanStack Query `['lead', id]` + `['leads']`.

### Slice `features/conversation/actions/` (existant + ajouts)
| Action | Endpoint | Note |
|---|---|---|
| `sendMessageAction` | `POST /conversations/:id/messages` | **existant (013)** |
| `createAttachmentUploadAction` | `POST /conversations/:id/attachments` | ajout |
| `finalizeAttachmentAction` | `POST .../finalize` | ajout |
| `getAttachmentUrlAction` | `GET .../url` | ajout (URL courte à la demande) |

## State boundaries
- **RSC** : rendu initial des listes/détails (HTML rapide, SC-008).
- **TanStack Query** : cache + invalidation après mutation (clés `['leads']`, `['lead',id]`,
  `['conversations']`, `['messages',id]`).
- **react-hook-form + Zod** : formulaire d'envoi de message, raisons de refus/perte.
- **`useState`** : ouverture de modales/confirmations locales.

## Accessibilité (WCAG 2.1 AA — SC-005)
- Listes en `<ul>/<ol>`, statuts avec libellé textuel (pas couleur seule), badges avec
  `aria-label`. Actions = `<button>` avec libellés explicites ; confirmation des actions
  terminales (refuser/perdu). Focus visibles, navigation clavier complète, erreurs en
  `role="alert"`/`aria-live`. Réutilise les composants accessibles de `features/conversation`.
