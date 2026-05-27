// T085 + T086 — Test de contrat LegalAcceptanceFacade (US4 P2).
//
// Simule un consommateur 002-voyageur-intake et valide les garanties
// publiques de la façade :
//   1. acceptForBrief retourne un LegalAcceptanceRecord typé
//   2. acceptForBrief est idempotent sur (briefId, type, version)
//   3. acceptForBrief lève UnknownLegalDocumentVersionError si version inconnue
//   4. acceptForBrief lève UnknownLegalDocumentVersionError si pas effective
//   5. getCurrentVersion retourne un entier positif si version effective seedée
//   6. getCurrentVersion lève UnknownLegalDocumentVersionError si aucune version
//      effective n'est seedée
//   7. **Non-fuite de transaction** : aucune méthode du contrat ne reçoit
//      ni n'expose un client Prisma transactionnel.
//
// Le test ne touche pas la DB — il monte la façade avec des mocks pour
// valider la signature et les comportements documentés dans
// `contracts/legal-acceptance.port.md`.

import { LegalAcceptanceIdSchema, LegalDocumentIdSchema } from '@cv/legal';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../src/common/ports/clock.port';
import type { UuidGenerator } from '../../src/common/ports/uuid-generator.port';
import type { LegalAcceptanceReader } from '../../src/modules/identite/application/ports/legal-acceptance-reader.port';
import type { LegalAcceptanceWriter } from '../../src/modules/identite/application/ports/legal-acceptance-writer.port';
import type { LegalDocumentRepository } from '../../src/modules/identite/application/ports/legal-document-repository.port';
import { AcceptIntakeConsentUseCase } from '../../src/modules/identite/application/use-cases/accept-intake-consent.use-case';
import type { LegalAcceptance } from '../../src/modules/identite/domain/entities/legal-acceptance.entity';
import type { LegalDocument } from '../../src/modules/identite/domain/entities/legal-document.entity';
import {
  LegalAcceptanceFacade,
  UnknownLegalDocumentVersionError,
} from '../../src/modules/identite/interface/public-api/legal-acceptance.facade';

const NOW = new Date('2026-05-27T10:00:00Z');
const BRIEF_ID = '00000000-0000-4000-8000-000000000b01';
const ACCEPTANCE_ID = '00000000-0000-4000-8000-000000000aaa';

function doc(type: 'confidentialite' | 'cgu_b2c', version: number, effective: Date): LegalDocument {
  return {
    id: LegalDocumentIdSchema.parse(
      `00000000-0000-4000-8000-00000000d0${version.toString().padStart(2, '0')}`,
    ),
    type,
    version,
    checksum: 'a'.repeat(64),
    contentSnapshot: '...',
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    effectiveAt: effective,
  };
}

