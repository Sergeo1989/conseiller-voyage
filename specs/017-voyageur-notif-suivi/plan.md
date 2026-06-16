# Implementation Plan: Notifications + magic-link de suivi voyageur

**Branch**: `017-voyageur-notif-suivi` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-voyageur-notif-suivi/spec.md` (roadmap **010**).

## Summary

Couche de **notification + suivi côté voyageur** par-dessus 008 (brief + magic-link + récap) et
003 (SES ca-central-1). Le module **intake** OWNE le cycle de la `VoyageurNotification` (outbox
+ Dispatcher/Sender/Worker + mailer + templates react-email + annulation Loi 25), **mirroir
exact** du pattern conseiller de 012. Trois déclencheurs : (US2) **accusé d'activation** émis par
le use case d'activation 008 ; (US1) **« conseillers prêts » / « on cherche »** déclenché par le
consumer matching **déjà dédupliqué** (`ConsumeMatchingEventUseCase`) via un **port public intake**
`VoyageurMatchNotifier` (piggyback sur la dédup → 1 notif/événement, **sans** 2e abonné bus). Le
mailer résout **prénom + spécialité publics** (007) au send (jamais de contact, anti-marketplace),
insère un **lien de suivi** (magic-link `view_brief_status` de 008, renvoyable). Idempotent,
mode dégradé courriel, cascade Loi 25, FR-CA/i18n. ADR-0029. Le **contenu** de l'espace voyageur
reste à 015.

## Technical Context

**Language/Version** : TypeScript ≥ 5 strict.

**Primary Dependencies** : NestJS + Fastify · Prisma · **BullMQ** (file `intake.voyageur-notifications`) ·
**AWS SES ca-central-1** (003) · **react-email** (`@cv/email-templates`) · OTel. Réutilise
l'infra magic-link de 008 + le port public profil 007.

**Storage** : PostgreSQL — nouvelle table `intake_voyageur_notifications` (outbox append-only,
`idempotencyKey` UNIQUE) + enums. Aucune modif des tables 008/matching.

**Testing** : Vitest (fonctions pures `selectNotificationForOutcome` + sélection/anti-spam,
**TDD** ; invariant anti-PII/anti-marketplace) · Testcontainers (enqueue idempotent, cascade
annulation, dispatch, mode dégradé) · mailer stub.

**Target Platform** : API NestJS (ECS Fargate ca-central-1) + worker BullMQ. Pas de front nouveau
(le lien route vers la page récap 008 existante).

**Performance Goals** : envoi **asynchrone** (n'affecte jamais soumission/activation/matching,
SC-003) ; 1 job/destinataire ; backoff sur SES HS.

**Constraints** : anti-marketplace (0 contact conseiller / 0 montant — FR-002/009) ; Loi 25
(région CA + annulation à l'effacement — FR-008/010) ; fiabilité (idempotence + mode dégradé —
FR-005/006) ; FR-CA/i18n.

**Scale/Scope** : régime de démarrage ; 1 module backend, 1 table, 1 port public + 1 port de
lecture, 3 classes job + 1 mailer + 2 templates.

## Constitution Check

*GATE : passé avant Phase 0, re-vérifié après Phase 1.*

### I. Conformité réglementaire (NON-NÉGOCIABLE) — ✅ PASS
Aucune touche transactionnelle. La notification « prêts » **ne contient ni montant, ni paiement,
ni réservation, ni coordonnée de contact** de conseiller ; le seul CTA renvoie au récap/espace
(intake-unique-route, ADR-0002). Seuls **prénom + spécialité publics** (007) apparaissent
(clarification 2026-06-16). Conseillers concernés = **vérifiés** uniquement (filtre 012 + re-check
public au send). Invariant anti-marketplace testé.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ PASS
Le destinataire est le **voyageur** (sa propre donnée ; consentement d'intake 008/004 couvre les
notifications transactionnelles). **Minimisation** : la table ne stocke que des **IDs techniques**
(pas de prénom/spécialité figés, résolus au send et jamais persistés) ; aucune coordonnée. **Région
CA** (SES 003, FR-008). **Effacement** : annulation des notifications en attente par
`RequestBriefErasure` (FR-010, SC-005). **Anti-PII defense-in-depth** : scan étendu à la table.

### III. Qualité de lead avant volume — ✅ PASS
Ferme la boucle côté voyageur (re-engagement, SC-009) sans toucher au scoring/plafond 3
(consomme les événements 011/012 en lecture). Pas de logique de matching.

### IV. Français d'abord — ✅ PASS
Templates react-email **FR-CA** par défaut + **EN** via catalogues (FR-011). Ton rassurant pour
`recherche_en_cours` (FR-003, SC-008). Formats `fr-CA`.

### V. Architecture : monolithe modulaire — ✅ PASS
Module **intake** OWNE la notification ; couplage inter-module **uniquement** via interfaces
publiques : `VoyageurMatchNotifier` (intake → consommé par matching) et
`ConseillerPublicDisplayReader` (profil 007). Pas de LLM. Mirroir 012 (DRY de pattern).

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ PASS
Logique sensible nouvelle = **fonction pure** `selectNotificationForOutcome` (type selon issue +
**suppression anti-spam** si issue inchangée) + l'invariant de rendu (pas de PII/contact).
**TDD obligatoire** (tests avant impl, commits séparés ; cas nominal + erreur).

### VII. Observabilité — ✅ PASS
Métriques OTel `cv.intake.voyageur_notification.*` (enqueued/sent/failed/cancelled par type) +
**ré-engagement** (visites récap post-notification, SC-009). Logs structurés sans PII.

### VIII. Clean Architecture & SOLID — ✅ PASS
`domaine` : `selectNotificationForOutcome` (pur), VO statut/type, interfaces de port. `application` :
le notifier + le use case d'enqueue/dispatch. `infrastructure` : outbox Prisma, Dispatcher/Sender/
Worker BullMQ, mailer SES, adapter `ConseillerPublicDisplayReader`. DIP/SRP respectés.

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ PASS
Pas de nouvel endpoint HTTP (déclenchement interne par event/port ; le lien réutilise la route
récap 008 protégée par magic-link hashé ADR-0018). Le port `VoyageurMatchNotifier` ne reçoit que
des IDs techniques. Aucun secret en clair (SES via Secrets Manager). Anti-énumération conservée
(ResendMagicLink réponse uniforme). Pas de SQL brut applicatif.

### X. Fiabilité et résilience — ✅ PASS
**Idempotence** par `idempotencyKey` (UNIQUE) ; **1 job/destinataire** ; **mode dégradé** courriel
(re-throw → backoff, outbox non drainée — jamais de blocage de soumission/activation/matching) ;
piggyback sur la dédup matching (pas de double notification) ; skip si brief anonymisé.

### Definition of Done
DoD constitution cochée : Vitest (purs TDD) + Testcontainers verts ; lint/tsc/boundaries ;
invariant anti-marketplace/anti-PII ; scan anti-PII (table notifications) ; FR-CA/i18n ;
**ADR-0029** mergé ; migration testée en staging ; métriques exposées.

## Project Structure

### Documentation (this feature)

```text
specs/017-voyageur-notif-suivi/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/ports.md
└── tasks.md   (/speckit-tasks — non créé ici)
```

### Source Code (repository root)

```text
apps/api/src/modules/intake/
├── domain/services/select-notification-for-outcome.ts   # fonction PURE (TDD)
├── application/
│   ├── ports/voyageur-notification-outbox.port.ts
│   ├── ports/voyageur-match-notifier.port.ts            # PUBLIC (consommé par matching) → @cv/shared/intake
│   └── use-cases/ (enqueue-activation-ack, notify-brief-outcome, cancel-on-erasure [extension])
├── infrastructure/
│   ├── prisma-voyageur-notification-outbox.ts
│   ├── jobs/voyageur-notification.job.ts                # Dispatcher + Sender + Worker (mirror 012)
│   ├── ses-voyageur-notification-mailer.ts
│   ├── prisma-conseiller-public-display-reader.ts       # adapter port profil 007
│   └── otel-voyageur-notification-metrics-recorder.ts
└── intake.module.ts                                     # + DI (outbox, jobs, mailer, notifier, reader)

