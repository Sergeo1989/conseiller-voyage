// Port NotificationPort — abstrait l'envoi de notifications au conseiller
// (résultat de revue, rappel d'expiration, révocation).
// L'implémentation BullmqNotification (T064) enqueue un job par destinataire
// (Principle X). Le module identité consommera ces événements via le
// pattern outbox (cf. R4), mais nous gardons un port distinct pour les
// envois directs ciblés depuis ce module.

import type { ConseillerId } from '@cv/shared/conformite';

export type NotificationKind =
  | 'dossier_approved'
  | 'dossier_refused'
  | 'expiration_reminder'
  | 'status_suspended'
  | 'status_revoked';

export interface NotificationToSend {
  readonly conseillerId: ConseillerId;
  readonly kind: NotificationKind;
  /** Payload propre à la notif — strict typing par kind à venir si besoin. */
  readonly payload: Record<string, unknown>;
}

export interface NotificationPort {
  enqueue(notification: NotificationToSend): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol.for('NotificationPort');
