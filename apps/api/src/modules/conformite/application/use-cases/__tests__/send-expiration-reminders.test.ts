// T082 — Tests SendExpirationRemindersUseCase.

import {
  CertificatIdSchema,
  ConseillerComplianceIdSchema,
  ConseillerIdSchema,
  SubmissionIdSchema,
} from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { Certificat } from '../../../domain/entities/certificat.entity';
import {
  FakeAuditLogWriter,
  FakeClock,
  FakeConformiteRepository,
  FakeNotificationPort,
  FakeOutboxWriter,
} from '../../__tests__/_fakes';
import { SendExpirationRemindersUseCase } from '../send-expiration-reminders.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 700;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000001');
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');
const SUBMISSION_ID = SubmissionIdSchema.parse('00000000-0000-4000-8000-000000000801');

function makeCert(
  suffix: string,
  expiresAt: Date,
  overrides: Partial<Certificat> = {},
): Certificat {
  // Pad to 12 hex chars using only [0-9a-f]
  const validId = suffix.replace(/[^0-9a-f]/g, '0').padStart(12, '7');
  return {
    id: CertificatIdSchema.parse(`00000000-0000-4000-8000-${validId}`),
    conseillerComplianceId: COMPLIANCE_ID,
    province: 'QC',
    certificateNumber: `CCV-${suffix}`,
    issuedAt: new Date('2025-01-01'),
    expiresAt,
    documentObjectKey: `conformite/${COMPLIANCE_ID}/${suffix}`,
    submittedAt: new Date('2025-01-15'),
    decision: 'approved',
    decisionAt: new Date('2025-01-20'),
    decisionByAdminId: null,
    refusalReason: null,
    supersededById: null,
    ...overrides,
  };
}

function makeContext(): {
  useCase: SendExpirationRemindersUseCase;
  repo: FakeConformiteRepository;
  notifications: FakeNotificationPort;
  audit: FakeAuditLogWriter;
  outbox: FakeOutboxWriter;
} {
  const repo = new FakeConformiteRepository();
  const notifications = new FakeNotificationPort();
  const audit = new FakeAuditLogWriter();
  const outbox = new FakeOutboxWriter();
  const clock = new FakeClock(NOW);
  const uuidGen = new FakeUuidGenerator();
  const useCase = new SendExpirationRemindersUseCase(
    repo,
    notifications,
    audit,
    outbox,
    clock,
    uuidGen,
  );
  return { useCase, repo, notifications, audit, outbox };
}

const CONSEILLER_MAP = new Map([[COMPLIANCE_ID, CONSEILLER_ID]]);

describe('SendExpirationRemindersUseCase (T082)', () => {
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    ctx = makeContext();
  });

  it('envoie un rappel J-60 pour un cert qui expire dans exactement 60 jours', async () => {
    const cert = makeCert('aaa', new Date(NOW.getTime() + 60 * MS_PER_DAY));
    ctx.repo.certificats.set(cert.id, cert);
    ctx.repo.certificatsBySubmission.set(SUBMISSION_ID, [cert.id]);

    const result = await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });

    expect(result.byKind.reminder_60d).toBe(1);
    expect(result.byKind.reminder_30d).toBe(0);
    expect(result.byKind.reminder_7d).toBe(0);
    expect(ctx.notifications.sent).toHaveLength(1);
    expect(ctx.notifications.sent[0]?.kind).toBe('expiration_reminder');
    expect(ctx.notifications.sent[0]?.payload.daysRemaining).toBe(60);
    expect(ctx.audit.entries).toHaveLength(1);
    expect(ctx.audit.entries[0]?.eventType).toBe('expiration.reminder_sent_60d');
    expect(ctx.outbox.entries).toHaveLength(1);
  });

  it('envoie J-30 pour cert à 30 jours', async () => {
    const cert = makeCert('bbb', new Date(NOW.getTime() + 30 * MS_PER_DAY + 1000));
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });
    expect(result.byKind.reminder_30d).toBe(1);
  });

  it('envoie J-7 pour cert à 7 jours', async () => {
    const cert = makeCert('ccc', new Date(NOW.getTime() + 7 * MS_PER_DAY + 1000));
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });
    expect(result.byKind.reminder_7d).toBe(1);
  });

  it("n'envoie rien pour un cert à 45 jours (hors fenêtres)", async () => {
    const cert = makeCert('ddd', new Date(NOW.getTime() + 45 * MS_PER_DAY));
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });
    expect(result.sentCount).toBe(0);
    expect(ctx.notifications.sent).toHaveLength(0);
  });

  it('exclut les certs refused', async () => {
    const cert = makeCert('eee', new Date(NOW.getTime() + 60 * MS_PER_DAY), {
      decision: 'refused',
    });
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });
    expect(result.sentCount).toBe(0);
  });

  it('exclut les certs supersededBy non-null (renouvellement)', async () => {
    const cert = makeCert('fff', new Date(NOW.getTime() + 60 * MS_PER_DAY), {
      supersededById: CertificatIdSchema.parse('00000000-0000-4000-8000-777777777fff'),
    });
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });
    expect(result.sentCount).toBe(0);
  });

  it('respecte le paramètre asOf (override horloge pour rejeu)', async () => {
    const pastDate = new Date('2026-04-01T12:00:00Z');
    const cert = makeCert('ggg', new Date(pastDate.getTime() + 60 * MS_PER_DAY));
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({
      asOf: pastDate,
      conseillerByComplianceId: CONSEILLER_MAP,
    });
    expect(result.byKind.reminder_60d).toBe(1);
  });

  it("saute silencieusement si conseillerByComplianceId ne contient pas l'entrée", async () => {
    const cert = makeCert('hhh', new Date(NOW.getTime() + 60 * MS_PER_DAY));
    ctx.repo.certificats.set(cert.id, cert);
    const result = await ctx.useCase.execute({
      conseillerByComplianceId: new Map(), // map vide
    });
    expect(result.sentCount).toBe(1); // compté côté reader.findMany
    expect(ctx.notifications.sent).toHaveLength(0); // mais pas envoyé
  });

  it('idempotencyKey audit déterministe (rejouable sans doublon DB)', async () => {
    const cert = makeCert('iii', new Date(NOW.getTime() + 60 * MS_PER_DAY));
    ctx.repo.certificats.set(cert.id, cert);
    await ctx.useCase.execute({ conseillerByComplianceId: CONSEILLER_MAP });
    expect(ctx.audit.entries[0]?.idempotencyKey).toBe(`reminder:${cert.id}:reminder_60d`);
  });
});
