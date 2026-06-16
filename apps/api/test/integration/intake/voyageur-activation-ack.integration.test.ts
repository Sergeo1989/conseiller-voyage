// T022 [017 US2] — Integration accusé d'activation (DB réelle).
//
// PRÉREQUIS : docker:up + db:migrate (skip-guard `dbAvailable` sinon).
// Couvre : vérification magic-link → activation → 1 notification `accuse_activation`
// (clé activation:{briefId}), distincte du courriel de vérification ; idempotente.

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';
import {
  type SendVoyageurNotificationResult,
  VOYAGEUR_NOTIFICATION_MAILER,
  VOYAGEUR_NOTIFICATION_OUTBOX,
  type VoyageurNotificationMailer,
  type VoyageurNotificationOutbox,
} from '../../../src/modules/intake/application/ports';
import { VerifyMagicLinkUseCase } from '../../../src/modules/intake/application/use-cases/verify-magic-link.use-case';
import { hashToken } from '../../../src/modules/intake/domain/entities/magic-link-token.entity';

class StubMailer implements VoyageurNotificationMailer {
  send(): Promise<SendVoyageurNotificationResult> {
    return Promise.resolve({ kind: 'sent' });
  }
}

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const LATER = new Date('2027-03-30T00:00:00Z');
const CLEAR_TOKEN = 'a'.repeat(64);

describe('Accusé d’activation voyageur (integration)', () => {
  let app: NestFastifyApplication;
  let verify: VerifyMagicLinkUseCase;
  let skipAll = false;
  let contactId = '';
  let briefId = '';

  beforeAll(async () => {
    if (!(await dbAvailable())) {
      skipAll = true;
      return;
    }
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VOYAGEUR_NOTIFICATION_MAILER)
      .useClass(StubMailer)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    verify = app.get(VerifyMagicLinkUseCase);

    const contact = await prisma.voyageurContact.create({
      data: { email: 'activation-ack-test@example.com', postalCode: 'H2X 1Y4' },
    });
    contactId = contact.id;
    const brief = await prisma.voyageurBrief.create({
      data: {
        voyageurContactId: contactId,
        status: 'pending_verification',
        expiresAt: LATER,
        consentGivenAt: new Date(),
        destinations: [{ country: 'IT' }],
        departureDate: new Date('2027-03-15T00:00:00Z'),
        returnDate: LATER,
        adultsCount: 2,
        budgetRange: 'between_2k_5k',
        conseillerLanguage: 'fr',
        speciality: 'autre',
        familiarity: 'occasional_traveler',
      },
    });
    briefId = brief.id;
    await prisma.magicLinkToken.create({
      data: {
        briefId,
        tokenHash: hashToken(CLEAR_TOKEN),
        purpose: 'verify_email',
        expiresAt: LATER,
      },
    });
  });

  afterAll(async () => {
    if (skipAll) return;
    if (briefId) {
      await prisma.voyageurNotification.deleteMany({ where: { briefId } });
      await prisma.magicLinkToken.deleteMany({ where: { briefId } });
      await prisma.voyageurBrief.delete({ where: { id: briefId } }).catch(() => {});
    }
    if (contactId)
      await prisma.voyageurContact.delete({ where: { id: contactId } }).catch(() => {});
    await app.close();
  });

  it('activation → 1 accusé `accuse_activation` (clé activation:{briefId})', async () => {
    if (skipAll) return;
    const result = await verify.execute({ clearToken: CLEAR_TOKEN });
    expect(result.kind).toBe('ok');

    const rows = await prisma.voyageurNotification.findMany({ where: { briefId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('accuse_activation');
    expect(rows[0]?.idempotencyKey).toBe(`activation:${briefId}`);
    expect(rows[0]?.outcome).toBeNull();
  });

  it('idempotent : un 2e enqueue de même clé ne crée pas de doublon', async () => {
    if (skipAll) return;
    const outbox = app.get<VoyageurNotificationOutbox>(VOYAGEUR_NOTIFICATION_OUTBOX);
    const res = await outbox.enqueue({
      id: '00000000-0000-0000-0000-0000000000ff',
      briefId,
      type: 'accuse_activation',
      idempotencyKey: `activation:${briefId}`,
      outcome: null,
      conseillerIds: [],
      createdAt: new Date(),
    });
    expect(res.kind).toBe('duplicate');
    const rows = await prisma.voyageurNotification.findMany({ where: { briefId } });
    expect(rows).toHaveLength(1);
  });
});
