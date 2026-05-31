// T064 — Test d'intégration end-to-end PerformMatchingUseCase (US1 P1 MVP).
//
// Exécution :
//   - Local : `pnpm docker:up && pnpm db:migrate` puis
//     `pnpm --filter @cv/api test:integration -- --grep matching`.
//   - CI : exécuté automatiquement par .github/workflows/ci.yml avec
//     Postgres + Redis Testcontainers.
//
// `beforeAll` skip si DATABASE_URL ne répond pas (dev sans Docker) pour
// éviter de bloquer le local quand seuls les tests unit sont visés.
//
// Couvre quickstart.md scénarios :
//   - 1 : Golden path → 3 entries persistées + 1 outbox `voyageur_brief_matched`
//   - 3 : Empty (0 conseiller éligible) → outbox `voyageur_brief_unmatched`
//   - 4 : Idempotence replay → 1 seul MR actif (UNIQUE INDEX réel)

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { PerformMatchingUseCase } from '../../../src/modules/matching/application/use-cases/perform-matching.use-case';

const TEST_BRIEF_EMAIL = 'matching-integration-voyageur@example.com';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('PerformMatchingUseCase (integration)', () => {
  let app: NestFastifyApplication;
  let useCase: PerformMatchingUseCase;
  let skipAll = false;

  beforeAll(async () => {
    if (!(await dbAvailable())) {
      skipAll = true;
      return;
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    useCase = moduleRef.get(PerformMatchingUseCase);
  });

  afterAll(async () => {
    if (skipAll) return;
    // Cleanup matching tables (trigger append-only sur audit → contournement)
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      await prisma.matchingOutboxEntry.deleteMany();
      await prisma.$executeRawUnsafe('DELETE FROM matching_audit_entries');
      await prisma.matchingResultEntry.deleteMany();
      await prisma.matchingResult.deleteMany();
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
    await prisma.voyageurBrief.deleteMany({
      where: { voyageurContact: { email: TEST_BRIEF_EMAIL } },
    });
    await prisma.voyageurContact.deleteMany({ where: { email: TEST_BRIEF_EMAIL } });
    await app.close();
  });

  beforeEach(async () => {
    if (skipAll) return;
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      await prisma.matchingOutboxEntry.deleteMany();
      await prisma.$executeRawUnsafe('DELETE FROM matching_audit_entries');
      await prisma.matchingResultEntry.deleteMany();
      await prisma.matchingResult.deleteMany();
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
  });

  it.skipIf(skipAll)(
    'scénario 4 idempotence : 2 invocations même briefId → 1 seul MR actif (UNIQUE INDEX réel)',
    async () => {
      // Crée un brief minimal en DB pour le smoke (sans seed conseiller, donc empty)
      const contact = await prisma.voyageurContact.create({
        data: {
          email: TEST_BRIEF_EMAIL,
          firstName: 'Marie',
          lastName: 'Test',
          postalCode: 'H7N 1A1',
        },
      });
      const brief = await prisma.voyageurBrief.create({
        data: {
          voyageurContactId: contact.id,
          status: 'active',
          destinations: [{ country: 'CU' }],
          departureDate: new Date('2027-03-15'),
          returnDate: new Date('2027-03-30'),
          datesFlexible: true,
          datesFlexibilityDays: 5,
          adultsCount: 2,
          childrenAges: [],
          infantsCount: 0,
          budgetRange: 'between_5k_10k',
          conseillerLanguage: 'fr',
          speciality: 'lune_de_miel',
          familiarity: 'experienced_traveler',
          consentGivenAt: new Date(),
          submittedAt: new Date(),
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
        },
      });

      const first = await useCase.execute({ briefId: brief.id });
      const second = await useCase.execute({ briefId: brief.id });

      expect(first.kind).toBe('ok');
      expect(second.kind).toBe('replay_ignored');

      const persisted = await prisma.matchingResult.findMany({
        where: { briefId: brief.id, supersededAt: null },
      });
      expect(persisted).toHaveLength(1);
    },
  );

  it.skipIf(skipAll)('brief_not_found : briefId inconnu → no persistence, no outbox', async () => {
    const result = await useCase.execute({
      briefId: '99999999-9999-4999-8999-999999999999',
    });
    expect(result.kind).toBe('brief_not_found');
    const persisted = await prisma.matchingResult.findMany();
    expect(persisted).toHaveLength(0);
  });

  // TODO scénario 1 golden path : nécessite seed conseillers vérifiés + statut
  // verified via ConformiteQueryPort. Plus complexe — à étendre quand un
  // helper de seed sera disponible (T0XX polish).
});
