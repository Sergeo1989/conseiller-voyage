// T020 — Tests d'invariant des entités Lead + LeadTransition (feature 012).

import { asLeadId, asLeadTransitionId } from '@cv/shared/matching';
import { describe, expect, it } from 'vitest';
import { LeadTransition } from '../lead-transition.entity';
import { Lead } from '../lead.entity';

const LEAD_ID = asLeadId('11111111-1111-4111-8111-111111111111');
const TR_ID = asLeadTransitionId('22222222-2222-4222-8222-222222222222');
const CONSEILLER_ID = '33333333-3333-4333-8333-333333333333';

function baseLeadProps() {
  return {
    id: LEAD_ID,
    matchingResultId: '44444444-4444-4444-8444-444444444444',
    matchingResultEntryPosition: 1 as const,
    conseillerId: CONSEILLER_ID,
    briefId: '55555555-5555-4555-8555-555555555555' as string | null,
    currentState: 'envoye' as const,
    scoreFinal: 0.82,
    boosted: false,
    closeReason: null as string | null,
    createdAt: new Date('2026-06-05T12:00:00Z'),
    updatedAt: new Date('2026-06-05T12:00:00Z'),
  };
}

describe('Lead entity', () => {
  it('accepte une position 1-3 et un briefId présent ou null', () => {
    expect(() => Lead.create(baseLeadProps())).not.toThrow();
    expect(() => Lead.create({ ...baseLeadProps(), briefId: null })).not.toThrow();
    expect(() => Lead.create({ ...baseLeadProps(), matchingResultEntryPosition: 3 })).not.toThrow();
  });

  it('rejette une position hors {1,2,3}', () => {
    expect(() =>
      Lead.create({ ...baseLeadProps(), matchingResultEntryPosition: 4 as unknown as 1 }),
    ).toThrow(/position/);
  });

  it('accepte scoreFinal null (anonymisé / non recopié)', () => {
    expect(() => Lead.create({ ...baseLeadProps(), scoreFinal: null })).not.toThrow();
  });

  it('rejette un scoreFinal hors [0, 1.1]', () => {
    expect(() => Lead.create({ ...baseLeadProps(), scoreFinal: 1.5 })).toThrow(/scoreFinal/);
    expect(() => Lead.create({ ...baseLeadProps(), scoreFinal: -0.1 })).toThrow(/scoreFinal/);
  });
});

describe('LeadTransition entity', () => {
  function baseTransition() {
    return {
      id: TR_ID,
      leadId: LEAD_ID as string,
      fromState: 'envoye' as const,
      toState: 'vu' as const,
      action: 'marquer_vu' as const,
      actor: 'conseiller' as const,
      actorId: CONSEILLER_ID as string | null,
      reason: null as string | null,
      occurredAt: new Date('2026-06-05T12:05:00Z'),
    };
  }

  it('accepte actor=conseiller avec actorId', () => {
    expect(() => LeadTransition.create(baseTransition())).not.toThrow();
  });

  it('accepte actor=systeme avec actorId null + fromState null (genèse)', () => {
    expect(() =>
      LeadTransition.create({
        ...baseTransition(),
        actor: 'systeme',
        actorId: null,
        fromState: null,
        action: 'clore_systeme',
        toState: 'perdu',
      }),
    ).not.toThrow();
  });

  it('rejette actor=conseiller sans actorId', () => {
    expect(() => LeadTransition.create({ ...baseTransition(), actorId: null })).toThrow(/actorId/);
  });

  it('rejette actor=systeme avec actorId non null', () => {
    expect(() => LeadTransition.create({ ...baseTransition(), actor: 'systeme' })).toThrow(
      /actorId null/,
    );
  });

  it('rejette un reason > 500 caractères', () => {
    expect(() => LeadTransition.create({ ...baseTransition(), reason: 'x'.repeat(501) })).toThrow(
      /500/,
    );
  });
});
