# Research — 012 notifications conseillers + machine d'état de lead

Décisions techniques résolvant les inconnues du plan. Format : Décision / Rationale / Alternatives.

## R1 — Consommation des événements de matching

**Décision** : un consumer s'abonne au canal Redis pub/sub `MATCHING_PUBSUB_CHANNEL` (`matching.events`, publié par 011/T093) et route par `name` (kebab-case). Idempotence via une table `consumed-events` (clé = `idempotencyKey` de l'événement). **En complément**, un **sweep de réconciliation** périodique (BullMQ repeatable) scanne les `MatchingResult` actifs (`ok`/`partial`) **sans lead correspondant** et rejoue la création (mode dégradé « bus HS »).

**Rationale** : le pub/sub Redis est à faible latence mais **lossy** (un message émis pendant que le consumer est arrêté est perdu). Le sweep garantit la complétude (FR-011) sans coupler 012 au draineur d'outbox de 011. 011 et 012 étant dans le **même module** `matching`, le sweep peut lire directement les tables matching (pas de franchissement de frontière).

**Alternatives** : (a) consommer directement `matching_outbox_entries` (durable) — rejeté car cette table est la propriété du publisher T093 (sémantique `publishedAt` dédiée au bus) ; mélanger deux consommateurs brouillerait l'invariant. (b) Remplacer pub/sub par une BullMQ Streams durable — surdimensionné pour le MVP, romprait le contrat de bus établi par 011. (c) Pub/sub seul sans sweep — viole FR-011 (perte d'événements en cas de panne).

## R2 — Envoi des notifications conseiller (SES)

**Décision** : suivre le **pattern per-module** déjà en place (cf. `mfa-notification-mailer.port` + `ses-mfa-notification-mailer`, `magic-link-mailer.port`) : un port `LeadNotificationMailer` (application) + un adapter `SesLeadNotificationMailer` (infrastructure) qui rend un gabarit `packages/email-templates/src/matching/lead-received.tsx` (react-email, FR-CA) et l'envoie via SES ca-central-1. **Un job BullMQ par destinataire** (pattern `bullmq-notification` conformité), idempotent.

**Rationale** : il n'existe pas de module « notifications » centralisé — 003 = l'infrastructure SES partagée (`@cv/email-templates` + adapters SES par module). Réutiliser ce pattern respecte le Principe V et évite un couplage transverse. Un job par destinataire est exigé par le Principe X (jamais un job pour 3 conseillers).

**Alternatives** : un seul job multi-destinataires — **interdit** (constitution). Envoi synchrone inline dans le consumer — rejeté (couple latence SES au traitement d'événement, non résilient).

## R3 — Idempotence des leads et notifications

**Décision** : contrainte **UNIQUE (conseillerId, matchingResultId)** sur la table `leads` → un replay d'événement ne crée pas de doublon. La notification est portée par un outbox `lead_notification_outbox` avec UNIQUE sur `idempotencyKey = lead:{conseillerId}:{matchingResultId}`. La consommation d'événement est dédupliquée en amont par `consumed-events`.

**Rationale** : double barrière (dédup événement + contrainte DB) garantit l'exactly-once effectif côté effet de bord, malgré l'at-least-once du bus.

**Alternatives** : dédup applicative seule (sans contrainte DB) — fragile en concurrence. Pas de dédup — viole SC-001/FR-003.

## R4 — Machine d'état (fonction pure, TDD)

**Décision** : `applyLeadTransition(current: LeadState, action: LeadAction, actor: Actor) → Result<LeadState, TransitionError>`, pure, sans I/O. Table de transitions autorisées :
`envoyé → {vu, perdu}`, `vu → {accepté, refusé, perdu}`, `accepté → {devis_envoyé, perdu}`, `devis_envoyé → {réservation_confirmée, perdu}`, états terminaux `{refusé, réservation_confirmée, perdu}`. Les montées identiques (ex. `vu` quand déjà `vu`) renvoient un **no-op idempotent** (pas de nouvelle transition). Tests RED avant GREEN + property tests (aucune transition hors table acceptée).

**Rationale** : Principe VI non négociable — le cœur métier doit être déterministe et testé avant implémentation. La table explicite rend l'invariant SC-003 trivialement vérifiable.

**Alternatives** : machine d'état implicite dispersée dans les use cases — rejeté (non testable en isolation, viole VI). Librairie XState — surdimensionné, ajoute une dépendance pour une logique triviale.

## R5 — Persistance append-only de l'historique

**Décision** : table `lead_transitions` **append-only**, protégée par un trigger Postgres `BEFORE UPDATE OR DELETE OR TRUNCATE` (réutilise la fonction `raise_append_only_error` déjà déployée par 001/008/011). L'état courant du lead est dérivé/dénormalisé sur `leads.current_state` (mis à jour transactionnellement avec l'insert de transition).

