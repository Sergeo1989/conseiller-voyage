// T056 — Tests d'invariant : mfa_audit_events est append-only.
//
// Trois triggers Postgres bloquent UPDATE/DELETE/TRUNCATE. Toute
// régression DOIT casser ces tests avant tout déploiement.
//
// Pattern : insère une row, tente la mutation, attend une exception
// PostgreSQL "audit log is append-only".

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_AUDIT_PREFIX = '00000000-0000-4000-8000-aaaa';

async function cleanupAudit(): Promise<void> {
  // Disable triggers temporairement pour cleanup (session-only).
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM mfa_audit_events WHERE id::text LIKE '${TEST_AUDIT_PREFIX}%'`,
    );
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function insertAuditRow(suffix: string): Promise<{ id: string }> {
  const id = `${TEST_AUDIT_PREFIX}${suffix.padStart(8, '0')}`;
  await prisma.mfaAuditEvent.create({
    data: {
      id,
      eventType: 'mfa_login_verified',
      actorUserId: null,
      targetUserId: null,
    },
  });
  return { id };
}

describe('mfa_audit_events append-only triggers', () => {
  beforeEach(async () => {
    await cleanupAudit();
  });
  afterAll(async () => {
    await cleanupAudit();
  });

  it('autorise INSERT (cas nominal)', async () => {
    const { id } = await insertAuditRow('00000001');
    const found = await prisma.mfaAuditEvent.findUnique({ where: { id } });
    expect(found).not.toBeNull();
  });

  it("rejette UPDATE avec 'audit log is append-only'", async () => {
    const { id } = await insertAuditRow('00000002');
    await expect(
      prisma.mfaAuditEvent.update({
        where: { id },
        data: { justification: 'hack' },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejette DELETE avec 'audit log is append-only'", async () => {
    const { id } = await insertAuditRow('00000003');
    await expect(prisma.mfaAuditEvent.delete({ where: { id } })).rejects.toThrow(/append-only/);
  });

  it("rejette deleteMany avec 'audit log is append-only'", async () => {
    const { id } = await insertAuditRow('00000004');
    await expect(
      prisma.mfaAuditEvent.deleteMany({
        where: { id },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejette TRUNCATE avec 'audit log is append-only'", async () => {
    await insertAuditRow('00000005');
    await expect(prisma.$executeRawUnsafe('TRUNCATE mfa_audit_events')).rejects.toThrow(
      /append-only/,
    );
  });

  it('rejette updateMany aussi (bulk update)', async () => {
    const { id } = await insertAuditRow('00000006');
    // updateMany Prisma surface un format d'erreur différent de update —
    // on vérifie seulement que la promesse rejette. Le contenu append-only
    // est vérifié par les 3 cas précédents (update, delete, deleteMany).
    await expect(
      prisma.mfaAuditEvent.updateMany({
        where: { id },
        data: { justification: 'bulk hack' },
      }),
    ).rejects.toThrow();
  });
});
