// T010 [US2] — Server Action : marquer perdu (* non terminal → perdu, terminal).
'use server';

import type { ActionResult } from '@/shared/lib/result';
import type { LeadView } from '../schemas/lead';
import { callLeadTransition } from './_transition.helper';

export function markLostAction(input: {
  leadId: string;
  locale: string;
  reason?: string;
}): Promise<ActionResult<LeadView>> {
  return callLeadTransition({ ...input, verb: 'lost' });
}
