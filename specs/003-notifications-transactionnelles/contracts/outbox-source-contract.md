# Contract : Outbox sources (modules consommateurs)

**Branche** : `003-notifications-transactionnelles`
**Type** : convention que chaque module source DOIT respecter pour
émettre des courriels via `NotificationPort`

⚠️ **Important** : les 3 modules sources livrés (001, 002, 002a) ont
chacun **leur propre schéma d'outbox** qui diverge sur les noms de
colonnes. Ce document détaille chaque schéma réel et le mapping
spécifique vers `NotificationEnvelope`. Aucun champ "minimal commun"
n'est imposé — chaque worker fait son propre mapping.

Ce document n'est **pas** un port code (pas d'interface TypeScript
imposée), mais une **convention** que tous les modules sources
appliquent dans leur propre code. Le module notifications n'a aucune
connaissance des tables outbox sources — chaque module source est
responsable de sa propre logique de drainage.

---

## 1. Inventaire réel des outbox J1

### 1.1 `conformite_outbox` (feature 001 — mergé)

```prisma
// packages/db/prisma/schema/conformite.prisma
model OutboxEntry {
  id            String    @id @default(uuid()) @db.Uuid
  eventType     String                                  // ex: 'conformite.dossier_approved'
  payload       Json                                    // données du template (inclut recipientEmail)
  createdAt     DateTime  @default(now())
  publishedAt   DateTime?                               // null = non envoyé
  attempts      Int       @default(0)
  nextAttemptAt DateTime?
  lastError     String?
  @@map("conformite_outbox")
}
```

**Particularités** :
- **PAS** de `recipientEmail` ni `recipientLocale` en colonne — ils
  sont dans `payload` (JSON).
- A `publishedAt` ET `nextAttemptAt` (pattern complet 001).
- Aucune FK vers `auth_users`. Le worker conformité doit récupérer
  `recipientLocale` depuis le profil utilisateur via le port existant
  du module conformité (qui a déjà accès aux infos conseiller).

### 1.2 `auth_outbox_emails` (feature 002 — mergé)

```prisma
// packages/db/prisma/schema/auth-credentials.prisma
model AuthOutboxEmail {
  id              String            @id @default(uuid()) @db.Uuid
  recipientUserId String?           @db.Uuid                    // null pour invitation admin
  recipientEmail  String                                        // toujours rempli
  templateKind    AuthEmailTemplate                             // enum (pas eventType String)
  payload         Json
  createdAt       DateTime          @default(now())
  sentAt          DateTime?                                     // ≠ publishedAt
  attempts        Int               @default(0)
  lastError       String?           @db.Text

  recipientUser AuthUser? @relation(fields: [recipientUserId], references: [id], onDelete: SetNull)
  @@map("auth_outbox_emails")
}

enum AuthEmailTemplate {
  email_verification
  password_reset
  password_changed
  admin_invitation
  // ... à compléter selon code réel
}
```

**Particularités** :
- A `recipientEmail` colonne (avantage : pas besoin de JSON lookup).
- **PAS** de `recipientLocale` — à récupérer via FK `recipientUser →
  AuthUser.preferredLocale` (in-module, OK Principe V).
- Utilise `sentAt` au lieu de `publishedAt`. Le worker manipule ce
  champ comme équivalent fonctionnel.
- **PAS** de `nextAttemptAt`. Le retry suit `attempts` + une heuristique
  basée sur `lastError`. Si besoin de backoff explicite (recommandé pour
  003), **ajouter** `nextAttemptAt` via migration expand compatible
  (cf. section 4 ci-dessous).
- `templateKind` est un enum Postgres typé (vs `eventType: String` libre
  côté conformité). Mapping vers `templateId` direct.

### 1.3 `mfa_outbox_emails` (feature 002a — mergé)

```prisma
// packages/db/prisma/schema/mfa.prisma
model MfaOutboxEmail {
  id              String                 @id @default(uuid()) @db.Uuid
  recipientUserId String                 @db.Uuid                  // NOT NULL (toujours un user existant)
  templateKind    MfaEmailTemplateKind                              // enum
  payload         Json
  queuedAt        DateTime               @default(now())
  sentAt          DateTime?
  attempts        Int                    @default(0)
  lastError       String?                @db.Text

  recipient AuthUser @relation(fields: [recipientUserId], references: [id], onDelete: Cascade)
  @@map("mfa_outbox_emails")
}
```

