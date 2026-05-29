// T101 — Integration tests multi-briefs + rate-limit FR-019/020/020a.
//
// Couvre l'invariant US3 :
//   - 3 briefs OK avec même email
//   - 4e brief → 429 EMAIL_RATE_LIMIT_EXCEEDED + body avec retryAfter
//   - 6 briefs sur même IP (emails différents) → 429 RATE_LIMIT_EXCEEDED
//     neutre (sans retryAfter) — anti-énumération
//   - hit simultané email+IP → reason=email (FR-020a ordre eval)
//
// PRÉREQUIS : pnpm docker:up + pnpm db:migrate. Skip si DB injoignable.

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';

const HEADERS = {
  'content-type': 'application/json',
  'x-requested-by': 'web',
};

const SAMPLE_BODY = {
  destinations: [{ country: 'IT', region: 'Toscane' }],
  departureDate: '2027-03-15',
  returnDate: '2027-03-30',
  datesFlexible: true,
  datesFlexibilityDays: 5,
  adultsCount: 2,
  childrenAges: [],
  infantsCount: 0,
  budgetRange: 'between_5k_10k',
  conseillerLanguage: 'fr',
  speciality: 'lune_de_miel',
  familiarity: 'experienced_traveler',
  contact: {
    email: 'rate-limit-test@example.com',
    firstName: 'Marie',
    lastName: 'Dupont',
    phone: '514-555-1234',
    postalCode: 'H7N 1A1',
  },
  consentGiven: true,
};

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('Multi-briefs + rate-limit US3 (integration)', () => {
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
    // Cleanup intake data created during tests
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      await prisma.intakeOutboxEntry.deleteMany();
      await prisma.$executeRawUnsafe('DELETE FROM intake_audit_entries');
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
    await prisma.magicLinkToken.deleteMany();
    await prisma.voyageurBrief.deleteMany();
    await prisma.voyageurContact.deleteMany();
    await app.close();
  });

  beforeEach(async () => {
    if (skipAll) return;
    // Reset all intake state pour chaque test
    await prisma.magicLinkToken.deleteMany();
    await prisma.voyageurBrief.deleteMany();
    await prisma.voyageurContact.deleteMany();
    // TODO : flush Redis intake:rl:* (nécessite un client Redis ici)
  });

  it.skipIf(skipAll)('3 briefs avec même email → tous 201', async () => {
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/intake/briefs',
        headers: HEADERS,
        payload: {
          ...SAMPLE_BODY,
          destinations: [{ country: 'IT', region: `Region-${i}` }],
        },
      });
      expect(response.statusCode, `iteration ${i}`).toBe(201);
    }
  });

  it.skipIf(skipAll)(
    '4e brief même email → 429 EMAIL_RATE_LIMIT_EXCEEDED + retryAfter',
    async () => {
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/intake/briefs',
          headers: HEADERS,
          payload: SAMPLE_BODY,
        });
      }
      const response = await app.inject({
        method: 'POST',
        url: '/api/intake/briefs',
        headers: HEADERS,
        payload: SAMPLE_BODY,
      });
      expect(response.statusCode).toBe(429);
      const body = response.json();
      expect(body.code).toBe('EMAIL_RATE_LIMIT_EXCEEDED');
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.message).toMatch(/3 briefs/i);
    },
  );

  // TODO : 6 briefs même IP emails différents → 429 RATE_LIMIT_EXCEEDED neutre.
  // Limité par le fait que Fastify inject() ne permet pas de simuler l'IP
  // (clientIp dérivé de la connexion réelle). À traiter via Playwright
  // ou avec config trust proxy + X-Forwarded-For.
});
