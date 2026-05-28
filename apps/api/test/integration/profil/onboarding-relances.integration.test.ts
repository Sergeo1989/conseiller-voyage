// T133-T134 — Tests intégration onboarding relances (feature 007 FR-021).
//
// T133 BullmqOnboardingRelanceScheduler :
//   - 3 jobs delayed (J+3, J+7, J+14) planifiés avec jobId déterministe
//   - Dédoublonnage : re-planification = no-op via jobId
//   - annulerRelances : retire les 3 jobs
//
// T134 EnvoyerRelanceOnboardingUseCase :
//   - statut incomplet → audit relance émis
//   - statut pret/masque_admin/anonymise → no-op (idempotence)
//   - profil inexistant → no-op silencieux

import { Queue } from 'bullmq';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthAuditWriter } from '../../../src/modules/identite/application/ports/auth-audit-writer.port';
import { EnvoyerRelanceOnboardingUseCase } from '../../../src/modules/identite/application/use-cases/envoyer-relance-onboarding.use-case';
import {
  BullmqOnboardingRelanceScheduler,
  ONBOARDING_REMINDERS_QUEUE,
  SEND_ONBOARDING_REMINDER_JOB,
} from '../../../src/modules/identite/infrastructure/bullmq-onboarding-relance-scheduler';
import { PrismaProfilConseillerRepository } from '../../../src/modules/identite/infrastructure/prisma-profil-conseiller-repository';
import { buildUuid, cleanupByUuidPrefix, seedAuthUser, seedProfil } from './_helpers';

const PREFIX = 'c01';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_PARSED = new URL(REDIS_URL);
const REDIS_CONNECTION = {
  host: REDIS_PARSED.hostname,
  port: Number(REDIS_PARSED.port || 6379),
};

const TEST_QUEUE_NAME = `${ONBOARDING_REMINDERS_QUEUE}.test`;

describe('T133 BullmqOnboardingRelanceScheduler', () => {
  let queue: Queue;
  let scheduler: BullmqOnboardingRelanceScheduler;

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: REDIS_CONNECTION });
    await queue.obliterate({ force: true }); // clean
    scheduler = new BullmqOnboardingRelanceScheduler(queue);
  });

  afterEach(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('planifie 3 jobs delayed (J+3, J+7, J+14) avec jobId déterministe', async () => {
    const profileId = buildUuid(PREFIX, '00000001');
    const verifiedAt = new Date();
    await scheduler.planifierRelances({ profileId, verifiedAt });

    const jobs = await queue.getJobs(['delayed', 'waiting']);
    expect(jobs.length).toBe(3);

    const jobIds = jobs.map((j) => j.id).sort();
    expect(jobIds).toEqual([
      `onboarding-reminder-${profileId}-j14`,
      `onboarding-reminder-${profileId}-j3`,
      `onboarding-reminder-${profileId}-j7`,
    ]);

    // Vérifie les delays approximativement (delta = scheduledFor - now)
    const j3 = jobs.find((j) => j.id?.endsWith('-j3'));
    const j7 = jobs.find((j) => j.id?.endsWith('-j7'));
    const j14 = jobs.find((j) => j.id?.endsWith('-j14'));
    const DAY_MS = 24 * 60 * 60 * 1000;
    // delay est en ms, tolérance de quelques secondes
    expect(j3?.opts.delay).toBeGreaterThan(3 * DAY_MS - 5000);
    expect(j3?.opts.delay).toBeLessThan(3 * DAY_MS + 5000);
    expect(j7?.opts.delay).toBeGreaterThan(7 * DAY_MS - 5000);
    expect(j14?.opts.delay).toBeGreaterThan(14 * DAY_MS - 5000);

    // Payload du job
    expect(j3?.data).toEqual({ profileId, etape: 'j3' });
    expect(j3?.name).toBe(SEND_ONBOARDING_REMINDER_JOB);
  });

  it('idempotent : re-planification = no-op grâce au jobId BullMQ', async () => {
    const profileId = buildUuid(PREFIX, '00000002');
    const verifiedAt = new Date();
    await scheduler.planifierRelances({ profileId, verifiedAt });
    await scheduler.planifierRelances({ profileId, verifiedAt });

    const jobs = await queue.getJobs(['delayed', 'waiting']);
    expect(jobs.length).toBe(3); // toujours 3, pas 6
  });

  it('annulerRelances retire les 3 jobs', async () => {
    const profileId = buildUuid(PREFIX, '00000003');
    await scheduler.planifierRelances({ profileId, verifiedAt: new Date() });
    expect((await queue.getJobs(['delayed', 'waiting'])).length).toBe(3);

    await scheduler.annulerRelances(profileId);
    expect((await queue.getJobs(['delayed', 'waiting'])).length).toBe(0);
  });

  it('annulerRelances idempotent (no-op si déjà annulé)', async () => {
    const profileId = buildUuid(PREFIX, '00000004');
    await expect(scheduler.annulerRelances(profileId)).resolves.toBeUndefined();
    await expect(scheduler.annulerRelances(profileId)).resolves.toBeUndefined();
  });
});