apps/api/src/modules/matching/
└── application/use-cases/consume-matching-event.use-case.ts  # + appel VoyageurMatchNotifier

packages/shared/src/intake/        # type/symbole VoyageurMatchNotifier + enums notification
packages/shared/src/profil-public/ # ConseillerPublicDisplayReader (port public 007)
packages/email-templates/src/intake/ # voyageur-advisors-ready + voyageur-activation (FR-CA/EN)
packages/db/prisma/schema/intake.prisma # + model VoyageurNotification + enums + migration
tools/check-no-pii-matching-audit.ts  # scan étendu à intake_voyageur_notifications
docs/adr/0029-voyageur-notification-trigger.md
```

**Structure Decision** : backend-only, module `intake` (mirroir 012). Le seul ajout cross-module
est l'appel du port public `VoyageurMatchNotifier` depuis le consumer matching existant + la
lecture du port public profil 007. Aucun front nouveau.

## Complexity Tracking

> Aucune violation. Le piggyback sur la dédup matching évite de dupliquer abonné/dedup/sweep
> (plus simple, pas plus complexe). Pas de *Complexity Tracking* requis.

## Phasing

- **Phase 0 — research.md** : ownership intake, déclencheur (port vs 2e abonné), résolution
  prénom/spécialité au send, magic-link 008, SES/react-email, Loi 25, anti-spam, observabilité. ✅
- **Phase 1 — data-model + contracts + quickstart** : `VoyageurNotification`, ports, flux, modes
  dégradés. ✅ + **ADR-0029** (déclencheur).
- **Phase 2 — tasks.md** (`/speckit-tasks`) : Setup → Foundational (table + ports + enums) → US1
  (notif matching, TDD `selectNotificationForOutcome` d'abord) → US2 (accusé activation) → US3
  (lien de suivi/renvoi) → Polish (scan anti-PII, métriques, cascade Loi 25, invariant, docs).
