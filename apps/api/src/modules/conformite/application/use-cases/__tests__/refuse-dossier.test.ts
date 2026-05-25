// T054 — Tests RefuseDossierUseCase.
// Couvre cas nominal + reason ≥ 20 chars + RBAC + statut compliance reste pending.

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
import { FakeClock, FakeConformiteRepository } from '../../__tests__/_fakes';
import { type RefuseDossierInput, RefuseDossierUseCase } from '../refuse-dossier.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 400;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000001');
const ADMIN_ID = AdminIdSchema.parse('00000000-0000-4000-8000-000000000aaa');

const VALID_REASON = 'Le numéro de permis OPC est introuvable au registre officiel.'; // ≥ 20 chars

interface SeededDossier {
  submissionId: SubmissionId;
  complianceId: string;
}

async function seedPendingDossier(repo: FakeConformiteRepository): Promise<SeededDossier> {
  const compliance = await repo.getOrCreateCompliance({
    conseillerId: CONSEILLER_ID,
    now: NOW,
  });

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
  useCase: RefuseDossierUseCase;
  repo: FakeConformiteRepository;
  clock: FakeClock;
  uuidGen: FakeUuidGenerator;
} {
  const repo = new FakeConformiteRepository();
  const clock = new FakeClock(NOW);
  const uuidGen = new FakeUuidGenerator();
  const useCase = new RefuseDossierUseCase(repo, repo, clock, uuidGen);
  return { useCase, repo, clock, uuidGen };
}

function makeInput(
  submissionId: SubmissionId,
  overrides: Partial<RefuseDossierInput> = {},
): RefuseDossierInput {
  return {
    requestedBy: { id: ADMIN_ID, role: 'admin' },
    submissionId,
    reason: VALID_REASON,
    ...overrides,
  };
}

describe('RefuseDossierUseCase (T054)', () => {
  let ctx: ReturnType<typeof makeUseCase>;
  let seeded: SeededDossier;

  beforeEach(async () => {
    ctx = makeUseCase();
    seeded = await seedPendingDossier(ctx.repo);
  });

  describe('cas nominal', () => {
    it('marque la submission refused avec adminId + decidedAt + reason', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      expect(sub?.status).toBe('refused');
      expect(sub?.decidedByAdminId).toBe(ADMIN_ID);
      expect(sub?.decidedAt?.getTime()).toBe(NOW.getTime());
      expect(sub?.decisionReason).toBe(VALID_REASON);
    });

    it('marque les certs et affils de la submission refused', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      const certs = [...ctx.repo.certificats.values()];
      const affils = [...ctx.repo.affiliations.values()];
      expect(certs.every((c) => c.decision === 'refused')).toBe(true);
      expect(affils.every((a) => a.decision === 'refused')).toBe(true);
      expect(certs[0]?.refusalReason).toBe(VALID_REASON);
    });

    it('laisse le statut compliance inchangé (pending → pending implicite)', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      const compliance = ctx.repo.compliances.get(seeded.complianceId as never);
      expect(compliance?.status).toBe('pending');
    });

    it('trim() le motif (espaces de début/fin supprimés)', async () => {
      await ctx.useCase.execute(
        makeInput(seeded.submissionId, { reason: `   ${VALID_REASON}   ` }),
      );
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      expect(sub?.decisionReason).toBe(VALID_REASON);
    });
  });

  describe('validation reason (FR-004)', () => {
    it('rejette si reason a moins de 20 caractères', async () => {
      await expect(
        ctx.useCase.execute(makeInput(seeded.submissionId, { reason: 'Trop court.' })),
      ).rejects.toThrow(/at least 20 characters/);
    });

    it('rejette si reason est vide', async () => {
      await expect(
        ctx.useCase.execute(makeInput(seeded.submissionId, { reason: '' })),
      ).rejects.toThrow(/at least 20 characters/);
    });

    it('rejette si reason ne contient que des espaces', async () => {
      await expect(
        ctx.useCase.execute(
          makeInput(seeded.submissionId, { reason: '                              ' }),
        ),
      ).rejects.toThrow(/at least 20 characters/);
    });

    it('accepte exactement 20 caractères (frontière inclusive)', async () => {
      const reason20 = 'A'.repeat(20);
      await ctx.useCase.execute(makeInput(seeded.submissionId, { reason: reason20 }));
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      expect(sub?.decisionReason).toBe(reason20);
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
      const sub = ctx.repo.submissions.get(seeded.submissionId);
      if (!sub) throw new Error('seed lost');
      ctx.repo.submissions.set(seeded.submissionId, { ...sub, status: 'approved' });
      await expect(ctx.useCase.execute(makeInput(seeded.submissionId))).rejects.toThrow(
        /already decided/i,
      );
    });

    it('rejette si la submission est déjà refused (409)', async () => {
      await ctx.useCase.execute(makeInput(seeded.submissionId));
      await expect(ctx.useCase.execute(makeInput(seeded.submissionId))).rejects.toThrow(
        /already decided/i,
      );
    });
  });
});
