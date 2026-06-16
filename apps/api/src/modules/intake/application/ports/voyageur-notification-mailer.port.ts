// T016 [017] — Port VoyageurNotificationMailer (envoi d'une notification voyageur).
//
// Le Sender (job BullMQ) appelle `send` avec la notification en attente ; le
// mailer résout l'adresse du voyageur, génère un magic-link `view_brief_status`
// (008, renvoyable), rend le bon gabarit FR-CA et envoie via SES ca-central-1.
// THROW si SES échoue → le job retente (backoff). Les `skipped_*` sont des
// issues définitives non bloquantes (brief anonymisé / sans adresse).

import type { MatchOutcome, VoyageurNotificationType } from '@cv/shared/intake';

export interface SendVoyageurNotificationInput {
  readonly notificationId: string;
  readonly briefId: string;
  readonly type: VoyageurNotificationType;
  readonly outcome: MatchOutcome | null;
  readonly conseillerIds: ReadonlyArray<string>;
}

export type SendVoyageurNotificationResult =
  | { readonly kind: 'sent' }
  | { readonly kind: 'skipped_anonymized' } // Loi 25 : brief effacé/anonymisé
  | { readonly kind: 'skipped_no_address' }; // contact sans courriel (anonymisé)

export interface VoyageurNotificationMailer {
  send(input: SendVoyageurNotificationInput): Promise<SendVoyageurNotificationResult>;
}

export const VOYAGEUR_NOTIFICATION_MAILER = Symbol.for('VoyageurNotificationMailer');
