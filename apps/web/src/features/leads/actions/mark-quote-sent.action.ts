// T010 [US2] — Server Action : marquer devis envoyé (accepté → devis_envoyé).
// Marqueur déclaratif — AUCUN montant (le devis est un fichier opaque, ADR-0002).
'use server';

import type { ActionResult } from '@/shared/lib/result';
import type { LeadView } from '../schemas/lead';
import { callLeadTransition } from './_transition.helper';

export async function markQuoteSentAction(input: {
  leadId: string;
  locale: string;
}): Promise<ActionResult<LeadView>> {
  return callLeadTransition({ ...input, verb: 'quote-sent' });
}
