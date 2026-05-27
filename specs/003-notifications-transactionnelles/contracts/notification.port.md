# Contract : `NotificationPort` (facade publique)

**Branche** : `003-notifications-transactionnelles`
**Type** : facade publique consommée cross-module
**Stabilité** : semver intra-monorepo (additif = mineur, retrait = majeur)

Ce port est la **seule** surface exposée par le module `notifications`
aux autres modules (001 conformité, 002/002a identité, et tous les
modules à venir 008/012/etc.). Aucun autre import depuis
`apps/api/src/modules/notifications/**` n'est autorisé par
`tools/check-module-boundaries.ts`.

---

## Signature TypeScript

```ts
// apps/api/src/modules/notifications/interface/public-api/notification.port.ts

import type { NotificationEnvelope } from '@cv/shared/notifications';

export interface NotificationPort {
  /**
   * Enregistre une intention d'envoi de courriel transactionnel.
   *
   * Idempotence : si une entrée avec `envelope.correlationId` existe
   * déjà dans `notification_email_log`, l'appel est un no-op silencieux
   * et retourne `{ accepted: false, reason: 'duplicate' }`.
   *
   * Suppression list : si l'adresse canonicalisée du destinataire est
   * en suppression list (non expirée, non retirée), l'envoi est
   * annulé, status = 'skipped_suppressed', et l'appel retourne
   * `{ accepted: false, reason: 'suppressed', suppressionReason }`.
   *
   * Validation : si la `NotificationEnvelope` ne respecte pas le
   * schéma Zod, l'appel lève `NotificationEnvelopeValidationError`.
   *
   * Garanties : at-least-once. Si le worker est redémarré entre la
   * mise en queue BullMQ et l'envoi SES, le job sera replay et
   * l'idempotence garantit qu'aucun double envoi ne sortira.
   */
  send(envelope: NotificationEnvelope): Promise<SendResult>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export type SendResult =
  | { accepted: true; notificationLogEntryId: string }
  | { accepted: false; reason: 'duplicate'; notificationLogEntryId: string }
  | { accepted: false; reason: 'suppressed'; suppressionReason: SuppressionReason }
  | { accepted: false; reason: 'rendering_failed'; error: string };

export class NotificationEnvelopeValidationError extends Error {
  constructor(public readonly issues: ZodIssue[]) {
    super('NotificationEnvelope failed Zod validation');
    this.name = 'NotificationEnvelopeValidationError';
  }
}
```

---

## Usage côté module consommateur

### Exemple — conformité 001

```ts
// apps/api/src/modules/conformite/infrastructure/jobs/outbox-publisher.job.ts

@Injectable()
export class OutboxPublisherJob {
  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notifications: NotificationPort,
  ) {}

  async processBatch(): Promise<void> {
    const rows = await prisma.outboxEntry.findMany({
      where: { publishedAt: null, /* ... */ },
      take: 100,
    });
    for (const row of rows) {
      const envelope = mapOutboxRowToEnvelope(row);
      const result = await this.notifications.send(envelope);
      // Update row.publishedAt si accepted, attempts++ sinon
    }
  }
}
```

### Exemple — auth 002 (worker à créer)

```ts
// apps/api/src/modules/identite/infrastructure/jobs/auth-outbox-dispatch.worker.ts

@Injectable()
export class AuthOutboxDispatchWorker {
  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notifications: NotificationPort,
  ) {}
  // Pattern identique à OutboxPublisherJob, scan auth_outbox_emails.
}
```

---

## Garanties contractuelles

| Propriété | Garantie |
|---|---|
| **Idempotence** | `correlationId` est la clé. Deux appels avec le même `correlationId` produisent zéro ou un seul envoi SES. |
| **At-least-once** | Si le worker crash après acceptation SES mais avant update DB, un retry produira soit un duplicate SES (filtré par idempotence Postgres), soit un nouvel envoi (impossible car `correlationId` existe déjà). |
| **Non-blocking** | `send()` retourne immédiatement après écriture en DB + enqueue BullMQ. L'envoi réel est asynchrone. Latence p95 < 50 ms. |
| **Pas de side-effects observables si la facade lève** | Si `send()` lève `NotificationEnvelopeValidationError` ou une erreur DB, aucune ligne n'est créée dans `notification_email_log`. |
| **Compatibilité semver** | Ajout de champs optionnels à `NotificationEnvelope` = mineur. Retrait ou changement de type = majeur (impose `schemaVersion: 2` + dual-write 30 j). |

---

## Stabilité et évolution

- **schemaVersion** : `1` pour J1. Tout ajout de champ optionnel à
  `NotificationEnvelope` est permis sans bump (additivité). Tout
  changement breaking exige un nouveau `schemaVersion: 2` avec
  période de dual-support 30 jours.
- **Nouveaux types d'événements** : ajout d'un `templateId` ou
  `eventType` ne casse pas le contrat (le port reçoit, le module
  notifications dispatche selon le `templateId` connu de son
  catalogue ; si inconnu → status `rendering_failed` + alerte).
- **Ports additionnels** : si un module consommateur a besoin d'un
  comportement nouveau (ex: prévisualiser un template), une nouvelle
  méthode est ajoutée à `NotificationPort` (additivité = mineur). Si
  une méthode existante doit changer, créer un port séparé
  (`NotificationPreviewPort`) pour ségrégation (Principe I — Interface
  Segregation).

---

## Liste des ports privés du module (NON exposés)

Pour mémoire / Constitution Check. Ces ports vivent dans
`apps/api/src/modules/notifications/application/ports/` et ne
**doivent pas** être consommés cross-module :

- `EmailSender` (implémenté par `SesEmailSender`)
- `SuppressionListReader` / `SuppressionListWriter`
- `NotificationLogReader` / `NotificationLogWriter`
- `NotificationAuditLogWriter`
- `EmailTemplateRenderer`
- `Clock` / `UuidGenerator`

Toute tentative d'import depuis ces ports cross-module est rejetée par
`tools/check-module-boundaries.ts` (whitelist limitée à
`NotificationPort` + `NOTIFICATION_PORT` symbol + types `NotificationEnvelope`,
`SendResult`).
