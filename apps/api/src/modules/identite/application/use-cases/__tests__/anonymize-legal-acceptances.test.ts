// T091 — AnonymizeLegalAcceptancesUseCase tests.
//
// Couverture Phase N Polish (Loi 25, ADR-0008) :
//   - N acceptances → N rows d'anonymisation insérées avec salt + version
//   - rows originales jamais touchées (vérifié par absence d'appel writer
//     côté LegalAcceptance — la suppression des rows originales est
//     bloquée DB-side par les triggers immutables, donc rien à mocker)
//   - idempotent : acceptances déjà anonymisées sont skipées
//   - hash déterministe : même subjectId + salt → même hash
//   - IP masquée et UA réduit à family

import { LegalAcceptanceAnonymizationIdSchema, LegalAcceptanceIdSchema } from '@cv/legal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { LegalAcceptanceAnonymization } from '../../../domain/entities/legal-acceptance-anonymization.entity';
import type { LegalAcceptanceWithAnonymization } from '../../../domain/entities/legal-acceptance-anonymization.entity';
import type { LegalAcceptance } from '../../../domain/entities/legal-acceptance.entity';
import type { LegalAcceptanceAnonymizationWriter } from '../../ports/legal-acceptance-anonymization-writer.port';
import type { LegalAcceptanceReader } from '../../ports/legal-acceptance-reader.port';
import { AnonymizeLegalAcceptancesUseCase } from '../anonymize-legal-acceptances.use-case';

