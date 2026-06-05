# Contrat — Consommation bus + notifications sortantes (012)

## 1. Entrée — abonnement au bus `matching.events`

012 s'abonne au canal Redis pub/sub `MATCHING_PUBSUB_CHANNEL` (`matching.events`), alimenté par 011 (T093). Message reçu :

```
{ name: MatchingEventBusName, idempotencyKey: string, payload: object }
```

`name` ∈ `{ voyageur.brief.matched, voyageur.brief.partially_matched, voyageur.brief.unmatched, voyageur.brief.all_matches_revoked }` (mapping `@cv/shared/matching`).

### Payloads consommés (publiés par 011)

- `matched` / `partially_matched` :
  `{ matchingResultId, briefId, matchedCount, algorithmVersion, computedAt, entries: [{ position, conseillerId, scoreFinal, boosted }], boostApplied }`
- `unmatched` : `{ matchingResultId, briefId, matchedCount: 0, reason, … }`
- `all_matches_revoked` : `{ matchingResultId, briefId, … }`

### Comportement par événement

| Événement | Action 012 |
|---|---|
| `matched` / `partially_matched` | Dédup (`consumed-events`). Pour chaque entry dont le conseiller est **vérifié** : créer un `Lead` (`envoye`) + enqueue une notification (1 job/destinataire). Conseiller non vérifié → notification `skipped_unverified`, pas de lead notifié. Si `matchingResultId` supersède un MR antérieur du même brief → clore en `perdu` les leads non terminaux de l'ancien MR (FR-018). |
| `unmatched` | Trace uniquement ; aucun lead, aucune notification. |
| `all_matches_revoked` | Aucun conseiller notifié ; clôturer les leads concernés en `perdu` ; alerte admin **réutilise** le mécanisme 011/008 (pas de nouveau canal). |

### Idempotence & résilience

- Dédup at-least-once via `consumed-events.idempotencyKey`.
- **Sweep de réconciliation** (BullMQ repeatable) : scanne les `MatchingResult` actifs (`ok`/`partial`) sans lead → rejoue la création (mode dégradé « bus HS », FR-011).

## 2. Sortie — notifications conseiller

Pattern outbox + un **job BullMQ par destinataire** (Principe X).

```
LeadNotificationOutbox(pending)
   → job BullMQ (queue `matching.lead-notifications`, 1 entrée = 1 conseiller)
   → résout l'adresse via le module identité (jamais stockée dans 012)
   → vérifie verified (re-check)
   → rend le gabarit FR-CA `lead-received.tsx` (sans PII contact voyageur)
   → SES ca-central-1
   → status=sent (ou failed + backoff/dead-letter)
```

Idempotence : UNIQUE `idempotencyKey = lead:{conseillerId}:{matchingResultId}`. Un replay ne renvoie pas de courriel.

### Contenu de la notification (FR-004)

Autorisé : résumé non sensible du brief (destinations, période approximative, type de projet), lien vers l'espace conseiller. **Interdit** : nom complet, courriel, téléphone, adresse du voyageur.

## 3. Événements domaine internes (optionnels)

012 peut émettre des événements domaine internes (`LeadCreated`, `LeadTransitioned`) pour l'observabilité/metrics. La communication **voyageur** (sur acceptation/refus) est **hors périmètre** (déléguée à 013/015, FR-017) — aucun événement voyageur n'est publié par 012 dans ce périmètre.
