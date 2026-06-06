// T020 [GREEN] — Entité Lead (domaine feature 012).
// Invariants enforcés domain + DB :
//   - matchingResultEntryPosition ∈ {1, 2, 3} (CHECK DB chk_lead_entry_position_range)
//   - scoreFinal null OU ∈ [0, 1.1] (recopié de l'entry — signal non PII)
//   - briefId nullable (neutralisé à l'anonymisation Loi 25)
//   - currentState : LeadState valide

import type { LeadId, LeadState } from '@cv/shared/matching';

const SCORE_FINAL_MAX = 1.1; // cap boost +10 % hérité 011

export interface LeadProps {
  readonly id: LeadId;
  readonly matchingResultId: string;
  readonly matchingResultEntryPosition: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly currentState: LeadState;
  readonly scoreFinal: number | null;
  readonly boosted: boolean;
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Lead {
  private constructor(public readonly props: LeadProps) {}

  static create(props: LeadProps): Lead {
    if (![1, 2, 3].includes(props.matchingResultEntryPosition)) {
      throw new Error(
        `Lead invariant : position ${props.matchingResultEntryPosition} hors {1,2,3}`,
      );
    }
    if (props.scoreFinal !== null) {
      if (props.scoreFinal < 0 - 1e-6 || props.scoreFinal > SCORE_FINAL_MAX + 1e-6) {
        throw new Error(
          `Lead invariant : scoreFinal (${props.scoreFinal}) hors [0, ${SCORE_FINAL_MAX}]`,
        );
      }
    }
    return new Lead(props);
  }
}
