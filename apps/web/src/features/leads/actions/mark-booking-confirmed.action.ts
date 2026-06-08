// T010 [US2] — Server Action : marquer réservation confirmée (devis_envoyé →
// réservation_confirmée). Déclaratif ; n'affecte pas les leads frères (012).
'use server';

import type { ActionResult } from '@/shared/lib/result';
import type { LeadView } from '../schemas/lead';
import { callLeadTransition } from './_transition.helper';

export async function markBookingConfirmedAction(input: {
  leadId: string;
  locale: string;
}): Promise<ActionResult<LeadView>> {
  return callLeadTransition({ ...input, verb: 'booking-confirmed' });
}
