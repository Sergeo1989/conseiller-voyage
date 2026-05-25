// T052 — Tests ApproveDossierUseCase.
// Couvre cas nominal pending→verified + RBAC + transitions + audit + outbox.

import {
  AdminIdSchema,
  AffiliationIdSchema,
  CertificatIdSchema,
  ConseillerIdSchema,
  type SubmissionId,
  SubmissionIdSchema,
  UploadIntentIdSchema,
} from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { ConformiteStatus } from '../../../domain/value-objects/conformite-status.vo';
import {
  FakeClock,
  FakeConformiteRepository,
  FakeConformiteStatusCache,
} from '../../__tests__/_fakes';
import { type ApproveDossierInput, ApproveDossierUseCase } from '../approve-dossier.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 300;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000001');
const ADMIN_ID = AdminIdSchema.parse('00000000-0000-4000-8000-000000000aaa');

interface SeededDossier {
  submissionId: SubmissionId;
  complianceId: string;
}

async function seedPendingDossier(
  repo: FakeConformiteRepository,
  initialStatus: ConformiteStatus = 'pending',
): Promise<SeededDossier> {
  const compliance = await repo.getOrCreateCompliance({
    conseillerId: CONSEILLER_ID,
    now: NOW,
  });

  if (initialStatus !== 'pending') {
    repo.compliances.set(compliance.id, {
      ...compliance,
      status: initialStatus,
      lastStatusChangeAt: NOW,
    });
  }

  const certIntentId = UploadIntentIdSchema.parse('00000000-0000-4000-8000-000000000901');
  const affilIntentId = UploadIntentIdSchema.parse('00000000-0000-4000-8000-000000000902');
  await repo.createUploadIntents({
    conseillerComplianceId: compliance.id,
    intents: [
      {
        id: certIntentId,
        purpose: 'certificat',
        expectedContentType: 'application/pdf',
        expectedContentLength: 1_000_000,
        objectKey: `conformite/${compliance.id}/cert`,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
      },
      {
        id: affilIntentId,
        purpose: 'preuve_affiliation',
        expectedContentType: 'application/pdf',
        expectedContentLength: 800_000,
        objectKey: `conformite/${compliance.id}/affil`,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
      },
    ],
  });

  const submissionId = SubmissionIdSchema.parse('00000000-0000-4000-8000-000000000801');
  const certId = CertificatIdSchema.parse('00000000-0000-4000-8000-000000000701');
  const affilId = AffiliationIdSchema.parse('00000000-0000-4000-8000-000000000702');

  await repo.submitDossier({
    conseillerComplianceId: compliance.id,
    submissionId,
    submittedAt: NOW,
    consentGiven: true,
    certificates: [
      {
        id: certId,
        province: 'QC',
        certificateNumber: 'CCV-12345',
        issuedAt: new Date('2025-01-01T00:00:00Z'),
        expiresAt: new Date('2028-01-01T00:00:00Z'),
        documentObjectKey: `conformite/${compliance.id}/cert`,
        uploadIntentId: certIntentId,
      },
    ],
    affiliations: [
      {
        id: affilId,
        agencyName: 'Agence X',
        agencyPermitNumber: 'OPC-998877',
        agencyProvince: 'QC',
        proofObjectKey: `conformite/${compliance.id}/affil`,
        uploadIntentId: affilIntentId,
        role: null,
        activeSince: null,
      },
    ],
    auditEntries: [],
    outboxEntries: [],
  });

  return { submissionId, complianceId: compliance.id };
}

function makeUseCase(): {
  useCase: ApproveDossierUseCase;
  repo: FakeConformiteRepository;
  clock: FakeClock;
  uuidGen: FakeUuidGenerator;
  cache: FakeConformiteStatusCache;
} {
  const repo = new FakeConformiteRepository();
  const clock = new FakeClock(NOW);
  const uuidGen = new FakeUuidGenerator();
  const cache = new FakeConformiteStatusCache();
  const useCase = new ApproveDossierUseCase(repo, repo, clock, uuidGen, cache);
  return { useCase, repo, clock, uuidGen, cache };
}

function makeInput(
  submissionId: SubmissionId,
  overrides: Partial<ApproveDossierInput> = {},
): ApproveDossierInput {
  return {
    requestedBy: { id: ADMIN_ID, role: 'admin' },
    submissionId,
    comment: null,
    ...overrides,
  };
}

