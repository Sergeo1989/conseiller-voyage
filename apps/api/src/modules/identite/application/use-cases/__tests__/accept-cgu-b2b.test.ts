// T065 — AcceptCguB2bUseCase tests.
//
// Couverture des règles métier US3 :
//   - cas nominal : insert + acceptance retournée
//   - RBAC voyageur → 403
//   - version inconnue → 404
//   - version pas encore effective → 404
//   - version supersédée → 409
//   - double soumission → idempotent (alreadyAccepted=true, pas de duplicate INSERT)

import { LegalAcceptanceIdSchema, LegalDocumentIdSchema } from '@cv/legal';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { LegalAcceptance } from '../../../domain/entities/legal-acceptance.entity';
import type { LegalDocument } from '../../../domain/entities/legal-document.entity';
import type { LegalAcceptanceReader } from '../../ports/legal-acceptance-reader.port';
import type { LegalAcceptanceWriter } from '../../ports/legal-acceptance-writer.port';
import type { LegalDocumentRepository } from '../../ports/legal-document-repository.port';
import { AcceptCguB2bUseCase } from '../accept-cgu-b2b.use-case';

const NOW = new Date('2026-05-27T10:00:00Z');
const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACCEPTANCE_ID = '00000000-0000-4000-8000-000000000aaa';
const DOC_V1_ID = '00000000-0000-4000-8000-000000000d01';
const DOC_V2_ID = '00000000-0000-4000-8000-000000000d02';

function makeDocV1(): LegalDocument {
  return {
    id: LegalDocumentIdSchema.parse(DOC_V1_ID),
    type: 'cgu_b2b',
    version: 1,
    checksum: 'a'.repeat(64),
    contentSnapshot: '# CGU v1',
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    effectiveAt: new Date('2026-04-15T00:00:00Z'),
  };
}

function makeDocV2(effectiveAt: Date): LegalDocument {
  return {
    id: LegalDocumentIdSchema.parse(DOC_V2_ID),
    type: 'cgu_b2b',
    version: 2,
    checksum: 'b'.repeat(64),
    contentSnapshot: '# CGU v2',
    publishedAt: new Date('2026-05-01T00:00:00Z'),
    effectiveAt,
  };
}

function makeAcceptance(version: number): LegalAcceptance {
  return {
    id: LegalAcceptanceIdSchema.parse(ACCEPTANCE_ID),
    subjectType: 'user',
    subjectId: USER_ID,
    documentType: 'cgu_b2b',
    documentVersion: version,
    acceptedAt: NOW,
    ipAddress: '192.168.1.42',
    userAgent: 'Mozilla/5.0',
  };
}

const VALID_INPUT = {
  userId: USER_ID,
  actorRole: 'conseiller' as const,
  documentVersion: 1,
  ipAddress: '192.168.1.42',
  userAgent: 'Mozilla/5.0',
};

interface Mocks {
  documents: LegalDocumentRepository;
  reader: LegalAcceptanceReader;
  writer: LegalAcceptanceWriter;
  clock: Clock;
  uuids: UuidGenerator;
}

function buildMocks(overrides: Partial<Mocks> = {}): Mocks {
  return {
    documents: {
      findById: vi.fn(),
      findByTypeAndVersion: vi.fn().mockResolvedValue(makeDocV1()),
      findCurrentByType: vi.fn().mockResolvedValue(makeDocV1()),
      listEffectiveByType: vi.fn(),
      insertVersion: vi.fn(),
    },
    reader: {
      findLatestBySubject: vi.fn().mockResolvedValue(null),
      findWithAnonymization: vi.fn(),
      listBySubject: vi.fn(),
    },
    writer: {
      insert: vi.fn().mockResolvedValue(makeAcceptance(1)),
    },
    clock: { now: vi.fn().mockReturnValue(NOW), nowMs: vi.fn().mockReturnValue(NOW.getTime()) },
    uuids: { generate: vi.fn().mockReturnValue(ACCEPTANCE_ID) },
    ...overrides,
  };
}

