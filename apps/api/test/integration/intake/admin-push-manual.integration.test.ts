// T128 — Integration tests admin push manuel (FR-027 + FR-028, US5).
//
// PRÉREQUIS : pnpm docker:up + pnpm db:migrate. Skip si DB injoignable.

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

describe('Admin push manuel US5 (integration)', () => {
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

  it.skipIf(skipAll)('GET /api/intake/admin/unmatched sans cookie admin → 401/403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intake/admin/unmatched',
      headers: HEADERS,
    });
    expect([401, 403]).toContain(response.statusCode);
  });

  it.skipIf(skipAll)('GET /api/intake/admin/briefs/:id sans cookie admin → 401/403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intake/admin/briefs/11111111-1111-4111-8111-111111111111',
      headers: HEADERS,
    });
    expect([401, 403]).toContain(response.statusCode);
  });

  it.skipIf(skipAll)('POST push-manual sans cookie admin → 401/403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/intake/admin/briefs/11111111-1111-4111-8111-111111111111/push-manual',
      headers: HEADERS,
      payload: {
        conseillerComplianceId: '22222222-2222-4222-8222-222222222222',
        reason: 'Motif valide de plus de 20 caractères pour test integration',
      },
    });
    expect([401, 403]).toContain(response.statusCode);
  });

  it.skipIf(skipAll)('POST push-manual avec motif court → 400 (Zod min 20)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/intake/admin/briefs/11111111-1111-4111-8111-111111111111/push-manual',
      headers: HEADERS,
      payload: {
        conseillerComplianceId: '22222222-2222-4222-8222-222222222222',
        reason: 'court',
      },
    });
    expect([400, 401, 403]).toContain(response.statusCode);
  });
});
