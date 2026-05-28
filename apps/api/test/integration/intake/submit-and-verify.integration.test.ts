// T055 [TDD intégration] — Tests end-to-end NestJS du flow submit + verify.
//
// Exécution :
//   - Local : `pnpm docker:up && pnpm db:migrate` puis
//     `pnpm --filter @cv/api test:integration -- --grep intake`.
//   - CI : exécuté automatiquement par .github/workflows/ci.yml avec
//     Postgres + Redis Testcontainers (les containers sont jetés en fin
//     de job, donc pas de cleanup nécessaire en CI).
//
// Le `beforeAll` skip si DATABASE_URL ne répond pas (dev sans Docker)
// pour éviter de bloquer le local quand seuls les tests unit sont visés.

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';

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
    email: 'integration-test@example.com',
    firstName: 'Marie',
    lastName: 'Dupont',
    phone: '514-555-1234',
    postalCode: 'H7N 1A1',
  },
  consentGiven: true,
};

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

describe('VoyageurIntakeController (integration)', () => {
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
    // Cleanup audit table avec contournement trigger append-only.
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      await prisma.intakeOutboxEntry.deleteMany();
      await prisma.$executeRawUnsafe(
        `DELETE FROM intake_audit_entries WHERE "voyageurContactId"::text IN (SELECT id::text FROM intake_voyageur_contacts WHERE email = '${SAMPLE_BODY.contact.email}')`,
      );
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
    await prisma.magicLinkToken.deleteMany();
    await prisma.voyageurBrief.deleteMany({
      where: { voyageurContact: { email: SAMPLE_BODY.contact.email } },
    });
    await prisma.voyageurContact.deleteMany({ where: { email: SAMPLE_BODY.contact.email } });
    await app.close();
  });

  beforeEach(async () => {
    if (skipAll) return;
    // Reset state for each test (sans toucher à l'audit append-only)
    await prisma.magicLinkToken.deleteMany();
    await prisma.voyageurBrief.deleteMany({
      where: { voyageurContact: { email: SAMPLE_BODY.contact.email } },
    });
    await prisma.voyageurContact.deleteMany({ where: { email: SAMPLE_BODY.contact.email } });
  });

  it.skipIf(skipAll)('golden path : POST /api/intake/briefs → 201 brief en DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/intake/briefs',
      headers: HEADERS,
      payload: SAMPLE_BODY,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.briefId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.status).toBe('pending_verification');

    const inDb = await prisma.voyageurBrief.findUnique({ where: { id: body.briefId } });
    expect(inDb).not.toBeNull();
    expect(inDb?.status).toBe('pending_verification');

    // Magic link token créé et hash stocké (pas le clear)
    const tokens = await prisma.magicLinkToken.findMany({ where: { briefId: body.briefId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.skipIf(skipAll)('validation 400 : consentGiven=false → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/intake/briefs',
      headers: HEADERS,
      payload: { ...SAMPLE_BODY, consentGiven: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it.skipIf(skipAll)('disposable 422 : email jetable → 422 DISPOSABLE_EMAIL_DETECTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/intake/briefs',
      headers: HEADERS,
      payload: {
        ...SAMPLE_BODY,
        contact: { ...SAMPLE_BODY.contact, email: 'fake@mailinator.com' },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('DISPOSABLE_EMAIL_DETECTED');
  });

  // TODO : rate-limit 429 EMAIL + IP (T101 integration test dédié)
  // TODO : idempotency 409 (test dédié)
  // TODO : verify magic link golden path (lookup SES LocalStack mailbox)
});
