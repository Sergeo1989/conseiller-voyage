# Research : Notifications et courriel transactionnel

**Branche** : `003-notifications-transactionnelles`
**Date** : 2026-05-26
**Spec** : [spec.md](./spec.md) (5 clarifications session 2026-05-26)
**Plan** : [plan.md](./plan.md)

Ce document consolide les décisions techniques résolvant les unknowns
identifiés dans le plan. Chaque décision suit le format
**Decision / Rationale / Alternatives considered**.

---

## R1 — Stratégie de drainage outbox cross-module

**Decision** : Chaque module source (001 conformité, 002 auth, 002a MFA)
possède son **propre worker** dans son propre code qui scanne sa
table outbox locale et appelle `NotificationPort.send(envelope)` du
module notifications. Aucun reader cross-module n'est introduit côté
notifications.

**Concrètement** :
- `apps/api/src/modules/conformite/infrastructure/jobs/outbox-publisher.job.ts`
  est **modifié** : remplace l'appel actuel à
  `RedisConformiteEventPublisher.publish()` (event Redis fire-and-forget
  inutile car aucun consommateur) par un appel à
  `NotificationPort.send(envelope)`.
- `apps/api/src/modules/identite/infrastructure/jobs/auth-outbox-dispatch.worker.ts`
  est **créé** (NOUVEAU) : scan `auth_outbox_emails`, idempotence par
  `entry.id`, appelle `NotificationPort.send()`.
- `apps/api/src/modules/identite/infrastructure/jobs/mfa-outbox-dispatch.worker.ts`
  est **créé** (NOUVEAU) : scan `mfa_outbox_emails`, idempotence par
  `entry.id`, appelle `NotificationPort.send()`.

**Rationale** :
- Respect strict du Principe V de la constitution. Le module
  notifications n'a aucune connaissance des schémas Prisma des autres
  modules. L'outil `tools/check-module-boundaries.ts` ne signalera
  aucune violation.
- Chaque module reste propriétaire de la durée de vie de ses entries
  outbox (état `publishedAt`, gestion des retries spécifiques).
- Le module notifications expose un **port unique** (`NotificationPort`)
  conçu pour accueillir les modules à venir (008 intake, 012 matching)
  sans modification interne (Principe O — Open/Closed).
- Le facade reste pure : `send(envelope)` est idempotent via
  `envelope.correlationId` (`= entry.id` du module source). Si la
  facade est appelée deux fois avec la même `correlationId`, la
  deuxième est un no-op silencieux.

**Alternatives considered** :
- **Drainage centralisé** (un worker notifications qui lit toutes les
  tables outbox) → rejeté : viole Principe V, créerait un import
  Prisma cross-module détecté par `check-module-boundaries.ts`.
- **Outbox unifiée** (une seule table `outbox` partagée) → rejeté :
  couplerait les schémas, perdrait l'isolation des features, demanderait
  migration destructive des 3 modules livrés.
- **Event bus Redis** (modules sources publient sur un canal Redis,
  notifications subscribe) → rejeté : pas at-least-once garanti côté
  pub/sub Redis ; les outbox existantes restent obligatoires de toute
  façon (transaction atomique source).

---

## R2 — Format payload `NotificationEnvelope` (port public)

**Decision** : `NotificationEnvelope` est un value object validé par
schéma Zod partagé dans `packages/shared/src/notifications/`. Le
schéma est versionné via un champ `schemaVersion: 1` pour permettre
l'évolution future sans casser les consommateurs.

```ts
// packages/shared/src/notifications/envelope.schema.ts
export const NotificationEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  correlationId: z.string().uuid(),            // outbox entry.id du module source
  eventType: z.string().min(1).max(100),       // ex: 'auth.email_verification'
  templateId: z.string().min(1).max(100),      // ex: 'auth.email-verification'
  recipientEmail: z.string().email().max(254),
  recipientLocale: z.enum(['fr-CA', 'en']),
  templateData: z.record(z.unknown()),         // typage spécifique au template, validé côté renderer
  sourceModule: z.enum(['conformite', 'identite', 'intake', 'matching', 'facturation']),
  enqueuedAt: z.string().datetime(),
});
export type NotificationEnvelope = z.infer<typeof NotificationEnvelopeSchema>;
```

