// T107 + T115i — Integration tests erasure Loi 25 (FR-022 + FR-022a + SC-008).
//
// PRÉREQUIS : pnpm docker:up + pnpm db:migrate (Testcontainers en CI).

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';

const HEADERS = {
  'content-type': 'application/json',
  'x-requested-by': 'web',
};

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('Erasure Loi 25 US4 (integration)', () => {
  let app: NestFastifyApplication;
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
  });

  afterAll(async () => {
    if (skipAll) return;
    await app.close();
  });

  it.skipIf(skipAll)(
    'POST /briefs/:id/erasure-request sans cookie → 401/403 (IntakeAuthGuard)',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/intake/briefs/11111111-1111-4111-8111-111111111111/erasure-request',
        headers: HEADERS,
        payload: { confirmation: 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE' },
      });
      expect([401, 403]).toContain(response.statusCode);
    },
  );

  // IntakeAuthGuard s'exécute avant la validation Zod du body → sans cookie
  // session voyageur on obtient 401/403 indépendamment du contenu. Le rejet
  // Zod « phrase incorrecte » est déjà couvert par le test unitaire
  // request-brief-erasure.use-case.test.ts (kind 'invalid_confirmation').
  it.skip('POST /briefs/:id/erasure-request avec phrase incorrecte → 400 (Zod) [skip: requiert cookie auth]', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/intake/briefs/11111111-1111-4111-8111-111111111111/erasure-request',
      headers: HEADERS,
      payload: { confirmation: 'WRONG_PHRASE' },
    });
    expect(response.statusCode).toBe(400);
  });

  it.skipIf(skipAll)('POST /voyageur/erase-all-data sans cookie → 401/403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/intake/voyageur/erase-all-data',
      headers: HEADERS,
      payload: {
        confirmation: 'JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES',
        acknowledgedBriefCount: 1,
      },
    });
    expect([401, 403]).toContain(response.statusCode);
  });

  // Idem : la garde auth filtre avant Zod sans cookie. La distinction
  // FR-022 ≠ FR-022a est testée au niveau use case
  // (erase-all-voyageur-data.use-case.test.ts kind 'invalid_confirmation').
  it.skip('POST /voyageur/erase-all-data phrase FR-022 ≠ FR-022a → 400 [skip: requiert cookie auth]', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/intake/voyageur/erase-all-data',
      headers: HEADERS,
      payload: {
        confirmation: 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE', // FR-022 phrase
        acknowledgedBriefCount: 1,
      },
    });
    expect(response.statusCode).toBe(400);
  });

  // TODO T115 — SC-008 latency invariant : mesurer le délai entre POST
  // erasure-request et brief.anonymizedAt set en DB ; doit être < 60s.
  // Difficulté : le use case est synchrone donc l'invariant est tenu
  // par construction (~ms). À documenter dans le runbook.
});
