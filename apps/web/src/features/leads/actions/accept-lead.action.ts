// T010 [US2] — Server Action : accepter un lead (vu → accepté). Ouvre le fil (013).
'use server';

import type { ActionResult } from '@/shared/lib/result';
import type { LeadView } from '../schemas/lead';
import { callLeadTransition } from './_transition.helper';

export function acceptLeadAction(input: {
  leadId: string;
  locale: string;
}): Promise<ActionResult<LeadView>> {
  return callLeadTransition({ ...input, verb: 'accept' });
}
