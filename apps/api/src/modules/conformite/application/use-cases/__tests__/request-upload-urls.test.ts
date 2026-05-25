// T048 — Tests RequestUploadUrlsUseCase.
// Couvre cas nominal + RBAC + validation files + idempotence relative
// (réutilisation de la même ConseillerCompliance).
//
// Note Principe VI : ce use case n'est pas une "fonction pure" stricte
// (effets de bord via writer + storage), donc tests + impl peuvent
// cohabiter dans le même commit. La couverture "nominal + erreur" est
// l'exigence formelle.

import { ConseillerIdSchema } from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import { FakeClock, FakeConformiteRepository, FakeDocumentStorage } from '../../__tests__/_fakes';
import {
  type RequestUploadUrlsInput,
  RequestUploadUrlsUseCase,
} from '../request-upload-urls.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 100;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-23T12:00:00Z');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000001');

function makeUseCase(): {
  useCase: RequestUploadUrlsUseCase;
  repo: FakeConformiteRepository;
  storage: FakeDocumentStorage;
  clock: FakeClock;
  uuidGen: FakeUuidGenerator;
} {
  const repo = new FakeConformiteRepository();
  const storage = new FakeDocumentStorage();
  const clock = new FakeClock(NOW);
  const uuidGen = new FakeUuidGenerator();
  const useCase = new RequestUploadUrlsUseCase(repo, storage, clock, uuidGen);
  return { useCase, repo, storage, clock, uuidGen };
}

function makeInput(overrides: Partial<RequestUploadUrlsInput> = {}): RequestUploadUrlsInput {
  return {
    requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
    files: [
      {
        purpose: 'certificat',
        contentType: 'application/pdf',
        contentLength: 1_000_000, // 1 MB
      },
    ],
    ...overrides,
  };
}

describe('RequestUploadUrlsUseCase (T048)', () => {
  let ctx: ReturnType<typeof makeUseCase>;

  beforeEach(() => {
    ctx = makeUseCase();
  });

  describe('cas nominal', () => {
    it('crée 1 UploadIntent + retourne 1 presigned URL pour 1 fichier', async () => {
      const result = await ctx.useCase.execute(makeInput());

      expect(result.uploads).toHaveLength(1);
      expect(ctx.repo.uploadIntents.size).toBe(1);
      const intent = [...ctx.repo.uploadIntents.values()][0];
      expect(intent).toBeDefined();
      expect(intent?.purpose).toBe('certificat');
      expect(intent?.expectedContentType).toBe('application/pdf');
      expect(intent?.expectedContentLength).toBe(1_000_000);
      expect(intent?.consumedAt).toBeNull();
      expect(intent?.expiresAt.getTime()).toBe(NOW.getTime() + 5 * 60 * 1000);
    });

    it("supporte jusqu'à 5 fichiers de purposes mélangés", async () => {
      const result = await ctx.useCase.execute(
        makeInput({
          files: [
            { purpose: 'certificat', contentType: 'application/pdf', contentLength: 500_000 },
            { purpose: 'preuve_affiliation', contentType: 'image/jpeg', contentLength: 800_000 },
            { purpose: 'preuve_affiliation', contentType: 'image/png', contentLength: 600_000 },
            { purpose: 'certificat', contentType: 'image/heic', contentLength: 1_200_000 },
            {
              purpose: 'preuve_affiliation',
              contentType: 'application/pdf',
              contentLength: 400_000,
            },
          ],
        }),
      );

      expect(result.uploads).toHaveLength(5);
      expect(ctx.repo.uploadIntents.size).toBe(5);
    });

    it('crée ConseillerCompliance si absente (premier upload)', async () => {
      expect(ctx.repo.compliances.size).toBe(0);
      await ctx.useCase.execute(makeInput());
      expect(ctx.repo.compliances.size).toBe(1);
      const compliance = [...ctx.repo.compliances.values()][0];
      expect(compliance?.status).toBe('pending');
      expect(compliance?.conseillerId).toBe(CONSEILLER_ID);
    });

    it('réutilise ConseillerCompliance existante (upload subsequent)', async () => {
      await ctx.useCase.execute(makeInput());
      await ctx.useCase.execute(makeInput());
      expect(ctx.repo.compliances.size).toBe(1);
      expect(ctx.repo.uploadIntents.size).toBe(2);
    });

    it('genère un objectKey sous le préfixe du ConseillerCompliance', async () => {
      const result = await ctx.useCase.execute(makeInput());
      const intent = [...ctx.repo.uploadIntents.values()][0];
      const compliance = [...ctx.repo.compliances.values()][0];
      expect(intent?.objectKey).toContain(`conformite/${compliance?.id}/`);
      expect(intent?.objectKey).toContain(result.uploads[0]?.uploadId ?? '');
    });
  });

  describe('RBAC (Principe IX)', () => {
    it("rejette si requestedBy.role === 'admin'", async () => {
      await expect(
        ctx.useCase.execute(makeInput({ requestedBy: { id: CONSEILLER_ID, role: 'admin' } })),
      ).rejects.toThrow(/conseiller/i);
    });

    it("rejette si requestedBy.role === 'voyageur'", async () => {
      await expect(
        ctx.useCase.execute(makeInput({ requestedBy: { id: CONSEILLER_ID, role: 'voyageur' } })),
      ).rejects.toThrow(/conseiller/i);
    });
  });

  describe('validation files (FR-021)', () => {
    it('rejette si 0 fichier', async () => {
      await expect(ctx.useCase.execute(makeInput({ files: [] }))).rejects.toThrow(
        /between 1 and 5/,
      );
    });

    it('rejette si > 5 fichiers', async () => {
      const sixFiles = Array.from({ length: 6 }, () => ({
        purpose: 'certificat' as const,
        contentType: 'application/pdf' as const,
        contentLength: 500_000,
      }));
      await expect(ctx.useCase.execute(makeInput({ files: sixFiles }))).rejects.toThrow(
        /between 1 and 5/,
      );
    });

    it('rejette si contentType non autorisé (text/plain)', async () => {
      await expect(
        ctx.useCase.execute(
          makeInput({
            files: [
              {
                purpose: 'certificat',
                contentType: 'text/plain' as never,
                contentLength: 500_000,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/contentType/);
    });

    it('rejette si contentLength = 0', async () => {
      await expect(
        ctx.useCase.execute(
          makeInput({
            files: [{ purpose: 'certificat', contentType: 'application/pdf', contentLength: 0 }],
          }),
        ),
      ).rejects.toThrow(/contentLength/);
    });

    it('rejette si contentLength > 5 MB (FR-021)', async () => {
      await expect(
        ctx.useCase.execute(
          makeInput({
            files: [
              {
                purpose: 'certificat',
                contentType: 'application/pdf',
                contentLength: 5 * 1024 * 1024 + 1,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/contentLength/);
    });

    it('accepte exactement 5 MB (frontière inclusive)', async () => {
      const result = await ctx.useCase.execute(
        makeInput({
          files: [
            {
              purpose: 'certificat',
              contentType: 'application/pdf',
              contentLength: 5 * 1024 * 1024,
            },
          ],
        }),
      );
      expect(result.uploads).toHaveLength(1);
    });
  });
});