describe('T134 EnvoyerRelanceOnboardingUseCase', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  function buildUseCase(): {
    useCase: EnvoyerRelanceOnboardingUseCase;
    audit: AuthAuditWriter;
  } {
    const audit: AuthAuditWriter = { append: vi.fn().mockResolvedValue(undefined) };
    return {
      useCase: new EnvoyerRelanceOnboardingUseCase(new PrismaProfilConseillerRepository(), audit),
      audit,
    };
  }

  it('statut incomplet → audit émis', async () => {
    const authUserId = buildUuid(PREFIX, '00000010');
    const profilId = buildUuid(PREFIX, '10000010');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

    const { useCase, audit } = buildUseCase();
    await useCase.execute({ profileId: profilId, etape: 'j3' });

    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'signup',
        targetUserId: authUserId,
        metadata: expect.objectContaining({
          action: 'profil.onboarding.reminder',
          etape: 'j3',
        }),
      }),
    );
  });

  it('statut pret → no-op (idempotence : conseiller a complété entretemps)', async () => {
    const authUserId = buildUuid(PREFIX, '00000011');
    const profilId = buildUuid(PREFIX, '10000011');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'pret',
      slug: `c01-pret-${Date.now()}`,
    });

    const { useCase, audit } = buildUseCase();
    await useCase.execute({ profileId: profilId, etape: 'j7' });

    expect(audit.append).not.toHaveBeenCalled();
  });

  it('statut masque_admin → no-op', async () => {
    const authUserId = buildUuid(PREFIX, '00000012');
    const profilId = buildUuid(PREFIX, '10000012');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'masque_admin',
      raisonMasquageAdmin: 'Test',
    });

    const { useCase, audit } = buildUseCase();
    await useCase.execute({ profileId: profilId, etape: 'j14' });

    expect(audit.append).not.toHaveBeenCalled();
  });

  it('statut anonymise → no-op', async () => {
    const authUserId = buildUuid(PREFIX, '00000013');
    const profilId = buildUuid(PREFIX, '10000013');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'anonymise',
      anonymizedAt: new Date(),
    });

    const { useCase, audit } = buildUseCase();
    await useCase.execute({ profileId: profilId, etape: 'j3' });

    expect(audit.append).not.toHaveBeenCalled();
  });

  it('profil inexistant → no-op silencieux (warn log)', async () => {
    const ghostId = buildUuid(PREFIX, '99999999');
    const { useCase, audit } = buildUseCase();
    await expect(useCase.execute({ profileId: ghostId, etape: 'j3' })).resolves.toBeUndefined();
    expect(audit.append).not.toHaveBeenCalled();
  });
});