**Rationale** :
- `schemaVersion: 1` permet l'évolution sans breaking change (leçon
  adversariale review 002 finding I-2).
- `correlationId` = clé d'idempotence stable (l'identifiant outbox source).
- `templateId` séparé de `eventType` permet un mapping N:1
  (plusieurs événements peuvent rendre le même template avec données
  variables).
- `templateData: z.record(z.unknown())` validé une seconde fois par le
  renderer du template concret (le renderer connaît son schéma typé).
- Zod côté serveur (Principe IX) — le module notifications **rejette**
  toute envelope non conforme avec un log d'erreur structuré.

**Alternatives considered** :
- **Sans `schemaVersion`** → rejeté : évolution impossible sans dual-write.
- **`templateData: z.string()` JSON brut** → rejeté : perd le typage,
  fait reposer toute validation sur le renderer.
- **Schéma protobuf gRPC** → rejeté : ajoute une dépendance lourde,
  Zod suffit pour communication intra-monolithe.

---

## R3 — Rendu `react-email` au runtime vs au build

**Decision** : Rendu **au runtime** via
`@react-email/render.renderAsync()` au moment de l'envoi par le worker
notifications. Pas de pré-rendu au build.

**Rationale** :
- Permet l'interpolation dynamique de `templateData` à chaque envoi
  (nom du destinataire, lien de vérification unique, etc.) sans
  template engine intermédiaire.
- Pre-rendering au build forcerait à figer le HTML, ce qui empêcherait
  l'interpolation runtime des variables — ou exigerait un placeholder
  système (`{{recipientName}}`) → ajout de complexité et de bugs.
- `@react-email/render` est mature, la latence p95 mesurée
  (benchmarks publics) est < 50 ms par template — négligeable vs SLO
  p95 < 2 s.
- Les templates restent éditables comme du code JSX sans rebuild
  intermédiaire.

**Alternatives considered** :
- **Pré-rendu au build avec placeholders** → rejeté (complexité,
  bugs de remplacement).
- **MJML transpilé séparément** → rejeté : la stack canonique
  contient déjà `react-email` (constitution).
- **Templates littéraux TypeScript template literals** → rejeté :
  perd les composants accessibles + dark mode safe de `@react-email/components`.

---

## R4 — SES SDK : v1 vs v2

**Decision** : `@aws-sdk/client-sesv2` (SES v2 API).

**Rationale** :
- v2 supporte nativement les **configuration sets** avec event
  destinations (Bounce/Complaint/Delivery → SNS) sans appel séparé.
- v2 expose `SendEmailCommand` qui accepte HTML + plain text + headers
  custom dans un payload unique (v1 demandait plusieurs étapes).
- v2 retourne plus de métadonnées par envoi (`messageId` stable pour
  corrélation avec les events SNS).
- AWS recommande v2 pour les nouveaux développements depuis 2020.
- Maintenance v1 prévue arrêtée en 2026.

**Configuration set utilisée** :
- Nom : `notifications-prod` (et `notifications-staging`).
- Event publishing : Bounce, Complaint, Delivery, RenderingFailure,
  Reject → SNS topic `notifications-ses-events`.
