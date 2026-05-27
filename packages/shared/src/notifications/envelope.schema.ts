// T003 — Schéma Zod du contrat public `NotificationEnvelope`.
//
// Ce schéma définit le payload échangé entre les modules sources
// (001 conformité, 002 auth, 002a MFA, 008+ à venir) et le port
// public `NotificationPort` exposé par le module notifications.
//
// Versionné via `schemaVersion: 1` pour permettre évolution sans
// breaking change (additivité = mineur, retrait = majeur cf.
// contracts/notification.port.md).
//
// Validation côté serveur (Principe IX). Le port `NotificationPort.send()`
// rejette toute envelope non conforme via `NotificationEnvelopeValidationError`.

import { z } from 'zod';

export const NotificationLocaleSchema = z.enum(['fr-CA', 'en']);
export type NotificationLocale = z.infer<typeof NotificationLocaleSchema>;

export const NotificationSourceModuleSchema = z.enum([
  'conformite',
  'identite',
  'intake',
  'matching',
  'facturation',
]);
export type NotificationSourceModule = z.infer<typeof NotificationSourceModuleSchema>;

export const NotificationEnvelopeSchema = z
  .object({
    // Version du schéma — incrémenter en cas de breaking change majeur.
    // L'ajout de champs optionnels reste mineur (schemaVersion: 1 conservé).
    schemaVersion: z.literal(1),

    // Identifiant outbox du module source. Clé d'idempotence stricte :
    // deux envelopes avec le même `correlationId` produisent zéro ou un
    // seul envoi SES.
    correlationId: z.string().uuid(),

    // Nom métier de l'événement (ex: 'auth.email_verification',
    // 'conformite.dossier_approved'). Format libre côté source.
    eventType: z.string().min(1).max(100),

    // Identifiant stable du template `react-email` à utiliser.
    // Format conventionnel : '<module>.<template-name>'.
    templateId: z.string().min(1).max(100),

    // Adresse email destinataire en clair, RFC 5321 (≤ 254 caractères).
    recipientEmail: z.string().email().max(254),

    // Préférence linguistique du destinataire au moment du drainage.
    recipientLocale: NotificationLocaleSchema,

    // Données dynamiques injectées dans le template. Validation
    // secondaire effectuée par le renderer du template concret (qui
    // connaît son propre schéma typé).
    templateData: z.record(z.unknown()),

    // Module qui a déposé l'envelope. Utile pour observabilité +
    // routing alerting.
    sourceModule: NotificationSourceModuleSchema,

    // Horodatage ISO 8601 du dépôt outbox source (avant drainage).
    enqueuedAt: z.string().datetime(),
  })
  .strict();

export type NotificationEnvelope = z.infer<typeof NotificationEnvelopeSchema>;

/**
 * Erreur levée par `NotificationPort.send()` quand l'envelope ne respecte
 * pas le schéma. Le module consommateur peut catch et logger en
 * conséquence (ce n'est pas une erreur transient retry-able).
 */
export class NotificationEnvelopeValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super('NotificationEnvelope failed Zod validation');
    this.name = 'NotificationEnvelopeValidationError';
  }
}
