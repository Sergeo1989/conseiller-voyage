# Contrat — Endpoints HTTP (consommés + 1 ajouté)

Base conseiller : `api/matching/conseiller` — protégée par `AuthGuard + RoleGuard('conseiller')`
+ middleware CGU (004) + filtrage vérifié (001). Toutes les réponses : **0 PII de contact**,
**0 champ transactionnel** (ADR-0002).

## Leads (012 — existants, consommés tels quels)

| Méthode | Chemin | Rôle | Notes |
|---|---|---|---|
| GET | `/leads?state&page&pageSize` | Liste paginée de mes leads | résumé non nominatif + statut |
| GET | `/leads/:leadId` | Détail (auto-`vu` à la 1re vue) | + historique des transitions |
| POST | `/leads/:leadId/accept` | Transition `accepter` | **Idempotency-Key requis** |
| POST | `/leads/:leadId/refuse` | Transition `refuser` (raison) | terminal |
| POST | `/leads/:leadId/quote-sent` | `marquer_devis_envoye` | déclaratif |
| POST | `/leads/:leadId/booking-confirmed` | `marquer_reservation_confirmee` | |
| POST | `/leads/:leadId/lost` | `marquer_perdu` (raison) | terminal |

Codes : `200` (vue lead mise à jour), `400` (Idempotency-Key manquant), `403` (non
propriétaire / non vérifié), `404`, `409` (**conflit** d'état), `422` (transition invalide).

## Conversation (013 — existants, consommés tels quels)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/conversations/:conversationId/messages?page&pageSize` | Page de messages + entête `conversation` |
| POST | `/conversations/:conversationId/messages` | Envoi (Idempotency-Key) |
| POST | `/conversations/:conversationId/attachments` | URL d'upload pré-signée (devis opaque) |
| POST | `/conversations/:conversationId/attachments/:attachmentId/finalize` | Marque `ready` |
| GET | `/conversations/:conversationId/attachments/:attachmentId/url` | URL de lecture signée courte |

## Conversation — AJOUTÉ par 014

| Méthode | Chemin | Rôle | Délègue à |
|---|---|---|---|
| GET | `/conversations?page&pageSize` | **Liste paginée de mes fils** | `ConversationQueryPort.listForConseiller` (013) |

**Réponse `GET /conversations`** :
```jsonc
{
  "items": [
    { "id": "uuid", "leadId": "uuid", "writable": true, "lastMessageAt": "ISO|null", "openedAt": "ISO" }
  ],
  "page": 1, "pageSize": 20, "total": 3
}
```

- Autorisation : conseiller authentifié ; `conseillerId` résolu côté serveur
  (`ConseillerIdentityResolver`) — **jamais** passé par le client. Cloisonnement garanti par
  le port (filtre `conseillerId`).
- Pagination : `page ≥ 1`, `pageSize ≤ 100` (défaut 20), tri `lastMessageAt desc`.
- Aucun champ transactionnel ; aucune PII de contact.
- Couverture : stub d'intégration (staging, convention 011/012) + le mapping est trivial.
