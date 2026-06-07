# Implementation Plan: Conversation conseiller ↔ voyageur (post-acceptation)

**Branch**: `014-conversation-conseiller-voyageur` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-conversation-conseiller-voyageur/spec.md`

## Summary

Backbone de **conversation post-acceptation** dans le module `matching`. Quand un lead
passe à `accepté` (012), un **fil** s'ouvre par couple (conseiller × lead). Les parties
échangent des **messages texte** + **pièces jointes** (devis PDF transmis tels quels,
stockés S3 ca-central-1, URL signées). Une **notification par destinataire** (BullMQ →
SES via 003). L'éligibilité à l'écriture (lead non terminal-négatif + conseiller vérifié)
est **lue** via le port public de 012 (`MatchingLeadQueryPort`) + conformité (001) — la
machine d'état n'est pas ré-implémentée. Cascade **anonymisation Loi 25** (audit préservé),
**idempotence** d'envoi, **cloisonnement** des fils. Expose un **port public** +
**endpoints HTTP** (conseiller/voyageur) + **UI minimale**. **Anti-marketplace strict**
(ADR-0002) : zéro montant/paiement/lien de réservation, devis = fichier opaque, mention
permanente, règlement hors plateforme.

## Technical Context

**Language/Version**: TypeScript ≥ 5 strict.

**Primary Dependencies**: NestJS + Fastify · Prisma (PostgreSQL ≥ 16) · Redis ≥ 7 + BullMQ ·
AWS S3 ca-central-1 (ADR-0001, URL signées) · AWS SES via module 003 · react-email · Pino ·
@nestjs/swagger · Zod. Front : Next.js App Router (RSC) + next-intl + Tailwind v4.

**Storage**: PostgreSQL (conversations, messages, métadonnées de pièces jointes, idempotence,
outbox de notification) ; **S3 ca-central-1** (fichiers des pièces jointes, hors DB).

**Testing**: Vitest (domaine pur + use cases via fakes), Testcontainers Postgres+Redis
(intégration), MSW (S3/SES simulés), Playwright + axe-core (UI minimale).

**Target Platform**: API NestJS (ECS Fargate ca-central-1) + Next.js (CloudFront).

**Project Type**: Web (monolithe modulaire — module `matching`, backend + slice front).

**Performance Goals**: p95 **envoi de message (endpoint synchrone) < 800 ms** (SLO X) ;
p95 mise en file de la notification **< 5 s**.

**Constraints**: anti-marketplace (0 montant/paiement/réservation — ADR-0002) ; écriture
seulement si lead ∈ {accepté, devis_envoyé, réservation_confirmée} ET conseiller vérifié ;
fils cloisonnés ; idempotence d'envoi ; Loi 25 (région canadienne + cascade + audit) ;
pièces jointes validées (type/poids) et servies par URL signée à durée limitée.

**Scale/Scope**: régime nominal de démarrage (quelques fils actifs simultanés) ; backbone
+ UI minimale. Pas d'exigence de débit massif au-delà des SLO généraux.

## Constitution Check

*GATE : passer avant Phase 0, re-vérifier après Phase 1.*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE) — ✅ PASS

**La plateforme ne touche à aucune transaction.** Aucun montant, aucun champ de paiement,
aucun lien de réservation interne n'est stocké/structuré/affiché (FR-009, SC-003). Un devis
est un **fichier opaque** (S3), jamais un objet transactionnel. Mention permanente dans
chaque fil (FR-010). **Re-filtrage `verified`** au moment de l'écriture, vérifié en couche
application/DB via conformité (001) + état lead via `MatchingLeadQueryPort` (012) (FR-005).

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ PASS

Données personnelles : contenu des messages + pièces jointes. **Minimisation** (mise en
garde Loi 25 contre l'envoi de données sensibles ; pas d'extraction). **Région canadienne**
(PostgreSQL + S3 ca-central-1). **Effacement** : l'anonymisation d'une partie neutralise le
contenu PII des messages et **supprime** les pièces jointes liées, en **préservant la piste
d'audit** non-PII (FR-011, SC-006). Rétention selon le tableau de la constitution. Consentement
acquis à l'intake (008) ; le fil n'existe qu'après acceptation.

### III. Qualité de lead avant volume — ✅ N/A justifié

Ne touche ni au scoring ni au plafond 3 ; **lit** l'état du lead via 012 sans écrire de
transition (FR-015). Alimente la boucle économique en signal « échange engagé / devis
transmis » (cf. VII).

### IV. Français d'abord — ✅ PASS

Copie, notifications, mention anti-transaction et erreurs en **FR-CA** ; clés i18n pour EN
futur (024) (FR-013).

### V. Architecture : monolithe modulaire — ✅ PASS

Vit dans le module `matching`. Couplage cross-module via **interfaces publiques** uniquement :
`MatchingLeadQueryPort` (012), `ConformiteQueryPort` (001, statut vérifié), module 003 (SES).
Expose son propre **port public** `ConversationQueryPort` (consommé par 014/015). Pas
d'import profond. Pas de LLM.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ PASS (TDD strict)

Fonctions **pures du domaine**, testées **avant** implémentation (commits rouge/vert séparés) :
`canWrite(leadState, conseillerVerifie)` (autorisation d'écriture), `validateMessage(body)`
(non vide, longueur max), `validateAttachment(type, size)` (types/poids), dérivation du statut
d'écriture du fil. Idempotence (dedup par clé) testée.

### VII. Observabilité de la boucle économique — ✅ PASS

Instrumente « fils ouverts », « messages envoyés », « pièces jointes (devis) transmises » —
signaux pour la conversion *lead → devis → réservation* (le « devis_envoyé » reste piloté
par 012 ; ici on observe l'échange). Métriques OTel + logs structurés (pattern 012).

### VIII / VIII.a. Clean Architecture + conventions front — ✅ PASS

4 couches : domaine pur (entités/VO/services) ← application (ports + use cases) ←
infrastructure (Prisma, S3, SES, BullMQ) ; interface mince (contrôleurs NestJS + Server
Actions Next.js). Front : slice `apps/web/src/features/conversation` (RSC + 1 server action
`send-message`, state serveur via TanStack Query/refresh). Aucun import infra dans domaine/app.

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ PASS

**RBAC en couche application** : seule une partie **membre du fil** lit/écrit (autorisation
vérifiée use case + filtre DB). **Validation Zod** côté serveur (corps, type/poids pièce
jointe). **Upload sécurisé** : S3 (hors webroot), **URL signées à durée limitée**, types
restreints (PDF + images), pas d'exécution ; **scan antivirus différé** (Tier 5) — risque
noté. En-têtes HTTP globaux. Aucun secret en clair, aucun SQL brut. OWASP (upload, IDOR sur
fil/pièce jointe → autorisation stricte) revu.

### X. Fiabilité et résilience — ✅ PASS

p95 envoi < 800 ms (SLO). **Idempotence** d'envoi (clé) (FR-004). **Outbox + retry** de
notification (au moins une fois, sans doublon) (FR-012). Modes dégradés : SES HS → outbox
retient et rejoue ; S3 HS → l'envoi de **texte** reste possible, la pièce jointe échoue
proprement (FR-008) ; DB primaire HS → documenté. Health checks exposés.

### Definition of Done — engagement

DoD cochée avant merge : tests (Vitest pur + Testcontainers + Playwright axe), lint Biome,
tsc, a11y (axe-core CI), perf (SLO), métriques produit, sécurité OWASP (upload/IDOR),
copie FR-CA, **ADR-0027** (pièces jointes anti-transaction + URL signées + rétention),
migration testée en staging.

**Verdict** : aucune violation. Pas de *Complexity Tracking* requis.

## Project Structure

### Documentation (this feature)

```text
specs/014-conversation-conseiller-voyageur/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/{conversation-query.port.md, http-endpoints.md, notifications-and-storage.md}
└── tasks.md   (/speckit-tasks — non créé ici)
```

### Source Code (repository root)

```text
packages/db/prisma/schema/matching.prisma
  └── + models Conversation, ConversationMessage, ConversationAttachment,
        ConversationNotificationOutbox, ConsumedConversationEvent + enums + migration

