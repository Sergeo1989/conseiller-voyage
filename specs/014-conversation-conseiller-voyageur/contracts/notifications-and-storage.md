# Contrat — Notifications + stockage des pièces jointes

## Notifications (1 par destinataire, résilientes)

- À chaque message persisté, le système crée **une entrée d'outbox par destinataire**
  (`ConversationNotificationOutbox`, unique `(messageId, recipient)`), drainée par un **job
  BullMQ par destinataire** vers **SES** (module 003), courriel **FR-CA sans PII de contenu**
  (juste « nouveau message dans votre conversation » + lien vers l'espace).
- **Au moins une fois + dédup** → aucun doublon perçu (FR-012, SC-002). Reprise sur panne SES
  (retry). Jamais de notification groupée (FR-003).
- Le courriel **ne contient pas** le corps du message ni de pièce jointe (vie privée).

## Stockage des pièces jointes (S3 ca-central-1, anti-transaction)

Flux d'upload (le binaire ne transite pas par l'API) :
1. `POST .../attachments` : le serveur **valide** `mimeType`/`sizeBytes` (`validateAttachment`),
   crée `ConversationAttachment(status=PENDING_UPLOAD)`, renvoie une **URL S3 pré-signée** (PUT).
2. Le client PUT le fichier directement vers **S3 ca-central-1**.
3. `POST .../finalize` : le serveur marque `READY` et rattache au message.
4. Lecture : `GET .../url` renvoie une **URL signée à durée limitée** (quelques minutes),
   uniquement pour un membre du fil.

| Clause | Exigence | Réf |
|---|---|---|
| S1 | Fichiers en **région canadienne** (S3 ca-central-1) | II, ADR-0001 |
| S2 | Types restreints (≥ PDF + images) + taille max | FR-008 |
| S3 | URL d'upload pré-signée + URL de lecture **signée courte** (pas d'accès public) | IX |
| S4 | Métadonnées en DB, **aucun montant / champ transactionnel** | I, ADR-0002, SC-003 |
| S5 | Suppression Loi 25 : objet S3 supprimé + `deletedAt`, audit préservé | II, FR-011 |
| S6 | Scan antivirus **différé** (Tier 5) — risque documenté | IX |

## Invariant anti-transaction (testé)

Un contrôle automatisé vérifie qu'**aucun** champ de montant/prix/paiement/réservation
n'existe dans les modèles `Conversation*` ni dans les réponses d'API/UI. Le devis est
**uniquement** une pièce jointe opaque (SC-003).