function build(mocks: Mocks): AcceptCguB2bUseCase {
  return new AcceptCguB2bUseCase(
    mocks.documents,
    mocks.reader,
    mocks.writer,
    mocks.clock,
    mocks.uuids,
  );
}

describe('AcceptCguB2bUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cas nominal : insère une LegalAcceptance et retourne alreadyAccepted=false', async () => {
    const mocks = buildMocks();
    const uc = build(mocks);

    const result = await uc.execute(VALID_INPUT);

    expect(result.alreadyAccepted).toBe(false);
    expect(result.acceptance.subjectId).toBe(USER_ID);
    expect(result.acceptance.documentType).toBe('cgu_b2b');
    expect(result.acceptance.documentVersion).toBe(1);
    expect(mocks.writer.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'user',
        subjectId: USER_ID,
        documentType: 'cgu_b2b',
        documentVersion: 1,
        ipAddress: '192.168.1.42',
        userAgent: 'Mozilla/5.0',
        acceptedAt: NOW,
      }),
    );
  });

  it('RBAC : role voyageur → ForbiddenException', async () => {
    const mocks = buildMocks();
    const uc = build(mocks);

    await expect(uc.execute({ ...VALID_INPUT, actorRole: 'voyageur' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mocks.writer.insert).not.toHaveBeenCalled();
  });

  it('version inconnue → NotFoundException', async () => {
    const mocks = buildMocks({
      documents: {
        findById: vi.fn(),
        findByTypeAndVersion: vi.fn().mockResolvedValue(null),
        findCurrentByType: vi.fn().mockResolvedValue(makeDocV1()),
        listEffectiveByType: vi.fn(),
        insertVersion: vi.fn(),
      },
    });
    const uc = build(mocks);

    await expect(uc.execute({ ...VALID_INPUT, documentVersion: 99 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mocks.writer.insert).not.toHaveBeenCalled();
  });

  it('version pas encore effective (effectiveAt > now) → NotFoundException', async () => {
    const future = new Date('2026-12-31T00:00:00Z');
    const docV2Future = makeDocV2(future);
    const mocks = buildMocks({
      documents: {
        findById: vi.fn(),
        findByTypeAndVersion: vi.fn().mockResolvedValue(docV2Future),
        findCurrentByType: vi.fn().mockResolvedValue(makeDocV1()),
        listEffectiveByType: vi.fn(),
        insertVersion: vi.fn(),
      },
    });
    const uc = build(mocks);

    await expect(uc.execute({ ...VALID_INPUT, documentVersion: 2 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mocks.writer.insert).not.toHaveBeenCalled();
  });

  it('version supersédée (v1 demandée, v2 courante effective) → ConflictException', async () => {
    const docV2Effective = makeDocV2(new Date('2026-05-15T00:00:00Z'));
    const mocks = buildMocks({
      documents: {
        findById: vi.fn(),
        findByTypeAndVersion: vi.fn().mockResolvedValue(makeDocV1()),
        findCurrentByType: vi.fn().mockResolvedValue(docV2Effective),
        listEffectiveByType: vi.fn(),
        insertVersion: vi.fn(),
      },
    });
    const uc = build(mocks);

    await expect(uc.execute({ ...VALID_INPUT, documentVersion: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mocks.writer.insert).not.toHaveBeenCalled();
  });

  it("double soumission : retourne l'acceptance existante avec alreadyAccepted=true", async () => {
    const existing = makeAcceptance(1);
    const mocks = buildMocks({
      reader: {
        findLatestBySubject: vi.fn().mockResolvedValue(existing),
        findWithAnonymization: vi.fn(),
        listBySubject: vi.fn(),
      },
    });
    const uc = build(mocks);

    const result = await uc.execute(VALID_INPUT);

    expect(result.alreadyAccepted).toBe(true);
    expect(result.acceptance).toBe(existing);
    expect(mocks.writer.insert).not.toHaveBeenCalled();
  });
});
