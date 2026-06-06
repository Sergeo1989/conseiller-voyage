// T014 — Port LeadNotificationMailer (envoi courriel conseiller, feature 012).
//
// L'adapter (SES) résout l'adresse du destinataire via le module identité
// AU MOMENT de l'envoi (jamais stockée dans 012), re-vérifie `verified`, rend
// le gabarit FR-CA `lead-received.tsx` (sans PII de contact) et envoie via SES.

/** Résumé NON sensible du brief (FR-004) — jamais de PII de contact. */
export interface LeadBriefSummaryDto {
  readonly destinations: ReadonlyArray<string>;
  readonly periodeApprox: string;
  readonly typeProjet: string;
}

export interface SendLeadReceivedInput {
  readonly conseillerId: string;
  readonly leadId: string;
  readonly briefSummary: LeadBriefSummaryDto;
}

export type SendLeadReceivedResult =
  | { readonly kind: 'sent' }
  | { readonly kind: 'skipped_unverified' } // conseiller non vérifié au re-check
  | { readonly kind: 'skipped_no_address' }; // adresse introuvable (échec non bloquant)

export interface LeadNotificationMailer {
  /**
   * Envoie la notification « nouveau lead » au conseiller. Lève une exception
   * en cas d'échec transitoire (SES HS) pour que le job BullMQ retente (backoff).
   * Les cas `skipped_*` sont des issues définitives non bloquantes.
   */
  sendLeadReceived(input: SendLeadReceivedInput): Promise<SendLeadReceivedResult>;
}

export const LEAD_NOTIFICATION_MAILER = Symbol.for('LeadNotificationMailer');
