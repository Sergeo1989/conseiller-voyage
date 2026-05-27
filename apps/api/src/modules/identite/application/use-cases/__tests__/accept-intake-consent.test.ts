// T081 — AcceptIntakeConsentUseCase tests.
//
// Couverture US4 :
//   - cas nominal confidentialite : insert acceptance subjectType='brief'
//   - cas nominal cgu_b2c : insert acceptance subjectType='brief'
//   - rejeu idempotent : retourne l'existante sans new INSERT
//   - version inconnue → NotFoundException
//   - version pas encore effective → NotFoundException
//
// Note (Principe V — pas de partage de client Prisma cross-module) :
// l'API publique ne reçoit jamais un client transactionnel. La façade
// délègue au repository writer qui encapsule sa propre transaction.

import { LegalAcceptanceIdSchema, LegalDocumentIdSchema } from '@cv/legal';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { LegalAcceptance } from '../../../domain/entities/legal-acceptance.entity';
import type { LegalDocument } from '../../../domain/entities/legal-document.entity';
import type { LegalAcceptanceReader } from '../../ports/legal-acceptance-reader.port';
import type { LegalAcceptanceWriter } from '../../ports/legal-acceptance-writer.port';
import type { LegalDocumentRepository } from '../../ports/legal-document-repository.port';
import {
  AcceptIntakeConsentUseCase,
  type IntakeConsentDocumentType,
} from '../accept-intake-consent.use-case';

const NOW = new Date('2026-05-27T10:00:00Z');
const BRIEF_ID = '00000000-0000-4000-8000-000000000b01';
const ACCEPTANCE_ID = '00000000-0000-4000-8000-000000000aaa';

function doc(type: IntakeConsentDocumentType, version: number, effective: Date): LegalDocument {
  return {
    id: LegalDocumentIdSchema.parse(
      `00000000-0000-4000-8000-00000000d0${version.toString().padStart(2, '0')}`,
    ),
    type,
    version,
    checksum: 'a'.repeat(64),
    contentSnapshot: `# ${type} v${version}`,
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    effectiveAt: effective,
  };
}

function accept(type: IntakeConsentDocumentType, version: number): LegalAcceptance {
  return {
    id: LegalAcceptanceIdSchema.parse(ACCEPTANCE_ID),
    subjectType: 'brief',
    subjectId: BRIEF_ID,
    documentType: type,
    documentVersion: version,
    acceptedAt: NOW,
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0',
  };
}

interface Mocks {
  documents: LegalDocumentRepository;
  reader: LegalAcceptanceReader;
  writer: LegalAcceptanceWriter;
  clock: Clock;
  uuids: UuidGenerator;
}

function mocks(
  type: IntakeConsentDocumentType,
  effective: Date = new Date('2026-04-15T00:00:00Z'),
  existing: LegalAcceptance | null = null,
): Mocks {
  return {
    documents: {
      findById: vi.fn(),
      findByTypeAndVersion: vi.fn().mockResolvedValue(doc(type, 1, effective)),
      findCurrentByType: vi.fn(),
      listEffectiveByType: vi.fn(),
      insertVersion: vi.fn(),
    },
    reader: {
      findLatestBySubject: vi.fn().mockResolvedValue(existing),
      findWithAnonymization: vi.fn(),
      listBySubject: vi.fn(),
    },
    writer: { insert: vi.fn().mockResolvedValue(accept(type, 1)) },
    clock: { now: vi.fn().mockReturnValue(NOW), nowMs: vi.fn().mockReturnValue(NOW.getTime()) },
    uuids: { generate: vi.fn().mockReturnValue(ACCEPTANCE_ID) },
  };
}

function build(m: Mocks): AcceptIntakeConsentUseCase {
  return new AcceptIntakeConsentUseCase(m.documents, m.reader, m.writer, m.clock, m.uuids);
}

describe('AcceptIntakeConsentUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cas nominal confidentialite : insert subjectType=brief', async () => {
    const m = mocks('confidentialite');
    const uc = build(m);
    const result = await uc.execute({
      briefId: BRIEF_ID,
      documentType: 'confidentialite',
      documentVersion: 1,
      acceptedAt: NOW,
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0',
    });
    expect(result.alreadyAccepted).toBe(false);
    expect(result.acceptance.subjectType).toBe('brief');
    expect(result.acceptance.documentType).toBe('confidentialite');
    expect(m.writer.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'brief',
        subjectId: BRIEF_ID,
        documentType: 'confidentialite',
      }),
    );
  });

  it('cas nominal cgu_b2c : insert subjectType=brief', async () => {
    const m = mocks('cgu_b2c');
    const uc = build(m);
    const result = await uc.execute({
      briefId: BRIEF_ID,
      documentType: 'cgu_b2c',
      documentVersion: 1,
      acceptedAt: NOW,
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0',
    });
    expect(result.alreadyAccepted).toBe(false);
    expect(result.acceptance.documentType).toBe('cgu_b2c');
  });

  it('rejeu idempotent : retourne existing avec alreadyAccepted=true', async () => {
    const existing = accept('confidentialite', 1);
    const m = mocks('confidentialite', new Date('2026-04-15T00:00:00Z'), existing);
    const uc = build(m);
    const result = await uc.execute({
      briefId: BRIEF_ID,
      documentType: 'confidentialite',
      documentVersion: 1,
      acceptedAt: NOW,
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0',
    });
    expect(result.alreadyAccepted).toBe(true);
    expect(result.acceptance).toBe(existing);
    expect(m.writer.insert).not.toHaveBeenCalled();
  });

  it('version inconnue → NotFoundException', async () => {
    const m = mocks('cgu_b2c');
    (m.documents.findByTypeAndVersion as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const uc = build(m);
    await expect(
      uc.execute({
        briefId: BRIEF_ID,
        documentType: 'cgu_b2c',
        documentVersion: 99,
        acceptedAt: NOW,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('version pas encore effective → NotFoundException', async () => {
    const future = new Date('2026-12-31T00:00:00Z');
    const m = mocks('confidentialite', future);
    const uc = build(m);
    await expect(
      uc.execute({
        briefId: BRIEF_ID,
        documentType: 'confidentialite',
        documentVersion: 1,
        acceptedAt: NOW,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