**Particularités** :
- **PAS** de `recipientEmail` en colonne — récupéré uniquement via FK
  `recipient → AuthUser.email` (in-module, OK Principe V).
- **PAS** de `recipientLocale` — récupéré via `AuthUser.preferredLocale`.
- Utilise `queuedAt`/`sentAt` (vs `createdAt`/`publishedAt`).
- **PAS** de `nextAttemptAt`. Comme auth, à ajouter par migration
  expand si backoff explicite voulu (recommandé).
- `templateKind` enum typé.
- `onDelete: Cascade` depuis `AuthUser` — l'effacement Loi 25 d'un user
  propage à ses entries MFA outbox (déjà couvert par 002a).

---

## 2. Mapping vers `NotificationEnvelope`

Le worker de chaque module convertit sa row outbox locale en
`NotificationEnvelope` en suivant le mapping spécifique :

### 2.1 Worker conformité

```ts
// apps/api/src/modules/conformite/infrastructure/jobs/outbox-publisher.job.ts (modifié)
private async mapToEnvelope(row: OutboxEntry): Promise<NotificationEnvelope> {
  const payload = row.payload as Record<string, unknown>;
  // recipientEmail vient du payload (déposé au moment du dispatch use case)
  const recipientEmail = payload.recipientEmail as string;
  // recipientLocale via reader interne module conformité
  const conseiller = await this.conformiteReader.findByEmail(recipientEmail);
  const recipientLocale = conseiller?.preferredLocale ?? 'fr-CA';
  return {
    schemaVersion: 1,
    correlationId: row.id,
    eventType: row.eventType,
    templateId: mapConformiteEventToTemplateId(row.eventType),
    recipientEmail,
    recipientLocale,
    templateData: payload,
    sourceModule: 'conformite',
    enqueuedAt: row.createdAt.toISOString(),
  };
}
```

⚠️ **Action requise côté 003** : auditer les use cases conformité qui
posent des entries outbox (ApproveDossier, RefuseDossier, etc.) pour
**garantir** que `payload.recipientEmail` est toujours rempli. Si pas
le cas, modifier ces use cases (changement minimal, in-module).

### 2.2 Worker auth (à créer dans `identite/`)

```ts
// apps/api/src/modules/identite/infrastructure/jobs/auth-outbox-dispatch.worker.ts (nouveau)
private async mapToEnvelope(row: AuthOutboxEmail): Promise<NotificationEnvelope> {
  let recipientLocale: 'fr-CA' | 'en' = 'fr-CA';
  if (row.recipientUserId) {
    const user = await prisma.authUser.findUnique({
      where: { id: row.recipientUserId },
      select: { preferredLocale: true },
    });
    if (user?.preferredLocale === 'en') recipientLocale = 'en';
  }
  // Sinon (admin invitation pré-acceptation) : FR-CA par défaut
  return {
    schemaVersion: 1,
    correlationId: row.id,
    eventType: `auth.${row.templateKind}`,                  // ex: 'auth.email_verification'
    templateId: mapAuthTemplateKindToTemplateId(row.templateKind),
    recipientEmail: row.recipientEmail,
    recipientLocale,
    templateData: row.payload as Record<string, unknown>,
    sourceModule: 'identite',
    enqueuedAt: row.createdAt.toISOString(),
  };
}
```

### 2.3 Worker MFA (à créer dans `identite/`)

```ts
// apps/api/src/modules/identite/infrastructure/jobs/mfa-outbox-dispatch.worker.ts (nouveau)
private async mapToEnvelope(row: MfaOutboxEmail): Promise<NotificationEnvelope> {
  const user = await prisma.authUser.findUnique({
    where: { id: row.recipientUserId },
    select: { email: true, preferredLocale: true },
  });
  if (!user) throw new Error(`User ${row.recipientUserId} not found for MFA outbox ${row.id}`);
  return {
    schemaVersion: 1,
    correlationId: row.id,
    eventType: `mfa.${row.templateKind}`,
    templateId: mapMfaTemplateKindToTemplateId(row.templateKind),
    recipientEmail: user.email,
    recipientLocale: user.preferredLocale === 'en' ? 'en' : 'fr-CA',
    templateData: row.payload as Record<string, unknown>,
    sourceModule: 'identite',
    enqueuedAt: row.queuedAt.toISOString(),
  };
}
```

---

## 3. Marquage post-envoi (par module)

Chaque module source met à jour sa row outbox **avec son propre nom de
colonne** :