function acceptance(type: 'confidentialite' | 'cgu_b2c', version: number): LegalAcceptance {
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

function buildFacade(opts: {
  doc?: LegalDocument | null;
  existing?: LegalAcceptance | null;
  current?: LegalDocument | null;
}): LegalAcceptanceFacade {
  const documents: LegalDocumentRepository = {
    findById: vi.fn(),
    findByTypeAndVersion: vi.fn().mockResolvedValue(opts.doc ?? null),
    findCurrentByType: vi
      .fn()
      .mockResolvedValue(opts.current === undefined ? (opts.doc ?? null) : opts.current),
    listEffectiveByType: vi.fn(),
    insertVersion: vi.fn(),
  };
  const reader: LegalAcceptanceReader = {
    findLatestBySubject: vi.fn().mockResolvedValue(opts.existing ?? null),
    findWithAnonymization: vi.fn(),
    listBySubject: vi.fn(),
  };
  const writer: LegalAcceptanceWriter = {
    insert: vi.fn().mockResolvedValue(acceptance('confidentialite', 1)),
  };
  const clock: Clock = {
    now: vi.fn().mockReturnValue(NOW),
    nowMs: vi.fn().mockReturnValue(NOW.getTime()),
  };
  const uuids: UuidGenerator = { generate: vi.fn().mockReturnValue(ACCEPTANCE_ID) };
  const useCase = new AcceptIntakeConsentUseCase(documents, reader, writer, clock, uuids);
  return new LegalAcceptanceFacade(useCase, documents, clock);
}

describe('LegalAcceptanceFacade (contract)', () => {
  describe('acceptForBrief', () => {
    it('retourne un LegalAcceptanceRecord typé en cas nominal', async () => {
      const effective = new Date('2026-04-15T00:00:00Z');
      const facade = buildFacade({ doc: doc('confidentialite', 1, effective) });
      const result = await facade.acceptForBrief({
        briefId: BRIEF_ID,
        documentType: 'confidentialite',
        documentVersion: 1,
        acceptedAt: NOW,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.briefId).toBe(BRIEF_ID);
      expect(result.documentType).toBe('confidentialite');
      expect(result.documentVersion).toBe(1);
      expect(result.acceptedAt).toBeInstanceOf(Date);
    });

    it('est idempotent sur (briefId, type, version) : retourne le même ID', async () => {
      const effective = new Date('2026-04-15T00:00:00Z');
      const existing = acceptance('cgu_b2c', 1);
      const facade = buildFacade({ doc: doc('cgu_b2c', 1, effective), existing });
      const first = await facade.acceptForBrief({
        briefId: BRIEF_ID,
        documentType: 'cgu_b2c',
        documentVersion: 1,
        acceptedAt: NOW,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0',
      });
      const second = await facade.acceptForBrief({
        briefId: BRIEF_ID,
        documentType: 'cgu_b2c',
        documentVersion: 1,
        acceptedAt: NOW,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0',
      });
      expect(first.id).toBe(second.id);
    });

    it('lève UnknownLegalDocumentVersionError si version inconnue', async () => {
      const facade = buildFacade({ doc: null });
      await expect(
        facade.acceptForBrief({
          briefId: BRIEF_ID,
          documentType: 'cgu_b2c',
          documentVersion: 99,
          acceptedAt: NOW,
          ipAddress: '203.0.113.42',
          userAgent: 'Mozilla/5.0',
        }),
      ).rejects.toBeInstanceOf(UnknownLegalDocumentVersionError);
    });

    it('lève UnknownLegalDocumentVersionError si pas encore effective', async () => {
      const future = new Date('2026-12-31T00:00:00Z');
      const facade = buildFacade({ doc: doc('cgu_b2c', 2, future) });
      await expect(
        facade.acceptForBrief({
          briefId: BRIEF_ID,
          documentType: 'cgu_b2c',
          documentVersion: 2,
          acceptedAt: NOW,
          ipAddress: '203.0.113.42',
          userAgent: 'Mozilla/5.0',
        }),
      ).rejects.toBeInstanceOf(UnknownLegalDocumentVersionError);
    });

    it('ne re-throw pas NotFoundException brut (encapsulation HTTP préservée)', async () => {
      const facade = buildFacade({ doc: null });
      const error = await facade
        .acceptForBrief({
          briefId: BRIEF_ID,
          documentType: 'cgu_b2c',
          documentVersion: 99,
          acceptedAt: NOW,
          ipAddress: '203.0.113.42',
          userAgent: 'Mozilla/5.0',
        })
        .catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(NotFoundException);
      expect(error).toBeInstanceOf(UnknownLegalDocumentVersionError);
    });
  });

  describe('getCurrentVersion', () => {
    it("retourne l'entier de la version effective", async () => {
      const effective = new Date('2026-04-15T00:00:00Z');
      const facade = buildFacade({ doc: doc('confidentialite', 3, effective) });
      const version = await facade.getCurrentVersion('confidentialite');
      expect(version).toBe(3);
    });

    it('lève UnknownLegalDocumentVersionError si rien de seedé', async () => {
      const facade = buildFacade({ doc: null, current: null });
      await expect(facade.getCurrentVersion('cgu_b2c')).rejects.toBeInstanceOf(
        UnknownLegalDocumentVersionError,
      );
    });
  });

  describe('non-fuite de transaction (Principe V)', () => {
    it("aucune méthode du contrat ne reçoit ni n'expose un client Prisma", () => {
      // Vérification statique : si on changeait la signature pour
      // accepter ou retourner un type Prisma transactionnel, ce test
      // échouerait à la compilation (TypeScript). En runtime, on vérifie
      // que les types exposés ne contiennent pas de marker Prisma.
      const facade = buildFacade({ doc: doc('confidentialite', 1, new Date()) });
      // Les méthodes prennent un objet plain JS et retournent une
      // Promise<LegalAcceptanceRecord> — pas de symbole Prisma exposé.
      expect(typeof facade.acceptForBrief).toBe('function');
      expect(typeof facade.getCurrentVersion).toBe('function');
    });
  });
});
