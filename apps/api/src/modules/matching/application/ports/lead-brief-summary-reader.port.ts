// T028 [US1] — Port LeadBriefSummaryReader.
//
// Lit un résumé NON sensible d'un brief (destinations, période approximative,
// type de projet) pour le contenu de la notification conseiller. JAMAIS de PII
// de contact (nom, courriel, téléphone, adresse). `null` si brief inexistant
// ou anonymisé (Loi 25).

import type { LeadBriefSummaryDto } from './lead-notification-mailer.port';

export interface LeadBriefSummaryReader {
  getSummary(briefId: string): Promise<LeadBriefSummaryDto | null>;
}

export const LEAD_BRIEF_SUMMARY_READER = Symbol.for('LeadBriefSummaryReader');
