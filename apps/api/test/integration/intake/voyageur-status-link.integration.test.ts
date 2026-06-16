// T024 [017 US3] — Integration lien de suivi durable `view_brief_status`.
//
// PRÉREQUIS : docker:up + db:migrate (skip-guard `dbAvailable` sinon).
// Couvre : un token `view_brief_status` (généré par le mailer, route /voyage/[token])
// donne accès au récap sans (ré)activer ni se consommer (DURABLE, réutilisable),
// distinct du `verify_email` one-time ; expiré → token_expired (→ renvoi 008).

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { VerifyMagicLinkUseCase } from '../../../src/modules/intake/application/use-cases/verify-magic-link.use-case';
import { hashToken } from '../../../src/modules/intake/domain/entities/magic-link-token.entity';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const LATER = new Date('2027-03-30T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');
const STATUS_TOKEN = 'b'.repeat(64);
const EXPIRED_TOKEN = 'c'.repeat(64);

describe('Lien de suivi durable view_brief_status (integration)', () => {
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
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    verify = app.get(VerifyMagicLinkUseCase);

    const contact = await prisma.voyageurContact.create({
      data: { email: 'status-link-test@example.com', postalCode: 'H2X 1Y4' },
    });
    contactId = contact.id;
    const brief = await prisma.voyageurBrief.create({
      data: {
        voyageurContactId: contactId,
        status: 'active', // déjà activé : le lien de suivi arrive post-activation
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
    await prisma.magicLinkToken.createMany({
      data: [
        {
          briefId,
          tokenHash: hashToken(STATUS_TOKEN),
          purpose: 'view_brief_status',
          expiresAt: LATER,
        },
        {
          briefId,
          tokenHash: hashToken(EXPIRED_TOKEN),
          purpose: 'view_brief_status',
          expiresAt: PAST,
        },
      ],
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

  it('token de suivi valide → ok (accès récap), réutilisable (non consommé)', async () => {
    if (skipAll) return;
    const r1 = await verify.execute({ clearToken: STATUS_TOKEN });
    expect(r1.kind).toBe('ok');

    // DURABLE : un 2e passage du MÊME token réussit encore (non consommé).
    const r2 = await verify.execute({ clearToken: STATUS_TOKEN });
    expect(r2.kind).toBe('ok');

    const token = await prisma.magicLinkToken.findFirst({
      where: { briefId, tokenHash: hashToken(STATUS_TOKEN) },
    });
    expect(token?.consumedAt).toBeNull();

    // Aucune (ré)activation : pas d'accusé d'activation enqueue.
    const acks = await prisma.voyageurNotification.findMany({
      where: { briefId, type: 'accuse_activation' },
    });
    expect(acks).toHaveLength(0);
  });

  it('token de suivi expiré → token_expired (→ renvoi 008)', async () => {
    if (skipAll) return;
    const r = await verify.execute({ clearToken: EXPIRED_TOKEN });
    expect(r.kind).toBe('token_expired');
  });
});