packages/shared/src/matching/
  ├── conversation-query.port.ts     # PORT PUBLIC (vues fil/messages, sans PII superflue)
  ├── conversation-branded-ids.ts    # ConversationId / MessageId / AttachmentId
  └── index.ts                       # réexport

apps/api/src/modules/matching/
  ├── domain/
  │   ├── entities/{conversation.entity.ts, conversation-message.entity.ts}
  │   ├── value-objects/{message-body.vo.ts, attachment-meta.vo.ts}
  │   └── services/conversation-policy.ts   # PUR : canWrite, validateMessage, validateAttachment
  ├── application/
  │   ├── ports/{conversation-repo.port.ts, attachment-storage.port.ts,
  │   │          conversation-notification-outbox.port.ts, conversation-mailer.port.ts,
  │   │          lead-eligibility-reader.port.ts, conseiller-verification-reader.port.ts}
  │   └── use-cases/{open-conversation-on-accept, send-message, list-messages,
  │                  create-attachment-upload, get-attachment-url, anonymize-conversation-loi25}
  ├── infrastructure/
  │   ├── prisma-conversation-repository.ts · prisma-conversation-notification-outbox.ts
  │   ├── s3-attachment-storage.ts (ca-central-1, URL signées)
  │   ├── ses-conversation-mailer.ts (+ react-email template)
  │   ├── jobs/conversation-notification.job.ts (1 job / destinataire)
  │   ├── jobs/lead-accepted.consumer.ts (ouvre le fil à l'acceptation)
  │   └── prisma-conversation-query-adapter.ts (port public)
  └── interface/http/{conseiller-conversation.controller.ts, voyageur-conversation.controller.ts}

apps/web/src/features/conversation/         # UI MINIMALE (slice VIII.a)
  ├── ui/{ConversationThread, MessageList, MessageComposer, AntiTransactionNotice, AttachmentLink}
  ├── actions/send-message.action.ts        # Server Action (Zod, ActionResult)
  ├── hooks/ · schemas/ · index.ts
```

**Structure Decision** : feature dans le module `matching` (4 couches), cœur métier en
fonctions pures testées (VI). Le déclenchement (lead `accepté`) est consommé via un
**consumer**, jamais en ré-implémentant la machine d'état (012 reste la source de vérité,
lue via `MatchingLeadQueryPort`). Pièces jointes hors DB (S3), métadonnées en DB. Port
public `ConversationQueryPort` pour 014/015. **UI minimale** seulement.

## Décisions clés (détaillées en research.md)

- **Déclenchement du fil** : à la transition `accepté` — événement vs création paresseuse
  (research R1).
- **Stockage pièces jointes** : S3 ca-central-1, upload via URL pré-signée, lecture via URL
  signée courte ; métadonnées en DB ; aucun montant (R2).
- **Notifications** : outbox DB + BullMQ, 1 job/destinataire, drainé vers SES via 003 (R3).
- **Anti-transaction** : invariant testé (0 champ montant/paiement dans modèle + UI) (R4).
- **Autorisation / cloisonnement** : membre-du-fil, filtre DB + use case (R5).

## Complexity Tracking

Aucune violation de la Constitution → section sans objet.
