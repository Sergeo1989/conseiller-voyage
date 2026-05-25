// T050 — Tests SubmitDossierUseCase.
// Couvre cas nominal + RBAC + validation métier + vérification
// UploadIntents (B2) + écriture de Submission/Certificats/Affiliations
// + audit + outbox.

import {
  ConseillerIdSchema,
  type UploadIntentId,
  UploadIntentIdSchema,
} from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { UploadPurpose } from '../../../domain/entities/upload-intent.entity';
import { FakeClock, FakeConformiteRepository } from '../../__tests__/_fakes';
import type { DossierSubmissionInput } from '../../validate-dossier-submission';
import { type SubmitDossierInput, SubmitDossierUseCase } from '../submit-dossier.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 200;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000001');

interface SeededIntents {
  certIntentId: UploadIntentId;
  affilIntentId: UploadIntentId;
}

async function seedIntents(
  repo: FakeConformiteRepository,
  purposes: Array<UploadPurpose> = ['certificat', 'preuve_affiliation'],
): Promise<{ intentIds: UploadIntentId[]; complianceId: string }> {
  const compliance = await repo.getOrCreateCompliance({
    conseillerId: CONSEILLER_ID,
    now: NOW,
  });
  const intents = await repo.createUploadIntents({
    conseillerComplianceId: compliance.id,
    intents: purposes.map((purpose, i) => ({
      id: UploadIntentIdSchema.parse(
        `00000000-0000-4000-8000-${String(900 + i).padStart(12, '0')}`,
      ),
      purpose,
      expectedContentType: 'application/pdf',
      expectedContentLength: 1_000_000,
      objectKey: `conformite/${compliance.id}/upload-${i}`,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    })),
  });
  return {
    intentIds: intents.map((i) => i.id),
    complianceId: compliance.id,
  };
}

async function seedClassicDossier(repo: FakeConformiteRepository): Promise<SeededIntents> {
  const { intentIds } = await seedIntents(repo, ['certificat', 'preuve_affiliation']);
  const [certIntentId, affilIntentId] = intentIds;
  if (!certIntentId || !affilIntentId) throw new Error('seed failed');
  return { certIntentId, affilIntentId };
}

function makeUseCase(): {
  useCase: SubmitDossierUseCase;
  repo: FakeConformiteRepository;
  clock: FakeClock;
  uuidGen: FakeUuidGenerator;
} {
  const repo = new FakeConformiteRepository();
  const clock = new FakeClock(NOW);
  const uuidGen = new FakeUuidGenerator();
  const useCase = new SubmitDossierUseCase(repo, repo, clock, uuidGen);
  return { useCase, repo, clock, uuidGen };
}

function makeInput(
  seeded: SeededIntents,
  overrides: Partial<DossierSubmissionInput> = {},
): SubmitDossierInput {
  return {
    requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
    dossier: {
      consentGiven: true,
      certificates: [
        {
          province: 'QC',
          certificateNumber: 'CCV-12345',
          issuedAt: new Date('2025-01-01T00:00:00Z'),
          expiresAt: new Date('2028-01-01T00:00:00Z'),
          documentUploadId: seeded.certIntentId,
        },
      ],
      affiliations: [
        {
          agencyName: 'Agence Voyages Test',
          agencyPermitNumber: 'OPC-998877',
          agencyProvince: 'QC',
          proofUploadId: seeded.affilIntentId,
        },
      ],
      ...overrides,
    },
  };
}

