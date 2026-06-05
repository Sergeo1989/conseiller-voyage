# Contrat — Endpoints HTTP conseiller (012)

Tous sous `AuthGuard` + `RoleGuard @RequireRole('conseiller')`. Autorisation au niveau use case : un conseiller n'accède/agit que sur **ses** leads. Validation Zod côté serveur. Re-vérification `verified` à chaque action (FR-008). Réponses d'erreur en FR-CA (i18n `matching.lead.*`).

Base : `/api/matching/conseiller`.

## GET `/leads`

Liste paginée des leads du conseiller authentifié (vue tableau de bord — données consommées par 014).

- **200** : `{ items: LeadView[], page, pageSize, total }`
- Filtre optionnel `?state=` (LeadState). Tri par `createdAt` desc par défaut.

## GET `/leads/:leadId`

Détail d'un lead. **Effet de bord** : déclenche la transition automatique `envoye → vu` si applicable (FR-019), idempotente.

- **200** : `LeadView` (état possiblement passé à `vu`)
- **403** : lead n'appartient pas au conseiller
- **404** : lead inexistant ou brief anonymisé (selon politique de masquage)

## POST `/leads/:leadId/accept`

Transition `vu → accepte`.

- En-tête `Idempotency-Key` requis.
- **200** : `LeadView` (state=`accepte`)
- **409 LEAD_STATE_CONFLICT** : l'état courant n'autorise pas l'action (concurrence optimiste — relire l'état)
- **403 CONSEILLER_NOT_VERIFIED** : conseiller non vérifié au moment de l'action
- **422 INVALID_TRANSITION** : transition non autorisée depuis l'état courant

## POST `/leads/:leadId/refuse`

Transition `vu → refuse` (terminal). Body `{ reason?: string ≤ 500 }`. Mêmes codes que `accept`.

## POST `/leads/:leadId/quote-sent`

Transition `accepte → devis_envoye`. Marqueur déclaratif **sans montant ni donnée transactionnelle** (FR-013). Mêmes codes.

## POST `/leads/:leadId/booking-confirmed`

Transition `devis_envoye → reservation_confirmee` (terminal positif). Marqueur déclaratif. **N'affecte pas** les leads frères (FR-016). Mêmes codes.

## POST `/leads/:leadId/lost`

Transition `* (non terminal) → perdu` (terminal). Body `{ reason?: string ≤ 500 }`. Mêmes codes.

## Schéma `LeadView` (réponse)

```
{
  id, matchingResultId, position, currentState,
  scoreFinal, boosted, createdAt, updatedAt,
  brief: { destinations[], periodeApprox, typeProjet } | null,   // résumé NON sensible, null si anonymisé
  history: [ { fromState, toState, occurredAt, actor } ]          // sans PII
}
```

> `brief` ne contient **aucune** coordonnée de contact voyageur (FR-004). `null` si le brief est anonymisé.

## Codes transverses

`401` (session absente), `403` (rôle non conseiller / pas le propriétaire / non vérifié), `409` (conflit d'état), `422` (transition invalide), `400` (validation Zod).