| Module | Colonne "envoyé" | Colonne "prochain retry" |
|---|---|---|
| conformite | `publishedAt = now()` | `nextAttemptAt` (existe) |
| auth | `sentAt = now()` | À ajouter via migration (cf. section 4) |
| mfa | `sentAt = now()` | À ajouter via migration (cf. section 4) |

Le worker `Xxx` met à jour **uniquement** sa propre table — aucun
écriture cross-module.

---

## 4. Migrations nécessaires pour aligner auth + mfa avec backoff

Pour pouvoir appliquer une politique de retry exponentielle homogène
(cf. R7 research), il faut ajouter `nextAttemptAt` aux tables qui
ne l'ont pas. Migration **expand** compatible (ajout de colonne
nullable, ne casse rien) :

```sql
-- packages/db/prisma/migrations/2026MMDDNNNNNN_outbox_add_next_attempt_at/migration.sql
ALTER TABLE auth_outbox_emails
  ADD COLUMN next_attempt_at TIMESTAMPTZ NULL;
ALTER TABLE mfa_outbox_emails
  ADD COLUMN next_attempt_at TIMESTAMPTZ NULL;

CREATE INDEX idx_auth_outbox_emails_pending
  ON auth_outbox_emails (sent_at, next_attempt_at)
  WHERE sent_at IS NULL;
CREATE INDEX idx_mfa_outbox_emails_pending
  ON mfa_outbox_emails (sent_at, next_attempt_at)
  WHERE sent_at IS NULL;
```

Mettre à jour les `prisma` schemas correspondants. **Forward-only**,
expand compatible avec le code 002/002a existant qui ignore
simplement cette colonne.

---

## 5. Worker générique (template à instancier)

```ts
@Injectable()
export class XxxOutboxDispatchWorker {
  private running = false;
  private readonly interval = process.env.NODE_ENV === 'development' ? 30_000 : 5_000;
  private readonly maxAttempts = 10;

  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notifications: NotificationPort,
  ) {}

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await prisma.xxxOutboxRow.findMany({
        where: {
          [SENT_COLUMN]: null,                                      // sentAt OU publishedAt
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
          attempts: { lt: this.maxAttempts },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const row of rows) {
        await this.processOne(row);
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(row: XxxOutboxRow): Promise<void> {
    const envelope = await this.mapToEnvelope(row);
    try {
      const result = await this.notifications.send(envelope);
      if (result.accepted || result.reason === 'duplicate') {
        await prisma.xxxOutboxRow.update({
          where: { id: row.id },
          data: { [SENT_COLUMN]: new Date(), lastError: null },
        });
      } else {
        // suppressed / rendering_failed : marker comme publié, pas de retry
        await prisma.xxxOutboxRow.update({
          where: { id: row.id },
          data: {
            [SENT_COLUMN]: new Date(),
            lastError: `Skipped: ${result.reason}`,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      await prisma.xxxOutboxRow.update({
        where: { id: row.id },
        data: {
          attempts: nextAttempts,
          nextAttemptAt: computeBackoff(nextAttempts),
          lastError: message,
        },
      });
    }
  }
}
```

`SENT_COLUMN` est `publishedAt` pour conformité, `sentAt` pour auth/mfa.

---

## 6. Mapper `templateKind`/`eventType` → `templateId`

Chaque module source possède sa fonction pure de mapping :

```ts
// apps/api/src/modules/conformite/infrastructure/jobs/event-type-mapper.ts
export function mapConformiteEventToTemplateId(eventType: string): string {
  switch (eventType) {
    case 'conformite.dossier_approved': return 'conformite.dossier-approved';
    case 'conformite.dossier_refused': return 'conformite.dossier-refused';
    case 'conformite.dossier_submitted': return 'conformite.dossier-submitted';
    case 'conformite.expiration_reminder_j30': return 'conformite.expiration-reminder';  // template paramétré
    case 'conformite.expiration_reminder_j15': return 'conformite.expiration-reminder';
    case 'conformite.expiration_reminder_j7':  return 'conformite.expiration-reminder';
    case 'conformite.expiration_reminder_j1':  return 'conformite.expiration-reminder';
    case 'conformite.revocation': return 'conformite.revocation';
    case 'conformite.erasure_confirmed': return 'conformite.erasure-confirmed';
    default:
      throw new Error(`Unknown conformite eventType: ${eventType}`);
  }
}

// apps/api/src/modules/identite/infrastructure/jobs/auth-template-mapper.ts
export function mapAuthTemplateKindToTemplateId(kind: AuthEmailTemplate): string {
  // kind est un enum strict → switch exhaustif sans default
  switch (kind) {
    case 'email_verification': return 'auth.email-verification';
    case 'password_reset': return 'auth.password-reset';
    case 'password_changed': return 'auth.password-changed';
    case 'admin_invitation': return 'auth.admin-invitation';
  }
}

// apps/api/src/modules/identite/infrastructure/jobs/mfa-template-mapper.ts (analogue pour MfaEmailTemplateKind)
```