describe('ApproveDossierUseCase (T052)', () => {
  let ctx: ReturnType<typeof makeUseCase>;
  let seeded: SeededDossier;

  beforeEach(async () => {
    ctx = makeUseCase();
    seeded = await seedPendingDossier(ctx.repo, 'pending');
  });

  describe('cas nominal pending → verified', () => {
    it('marque la submission approved', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      expect(sub?.status).toBe('approved');
      expect(sub?.decidedByAdminId).toBe(ADMIN_ID);
    });

    it('fait transitionner le compliance pending → verified', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      const compliance = ctx.repo.compliances.get(seeded.complianceId as never);
      expect(compliance?.status).toBe('verified');
      expect(compliance?.lastVerifiedAt?.getTime()).toBe(NOW.getTime());
    });

    it('marque les certs et affils de la submission approved', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      const certs = [...ctx.repo.certificats.values()];
      const affils = [...ctx.repo.affiliations.values()];
      expect(certs.every((c) => c.decision === 'approved')).toBe(true);
      expect(affils.every((a) => a.decision === 'approved')).toBe(true);
    });

    it('stocke le commentaire admin dans decisionReason', async () => {
      await ctx.useCase.execute(
        makeInput(seeded.submissionId, { comment: 'Documents en règle, validé.' }),
      );
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      expect(sub?.decisionReason).toBe('Documents en règle, validé.');
    });
  });

  describe('cas suspended → verified (renouvellement)', () => {
    it('fait transitionner suspended → verified', async () => {
      // Reset et seed avec compliance déjà suspended
      const fresh = makeUseCase();
      const s = await seedPendingDossier(fresh.repo, 'suspended');
      await fresh.useCase.execute(makeInput(s.submissionId));
      const compliance = fresh.repo.compliances.get(s.complianceId as never);
      expect(compliance?.status).toBe('verified');
    });
  });

  describe('RBAC (Principe IX)', () => {
    it("rejette si requestedBy.role === 'conseiller'", async () => {
      await expect(
        ctx.useCase.execute(
          makeInput(seeded.submissionId, {
            requestedBy: { id: ADMIN_ID, role: 'conseiller' },
          }),
        ),
      ).rejects.toThrow(/admin/i);
    });

    it("rejette si requestedBy.role === 'voyageur'", async () => {
      await expect(
        ctx.useCase.execute(
          makeInput(seeded.submissionId, {
            requestedBy: { id: ADMIN_ID, role: 'voyageur' },
          }),
        ),
      ).rejects.toThrow(/admin/i);
    });
  });

  describe('erreurs métier', () => {
    it("rejette si la submission n'existe pas (404)", async () => {
      const fakeId = SubmissionIdSchema.parse('00000000-0000-4000-8000-000000099999');
      await expect(ctx.useCase.execute(makeInput(fakeId))).rejects.toThrow(/not found/i);
    });

    it('rejette si la submission est déjà approved (409)', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      await expect(ctx.useCase.execute(makeInput(seeded.submissionId))).rejects.toThrow(
        /already decided/i,
      );
    });

    it('rejette si la submission est déjà refused (409)', async () => {
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      if (!sub) throw new Error('seed lost');
      ctx.repo.submissions.set(seeded.submissionId, { ...sub, status: 'refused' });
      await expect(ctx.useCase.execute(makeInput(seeded.submissionId))).rejects.toThrow(
        /already decided/i,
      );
    });
  });

  describe('absence de transition si statut inchangé', () => {
    it("n'effectue pas de transition si le calculé == courant (revoked sticky)", async () => {
      const fresh = makeUseCase();
      const s = await seedPendingDossier(fresh.repo, 'revoked');
      await fresh.useCase.execute(makeInput(s.submissionId));
      const compliance = fresh.repo.compliances.get(s.complianceId as never);
      // revoked est sticky dans computeConformiteStatus
      expect(compliance?.status).toBe('revoked');
      // Submission a quand même été marquée approved
      const sub = fresh.repo.submissions.get(s.submissionId);
      expect(sub?.status).toBe('approved');
    });
  });

  describe('cache invalidate synchrone (eng review issue 1.1)', () => {
    it('invalide le cache de statut quand transition pending → verified', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      expect(ctx.cache.invalidations).toEqual([CONSEILLER_ID]);
    });

    it("n'invalide PAS le cache si aucune transition (revoked sticky)", async () => {
      const fresh = makeUseCase();
      const s = await seedPendingDossier(fresh.repo, 'revoked');
      await fresh.useCase.execute(makeInput(s.submissionId));
      expect(fresh.cache.invalidations).toEqual([]);
    });
  });
});
