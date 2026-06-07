# Data Model — Conversation conseiller ↔ voyageur (014)

Module `matching`, schéma `packages/db/prisma/schema/matching.prisma`. Fichiers des pièces
jointes **hors DB** (S3 ca-central-1) ; la DB ne stocke que des métadonnées. **Aucun champ
de montant / paiement / réservation** (invariant ADR-0002).

## Enums

- `ConversationParticipant` : `CONSEILLER | VOYAGEUR` (auteur d'un message, destinataire d'une notif).
- `ConversationNotifStatus` : `PENDING | SENT | FAILED` (outbox).

> Le **statut d'écriture** du fil (actif / lecture seule) n'est **pas** un enum stocké : il
> est **dérivé** à la lecture depuis l'état du lead (012) + statut vérifié (R7) — pas de
> duplication de la machine d'état.

## Entités

### Conversation
Fil entre un conseiller et le voyageur d'un lead **accepté**. **Un fil par couple (conseiller × lead).**
- `id` (cuid), `leadId` (FK Lead 012, unique avec conseillerId), `conseillerId`,
  `briefId` (nullable — neutralisé Loi 25), `voyageurRef` (référence voyageur, neutralisable),
  `openedAt`, `lastMessageAt` (tri/aperçu), `createdAt`, `updatedAt`.
- Contrainte d'unicité : `@@unique([leadId])` (le lead identifie déjà le couple conseiller×brief).
- Index : `conseillerId`, `briefId`.

### ConversationMessage
- `id`, `conversationId` (FK), `author` (`ConversationParticipant`), `body` (texte ; nullable
  après anonymisation), `idempotencyKey` (unique par conversation), `createdAt`.
- `@@unique([conversationId, idempotencyKey])` (idempotence d'envoi — FR-004).
- Index : `conversationId, createdAt` (pagination ordonnée).
- Validation (domaine, VO `MessageBody`) : non vide après trim, longueur max (ex. 4000).

### ConversationAttachment
Métadonnées d'un fichier (le binaire est sur S3). **Aucun montant.**
- `id`, `messageId` (FK), `fileName`, `mimeType`, `sizeBytes`, `s3Key`,
  `status` (`PENDING_UPLOAD | READY`), `createdAt`, `deletedAt` (nullable — suppression Loi 25).
- Validation (domaine, VO `AttachmentMeta`) : `mimeType ∈` types autorisés (pdf + images),
  `sizeBytes ≤` max (ex. 10 Mo).

### ConversationNotificationOutbox
- `id`, `messageId` (FK), `recipient` (`ConversationParticipant`), `idempotencyKey`,
  `status` (`ConversationNotifStatus`), `attempts`, `createdAt`, `sentAt` (nullable).
- `@@unique([messageId, recipient])` (1 notif/destinataire — FR-003).

### ConsumedConversationEvent
Trace d'idempotence des événements consommés (ex. `lead.accepted`) pour l'ouverture de fil.
- `id`, `eventKey` (unique), `consumedAt`.

## Relations

```
Lead (012) 1───1 Conversation 1───* ConversationMessage 1───* ConversationAttachment
                                   └───* ConversationNotificationOutbox (1 par destinataire)
```

## Règles de validation (fonctions PURES, testées TDD — domaine)

- `canWrite(leadState, conseillerVerifie)` → `true` ssi `leadState ∈ {ACCEPTE, DEVIS_ENVOYE,
  RESERVATION_CONFIRMEE}` ET `conseillerVerifie === true` (FR-005).
- `validateMessage(body)` → rejette vide / trop long (FR-017).
- `validateAttachment(mimeType, sizeBytes)` → rejette type non autorisé / trop volumineux (FR-008).
- `isMember(participant, conversation)` → autorisation lecture/écriture (FR-006, IX).

## Cascade Loi 25

`anonymize-conversation-loi25(partyRef)` : pour chaque message PII de la partie → `body = null` ;
pour chaque pièce jointe liée → suppression objet S3 + `deletedAt`. Conserve ids/horodatages
(audit). Idempotent (FR-011, SC-006).

## Hors-modèle (interdits — invariant ADR-0002)

Aucun champ : `amount`, `price`, `currency`, `paymentLink`, `bookingId`, `total`, etc. Le
devis est **uniquement** une `ConversationAttachment` opaque.
