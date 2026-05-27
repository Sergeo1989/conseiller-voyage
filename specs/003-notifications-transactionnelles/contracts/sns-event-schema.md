# Contract : SNS Event Schema (SES → Lambda → NestJS)

**Branche** : `003-notifications-transactionnelles`
**Source** : AWS SES Configuration Set events publiés sur SNS topic
`notifications-ses-events`
**Consumer** : `apps/lambda-bounces-handler/` → endpoint NestJS
`POST /api/internal/notifications/sns`

Ce document spécifie :
1. Les payloads SES → SNS bruts (référence AWS).
2. La normalisation effectuée par la Lambda.
3. Le payload signé HMAC envoyé au NestJS backend.
4. Les schémas Zod de validation côté backend.

---

## 1. Payload SES → SNS brut

AWS SES publie sur le topic SNS un message dont le `body` (string)
contient un JSON à 3 formats principaux : `Bounce`, `Complaint`,
`Delivery`. Référence officielle :
https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html

### 1.1 Bounce

```json
{
  "eventType": "Bounce",
  "mail": {
    "timestamp": "2026-05-26T10:00:01.000Z",
    "messageId": "0100018f...",
    "source": "notifications@notifications.conseiller-voyage.ca",
    "destination": ["user@example.com"],
    "headersTruncated": false,
    "headers": [...],
    "commonHeaders": { ... },
    "tags": { ... }
  },
  "bounce": {
    "bounceType": "Permanent",
    "bounceSubType": "General",
    "bouncedRecipients": [
      {
        "emailAddress": "user@example.com",
        "action": "failed",
        "status": "5.1.1",
        "diagnosticCode": "smtp; 550 5.1.1 ..."
      }
    ],
    "timestamp": "2026-05-26T10:01:00.000Z",
    "feedbackId": "0100018f..."
  }
}
```

### 1.2 Complaint

```json
{
  "eventType": "Complaint",
  "mail": { /* idem Bounce */ },
  "complaint": {
    "complainedRecipients": [
      { "emailAddress": "user@example.com" }
    ],
    "timestamp": "2026-05-26T10:05:00.000Z",
    "feedbackId": "0100018f...",
    "complaintFeedbackType": "abuse",
    "userAgent": "Gmail",
    "complaintSubType": null,
    "arrivalDate": "2026-05-26T10:05:00.000Z"
  }
}
```

### 1.3 Delivery

```json
{
  "eventType": "Delivery",
  "mail": { /* idem Bounce */ },
  "delivery": {
    "timestamp": "2026-05-26T10:00:18.890Z",
    "processingTimeMillis": 17890,
    "recipients": ["user@example.com"],
    "smtpResponse": "250 2.0.0 OK ...",
    "remoteMtaIp": "...",
    "reportingMTA": "..."
  }
}
```

---

## 2. Normalisation Lambda

`apps/lambda-bounces-handler/src/parse-sns-event.ts` :

```ts
export interface NormalizedSesEvent {
  schemaVersion: 1;
  eventType: 'Bounce' | 'Complaint' | 'Delivery';
  sesMessageId: string;                // mail.messageId
  occurredAt: string;                  // ISO 8601 — bounce.timestamp | complaint.timestamp | delivery.timestamp
  recipientEmail: string;              // pour Bounce/Complaint = bouncedRecipients[0] | complainedRecipients[0] ; pour Delivery = recipients[0]
  sourceEmail: string;                 // mail.source
  details: BounceDetails | ComplaintDetails | DeliveryDetails;
}

export type BounceDetails = {
  bounceType: 'Permanent' | 'Transient' | 'Undetermined';
  bounceSubType: string;
  diagnosticCode: string | null;
  feedbackId: string;
};

export type ComplaintDetails = {
  complaintFeedbackType: string | null;   // 'abuse' | 'auth-failure' | 'fraud' | 'not-spam' | 'other' | 'virus'
  userAgent: string | null;
  feedbackId: string;
};

export type DeliveryDetails = {
  smtpResponse: string;
  processingTimeMillis: number;
};
```

La Lambda :
1. Parse le `Records[0].Sns.Message` (string → JSON).
2. Map vers `NormalizedSesEvent`.
3. Signe `<timestamp>.<body>` avec HMAC-SHA256 + secret partagé
   `NOTIFICATIONS_SNS_HMAC_SECRET` (lu depuis env Lambda, posé par CDK).
   Le timestamp est inclus dans la signature pour empêcher la
   modification après coup.
4. POST vers `https://api.conseiller-voyage.ca/api/internal/notifications/sns`
   avec en-têtes :
   - `Content-Type: application/json`
   - `X-CV-Sns-Signature: sha256=<hex>` (HMAC sur `timestamp.body`)
   - `X-CV-Sns-Timestamp: <epoch_seconds>` **obligatoire** (anti-replay)

---

## 3. Payload reçu par NestJS

`apps/api/src/modules/notifications/interface/http/sns-webhook.controller.ts` :

