# ADR-0029 — Déclencheur des notifications voyageur (port intake vs 2e abonné bus)

**Date** : 2026-06-16
**Statut** : accepté (feature 017 / roadmap 010 — implémenté sur la branche `017-voyageur-notif-suivi`)
**Décideurs** : équipe technique
**Spec lié** : [017-voyageur-notif-suivi/spec.md](../../specs/017-voyageur-notif-suivi/spec.md)
**Plan lié** : [017-voyageur-notif-suivi/plan.md](../../specs/017-voyageur-notif-suivi/plan.md), Constitution Check V / X
**Research lié** : [017-voyageur-notif-suivi/research.md](../../specs/017-voyageur-notif-suivi/research.md), R2

---

## Contexte

Feature 010 notifie le **voyageur** quand son brief est matché/partiellement/non matché. Ces
issues sont signalées par les événements `voyageur.brief.matched|partially_matched|unmatched`
publiés par 011 sur le bus Redis `matching.events`. Le bus est **lossy** (ADR-0026) ; 012 a déjà
résolu la fiabilité côté conseiller : un consumer abonné + table de **déduplication**
(`consumed_matching_events`) + sweep de réconciliation des leads.

Question : **comment 010 déclenche-t-il la notification voyageur** à partir de ces mêmes
événements, sans doublon et sans bloquer ?

## Décision

**Le consumer matching existant (`ConsumeMatchingEventUseCase`), déjà abonné et dédupliqué,
appelle un port public exposé par intake — `VoyageurMatchNotifier.onBriefOutcome(...)` — après
son traitement.** Intake enqueue alors **une** `VoyageurNotification` (idempotente par la clé
d'événement) et en assure l'envoi (outbox + Dispatcher/Sender/Worker + mailer, mirroir 012).

- La notification voyageur **piggyback** sur la déduplication déjà faite par matching →
  **exactement une** notification par événement source.
- Le module **intake** OWNE le domaine notification voyageur (entité, outbox, envoi, annulation
  Loi 25). Le couplage est un **port public** (Principe V) ; MatchingModule importe déjà
  IntakeModule (depuis 016).
- L'**accusé d'activation** (US2) est déclenché **dans intake** (use case d'activation 008).

## Conséquences

**Positives** :
- **Pas de 2e abonné bus** côté intake → pas de duplication de l'abonnement Redis, de la table
  de dédup, ni du sweep de réconciliation (Scope S respecté, fiabilité réutilisée).
- Idempotence garantie en amont (dédup matching) + en aval (clé unique de notification).
- Frontières modulaires propres : intake OWNE la notification, matching ne fait que déclencher.

**Négatives / coûts** :
- Le consumer matching gagne une dépendance (le port intake) → matching « sait » qu'il faut
  notifier le voyageur. Mitigé : appel best-effort (un échec n'interrompt pas matching) via un
  port public, pas d'accès aux internes intake.
- Si demain un autre module doit réagir aux mêmes événements, on réévaluera un vrai bus
  multi-abonnés.

## Alternatives rejetées

| Alternative | Pourquoi rejetée |
|---|---|
| **2e abonné bus dans intake** (intake s'abonne à `matching.events`) | Plus découplé mais duplique abonnement + table de dédup + sweep de réconciliation pour gérer la perte (ADR-0026). Lourd pour Scope S. |
| **Matching crée la notification voyageur lui-même** | Mettrait le domaine notification voyageur (entité, templates, magic-link, Loi 25) dans le module matching — violation de cohésion. |
| **Trigger SQL** | Les événements ne sont pas une simple transition de colonne ; la logique (type, anti-spam, résolution publique) est applicative. |

## Points ouverts (calibration implémentation)

- Délai/fallback du cas non matché (immédiat retenu — clarification 2026-06-16) ; un éventuel
  rappel J+N si toujours non matché est hors périmètre (à évaluer post-MVP).
- Seuil exact « issue inchangée » pour l'anti-spam (FR-014) — à préciser en implémentation.
