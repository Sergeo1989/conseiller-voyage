// T010 [US2] — Server Action : refuser un lead (vu → refusé, terminal).
'use server';

import type { ActionResult } from '@/shared/lib/result';
import type { LeadView } from '../schemas/lead';
import { callLeadTransition } from './_transition.helper';

export async function refuseLeadAction(input: {
  leadId: string;
  locale: string;
  reason?: string;
}): Promise<ActionResult<LeadView>> {
  return callLeadTransition({ ...input, verb: 'refuse' });
}
