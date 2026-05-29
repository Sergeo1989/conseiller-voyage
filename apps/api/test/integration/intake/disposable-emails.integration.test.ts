// T102 — Integration tests disposable emails detection (FR-021).

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
  destinations: [{ country: 'IT' }],
  departureDate: '2027-03-15',
  returnDate: '2027-03-30',
  datesFlexible: false,
  adultsCount: 2,
  childrenAges: [],
  infantsCount: 0,
  budgetRange: 'between_5k_10k',
  conseillerLanguage: 'fr',
  speciality: 'lune_de_miel',
  familiarity: 'experienced_traveler',
  contact: {
    email: 'placeholder@example.com',
    firstName: 'Marie',
    lastName: 'Dupont',
  },
  consentGiven: true,
};

const DISPOSABLE_DOMAINS = ['mailinator.com', 'guerrillamail.com', 'temp-mail.org', 'yopmail.com'];

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('Disposable emails US3 (integration)', () => {
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

  beforeEach(async () => {
    if (skipAll) return;
    await prisma.magicLinkToken.deleteMany();
    await prisma.voyageurBrief.deleteMany();
    await prisma.voyageurContact.deleteMany();
  });

  for (const domain of DISPOSABLE_DOMAINS) {
    it.skipIf(skipAll)(`refuse email @${domain} avec 422 DISPOSABLE_EMAIL_DETECTED`, async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/intake/briefs',
        headers: HEADERS,
        payload: {
          ...SAMPLE_BODY,
          contact: { ...SAMPLE_BODY.contact, email: `fake@${domain}` },
        },
      });
      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.code).toBe('DISPOSABLE_EMAIL_DETECTED');
      expect(body.message).toMatch(/temporaire|temporary/i);
    });
  }

  it.skipIf(skipAll)('accepte gmail.com (FR-021 false-positive prevention)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/intake/briefs',
      headers: HEADERS,
      payload: {
        ...SAMPLE_BODY,
        contact: { ...SAMPLE_BODY.contact, email: 'durable@gmail.com' },
      },
    });
    expect(response.statusCode).toBe(201);
  });
});
