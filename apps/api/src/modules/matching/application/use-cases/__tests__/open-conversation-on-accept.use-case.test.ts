// T010 [US1] [TDD RED] — OpenConversationOnLeadAccepted : idempotent, 1 fil/lead.

import { describe, expect, it } from 'vitest';
import { FakeConversationRepo } from '../../__tests__/_conversation-fakes';
import { FakeClock, FakeUuidGenerator } from '../../__tests__/_lead-fakes';
import { OpenConversationOnLeadAcceptedUseCase } from '../open-conversation-on-accept.use-case';

const LEAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRIEF = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function build() {
  const repo = new FakeConversationRepo();
  const uc = new OpenConversationOnLeadAcceptedUseCase({
    clock: new FakeClock(new Date('2026-06-07T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    repo,
  });
  return { repo, uc };
}

const input = { leadId: LEAD, conseillerId: CONS, briefId: BRIEF, voyageurRef: 'voy-1' };

describe('OpenConversationOnLeadAccepted (FR-001)', () => {
  it('ouvre un fil pour un lead accepté', async () => {
    const { repo, uc } = build();
    const r = await uc.execute(input);
    expect(r.kind).toBe('opened');
    expect(repo.conversations).toHaveLength(1);
    expect(repo.conversations[0]?.leadId).toBe(LEAD);
  });

  it('idempotent : un 2e appel ne crée pas de doublon (1 fil par lead)', async () => {
    const { repo, uc } = build();
    await uc.execute(input);
    const r2 = await uc.execute(input);
    expect(r2.kind).toBe('already_open');
    expect(repo.conversations).toHaveLength(1);
  });
});