```ts
import { z } from 'zod';

export const SnsForwardedBounceSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal('Bounce'),
  sesMessageId: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  recipientEmail: z.string().email().max(254),
  sourceEmail: z.string().email().max(254),
  details: z.object({
    bounceType: z.enum(['Permanent', 'Transient', 'Undetermined']),
    bounceSubType: z.string().max(100),
    diagnosticCode: z.string().nullable(),
    feedbackId: z.string().max(200),
  }),
}).strict();

export const SnsForwardedComplaintSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal('Complaint'),
  sesMessageId: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  recipientEmail: z.string().email().max(254),
  sourceEmail: z.string().email().max(254),
  details: z.object({
    complaintFeedbackType: z.string().nullable(),
    userAgent: z.string().nullable(),
    feedbackId: z.string().max(200),
  }),
}).strict();

export const SnsForwardedDeliverySchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal('Delivery'),
  sesMessageId: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  recipientEmail: z.string().email().max(254),
  sourceEmail: z.string().email().max(254),
  details: z.object({
    smtpResponse: z.string().max(500),
    processingTimeMillis: z.number().int().nonnegative(),
  }),
}).strict();

export const SnsForwardedEventSchema = z.discriminatedUnion('eventType', [
  SnsForwardedBounceSchema,
  SnsForwardedComplaintSchema,
  SnsForwardedDeliverySchema,
]);
export type SnsForwardedEvent = z.infer<typeof SnsForwardedEventSchema>;
```

---

## 4. Vérification de signature côté NestJS

`SnsWebhookGuard` :

```ts
@Injectable()
export class SnsWebhookGuard implements CanActivate {
  // Fenêtre anti-replay : rejette tout payload daté > 5 minutes du now.
  private static readonly REPLAY_WINDOW_SECONDS = 300;

  constructor(
    @Inject(SNS_HMAC_SECRET) private readonly secret: string,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = req.headers['x-cv-sns-signature'] as string | undefined;
    const timestamp = req.headers['x-cv-sns-timestamp'] as string | undefined;

    // 1. Headers obligatoires
    if (!provided?.startsWith('sha256=') || !timestamp) return false;

    // 2. Anti-replay : timestamp dans la fenêtre [now - 300s, now + 60s]
    const tsNum = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(tsNum)) return false;
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    if (Math.abs(nowSec - tsNum) > SnsWebhookGuard.REPLAY_WINDOW_SECONDS) {
      return false;
    }

    // 3. Vérification HMAC sur `timestamp.body` (le timestamp est dans le hash, donc non-modifiable)
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${timestamp}.${req.rawBody.toString('utf-8')}`)
      .digest('hex');
    const expectedHeader = `sha256=${expected}`;

    return crypto.timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expectedHeader),
    );
  }
}
```

Trois protections combinées :
1. **Headers obligatoires** : pas de signature ou pas de timestamp →
   rejet immédiat.
2. **Anti-replay** : fenêtre 300 s passé + 60 s futur (clock skew
   toléré).
3. **HMAC sur `timestamp.body`** : le timestamp est dans le hash —
   l'attaquant ne peut pas le modifier sans casser la signature.

Hérite du pattern Fastify `rawBody` (à activer dans la configuration
Fastify globale si pas déjà actif).

---

## 5. Dispatch selon `eventType` (use cases)

| `eventType` | Use case appelé |
|---|---|
| `Bounce` (Permanent) | `RecordBounceUseCase` (mode `permanent`) → suppression list permanent + audit |
| `Bounce` (Transient) | `RecordBounceUseCase` (mode `soft`) → si > 3 soft sur 30 j, suppression 30 j |
| `Bounce` (Undetermined) | `RecordBounceUseCase` (mode `permanent` par prudence) |
| `Complaint` | `RecordComplaintUseCase` → suppression list permanent + audit |
| `Delivery` | `RecordDeliveryUseCase` → update `notification_email_log.deliveredAt` |

Tous les use cases sont **idempotents** sur `(sesMessageId, eventType)`
composite key. Replay SNS (la Lambda peut être appelée plusieurs fois
pour le même event) ne produit aucun side-effect supplémentaire.

---

## 6. Setup côté infrastructure (CDK)

Stack `infra/lib/notifications-stack.ts` (à créer) :

1. SNS topic `notifications-ses-events` en `ca-central-1`.
2. SES Configuration Set `notifications-prod` (et `-staging`) avec
   event destination → topic SNS pour Bounce/Complaint/Delivery/
   RenderingFailure/Reject.
3. Lambda `lambda-bounces-handler` souscrite au topic, IAM role minimal
   (logs + appel HTTPS sortant).
4. Secret `NOTIFICATIONS_SNS_HMAC_SECRET` partagé Lambda ↔ NestJS via
   Secrets Manager (lecture IAM granulaire).
5. Sous-domaine `notifications.conseiller-voyage.ca` en Route 53 avec
   DKIM/SPF/DMARC posés.

---

## 7. Tests d'intégration

Suite Vitest + Testcontainers :
- Fixture SNS event (Bounce permanent) → POST signé HMAC à
  `/api/internal/notifications/sns` → assertion sur DB
  (`notification_email_log.status = 'bounced'`,
  `notification_suppression_list` créée).
- Fixture SNS event Delivery → assertion `deliveredAt` populé.
- Fixture SNS event avec signature invalide → 401.
- Idempotence : même event SNS rejoué deux fois → une seule mutation.

---

## 8. Out of scope (différé)

- Parsing des events `RenderingFailure` côté SNS (envoyés par SES
  quand le template SES côté serveur échoue — on n'utilise pas les
  templates SES, donc rare).
- Parsing des events `Reject` (SES rejette un envoi). À surveiller en
  alerting mais pas de side-effect côté backend pour J1.
- Vérification de signature AWS SNS native (`MessageSignature`) — la
  Lambda ajoute déjà une couche d'authentification HMAC.
