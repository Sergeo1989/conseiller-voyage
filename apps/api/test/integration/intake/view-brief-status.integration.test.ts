// T091 — Tests intégration view-brief-status + by-email avec rolling
// renewal cookie (FR-014a Q5 + C2).
//
// PRÉREQUIS : pnpm docker:up + pnpm db:migrate (Testcontainers en CI).
// Skip si DB injoignable.

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

describe('VoyageurIntakeController US2 (integration)', () => {
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

  it.skipIf(skipAll)('GET /api/intake/briefs/:briefId sans cookie → 403/401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intake/briefs/11111111-1111-4111-8111-111111111111',
      headers: HEADERS,
    });
    // Le guard renvoie false → NestJS génère 403 par défaut sans message
    expect([401, 403]).toContain(response.statusCode);
  });

  it.skipIf(skipAll)('GET /api/intake/briefs/by-email sans cookie → 403/401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intake/briefs/by-email',
      headers: HEADERS,
    });
    expect([401, 403]).toContain(response.statusCode);
  });

  // TODO : test golden path avec brief seeded + token clear posé en
  // cookie + assertion rolling renewal Set-Cookie sur la réponse.
  // Différé — nécessite un seed complet du flow US1 d'abord.
});
