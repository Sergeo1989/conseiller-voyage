// T067 — CheckCguUpToDateUseCase tests.
//
// Cas couverts :
//   1. up_to_date    : acceptedVersion === currentVersion
//   2. outdated      : acceptedVersion < currentVersion
//   3. never_accepted: aucune acceptance retrouvée
//   4. anomalie déploiement : aucune version effective → NotFoundException

import { LegalAcceptanceIdSchema, LegalDocumentIdSchema } from '@cv/legal';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import type { LegalAcceptance } from '../../../domain/entities/legal-acceptance.entity';
import type { LegalDocument } from '../../../domain/entities/legal-document.entity';
import type { LegalAcceptanceReader } from '../../ports/legal-acceptance-reader.port';
import type { LegalDocumentRepository } from '../../ports/legal-document-repository.port';
import { CheckCguUpToDateUseCase } from '../check-cgu-up-to-date.use-case';

const NOW = new Date('2026-05-27T10:00:00Z');
const USER_ID = '00000000-0000-4000-8000-000000000001';

function doc(version: number): LegalDocument {
  return {
    id: LegalDocumentIdSchema.parse(`00000000-0000-4000-8000-00000000d00${version}`),
    type: 'cgu_b2b',
    version,
    checksum: 'x'.repeat(64),
    contentSnapshot: '...',
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    effectiveAt: new Date('2026-04-15T00:00:00Z'),
  };
}

function acceptance(version: number): LegalAcceptance {
  return {
    id: LegalAcceptanceIdSchema.parse('00000000-0000-4000-8000-000000000aaa'),
    subjectType: 'user',
    subjectId: USER_ID,
    documentType: 'cgu_b2b',
    documentVersion: version,
    acceptedAt: new Date('2026-04-20T00:00:00Z'),
    ipAddress: '192.168.1.42',
    userAgent: 'Mozilla/5.0',
  };
}

function build(
  currentVersion: number | null,
  lastAccepted: LegalAcceptance | null,
): CheckCguUpToDateUseCase {
  const documents: LegalDocumentRepository = {
    findById: vi.fn(),
    findByTypeAndVersion: vi.fn(),
    findCurrentByType: vi.fn().mockResolvedValue(currentVersion ? doc(currentVersion) : null),
    listEffectiveByType: vi.fn(),
    insertVersion: vi.fn(),
  };
  const reader: LegalAcceptanceReader = {
    findLatestBySubject: vi.fn().mockResolvedValue(lastAccepted),
    findWithAnonymization: vi.fn(),
    listBySubject: vi.fn(),
  };
  const clock: Clock = {
    now: vi.fn().mockReturnValue(NOW),
    nowMs: vi.fn().mockReturnValue(NOW.getTime()),
  };
  return new CheckCguUpToDateUseCase(documents, reader, clock);
}

describe('CheckCguUpToDateUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('up_to_date : version acceptée === version courante', async () => {
    const result = await build(2, acceptance(2)).execute({ userId: USER_ID });
    expect(result.status).toBe('up_to_date');
    expect(result.currentVersion).toBe(2);
    expect(result.acceptedVersion).toBe(2);
  });

  it('outdated : version acceptée < version courante', async () => {
    const result = await build(2, acceptance(1)).execute({ userId: USER_ID });
    expect(result.status).toBe('outdated');
    expect(result.currentVersion).toBe(2);
    expect(result.acceptedVersion).toBe(1);
  });

  it('never_accepted : aucune acceptance', async () => {
    const result = await build(1, null).execute({ userId: USER_ID });
    expect(result.status).toBe('never_accepted');
    expect(result.currentVersion).toBe(1);
    expect(result.acceptedVersion).toBeNull();
  });

  it('anomalie : aucune version effective seedée → NotFoundException', async () => {
    await expect(build(null, null).execute({ userId: USER_ID })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
