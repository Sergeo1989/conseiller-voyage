# Data Model — Notifications + magic-link de suivi voyageur (017 / roadmap 010)

Phase 1. Module **intake**. Une table additive (notifications). Réutilise magic-link de 008.
Région CA (Loi 25).

## Entité : `VoyageurNotification` (nouvelle)

Outbox des notifications voyageur (un envoi par notification). Append-only pour l'audit.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | PK ; sert de `jobId` BullMQ (idempotence dispatch) |
| `briefId` | uuid | FK logique → `intake_voyageur_briefs.id` |
| `type` | enum `VoyageurNotificationType` | `accuse_activation` \| `conseillers_prets` \| `recherche_en_cours` |
| `status` | enum `VoyageurNotificationStatus` | `en_attente` \| `envoyee` \| `echouee` \| `annulee` |
| `idempotencyKey` | text | **UNIQUE** ; clé de l'événement source (`activation:{briefId}` ou la clé d'événement matching) → anti-doublon (FR-005) |
| `outcome` | enum `MatchOutcome` \| null | pour les types matching : `matched` \| `partially_matched` \| `unmatched` |
| `conseillerIds` | jsonb (uuid[]) | conseillers appariés (pour résolution prénom/spécialité au send) ; **aucune** PII figée ici |
| `attempts` | int | tentatives d'envoi (backoff) |
| `lastError` | text \| null | message d'échec (sans PII — scan) |
| `createdAt` / `sentAt` | timestamptz | |

**Invariants** (testés) :
- `idempotencyKey` UNIQUE → un événement source ne produit jamais 2 notifications (FR-005).
- `status = annulee` ⇒ jamais envoyée (cascade Loi 25, FR-010).
- `conseillerIds` ne contient que des **IDs techniques** (pas de PII) ; le prénom/spécialité
  est résolu au send et **jamais persisté** ici (minimisation + scan anti-PII).
- Aucun champ montant/contact (anti-marketplace, invariant testé).

## Réutilisé (008) : `MagicLinkToken`

Lien de suivi = jeton `purpose = view_brief_status` frais inséré dans chaque courriel, routant
vers `/[locale]/(voyageur)/voyage/[token]` (page récap existante). Renvoi via
`ResendMagicLinkUseCase` (US3). **Aucune nouvelle table.**

## Consommé (011/012, existant) : événements de matching

`voyageur.brief.matched` / `partially_matched` / `unmatched` (bus `matching.events`). Le
consumer matching déduplique déjà (`consumed_matching_events`) → déclenche le notifier intake.

## Flux & déclencheurs

- **Accusé d'activation** (US2) : le use case d'activation 008 (vérif magic-link) enqueue une
  `VoyageurNotification(type=accuse_activation, key=activation:{briefId})`.
- **Matché/partiel/non matché** (US1) : `ConsumeMatchingEventUseCase` (matching) appelle le port
  public intake `VoyageurMatchNotifier.onBriefOutcome(...)` → enqueue
  `VoyageurNotification(type ∈ {conseillers_prets, recherche_en_cours}, outcome, conseillerIds,
  key=event idempotencyKey)`. Anti-spam : pas de ré-enqueue si l'issue est inchangée (FR-014).
- **Envoi** : `VoyageurNotificationDispatcher` (scan pending) → `…Sender` (résout prénom/
  spécialité via `ConseillerPublicDisplayReader` + génère un magic-link de suivi + rend le
  template + envoie SES) → `…Worker` (re-throw sur échec → backoff).
- **Annulation Loi 25** : `RequestBriefErasureUseCase` (intake) passe les notifications en
  attente du brief à `annulee`.

## Fonction pure : `selectNotificationForOutcome` (logique testée, Principe VI)

`(outcome, matchedCount) → { type, suppressed? }` :
- `matched` (3) ou `partially_matched` (1–2) → `type = conseillers_prets`.
- `unmatched` (0) → `type = recherche_en_cours` (ton rassurant, FR-003).
- Si l'issue est identique à la dernière notifiée du brief → **supprimée** (anti-spam, FR-014).

## Migration

Nouvelle migration Prisma : table `intake_voyageur_notifications` + enums. Aucune modif des
tables 008/matching.