**Rationale** : pattern d'audit Loi 25 déjà éprouvé sur 3 features. Dénormaliser `current_state` permet le guard de concurrence optimiste sans recalcul.

**Alternatives** : event sourcing pur (pas de colonne état) — surcoût de lecture injustifié. Mutation in-place sans historique — viole FR-007.

## R6 — Cascade d'anonymisation Loi 25

**Décision** : trigger Postgres `AFTER UPDATE` sur `intake_voyageur_briefs` quand `status → 'anonymized'` : met `leads.brief_id = NULL` pour les leads liés ; **ne touche jamais** `lead_transitions` (audit préservé). Pattern et garanties hérités d'ADR-0023 (011).

**Rationale** : atomicité DB, aucune fenêtre de PII orpheline, indépendant de la disponibilité d'un worker. Audit Loi 25 intact.

**Alternatives** : job applicatif consommant `voyageur.brief.deleted` — latence + risque de rétention si worker HS (cf. ADR-0023 alternatives rejetées).

## R7 — Re-filtrage dynamique du statut vérifié

**Décision** : `ConformiteQueryPort.getVerificationStatus(conseillerId)` est interrogé (a) **avant** chaque notification (exclusion + trace si non vérifié), (b) **à chaque transition** initiée par un conseiller (rejet si non vérifié). Pas de copie locale du statut.

**Rationale** : FR-008 + Principe I. La conformité (001) est seule autorité du statut, avec sa propre latence de propagation < 10 s.

**Alternatives** : snapshot du statut au matching — rejeté (un conseiller révoqué après matching pourrait agir).

## R8 — Re-matching (supersession des leads)

**Décision** : à la réception d'un nouvel événement `matched`/`partially_matched` portant un `matchingResultId` différent pour un `briefId` déjà traité, 012 détecte le(s) `MatchingResult` superseded (via le chaînage `supersededByMatchingResultId` de 011, lu par `MatchingResultReader`) et **clôt en `perdu`** (motif système `re-matched`) les leads non terminaux associés, puis crée les nouveaux leads (FR-018, SC-008). Un conseiller présent dans l'ancien et le nouveau top-3 obtient un nouveau lead + une nouvelle notification (idempotence par `matchingResultId` distinct).

**Rationale** : réutilise l'invariant de supersession déjà livré par 011 (TriggerRematch). Garde un seul lead **actif** par (conseiller × brief).

**Alternatives** : nouvel état `supersédé` — rejeté en clarification (étend la machine d'état). Laisser les anciens leads actifs — rejeté (double comptage, confusion).

## R9 — Observabilité

**Décision** : meter OTel `cv.matching.lead` — counters `lead.created`, `lead.transition{to_state}`, `lead.notification_sent`, `lead.notification_failed` ; dérivation des taux d'acceptation et de conversion. Logs Pino structurés (PII-safe : ids techniques + états uniquement). Dashboard `docs/dashboards/matching-leads.json` + alertes (taux d'échec notification > seuil, latence notification, taux d'acceptation anormalement bas). CLI anti-PII étendu/dupliqué pour scanner les tables lead.

**Rationale** : Principe VII — 012 alimente directement 2 des 4 métriques de la boucle économique.

**Alternatives** : métriques calculées a posteriori en SQL ad hoc — rejeté (SC-007 exige une exploitabilité directe).

## R10 — Traitement de `unmatched` et `all_matches_revoked`

**Décision** : `unmatched` → aucun lead, aucune notification, simple trace (la prise en charge admin du non-matché reste celle de 008). `all_matches_revoked` → aucun conseiller notifié, leads concernés clôturés en `perdu` ; **l'alerte admin réutilise** l'événement déjà émis par 011 et consommé par la file admin 008-US5 (pas de nouveau canal d'alerte en 012). Conforme FR-012.

**Rationale** : évite la duplication d'un mécanisme d'alerte admin existant (Principe V, DRY).

**Alternatives** : 012 crée sa propre alerte admin — duplication rejetée. 012 ignore l'événement — laisse des leads non clôturés (rejeté).
