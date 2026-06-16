// T010 [017 US1] [TDD RED] — Tests selectNotificationForOutcome.
// FR-001 (type selon issue), FR-003 (non matché = rassurant), FR-014 (anti-spam). Cf. data-model.

import { describe, expect, it } from 'vitest';
import { selectNotificationForOutcome } from '../select-notification-for-outcome';

describe('selectNotificationForOutcome — type selon issue', () => {
  it('matché → conseillers_prets', () => {
    expect(selectNotificationForOutcome('matched', null)).toEqual({
      type: 'conseillers_prets',
      suppressed: false,
    });
  });

  it('partiellement matché → conseillers_prets', () => {
    expect(selectNotificationForOutcome('partially_matched', null).type).toBe('conseillers_prets');
  });

  it('non matché → recherche_en_cours (ton rassurant, FR-003)', () => {
    expect(selectNotificationForOutcome('unmatched', null).type).toBe('recherche_en_cours');
  });
});

describe('selectNotificationForOutcome — anti-spam (FR-014)', () => {
  it('issue inchangée → supprimée', () => {
    expect(selectNotificationForOutcome('matched', 'matched').suppressed).toBe(true);
    expect(selectNotificationForOutcome('unmatched', 'unmatched').suppressed).toBe(true);
  });

  it('changement d’issue (non matché → matché) → notifiée', () => {
    expect(selectNotificationForOutcome('matched', 'unmatched').suppressed).toBe(false);
  });

  it('première notification (aucune précédente) → notifiée', () => {
    expect(selectNotificationForOutcome('partially_matched', null).suppressed).toBe(false);
  });
});