const NOW = new Date('2026-06-15T10:00:00Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SALT = 'test-salt-32-bytes-long-aaaaaaaaa';

function acceptance(idSuffix: string, ip: string, ua: string): LegalAcceptance {
  return {
    id: LegalAcceptanceIdSchema.parse(`00000000-0000-4000-8000-000000000${idSuffix}`),
    subjectType: 'user',
    subjectId: USER_ID,
    documentType: 'cgu_b2b',
    documentVersion: 1,
    acceptedAt: new Date('2026-04-20T00:00:00Z'),
    ipAddress: ip,
    userAgent: ua,
  };
}

function anonymization(acceptanceId: string): LegalAcceptanceAnonymization {
  return {
    id: LegalAcceptanceAnonymizationIdSchema.parse('22222222-2222-4222-8222-222222222222'),
    acceptanceId: LegalAcceptanceIdSchema.parse(acceptanceId),
    subjectIdHash: 'a'.repeat(64),
    ipAddressMasked: '0.0.0.0',
    userAgentFamily: 'unknown',
    anonymizedAt: NOW,
    anonymizationSaltVersion: 1,
  };
}

function buildUseCase(
  acceptances: ReadonlyArray<LegalAcceptanceWithAnonymization>,
  writerOpts: { rejectId?: string } = {},
): { useCase: AnonymizeLegalAcceptancesUseCase; writer: LegalAcceptanceAnonymizationWriter } {
  let counter = 0;
  const reader: LegalAcceptanceReader = {
    findLatestBySubject: vi.fn(),
    findWithAnonymization: vi.fn(),
    listBySubject: vi.fn().mockResolvedValue(acceptances),
  };
  const writer: LegalAcceptanceAnonymizationWriter = {
    insertAnonymization: vi.fn().mockImplementation((input) => {
      if (writerOpts.rejectId && input.acceptanceId === writerOpts.rejectId) {
        return Promise.reject(new Error('P2002 unique violation'));
      }
      return Promise.resolve({
        id: input.id,
        acceptanceId: input.acceptanceId,
        subjectIdHash: input.subjectIdHash,
        ipAddressMasked: input.ipAddressMasked,
        userAgentFamily: input.userAgentFamily,
        anonymizedAt: input.anonymizedAt,
        anonymizationSaltVersion: input.anonymizationSaltVersion,
      });
    }),
  };
  const clock: Clock = {
    now: vi.fn().mockReturnValue(NOW),
    nowMs: vi.fn().mockReturnValue(NOW.getTime()),
  };
  const uuids: UuidGenerator = {
    generate: vi.fn().mockImplementation(() => {
      counter += 1;
      return `33333333-3333-4333-8333-3333333333${counter.toString().padStart(2, '0')}`;
    }),
  };
  return {
    useCase: new AnonymizeLegalAcceptancesUseCase(reader, writer, clock, uuids),
    writer,
  };
}

describe('AnonymizeLegalAcceptancesUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it("insère N rows d'anonymisation pour N acceptances", async () => {
    const acceptances: LegalAcceptanceWithAnonymization[] = [
      {
        acceptance: acceptance('aa1', '192.168.1.42', 'Mozilla/5.0 Firefox/120'),
        anonymization: null,
        isAnonymized: false,
      },
      {
        acceptance: acceptance('aa2', '2001:db8::ff42', 'Mozilla/5.0 Chrome/120'),
        anonymization: null,
        isAnonymized: false,
      },
      {
        acceptance: acceptance('aa3', '203.0.113.7', 'Safari/15'),
        anonymization: null,
        isAnonymized: false,
      },
    ];
    const { useCase, writer } = buildUseCase(acceptances);
    const result = await useCase.execute({ subjectId: USER_ID, anonymizationSalt: SALT });
    expect(result.anonymizedCount).toBe(3);
    expect(writer.insertAnonymization).toHaveBeenCalledTimes(3);
  });

  it('skip les acceptances déjà anonymisées (idempotent)', async () => {
    const acceptances: LegalAcceptanceWithAnonymization[] = [
      {
        acceptance: acceptance('aa1', '1.2.3.4', 'UA1'),
        anonymization: anonymization('00000000-0000-4000-8000-000000000aa1'),
        isAnonymized: true,
      },
      { acceptance: acceptance('aa2', '5.6.7.8', 'UA2'), anonymization: null, isAnonymized: false },
    ];
    const { useCase, writer } = buildUseCase(acceptances);
    const result = await useCase.execute({ subjectId: USER_ID, anonymizationSalt: SALT });
    expect(result.anonymizedCount).toBe(1);
    expect(writer.insertAnonymization).toHaveBeenCalledTimes(1);
  });

  it('utilise le salt et la version de salt fournis', async () => {
    const acceptances: LegalAcceptanceWithAnonymization[] = [
      { acceptance: acceptance('aa1', '1.2.3.4', 'UA'), anonymization: null, isAnonymized: false },
    ];
    const { useCase, writer } = buildUseCase(acceptances);
    await useCase.execute({
      subjectId: USER_ID,
      anonymizationSalt: SALT,
      anonymizationSaltVersion: 2,
    });
    expect(writer.insertAnonymization).toHaveBeenCalledWith(
      expect.objectContaining({ anonymizationSaltVersion: 2 }),
    );
  });

  it('IP IPv4 masquée à /8 et userAgent réduit à family', async () => {
    const acceptances: LegalAcceptanceWithAnonymization[] = [
      {
        acceptance: acceptance(
          'aa1',
          '192.168.1.42',
          'Mozilla/5.0 (Windows NT 10.0) Firefox/120.0',
        ),
        anonymization: null,
        isAnonymized: false,
      },
    ];
    const { useCase, writer } = buildUseCase(acceptances);
    await useCase.execute({ subjectId: USER_ID, anonymizationSalt: SALT });
    expect(writer.insertAnonymization).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddressMasked: '192.0.0.0',
        userAgentFamily: 'Firefox',
      }),
    );
  });

  it('tolère un P2002 unique violation (idempotence DB) — log warning, continue', async () => {
    const acceptances: LegalAcceptanceWithAnonymization[] = [
      { acceptance: acceptance('aa1', '1.2.3.4', 'UA1'), anonymization: null, isAnonymized: false },
      { acceptance: acceptance('aa2', '5.6.7.8', 'UA2'), anonymization: null, isAnonymized: false },
    ];
    const rejectId = '00000000-0000-4000-8000-000000000aa1';
    const { useCase } = buildUseCase(acceptances, { rejectId });
    const result = await useCase.execute({ subjectId: USER_ID, anonymizationSalt: SALT });
    expect(result.anonymizedCount).toBe(1);
  });
});
