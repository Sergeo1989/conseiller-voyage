# Data Model — Tableau de bord conseiller (014)

> **Aucune nouvelle entité persistée, aucune migration, aucune machine d'état.**
> Cette feature consomme des **vues en lecture** déjà exposées par les ports/endpoints
> de 012 et 013. Ce document décrit les **vues consommées** (read models) et leurs
> garanties de confidentialité — pas un schéma de base.

## Vues consommées (read models)

### LeadView (source : 012 — `GET leads` / `GET leads/:id`)

| Champ | Type | Note |
|---|---|---|
| `id` | uuid | |
| `position` | 1 \| 2 \| 3 | rang dans le top-3 |
| `currentState` | enum | envoyé/vu/accepté/refusé/devis_envoyé/réservation_confirmée/perdu |
| `briefSummary` | objet | **non nominatif** : `destinations[]`, `periodeApprox`, `typeProjet` |
| `scoreFinal` | number \| null | indicatif (non transactionnel) |
| `createdAt` / `updatedAt` | date | |
| `history[]` | liste | transitions horodatées (`fromState`, `toState`, `actor`, `occurredAt`) |

**Confidentialité** : aucune PII de contact (nom/courriel/téléphone/adresse). `briefId`/
résumé null si anonymisé (Loi 25). Aucun champ montant/paiement/réservation.

### ConversationListItemView (source : 013 — `GET conversations` [AJOUTÉ])

| Champ | Type | Note |
|---|---|---|
| `id` | uuid | |
| `leadId` | uuid | |
| `writable` | boolean | dérivé `canWrite(état lead, vérifié)` |
| `lastMessageAt` | date \| null | tri par récence |
| `openedAt` | date | |

### ConversationMessagesPage (source : 013 — `GET :id/messages`)

- `conversation` : `ConversationView` (`id`, `leadId`, `conseillerId`, `briefId`,
  `writable`, `openedAt`, `lastMessageAt`).
- `items[]` : `MessageView` (`id`, `author` ∈ {conseiller, voyageur}, `body` \| null,
  `createdAt`, `attachments[]`).
- `attachments[]` : `AttachmentView` (`id`, `fileName`, `mimeType`, `sizeBytes`,
  `available`) — **jamais d'URL** ici ni de montant ; l'URL signée vient de `GET .../url`.
- `page`, `pageSize`, `total`.

## Commandes (mutations déléguées)

| Commande | Endpoint (existant) | Garantie |
|---|---|---|
| Accepter / Refuser / Devis envoyé / Réservation confirmée / Perdu | `POST leads/:id/{accept,refuse,quote-sent,booking-confirmed,lost}` (012) | Idempotency-Key requis ; `conflict`/`invalid_transition` surfacés |
| Envoyer un message | `POST :id/messages` (013) | Idempotency-Key ; lecture seule sinon |
| Pièce jointe (upload pré-signé / finalize / URL lecture) | `POST :id/attachments`, `POST .../finalize`, `GET .../url` (013) | type/poids validés ; URL courte |

## États dérivés (front, non persistés)

- **Actions disponibles** d'un lead : dérivées de `currentState` (mapping pur côté UI) —
  reflètent la machine d'état de 012 (aucune ré-implémentation des règles).
- **Statut d'écriture** d'un fil : `writable` fourni par le port (013).
- **Disponibilité d'une pièce jointe** : `available` fourni par le port (013).

## Invariants

- **0 PII de contact** et **0 champ transactionnel** dans toute vue rendue (SC-002,
  test d'invariant — cohérent avec T038 de 013).
- **Cloisonnement** : toute vue est filtrée par `conseillerId` courant en amont (ports
  012/013) ; le front ne reçoit jamais les données d'un autre conseiller (SC-001).
