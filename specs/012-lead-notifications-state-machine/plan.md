# Implementation Plan: Matching — notifications conseillers + machine d'état de lead

**Branch**: `012-lead-notifications-state-machine` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-lead-notifications-state-machine/spec.md`

## Summary

012 prolonge le module `matching` (011) côté aval : il **consomme** les 4 événements outbox publiés par 011 sur le bus interne (`matching.events`), crée une entité **Lead** par couple (conseiller vérifié × MatchingResultEntry), **notifie chaque conseiller individuellement** (un job BullMQ par destinataire, courriel FR-CA SES sans PII de contact), et pilote une **machine d'état de lead** append-only (`envoyé → vu → accepté → refusé → devis_envoyé → réservation_confirmée → perdu`). La machine d'état est une **fonction pure du domaine** (TDD strict, Principe VI). Aucune donnée transactionnelle (anti-marketplace, ADR-0002). Re-filtrage `verified` dynamique, cascade d'anonymisation Loi 25 préservant l'audit, concurrence optimiste, idempotence at-least-once. 012 expose un **port public `LeadQueryPort`** + des **endpoints HTTP conseiller**, consommés ensuite par 014 (dashboard) ; la communication voyageur est déléguée à 013/015.

## Technical Context

**Language/Version** : TypeScript ≥ 5 strict (stack figée constitution).

**Primary Dependencies** : NestJS + Fastify (interface/application), Prisma (infra), Redis pub/sub + BullMQ (bus + jobs), `@cv/email-templates` (react-email) + AWS SES ca-central-1 (ADR-0006), `@cv/shared/matching` (event-names, types), `ConformiteQueryPort` (001, statut verified), AuthGuard/RoleGuard (006, RBAC conseiller).

**Storage** : PostgreSQL ≥ 16 (tables `lead_*` dans le schéma matching), Redis (canal `matching.events` + queues BullMQ notifications).

**Testing** : Vitest (unit + property-based fast-check sur la machine d'état), Testcontainers (Postgres + Redis intégration), MSW si besoin. TDD strict sur le domaine.

**Target Platform** : AWS ECS Fargate ca-central-1 (worker BullMQ + API NestJS).

**Project Type** : web-service (backend NestJS, monolithe modulaire — module `matching`). Aucune UI livrée (014/015 ultérieurs).

**Performance Goals** : notification mise en file en < quelques secondes après réception de l'événement (SC-005) ; transitions d'état synchrones p95 < 800 ms (SLO Principe X).

**Constraints** : append-only sur l'historique des transitions (Loi 25/audit) ; aucune PII de contact voyageur dans les notifications ; concurrence optimiste ; idempotence at-least-once sur consommation d'événements et notifications.

**Scale/Scope** : régime nominal de démarrage (quelques briefs/minute en pointe) ; jusqu'à 3 leads + 3 notifications par matching ; pas d'exigence de débit massif au-delà des SLO généraux.

## Constitution Check

*GATE: Doit passer avant Phase 0. Re-vérifié après Phase 1.*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

✅ **Conforme**. 012 **ne touche jamais à la transaction** : `devis_envoyé` et `réservation_confirmée` sont des **marqueurs déclaratifs** du conseiller, sans montant, sans paiement, sans lien de réservation (FR-013). Seuls des conseillers **vérifiés au moment de l'action** sont notifiés / autorisés à agir, via re-filtrage `ConformiteQueryPort` (filtrage statut en amont de toute notification et de chaque transition, FR-008). Un conseiller révoqué après matching ne reçoit rien et ne peut plus agir. Les notifications ne divulguent **aucune coordonnée directe** du voyageur (FR-004, ADR-0002).

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

✅ **Conforme**. Données traitées minimisées : un lead référence `conseillerId`, `matchingResultEntryId` et un `briefId` (FK technique, neutralisable). Aucune PII voyageur n'est copiée dans les tables lead/notification. Tout reste en `ca-central-1` (Postgres + Redis + SES). **Cascade d'anonymisation** : trigger Postgres `AFTER UPDATE` sur `intake_voyageur_briefs` (→ `anonymized`) neutralise `briefId` sur les leads et **préserve `lead_transitions`** (audit, pattern hérité ADR-0023 de 011). Rétention selon le tableau de la constitution (audit conservé).

### III. Qualité de lead avant volume

✅ **Conforme**. 012 respecte le plafond 3 par construction (il consomme le top 3 déjà plafonné par 011 — SC-003 de 011). La **traçabilité d'état du lead** est instrumentée dès J1 (machine d'état append-only + métriques OTel), alimentant « % leads acceptés » et « conversion lead → devis → réservation » (Principe VII).

### IV. Français d'abord

✅ **Conforme**. Courriels conseiller et messages d'erreur HTTP en **FR-CA** via `@cv/email-templates` + clés i18n `matching.lead.*` ; dates `fr-CA`. Catalogue EN ajouté par i18n (jamais par fork).

### V. Architecture : monolithe modulaire

✅ **Conforme**. Module `matching` (012 = extension aval de 011, même module premier niveau). Imports cross-module via interfaces publiques uniquement : `ConformiteQueryPort` (001), `@cv/shared/matching` (event-names + types), Auth/Role guards (006). Aucun LLM (déterministe). 012 publie le port public `MATCHING_LEAD_QUERY_PORT` (consommé par 014/015).

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

✅ **Conforme par construction**. La **machine d'état du lead** est précisément la logique sensible visée : fonction pure `applyLeadTransition(currentState, action, actor) → Result<LeadState, TransitionError>` sans I/O. **Tests écrits AVANT** implémentation (commits RED séparés), tests de propriété (fast-check) pour les invariants (aucune transition illégale acceptée — SC-003 ; idempotence des montées — FR-020). Cas nominal ET cas d'erreur de chaque transition couverts.

### VII. Observabilité de la boucle économique

✅ **Conforme**. Métriques OTel : `lead.created` (counter), `lead.transition` (counter labelé `to_state`), `lead.notification_sent` / `lead.notification_failed`, taux d'acceptation et de conversion dérivables. Logs Pino structurés (PII-safe). Dashboard Grafana `docs/dashboards/matching-leads.json` + alertes (taux d'échec notification, latence). Lié dans le README du module.

### VIII. Clean Architecture et SOLID

✅ **Conforme**. 4 couches : `domain/` (LeadState VO, machine d'état pure, entité Lead, events), `application/` (use cases ConsumeMatchingEvent, NotifyConseiller, transitions ; ports), `infrastructure/` (adapters Prisma, SES mailer, BullMQ jobs, bus subscriber), `interface/` (controller HTTP conseiller). Ports granulaires (ISP), dépendances vers abstractions (DIP), machine d'état ouverte à l'extension via table de transitions (OCP).

### IX. Sécurité applicative (NON-NÉGOCIABLE)

✅ **Conforme**. Endpoints conseiller protégés `AuthGuard` + `RoleGuard @RequireRole('conseiller')` + autorisation au niveau use case (un conseiller n'agit que sur **ses** leads). Validation Zod côté serveur (params + body). Re-vérification `verified` à chaque action. Aucun secret nouveau (SES + Redis déjà gérés). Aucun SQL brut hors migrations/trigger (ADR). En-têtes HTTP hérités du middleware global. Idempotency-Key sur les actions sensibles.

### X. Fiabilité et résilience

✅ **Conforme**. SLO p95 < 800 ms sur les transitions synchrones. **Idempotence** : consommation d'événements dédupliquée (table `consumed-events` par `idempotencyKey`), notifications idempotentes par (conseiller × MatchingResult). **Modes dégradés** : (a) **Bus/Redis HS** → sweep de réconciliation périodique recrée les leads/notifications manquants (le pub/sub étant lossy) ; (b) **SES HS** → job BullMQ retries backoff + dead-letter, lead créé quand même ; (c) **DB HS** → worker retries. Concurrence optimiste sur les transitions (guard `WHERE state = expected`). Health checks hérités.

### Definition of Done

La DoD de la constitution sera cochée intégralement avant merge (tests TDD domaine, intégration Testcontainers, lint/typecheck/boundaries, métriques + dashboard, sécurité OWASP, doc FR-CA, ADRs, migrations testées staging).

## Project Structure

### Documentation (this feature)

```text
specs/012-lead-notifications-state-machine/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions techniques
├── data-model.md        # Phase 1 — entités + machine d'état
├── quickstart.md        # Phase 1 — scénarios de validation
├── contracts/           # Phase 1 — contrats (HTTP, port public, bus, outbox)
└── tasks.md             # Phase 2 — /speckit.tasks (non créé ici)
```

### Source Code (repository root)

```text
apps/api/src/modules/matching/
├── domain/
│   ├── value-objects/        lead-state.vo.ts (+ tests)
│   ├── services/             apply-lead-transition.ts (fonction pure, TDD) (+ tests)
│   ├── entities/             lead.entity.ts, lead-transition.entity.ts
│   └── events/               lead-events.ts (LeadCreated, LeadTransitioned…)
├── application/
│   ├── ports/                lead-writer / lead-reader / lead-notification-outbox /
│   │                         lead-notification-mailer / consumed-event-store ports (+ index)
│   └── use-cases/            consume-matching-event.use-case.ts,
│                             record-lead-transition.use-case.ts,
│                             view-lead.use-case.ts (auto-vu),
│                             reconcile-leads.use-case.ts (sweep)
├── infrastructure/
│   ├── prisma-lead-repository.ts, prisma-lead-notification-outbox.ts,
│   │   prisma-consumed-event-store.ts
│   ├── ses-lead-notification-mailer.ts
│   └── jobs/                 matching-events.consumer.ts (subscribe bus),
│                             lead-notification.job.ts (1 job/destinataire),
│                             lead-reconciliation.scheduler.ts
└── interface/
    └── http/                 conseiller-lead.controller.ts (GET/POST actions)

packages/email-templates/src/matching/
└── lead-received.tsx         # gabarit FR-CA, sans PII contact

packages/db/prisma/schema/matching.prisma   # + modèles lead_* (append-only)
packages/db/prisma/migrations/2026XXXX_*     # tables lead + triggers (append-only, cascade)
packages/shared/src/matching/                # + types/contrat LeadQueryPort si exposé cross-app
```

**Structure Decision** : extension du module `matching` existant (pas de nouveau module — Principe V, roadmap Tier 2). Réutilise les conventions 4 couches déjà éprouvées par 011 (VOs/services purs, ports DI `Symbol.for`, adapters Prisma/Redis/BullMQ, controller mince). Le port public lead est exposé via `@cv/shared/matching` pour 014/015.

## Complexity Tracking

> Aucune violation du Constitution Check à ce stade — section laissée vide.
