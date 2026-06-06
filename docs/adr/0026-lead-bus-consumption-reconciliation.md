# ADR-0026 — Consommation du bus matching + sweep de réconciliation des leads

**Date** : 2026-06-05
**Statut** : proposé (feature 012)
**Décideurs** : équipe technique
**Spec lié** : [012-lead-notifications-state-machine/spec.md](../../specs/012-lead-notifications-state-machine/spec.md), FR-001 + FR-003 + FR-011
**Plan lié** : [012-lead-notifications-state-machine/plan.md](../../specs/012-lead-notifications-state-machine/plan.md), Constitution Check Principe X
**Research lié** : [012-lead-notifications-state-machine/research.md](../../specs/012-lead-notifications-state-machine/research.md), R1 + R3

---

## Contexte

012 est piloté exclusivement par les 4 événements de matching publiés par 011
sur le canal Redis pub/sub `MATCHING_PUBSUB_CHANNEL` (`matching.events`, drainé
par 011/T093 depuis `matching_outbox_entries`).

Contraintes :

- FR-001 : consommer les 4 événements (`matched`, `partially_matched`, `unmatched`, `all_matches_revoked`).
- FR-003 : notification idempotente par (conseiller × MatchingResult).
- FR-011 : acheminement résilient, reprise après panne du bus **ou** du courriel, sans doublon perçu.
- Principe X : modes dégradés explicites (bus HS, SES HS, DB HS).

Le pub/sub Redis est à **faible latence mais lossy** : un message émis pendant
que le consumer est arrêté est définitivement perdu. Un consumer pub/sub seul
violerait donc FR-011.

## Décision

**Double mécanisme** — temps réel + filet de complétude :

1. **Consumer pub/sub** (`MatchingEventsConsumer`) — s'abonne à `matching.events`,
   route par `name` (kebab-case, mapping `@cv/shared/matching`), déduplique via
   la table `consumed_matching_events` (clé = `idempotencyKey` de l'événement),
   puis délègue à `ConsumeMatchingEventUseCase`.

2. **Sweep de réconciliation** (`LeadReconciliationScheduler`, BullMQ repeatable)
   — scanne périodiquement les `MatchingResult` actifs (`ok`/`partial`) **sans
   lead correspondant** et rejoue la création + les notifications. Garantit la
   complétude (FR-011) même si le bus a perdu des messages (mode dégradé « bus HS »).
   011 et 012 étant dans le **même module** `matching`, le sweep lit directement
   les tables matching (pas de franchissement de frontière).

### Idempotence at-least-once (double barrière)

- **Dédup événement** : `consumed_matching_events.idempotencyKey` (PK).
- **Contrainte DB** : `UNIQUE (conseillerId, matchingResultId)` sur `leads` +
  `UNIQUE idempotencyKey = lead:{conseillerId}:{matchingResultId}` sur
  `lead_notification_outbox`.

Le replay d'un événement (par le bus **ou** par le sweep) ne crée jamais de
doublon de lead ni de notification.

### Notifications sortantes (résilience SES)

Pattern outbox + **un job BullMQ par destinataire** (Principe X, jamais un job
groupé). Le job résout l'adresse via le module identité au moment de l'envoi
(jamais stockée), re-vérifie `verified`, rend `lead-received.tsx` et envoie via
SES. Échec → `failed` + backoff/dead-letter, le lead reste créé (mode dégradé
« SES HS »).

## Conséquences

### Positives

1. **Complétude garantie** (FR-011) sans coupler 012 au draineur d'outbox de 011.
2. **Faible latence nominale** via pub/sub, le sweep ne sert que de filet.
3. **Exactly-once effectif** côté effet de bord malgré l'at-least-once du bus.
4. **Modes dégradés couverts** : bus HS (sweep), SES HS (retry/dead-letter), DB HS (worker retry).

### Négatives / risques

1. **Latence du sweep** — un événement perdu n'est rejoué qu'au prochain passage du sweep. Mitigation : intervalle court (quelques minutes) ; le pub/sub couvre le cas nominal.
2. **Lecture cross-feature intra-module** — le sweep lit `matching_results`. Acceptable : même module `matching` (Principe V respecté, pas de frontière franchie).

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| Consommer directement `matching_outbox_entries` | Table propriété du publisher T093 (sémantique `publishedAt` dédiée) — deux consommateurs brouilleraient l'invariant |
| BullMQ Streams durable à la place du pub/sub | Surdimensionné pour le MVP, romprait le contrat de bus établi par 011 |
| Pub/sub seul sans sweep | Viole FR-011 (perte d'événements en cas de panne) |
| Un seul job multi-destinataires | Interdit par le Principe X |

## Statut d'implémentation

À compléter (statut → accepté) à la fin de la Phase 5 (US3) avec les notes
d'implémentation et les références de tests (T029-T032, T045-T046, T053).
