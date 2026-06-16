// T019 [017 US1] — Integration notifier voyageur (DB réelle).
//
// PRÉREQUIS : docker:up + db:migrate (skip-guard `dbAvailable` sinon).
// Couvre : event matched → VoyageurNotification persistée `conseillers_prets`
// en_attente (SC-001) ; rejeu même issue → pas de doublon (anti-spam FR-014) ;
// unmatched → `recherche_en_cours`. Sert aussi de test de boot DI (AppModule
// résout VOYAGEUR_MATCH_NOTIFIER + le câblage matching → intake).

import { prisma } from '@cv/db';
import { VOYAGEUR_MATCH_NOTIFIER, type VoyageurMatchNotifier } from '@cv/shared/intake';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';
import {
  type SendVoyageurNotificationResult,
  VOYAGEUR_NOTIFICATION_MAILER,
  type VoyageurNotificationMailer,
} from '../../../src/modules/intake/application/ports';
import { VoyageurNotificationSender } from '../../../src/modules/intake/infrastructure/jobs/voyageur-notification.job';

// Stub mailer : évite tout appel SES réel pendant le boot (le dispatcher
// périodique tourne). Toujours `sent` ici — la branche SES-HS est couverte
// par le test unitaire déterministe du Sender (cf. plus bas).
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

describe('Notifications voyageur (integration)', () => {
  let app: NestFastifyApplication;
  let notifier: VoyageurMatchNotifier;
  let sender: VoyageurNotificationSender;
  let skipAll = false;
  let contactId = '';
  let matchedBriefId = '';
  let unmatchedBriefId = '';

  async function makeBrief(): Promise<string> {
    const brief = await prisma.voyageurBrief.create({
      data: {
        voyageurContactId: contactId,
        status: 'active',
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
    return brief.id;
  }

  beforeAll(async () => {
    if (!(await dbAvailable())) {
      skipAll = true;
      return;
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VOYAGEUR_NOTIFICATION_MAILER)
      .useClass(StubMailer)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    notifier = app.get<VoyageurMatchNotifier>(VOYAGEUR_MATCH_NOTIFIER);
    sender = app.get(VoyageurNotificationSender);

    const contact = await prisma.voyageurContact.create({ data: { postalCode: 'H2X 1Y4' } });
    contactId = contact.id;
    matchedBriefId = await makeBrief();
    unmatchedBriefId = await makeBrief();
  });

  afterAll(async () => {
    if (skipAll) return;
    for (const id of [matchedBriefId, unmatchedBriefId]) {
      if (id) {
        await prisma.voyageurNotification.deleteMany({ where: { briefId: id } });
        await prisma.voyageurBrief.delete({ where: { id } }).catch(() => {});
      }
    }
    if (contactId)
      await prisma.voyageurContact.delete({ where: { id: contactId } }).catch(() => {});
    await app.close();
  });

  it('matched → notification `conseillers_prets` en_attente (SC-001)', async () => {
    if (skipAll) return;
    await notifier.onBriefOutcome({
      briefId: matchedBriefId,
      outcome: 'matched',
      conseillerIds: ['c1', 'c2'],
      idempotencyKey: `evt-matched-${matchedBriefId}`,
    });
    const rows = await prisma.voyageurNotification.findMany({ where: { briefId: matchedBriefId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('conseillers_prets');
    expect(rows[0]?.status).toBe('en_attente');
    expect(rows[0]?.outcome).toBe('matched');
  });

  it('rejeu même issue → pas de doublon (anti-spam FR-014)', async () => {
    if (skipAll) return;
    await notifier.onBriefOutcome({
      briefId: matchedBriefId,
      outcome: 'matched',
      conseillerIds: ['c1', 'c2'],
      idempotencyKey: `evt-matched-${matchedBriefId}-2`,
    });
    const rows = await prisma.voyageurNotification.findMany({ where: { briefId: matchedBriefId } });
    expect(rows).toHaveLength(1);
  });

  it('unmatched → notification `recherche_en_cours`', async () => {
    if (skipAll) return;
    await notifier.onBriefOutcome({
      briefId: unmatchedBriefId,
      outcome: 'unmatched',
      conseillerIds: [],
      idempotencyKey: `evt-unmatched-${unmatchedBriefId}`,
    });
    const rows = await prisma.voyageurNotification.findMany({
      where: { briefId: unmatchedBriefId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('recherche_en_cours');
  });

  it('Sender (stub mailer) → notification marquée envoyee en DB', async () => {
    if (skipAll) return;
    const row = await prisma.voyageurNotification.findFirst({
      where: { briefId: matchedBriefId },
    });
    if (!row) throw new Error('notification attendue');
    await sender.send({
      notificationId: row.id,
      briefId: row.briefId,
      type: 'conseillers_prets',
      outcome: 'matched',
      conseillerIds: [],
    });
    const updated = await prisma.voyageurNotification.findUnique({ where: { id: row.id } });
    expect(updated?.status).toBe('envoyee');
    expect(updated?.sentAt).not.toBeNull();
  });
});
