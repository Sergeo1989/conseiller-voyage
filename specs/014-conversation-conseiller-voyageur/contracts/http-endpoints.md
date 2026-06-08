# Contrat — Endpoints HTTP (conversation)

Tous authentifiés (session conseiller via AuthGuard 006 ; voyageur via espace voyageur).
Autorisation **membre-du-fil** systématique (IDOR → 403/404 indifférenciable). Validation
**Zod** côté serveur. Aucune charge transactionnelle. Réponses sans PII superflue.

## Conseiller (`/conseiller/conversations`)

| Méthode | Endpoint | Rôle | Notes |
|---|---|---|---|
| GET | `/conseiller/conversations` | liste paginée des fils du conseiller | via `ConversationQueryPort` |
| GET | `/conseiller/conversations/:id/messages` | page de messages | requester = propriétaire |
| POST | `/conseiller/conversations/:id/messages` | envoyer un message texte | **idempotence** (header/clé) ; `canWrite` requis (lead non terminal-négatif + vérifié) → 409/403 sinon |
| POST | `/conseiller/conversations/:id/attachments` | demander une **URL d'upload pré-signée** (après `validateAttachment`) | renvoie URL + attachmentId (status PENDING_UPLOAD) |
| POST | `/conseiller/conversations/:id/attachments/:aid/finalize` | confirmer l'upload (status READY) + rattacher au message | |
| GET | `/conseiller/conversations/:id/attachments/:aid/url` | **URL signée courte** de lecture | membre + disponible |

## Voyageur (`/voyage/conversations`)

| Méthode | Endpoint | Rôle |
|---|---|---|
| GET | `/voyage/conversations` | fils du voyageur (un par conseiller ayant accepté) |
| GET | `/voyage/conversations/:id/messages` | page de messages |
| POST | `/voyage/conversations/:id/messages` | envoyer un message (idempotent ; `canWrite`) |
| POST | `/voyage/conversations/:id/attachments` + `/finalize` + `GET .../url` | symétrique conseiller |

## Règles transverses

- **Idempotence** : `POST .../messages` accepte une clé d'idempotence (header
  `Idempotency-Key` ou champ) → rejeu = même message, pas de doublon (FR-004, SC-009).
- **Écriture** : refusée (403/409 + message FR-CA clair) si le fil n'est pas `writable`
  (lead `refusé`/`perdu` → lecture seule ; conseiller non vérifié) (FR-005).
- **Anti-transaction** : aucun endpoint n'accepte ni ne renvoie de montant/prix/lien de
  paiement (SC-003).
- **SLO** : p95 `POST .../messages` < 800 ms (X) ; la notification est asynchrone (outbox).
- **a11y** : l'UI minimale consommant ces endpoints passe axe-core (Principe XI).
