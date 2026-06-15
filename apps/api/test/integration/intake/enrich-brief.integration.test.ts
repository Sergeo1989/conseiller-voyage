// T021/T026/T032 [016] — Integration enrichissement (DB réelle, LLM faké).
//
// PRÉREQUIS : docker:up + db:migrate (skip-guard `dbAvailable` sinon).
// Couvre : persistance enrichi (US1), consommation par le scoring (US2, décorateur),
// cascade anonymisation Loi 25 (FR-015, T032).

import { prisma } from '@cv/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { LLM_PROVIDER } from '../../../src/modules/intake/application/ports';
import { EnrichBriefUseCase } from '../../../src/modules/intake/application/use-cases/enrich-brief.use-case';
import { FakeLlmProvider } from '../../../src/modules/intake/infrastructure/llm/__fakes__/fake-llm-provider';
import {
  BRIEF_SNAPSHOT_READER,
  type BriefSnapshot,
  type BriefSnapshotReader,
} from '../../../src/modules/matching/application/ports/brief-snapshot-reader.port';

async function dbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const FUTURE = new Date('2027-03-15T00:00:00Z');
const LATER = new Date('2027-03-30T00:00:00Z');

describe('Enrichissement LLM (integration)', () => {
  let app: NestFastifyApplication;
  let skipAll = false;
  let contactId = '';
  let briefId = '';

  beforeAll(async () => {
    if (!(await dbAvailable())) {
      skipAll = true;
      return;
    }
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_PROVIDER)
      .useValue(
        FakeLlmProvider.ok({
          speciality: 'famille_avec_enfants',
          destinations: ['FR'],
          confidence: 0.9,
        }),
      )
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    const contact = await prisma.voyageurContact.create({ data: { postalCode: 'H2X 1Y4' } });
    contactId = contact.id;
    const brief = await prisma.voyageurBrief.create({
      data: {
        voyageurContactId: contactId,
        status: 'active',
        expiresAt: LATER,
        consentGivenAt: new Date(),
        destinations: [{ country: 'IT' }],
        departureDate: FUTURE,
        returnDate: LATER,
        adultsCount: 2,
        budgetRange: 'between_2k_5k',
        conseillerLanguage: 'fr',
        speciality: 'autre',
        specialityOther: 'safari photo en famille',
        familiarity: 'occasional_traveler',
      },
    });
    briefId = brief.id;
  });

  afterAll(async () => {
    if (skipAll) return;
    if (briefId) await prisma.voyageurBrief.delete({ where: { id: briefId } }).catch(() => {});
    if (contactId)
      await prisma.voyageurContact.delete({ where: { id: contactId } }).catch(() => {});
    await app.close();
  });

  it('persiste un enrichissement `enrichi` avec spécialité canonique (US1)', async () => {
    if (skipAll) return;
    const result = await app.get(EnrichBriefUseCase).execute({ briefId: briefId as never });
    expect(result).toEqual({ kind: 'enriched', status: 'enrichi' });

    const row = await prisma.briefEnrichment.findUnique({ where: { briefId } });
    expect(row?.status).toBe('enrichi');
    expect(row?.enrichedSpeciality).toBe('famille_avec_enfants');
    expect(row?.enrichedDestinations).toEqual(['FR']);
  });

  it('le scoring consomme l’enrichi : `autre` résolu + destinations augmentées (US2)', async () => {
    if (skipAll) return;
    const reader = app.get<BriefSnapshotReader>(BRIEF_SNAPSHOT_READER);
    const snapshot = (await reader.readByBriefId(briefId)) as BriefSnapshot;
    expect(snapshot.speciality).toBe('famille_avec_enfants');
    expect(snapshot.destinations.map((d) => d.country)).toEqual(['IT', 'FR']);
  });

  it('cascade Loi 25 : anonymisation du brief neutralise les destinations (T032/FR-015)', async () => {
    if (skipAll) return;
    await prisma.voyageurBrief.update({
      where: { id: briefId },
      data: { status: 'anonymized', anonymizedAt: new Date() },
    });
    const row = await prisma.briefEnrichment.findUnique({ where: { briefId } });
    expect(row?.enrichedDestinations).toEqual([]);
    expect(row?.redactedAt).not.toBeNull();
  });
});