- IP pool : `default` J1 (dedicated IP différée jusqu'à volume > 100k/jour).
- Tracking : désactivé (open/click tracking) — anti-pattern transactionnel
  + risque vie privée Loi 25.

**Idempotence côté SES** : passer `envelope.correlationId` comme
identifiant déduplicant côté AWS. Détail technique R17 ci-dessous.
Garantit at-most-once SES dans une fenêtre de 24 h, même si le worker
crash après acceptation SES mais avant `UPDATE` Postgres.

**Alternatives considered** :
- **v1 (`@aws-sdk/client-ses`)** → rejeté (legacy, retraite annoncée).
- **SMTP direct via Nodemailer** → rejeté (perd les events SNS natifs,
  perd configuration sets, AWS SDK fournit gestion de credentials
  IAM/STS automatique).

---

## R5 — Souscription bounces/complaints : HTTPS endpoint vs SQS

**Decision** : SNS topic **+ Lambda subscriber** qui pousse vers un
endpoint HTTPS interne `POST /api/internal/notifications/sns` exposé
par `SnsWebhookController` (signé par un secret HMAC partagé Lambda
↔ NestJS).

**Rationale** :
- La Lambda fait deux choses : (a) parse le payload SNS (différents
  formats Bounce/Complaint/Delivery), (b) signe l'appel HTTPS au
  backend NestJS avec `X-CV-Sns-Signature: hmac-sha256(body, secret)`.
- L'endpoint HTTPS NestJS vérifie la signature avant tout traitement
  (anti-spoofing). Si signature invalide → 401 + log.
- Lambda gère la rétention SNS native (14 jours par défaut) en cas de
  panne backend ; replay possible.
- Le backend reçoit un payload normalisé déjà validé Zod, sans avoir
  à connaître le format SNS interne.

**Pattern alternatif évalué** :
- **NestJS subscribe direct au SNS topic (HTTPS endpoint public)** →
  rejeté : exposerait un endpoint public sans contrôle d'origine
  fiable (les en-têtes SNS sont spoofables sans vérification de
  signature `MessageSignature` AWS, qui est lourde à implémenter).
  La Lambda ajoute une couche de filtrage et d'auth.
- **SQS poll depuis le worker** → rejeté : ajouterait une file SQS en
  plus de la file BullMQ, complexité de provisioning, deux mécanismes
  d'ack à gérer.

---

## R6 — `NOTIFICATIONS_EMAIL_HASH_PEPPER` : génération et rotation

**Decision** : Pepper généré une fois, stocké en AWS Secrets Manager
`ca-central-1`. **Pas de rotation programmée** J1 — rotation
manuelle uniquement en cas de fuite. Si rotation : double-pepper
window pendant 30 jours (le module lit `current` ET `previous`,
comparaisons dans les deux ; nouvelles écritures avec `current` seul).

**Génération** :
```bash
openssl rand -base64 32   # 256 bits cryptographiquement aléatoires
```

**Stockage** :
- Secret name : `cv/notifications/email-hash-pepper`
- Format : JSON `{ "current": "<base64>", "previous": null | "<base64>" }`
- Lecture au boot via `@aws-sdk/client-secrets-manager`
- Cache local 1 h dans le process (refresh sur signal SIGUSR1 ou redémarrage)

**Rationale** :
- Rotation programmée crée plus de risques qu'elle n'en évite : si
  toutes les entries `suppression_list` et `audit_log` doivent être
  re-hashées, la migration est lourde, longue (millions de rows à
  terme), et bloquante pour le service.
- Sans rotation, le risque est : si le pepper fuit, la suppression
  list peut être réversée par rainbow tables → l'attaquant connaît
  qui a fait l'objet d'une plainte SES. Risque modéré (la suppression
  list n'est pas le dataset le plus sensible).
- Si fuite avérée → rotation manuelle déclenchée par opérateur,
  fenêtre double-pepper 30 jours, puis purge complète des hash
  `previous` après re-hashage.

**⚠️ Limitation post-effacement Loi 25** : si une row a déjà été
effacée (`recipientEmailClear = null`), elle ne peut **pas** être
re-hashée — l'email en clair nécessaire au recalcul du nouveau hash
n'existe plus. Conséquence :

- Les rows effacées **gardent leur hash sur l'ancien pepper**.
- Le système doit donc conserver `previous` **indéfiniment** (pas
  seulement 30 jours) pour pouvoir matcher une vieille suppression
  list entry contre un email canonicalisé entrant.
- À la rotation, le format Secrets devient
  `{ "current": "<base64>", "previous": ["<old1>", "<old2>", ...] }`
  avec une liste qui croît à chaque rotation (peu fréquente).
- Le `shouldSuppress(email, suppressionList, now)` essaie chaque
  pepper de la liste (boucle courte — typiquement 1-3 entries) pour
  trouver un match. Coût négligeable.

Cette dette est acceptée comme propriété intrinsèque de la pseudonymisation
Loi 25.

**Alternatives considered** :
- **Rotation mensuelle automatique** → rejeté (complexité, peu de gain).
- **Pas de pepper du tout (SHA-256 nu)** → rejeté (leçon adversariale
  review 002 finding B-1, vulnerable rainbow tables).
- **Pepper par tenant** → rejeté (multi-tenant pas dans le scope).
- **Re-hash forcé en ignorant les rows effacées** → rejeté (perd
  l'audit anti-resoumission sur tout l'historique pré-rotation).

---

## R7 — Circuit breaker SES

**Decision** : Retry/timeout natif AWS SDK + circuit breaker manuel
**custom** dans `SesEmailSender` (basé sur compteur d'échecs glissant
60 s + état machine `closed → open → half-open`).

**Rationale** :
- `opossum` (lib classique) ajoute une dépendance non triviale (15kB
  + 4 transitive) pour ~50 lignes de logique métier qui restent
  pures (`computeCircuitState(failures, now)` testable).
- AWS SDK v3 gère déjà retry exponential + timeout configurable. Le
  circuit breaker custom intervient AU-DESSUS : ouvre après 5 échecs
  en 60 s, bloque les envois pendant 30 s (échecs immédiats sans
  appel SES → file outbox source s'accumule), demi-ouverture après
  30 s (un appel test), fermeture après succès.

**Rationale alternative rejetée** :
- `opossum` : commode mais coût/bénéfice défavorable pour cette
  surface limitée.
- AWS SDK retry seul (sans circuit breaker) : la cascade de timeouts
  AWS SDK est longue (~30 s par tentative × 5 tentatives = 2,5 min)
  → saturation du worker + dégradation latence cascade. Le circuit
  breaker raccourcit cette cascade.

**Test** : `computeCircuitState({ failures, now })` pure function
testée par cas (closed → open après 5 échecs, half-open après 30 s,
fermeture après succès) avec injection de clock.

---

## R8 — Migration des templates conformité (clarification Q3)

**Decision** : Migration mécanique des 4 fichiers depuis
`packages/shared/src/email/templates/conformite/` vers
`packages/email-templates/src/conformite/` dans le **même PR** que la
feature 003. Suppression de l'ancien emplacement après migration des
imports côté `apps/api/src/modules/conformite/`.

**Plan de migration** :
1. Créer `packages/email-templates/src/conformite/` avec les 4
   fichiers (déplacement git).
2. Mettre à jour `packages/email-templates/src/index.ts` pour exporter
   le namespace `conformite/`.
3. Mettre à jour les imports dans
   `apps/api/src/modules/conformite/infrastructure/` (probablement
   l'OutboxPublisherJob actuel ou les use cases qui invoquent les
   templates).
4. Supprimer `packages/shared/src/email/templates/conformite/`.
5. Mettre à jour `packages/shared/src/email/templates/index.ts` pour
   retirer le re-export.
6. Tests existants 001 passent toujours (vérification par CI
   intégrale).

**Rationale** :
- Un seul package = un seul point d'import pour les templates,
  cohérence DX maximale.
- Convention `packages/email-templates/src/<module>/<template>.tsx`
  préparée pour les modules à venir.
- Migration mécanique = faible risque, 100 % couvert par CI.

**Alternatives considered** :
- **Migration différée en PR séparé après 003** → rejeté : créerait
  une période où le worker notifications importe depuis 2 packages,
  on aurait à modifier 003 a posteriori.
- **Garder shared/email/templates/conformite/ et ajouter un re-export
  depuis email-templates/** → rejeté : maintient la dette, pollue
  l'index publié.

---

## R9 — Dead-letter queue : table dédiée vs BullMQ failed jobs

**Decision** : Table dédiée `notification_email_log` avec colonne
`status` enum incluant `dead_letter`. Les jobs BullMQ failed sont
conservés en file Redis mais la **vérité métier** vit dans Postgres
(durabilité + queryability admin).

**Architecture** :
- `notification_dispatch.worker.ts` (BullMQ worker) consomme un job
  qui contient `{ correlationId, attempt }`.
- En échec, le worker :
  1. Update `notification_email_log` : `status = 'failed'`,
     `lastError`, `attempts++`, `nextAttemptAt = backoff(attempts)`.
  2. Si `attempts >= 5`, marque `status = 'dead_letter'` et émet
     log/metric/alert.
  3. BullMQ peut retentir nativement, mais on contrôle le backoff
     côté Postgres pour cohérence avec les autres patterns (001
     OutboxPublisherJob fait pareil).

**Rationale** :
- Console admin US6 (`/admin/notifications/dead-letter`) doit lister
  les DLQ — query Postgres simple `WHERE status = 'dead_letter'`.
- BullMQ Redis a une rétention configurable mais perd les events
  après TTL ; Postgres conserve 24 mois (rétention spec).
- Cohérence avec pattern 001 (`OutboxEntry.attempts` + `lastError`).

**Alternatives considered** :
- **BullMQ failed jobs comme source de vérité DLQ** → rejeté
  (rétention limitée, query lente, perd la trace 24 mois).
- **Table séparée `notification_dead_letter`** → rejeté (split
  artificiel, complexifie les use cases retry).

---

## R10 — Table audit dédiée vs réutilisation

**Decision** : Nouvelle table `notification_audit_entries` (append-only,
trigger Postgres BEFORE UPDATE/DELETE qui rejette, similaire au pattern
001 conformité).

**Rationale** :
- Principe V (frontière modulaire) : le module notifications possède
  son audit log indépendant. Pas de JOIN ni d'écriture cross-module
  vers `conformite_audit_entries`.
- Pattern hérité de 001 directement (cf. migration
  `20260525170000_audit_block_truncate`) : trigger row-level + trigger
  statement-level pour bloquer TRUNCATE. Deux migrations
  Prisma + 2 triggers SQL bruts → ADR justifié (`docs/adr/0008-table-audit-separee-loi25-no-fk.md`
  existant pour 001, extensible).
- Schéma minimal :
  - `id UUID PK`
  - `eventType TEXT NOT NULL` (ex: `'notification.suppression.removed_manually'`)
  - `actorId UUID NOT NULL` (admin qui a agi, ou `system`)
  - `actorRole VARCHAR NOT NULL` (`admin` ou `system`)
  - `targetEmailHashHMAC VARCHAR(64) NOT NULL`
  - `reason TEXT NULL` (motif libre requis pour actions sensibles)
  - `metadata JSONB NOT NULL DEFAULT '{}'` (payload event spécifique)
  - `occurredAt TIMESTAMPTZ NOT NULL DEFAULT now()`

**Alternatives considered** :
- **Écrire dans `conformite_audit_entries`** → rejeté (viole Principe V,
  couplage cross-module).
- **Pas d'audit log dédié** → rejeté (FR-030 exige journal append-only).

---

## R11 — Mode dégradé Redis HS

**Decision** : Si Redis HS, le worker notifications stoppe (lock BullMQ
non acquis). Les workers sources (001/002/002a) ne peuvent plus
appeler `NotificationPort.send()` car BullMQ est inaccessible — ils
reportent en backoff sur leur outbox (pattern existant 001).
**Alerte page** immédiate.

**Rationale** :
- Aucune alternative à Redis dans le pattern Outbox + BullMQ.
- La file outbox source dans Postgres garantit zéro perte de
  notification : au retour de Redis, tout est replayé.
- Le voyageur attend potentiellement quelques minutes son magic link
  — acceptable vs corruption ou doublon d'envoi.

**Alternatives considered** :
- **Fallback synchrone direct → SES** → rejeté (perd l'idempotence,
  perd le pattern, ne marche que pour Redis HS pas pour Postgres HS).
- **File alternative type SQS** → rejeté (sur-engineering, viole stack
  figée).

---

## R12 — Templates supplémentaires à créer

**Decision** : Trois nouveaux templates à ajouter dans le scope de
003, sous `packages/email-templates/src/<module>/` :

| Template | Module | Localisation | Trigger |
|---|---|---|---|
| `conformite/dossier-submitted.tsx` | conformite | À créer | Accusé de soumission de dossier (FR-005 actuel non couvert) |
| `mfa/totp-activated.tsx` | mfa | À créer | Confirmation post-setup TOTP réussi (US2 spec) |
| `conformite/erasure-confirmed.tsx` | conformite | À créer | Confirmation effacement Loi 25 (US5 spec) |

L'audit des `eventType` réellement publiés par les outbox J1 sera
effectué lors de `/speckit-tasks` pour finaliser la liste exhaustive
(possibilité que d'autres `eventType` n'aient pas de template — à
combler dans 003).

**Rationale** :
- Spec US2 exige couverture complète des `eventType` posés J1.
- Ces 3 templates manquent à l'inventaire mais correspondent à des
  événements déjà publiés ou attendus dans les outbox.
- Chacun suit le même squelette (`react-email` + i18n FR-CA/EN +
  preview text + mobile-first + dark mode safe).

**Alternatives considered** :
- **Templates différés au PR suivant** → rejeté (spec US2 P1 = couverture
  J1, sans ça la feature n'est pas livrable).

---

## R13 — Idempotency-Key : réutilisation du pattern 001

**Decision** : Réutiliser `IdempotencyInterceptor` existant
(`apps/api/src/common/interceptors/idempotency.interceptor.ts`, livré
par 001 / pattern `T020`). Backing store : Redis avec préfixe
`idempotency:<key>` et TTL 7 jours (cf. constitution Principe X).

**Rationale** :
- Aucun nouveau composant à créer — l'interceptor est applicable
  globalement via `@UseInterceptors(IdempotencyInterceptor)` ou
  par décorateur sur les endpoints admin.
- Redis 7j garantit la rejouabilité côté client (UI admin peut
  retenter une requête après timeout sans risque).
- La clé ne contient PAS de PII (UUID v4 généré côté client).
- Pas de table dédiée — pas de rétention applicative à gérer (Redis
  expire de lui-même).

**Application** :
- Endpoints concernés : `POST /api/admin/notifications/suppression-list/:id/remove`
  + `POST /api/admin/notifications/dead-letter/:id/retry` (cf.
  `contracts/http-endpoints.md` endpoints 2 et 4).
- Décorateur `@UseInterceptors(IdempotencyInterceptor)` posé sur les
  méthodes mutation du `AdminNotificationsController`.

**Alternatives considered** :
- **Table dédiée `idempotency_keys`** → rejeté (réutilisation Redis
  plus simple, déjà câblée par 001).
- **Pas d'idempotence** → rejeté (Principe X NON-NÉGOCIABLE).

---

## R14 — Mise à jour `tools/check-module-boundaries.ts`

**Decision** : Ajouter le module `notifications` au registre
`MODULE_PREFIXES` et whitelister les symboles publics dans
`ALLOWED_CROSS_MODULE_SYMBOLS`. Modification livrée dans le PR 003,
testée par CI.

**Modifications concrètes** :

```ts
// tools/check-module-boundaries.ts (ligne ~23-30)
const MODULE_PREFIXES: Record<string, string[]> = {
  conformite: ['Conformite', 'conformite_'],
  identite: ['Auth'],
  intake: ['Intake', 'intake_'],
  matching: ['Matching', 'matching_'],
  facturation: ['Facturation', 'facturation_'],
  seo: ['Seo', 'seo_'],
  notifications: ['Notification', 'notification_', 'Suppression'],  // NOUVEAU
};

// tools/check-module-boundaries.ts (ligne ~43-57)
const ALLOWED_CROSS_MODULE_SYMBOLS: ReadonlySet<string> = new Set([
  // ... existant : AuthGuard, AuthRole, AuthenticatedUser, etc.
  // NOUVEAU — symboles publics module notifications :
  'NotificationPort',
  'NOTIFICATION_PORT',
  'NotificationEnvelope',
  'NotificationEnvelopeSchema',
  'NotificationEnvelopeValidationError',
  'SendResult',
  'SuppressionReason',                  // exposé via SendResult { reason: 'suppressed', suppressionReason }
]);
```

**Rationale** :
- Sans cette mise à jour, le premier merge implémentant `NotificationPort`
  côté module source (ex: 001 conformité qui importe `NOTIFICATION_PORT`)
  fait échouer la CI.
- La whitelist explicite vaut mieux qu'une convention implicite (cf.
  pattern hérité de 001 pour `AuthGuard`).

**Alternatives considered** :
- **Pas de whitelist (refactor du tool)** → rejeté : le tool existe
  déjà et fonctionne ; on suit son pattern.

---

## R15 — Pino redact paths (anti-fuite PII logs)

**Decision** : Configurer `pino` avec `redact.paths` listant tous les
chemins d'objets qui peuvent contenir une adresse courriel en clair.
Configuration centralisée dans `apps/api/src/common/logger.module.ts`
(existant) et étendue par 003.

**Chemins à redact** (minimum) :

```ts
redact: {
  paths: [
    'recipientEmail',
    'recipientEmailClear',
    'envelope.recipientEmail',
    'envelope.recipientEmailClear',
    'email',
    'mail.destination[*]',
    'mail.source',
    'bouncedRecipients[*].emailAddress',
    'complainedRecipients[*].emailAddress',
    'delivery.recipients[*]',
    'req.body.recipientEmail',
    'res.body.recipientEmail',
  ],
  censor: '[REDACTED]',
}
```

**OTel spans** : interdire `email.address`, `messaging.destination.email`
en span attributes. Utiliser `recipientEmailHashHMAC` (hex 64) à la
place dans tous les span attributes notifications.

**Test unitaire** : `Vitest test/redaction.test.ts` qui sérialise
plusieurs objets contenant des emails et vérifie qu'aucune chaîne
matching la regex `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}` n'apparaît
dans le JSON loggué.

**Rationale** :
- SC-007 (zéro PII en log) est curatif via grep hebdomadaire → doit
  être préventif via redaction.
- `pino.redact` est natif et performant.

**Alternatives considered** :
- **Logger custom wrap** → rejeté (réutilise Pino qui a la feature).
- **Aucune redaction, juste grep CI** → rejeté (curatif insuffisant).

---

## R16 — BullMQ priority lanes (critique vs batch)

**Decision** : Utiliser le système `priority` natif de BullMQ pour
distinguer 2 niveaux :

| Priorité BullMQ | Usage |
|---|---|
| **1 (critique)** | Magic-link signup, password reset, MFA step-up (latence directement visible voyageur ou conseiller en cours d'action) |
| **10 (batch)** | Rappels d'expiration certificat J-30/J-15/J-7/J-1, accusés de soumission |

Le worker source détermine la priorité en mappant `templateKind` /
`eventType` vers un niveau (`priorityForEventType()`).

**Application** :

```ts
// apps/api/src/modules/notifications/infrastructure/jobs/notification-dispatch.worker.ts
const job = await this.queue.add('dispatch', envelope, {
  priority: priorityForEventType(envelope.eventType),  // 1 ou 10
  jobId: envelope.correlationId,                       // idempotence BullMQ
});
```

**Rationale** :
- Sous pic d'expiration certificat (200 envois batch), un voyageur
  qui s'inscrit doit recevoir son magic-link en < 30 s sans attendre
  la fin du batch. BullMQ `priority: 1` est traité avant `priority: 10`
  par le worker.
- Pas de file séparée (complexité inutile) — un seul worker, 2 priorités.

**Alternatives considered** :
- **Files séparées** (`notifications-critical` vs `notifications-batch`)
  → rejeté (complexité ops, 2 workers à monitorer, peu de gain).
- **FIFO sans priorité** → rejeté (latence magic-link sous pic =
  cassée).

---

## R17 — SES Outbound Idempotency Token (at-most-once SES)

**Decision** : Propager `envelope.correlationId` comme
`X-Amzn-SES-Outbound-Idempotency-Token` dans le call SES v2
`SendEmailCommand`. Garantit que SES déduplique côté serveur — pas de
doublon possible chez le destinataire même si le worker crash entre
"appel SES OK" et "update DB".

**Application** :

```ts
// apps/api/src/modules/notifications/infrastructure/ses-email-sender.ts
const command = new SendEmailCommand({
  Source: 'notifications@notifications.conseiller-voyage.ca',
  Destination: { ToAddresses: [envelope.recipientEmail] },
  Content: { Simple: { ... } },
  ConfigurationSetName: 'notifications-prod',
  // CLÉ idempotence côté SES :
  // (officiellement c'est passé dans MessageTags ou via paramètre dédié)
  // Documentation AWS : passer X-Amzn-SES-Outbound-Idempotency-Token
  // via le client config ou via la signature de SendEmailCommand v2.
});
```

**Rationale** :
- L'idempotence Postgres seule protège contre double-écriture en DB,
  mais **PAS** contre double-envoi SES.
- Scénario : worker accepte job → SES API call OK → worker crash AVANT
  `UPDATE notification_email_log SET status='sent'`. Sans token SES,
  retry produira un 2e envoi (destinataire reçoit 2 mails).
- Avec token SES = `correlationId` (UUID stable), SES retourne le même
  `MessageId` pour les calls suivants (fenêtre d'idempotence AWS = 24 h).

**Limite** : la fenêtre AWS est de 24 h. Au-delà, un retry pourrait
re-envoyer. Combiné à l'idempotence Postgres (status `sent` filtre les
retries), c'est tout-à-fait acceptable.

**Alternatives considered** :
- **Idempotence Postgres seule** → rejeté (laisse un trou de doublon
  réel). Confirmé par finding I-3 review architecte.

---

## Synthèse — Décisions actées

| ID | Décision | Impact |
|---|---|---|
| R1 | Drainage par-module via workers locaux appelant `NotificationPort` | Respecte Principe V, modifie 3 modules existants |
| R2 | `NotificationEnvelope` Zod v1 dans `packages/shared/` | Contrat versionné, évolutif |
| R3 | Rendu `react-email` au runtime | Latence < 50 ms, interpolation dynamique |
| R4 | SES v2 SDK + Configuration Set + IP pool default | Native event destinations, no open/click tracking |
| R5 | Lambda parser SNS → HTTPS signé HMAC vers NestJS | Anti-spoofing, decouple format SNS du backend |
| R6 | Pepper unique, rotation manuelle sur fuite avec fenêtre 30 j | Simplicité, risque résiduel acceptable |
| R7 | Circuit breaker custom (50 lignes) au-dessus du SDK | Évite opossum, testable pure-fn |
| R8 | Migration immédiate templates conformité dans email-templates/ | DX cohérent, dette nulle |
| R9 | DLQ dans `notification_email_log` (status=`dead_letter`) | Cohérence pattern 001, query admin simple |
| R10 | Audit dédié `notification_audit_entries` + triggers | Principe V, hérite pattern 001 |
| R11 | Mode dégradé Redis HS = stop + alerte page | Zéro perte via outbox source |
| R12 | 3 nouveaux templates à compléter J1 | Closes couverture US2 P1 |
| R13 | Idempotency-Key via `IdempotencyInterceptor` 001 (Redis 7 j) | Pas de nouveau composant à créer |
| R14 | `tools/check-module-boundaries.ts` mis à jour avec préfixes + whitelist symboles publics | Prévient régression CI au merge |
| R15 | Pino `redact.paths` + interdiction OTel `email.address` | SC-007 préventif (pas curatif) |
| R16 | BullMQ `priority: 1` (critique) vs `10` (batch) | Magic-link reste sous 30 s en pic |
| R17 | SES Outbound Idempotency Token = `correlationId` | At-most-once côté SES (24 h) |

**Aucune NEEDS CLARIFICATION restante.** Le plan peut passer en
Phase 1 (Design & Contracts).
