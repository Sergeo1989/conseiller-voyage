# Data Model — 012 notifications conseillers + machine d'état de lead

Schéma : `packages/db/prisma/schema/matching.prisma` (extension du module matching). Tables préfixées `lead_`. Tout en `ca-central-1`.

## Énumérations

### LeadState (machine d'état)

```
envoye | vu | accepte | refuse | devis_envoye | reservation_confirmee | perdu
```

États **terminaux** : `refuse`, `reservation_confirmee`, `perdu`.

### LeadAction (déclencheurs de transition)

```
marquer_vu (auto, système/conseiller) | accepter | refuser | marquer_devis_envoye |
marquer_reservation_confirmee | marquer_perdu | clore_systeme (re-match / all_revoked)
```

### LeadTransitionActor

```
conseiller | systeme
```

### Transitions autorisées

| De \ Vers | vu | accepte | refuse | devis_envoye | reservation_confirmee | perdu |
|---|---|---|---|---|---|---|
| **envoye** | ✅ | — | — | — | — | ✅ |
| **vu** | (no-op) | ✅ | ✅ | — | — | ✅ |
| **accepte** | — | — | — | ✅ | — | ✅ |
| **devis_envoye** | — | — | — | — | ✅ | ✅ |
| terminaux | — | — | — | — | — | — |

- `marquer_vu` sur un lead déjà `vu` ou au-delà : **no-op idempotent** (aucune nouvelle transition).
- `clore_systeme` → `perdu` autorisé depuis tout état non terminal (re-match, all_matches_revoked).
- Toute combinaison absente de la table : **rejetée** (`TransitionError`).

## Entités

### Lead

Une opportunité d'un conseiller sur un matching donné. **UNIQUE (conseillerId, matchingResultId)** (idempotence FR-003).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `matchingResultId` | UUID | FK logique vers `matching_results` (même module) |
| `matchingResultEntryPosition` | int (1-3) | position dans le top 3 (CHECK 1..3) |
| `conseillerId` | UUID | destinataire |
| `briefId` | UUID? | **nullable** — neutralisé à l'anonymisation (R6) |
| `currentState` | LeadState | dénormalisé (guard concurrence optimiste), défaut `envoye` |
| `scoreFinal` | Decimal? | recopié de l'entry (signal, non PII) |
| `boosted` | bool | recopié de l'entry |
| `closeReason` | text? | motif système (`re-matched`, `all_matches_revoked`) si clôture auto |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | maj transactionnelle avec la transition |

Index : UNIQUE(conseillerId, matchingResultId) ; (briefId) ; (currentState) pour les sweeps/métriques.

### LeadTransition (append-only)

Historique immuable des changements d'état.

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `leadId` | UUID | FK → leads |
| `fromState` | LeadState? | null pour la création initiale (`→ envoye`) |
| `toState` | LeadState | |
| `action` | LeadAction | |
| `actor` | LeadTransitionActor | |
| `actorId` | UUID? | conseillerId si actor=conseiller |
| `reason` | text? | motif (≤ 500 chars) — jamais de PII |
| `occurredAt` | DateTime | horodatage |

Contraintes : **append-only** (trigger Postgres BEFORE UPDATE/DELETE/TRUNCATE). Index (leadId, occurredAt).

### LeadNotificationOutbox

Notification conseiller à acheminer (un par destinataire).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `leadId` | UUID | FK → leads |
| `conseillerId` | UUID | destinataire |
| `idempotencyKey` | varchar(255) | UNIQUE = `lead:{conseillerId}:{matchingResultId}` |
| `channel` | enum (`email`) | extensible |
| `status` | enum (`pending`/`sent`/`failed`/`skipped_unverified`) | |
| `attempts` | int | backoff |
| `lastError` | text? | |
| `createdAt` / `sentAt` | DateTime? | |

Aucune PII de contact : l'adresse du destinataire est résolue **au moment de l'envoi** via le module identité (pas stockée ici).

### ConsumedMatchingEvent (dédup bus)

| Champ | Type | Notes |
|---|---|---|
| `idempotencyKey` | varchar(255) | PK — clé de l'événement bus |
| `eventName` | varchar | `voyageur.brief.matched`… |
| `consumedAt` | DateTime | |

## Règles de validation (issues des exigences)

- Un lead n'existe que pour un conseiller **vérifié au moment de la consommation** (FR-008) ; sinon notification `skipped_unverified` + aucune création (ou lead non notifié, tracé).
- `currentState` ne change que via une transition valide (R4) appliquée avec guard `WHERE current_state = :expected` (concurrence optimiste, FR-020).
- `briefId` peut passer à NULL (anonymisation) ; aucune autre mutation rétroactive.
- `lead_transitions` jamais modifiée/supprimée (append-only).
- Au plus **un lead actif** (non terminal) par (conseiller × brief) après re-match (SC-008).

## Migrations (Phase tasks)

1. `2026XXXX_init_lead` — tables `leads`, `lead_transitions`, `lead_notification_outbox`, `consumed_matching_events` + enums + index + CHECK position.
2. `2026XXXX_lead_transitions_append_only` — trigger append-only + (si besoin) rôle DB least-privilege.
3. `2026XXXX_lead_anonymisation_cascade` — trigger `AFTER UPDATE` sur `intake_voyageur_briefs` → `leads.brief_id = NULL` (préserve `lead_transitions`).