describe('SubmitDossierUseCase (T050)', () => {
  let ctx: ReturnType<typeof makeUseCase>;
  let seeded: SeededIntents;

  beforeEach(async () => {
    ctx = makeUseCase();
    seeded = await seedClassicDossier(ctx.repo);
  });

  describe('cas nominal', () => {
    it('crée Submission + Certificat + Affiliation et retourne submissionId', async () => {
      const result = await ctx.useCase.execute(makeInput(seeded));

      expect(result.submissionId).toBeDefined();
      expect(ctx.repo.submissions.size).toBe(1);
      expect(ctx.repo.certificats.size).toBe(1);
      expect(ctx.repo.affiliations.size).toBe(1);

      const submission = ctx.repo.submissions.get(result.submissionId);
      expect(submission?.status).toBe('pending');
      expect(submission?.submittedAt.getTime()).toBe(NOW.getTime());
    });

    it('marque les UploadIntents comme consumed après écriture', async () => {
      await ctx.useCase.execute(makeInput(seeded));
      const cert = ctx.repo.uploadIntents.get(seeded.certIntentId);
      const affil = ctx.repo.uploadIntents.get(seeded.affilIntentId);
      expect(cert?.consumedAt?.getTime()).toBe(NOW.getTime());
      expect(affil?.consumedAt?.getTime()).toBe(NOW.getTime());
    });

    it('applique le consentToProcessGivenAt sur le compliance', async () => {
      await ctx.useCase.execute(makeInput(seeded));
      const compliance = [...ctx.repo.compliances.values()][0];
      expect(compliance?.consentToProcessGivenAt?.getTime()).toBe(NOW.getTime());
    });

    it("utilise l'objectKey de l'intent pour les documents (pas l'uploadId)", async () => {
      await ctx.useCase.execute(makeInput(seeded));
      const cert = [...ctx.repo.certificats.values()][0];
      const affil = [...ctx.repo.affiliations.values()][0];
      const certIntent = ctx.repo.uploadIntents.get(seeded.certIntentId);
      const affilIntent = ctx.repo.uploadIntents.get(seeded.affilIntentId);
      expect(cert?.documentObjectKey).toBe(certIntent?.objectKey);
      expect(affil?.proofObjectKey).toBe(affilIntent?.objectKey);
    });
  });

  describe('RBAC (Principe IX)', () => {
    it("rejette si requestedBy.role === 'admin'", async () => {
      const input = makeInput(seeded);
      await expect(
        ctx.useCase.execute({
          ...input,
          requestedBy: { id: CONSEILLER_ID, role: 'admin' },
        }),
      ).rejects.toThrow(/conseiller/i);
    });

    it("rejette si requestedBy.role === 'voyageur'", async () => {
      const input = makeInput(seeded);
      await expect(
        ctx.useCase.execute({
          ...input,
          requestedBy: { id: CONSEILLER_ID, role: 'voyageur' },
        }),
      ).rejects.toThrow(/conseiller/i);
    });
  });

  describe('validation métier (FR-016, FR-001)', () => {
    it('rejette si consentGiven === false (FR-016)', async () => {
      await expect(ctx.useCase.execute(makeInput(seeded, { consentGiven: false }))).rejects.toThrow(
        /Dossier validation failed/,
      );
    });

    it('rejette si 0 certificat (FR-001)', async () => {
      await expect(ctx.useCase.execute(makeInput(seeded, { certificates: [] }))).rejects.toThrow(
        /Dossier validation failed/,
      );
    });

    it('rejette si 0 affiliation (FR-001)', async () => {
      await expect(ctx.useCase.execute(makeInput(seeded, { affiliations: [] }))).rejects.toThrow(
        /Dossier validation failed/,
      );
    });
  });

  describe('vérification UploadIntent (B2)', () => {
    it("rejette si l'uploadId n'existe pas", async () => {
      const fakeId = UploadIntentIdSchema.parse('00000000-0000-4000-8000-999999999999');
      await expect(
        ctx.useCase.execute(
          makeInput(seeded, {
            certificates: [
              {
                province: 'QC',
                certificateNumber: 'CCV-12345',
                issuedAt: new Date('2025-01-01T00:00:00Z'),
                expiresAt: new Date('2028-01-01T00:00:00Z'),
                documentUploadId: fakeId,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("rejette si l'uploadId appartient à un autre conseiller (forge)", async () => {
      // Crée un 2e conseiller avec son propre intent
      const otherConseiller = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000099');
      const otherCompliance = await ctx.repo.getOrCreateCompliance({
        conseillerId: otherConseiller,
        now: NOW,
      });
      const stolenIntentId = UploadIntentIdSchema.parse('00000000-0000-4000-8000-000000000777');
      await ctx.repo.createUploadIntents({
        conseillerComplianceId: otherCompliance.id,
        intents: [
          {
            id: stolenIntentId,
            purpose: 'certificat',
            expectedContentType: 'application/pdf',
            expectedContentLength: 1_000_000,
            objectKey: `conformite/${otherCompliance.id}/stolen`,
            createdAt: NOW,
            expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
          },
        ],
      });

      await expect(
        ctx.useCase.execute(
          makeInput(seeded, {
            certificates: [
              {
                province: 'QC',
                certificateNumber: 'CCV-12345',
                issuedAt: new Date('2025-01-01T00:00:00Z'),
                expiresAt: new Date('2028-01-01T00:00:00Z'),
                documentUploadId: stolenIntentId,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/does not belong/i);
    });

    it("rejette si l'uploadId a déjà été consommé", async () => {
      await ctx.repo.markUploadIntentsConsumed([seeded.certIntentId], NOW);
      await expect(ctx.useCase.execute(makeInput(seeded))).rejects.toThrow(/already consumed/i);
    });

    it("rejette si l'uploadId est expiré", async () => {
      ctx.clock.advance(6 * 60 * 1000); // > 5 min TTL
      await expect(ctx.useCase.execute(makeInput(seeded))).rejects.toThrow(/expired/i);
    });

    it("rejette si le purpose de l'intent ne matche pas (cert dans affil)", async () => {
      await expect(
        ctx.useCase.execute(
          makeInput(seeded, {
            affiliations: [
              {
                agencyName: 'Agence X',
                agencyPermitNumber: 'OPC-12',
                agencyProvince: 'QC',
                proofUploadId: seeded.certIntentId, // ← intent de purpose 'certificat'
              },
            ],
          }),
        ),
      ).rejects.toThrow(/purpose mismatch/i);
    });
  });
});