---

## 7. Audit J1 — `eventType`/`templateKind` réellement émis

À effectuer dans `/speckit-tasks` (1-2 h de lecture de code) pour
figer le scope final :

- Grep `prisma.outboxEntry.create` dans `apps/api/src/modules/conformite/`
  → liste les `eventType` réels publiés par 001.
- Grep `prisma.authOutboxEmail.create` → liste les `templateKind` réels
  publiés par 002.
- Grep `prisma.mfaOutboxEmail.create` → liste les `templateKind` réels
  publiés par 002a.

Pour chaque entrée trouvée :
1. Vérifier qu'un template existe (ou le créer dans
   `packages/email-templates/<module>/`).
2. Ajouter le mapping dans le mapper du module source.
3. Ajouter un scénario quickstart si pertinent.

L'objectif est zéro `eventType` orphelin (qui produirait un
`rendering_failed` en prod).

---

## 8. Garanties contractuelles

| Garantie | Mécanisme |
|---|---|
| Atomicité dépôt outbox + commit transaction métier | `prisma.$transaction([businessOp, outboxInsert])` (déjà appliqué par 001/002/002a) |
| Pas de doublon dans la même transaction | `correlationId = outboxEntry.id` = clé idempotence en aval |
| Drainage périodique | `setInterval` 5 s prod (30 s dev) — pattern hérité 001 |
| Retry transient | Backoff exponentiel basé sur `attempts` côté outbox locale (homogénéisé par migration expand pour auth/mfa) |
| Abandon après N tentatives | Log + métrique + alerting — l'envoi est définitivement perdu (la business operation reste, le courriel non envoyé) |

---

## 9. Anti-patterns rejetés en review

❌ **Module source qui lit `notification_email_log`** : viole Principe V.
   Si un module source a besoin de savoir si un envoi est effectif,
   il consulte sa propre row outbox locale.

❌ **Module source qui poste directement à SES** : court-circuite la
   suppression list, perd l'observabilité, viole l'unicité du moteur
   transactionnel.

❌ **Worker partagé multi-source dans `notifications/`** : viole
   Principe V, créerait un import cross-module Prisma détecté par
   `check-module-boundaries.ts`.

❌ **Cross-module write dans `notification_audit_entries`** : viole
   Principe V. Si un module source veut auditer une décision (ex:
   conformité décide de marquer un conseiller `email_invalide` après
   bounce), il le fait dans **son propre** journal d'audit.

❌ **JOIN cross-module sur `auth_users` depuis le module conformité**
   pour récupérer le `recipientLocale` : à éviter — passer par
   `ConformiteQueryFacade.getRecipientProfile()` qui encapsule le
   lookup (in-module si la table est gérée par conformité, sinon
   réplication minimale au moment du dépôt outbox).

---

## 10. Liste des modules sources J1

| Module | Worker | Schéma source | Action 003 |
|---|---|---|---|
| 001 conformité | `OutboxPublisherJob` existant | `conformite_outbox` (recipientEmail dans payload) | **Modifier** : remplacer appel `RedisConformiteEventPublisher` par `NotificationPort.send()` |
| 002 auth | `AuthOutboxDispatchWorker` à créer | `auth_outbox_emails` (recipientEmail en colonne) | **Créer** + migration expand `next_attempt_at` |
| 002a MFA | `MfaOutboxDispatchWorker` à créer | `mfa_outbox_emails` (recipientEmail via FK) | **Créer** + migration expand `next_attempt_at` |

## 11. Modules sources futurs

| Module | Trigger | Notes |
|---|---|---|
| 008 intake voyageur | Feature future | Outbox `intake_outbox` posée par 008 selon schéma libre, mapper côté 008 |
| 012 matching | Feature future | Outbox `matching_outbox`, mapper côté 012 |
| 006 facturation | Feature future | Outbox `facturation_outbox`, mapper côté 006 |

Chaque module futur consommera `NotificationPort` sans aucune
modification du module notifications.
