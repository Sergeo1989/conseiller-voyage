// T081b [invariant] — FR-019 / U2 du review.
//
// Test d'intégration Prisma : insère une row dans
// conformite_audit_entries puis tente UPDATE et DELETE — les deux
// DOIVENT lever une exception PostgreSQL ("audit log is append-only")
// grâce au trigger trg_conformite_audit_block_updates installé par la
// migration 0002_conformite_audit_append_only.
//
// Test EST l'invariant constitutionnel — le journal d'audit doit
// rester immuable (Principe IX + Loi 25 traçabilité 7 ans). Toute
// régression doit casser ces tests AVANT le déploiement.
//
// TODO(testcontainers) : container PG éphémère par run, et un sous-test
// qui se connecte sous le rôle DB app_conformite pour vérifier que
// l'absence de privilèges UPDATE/DELETE bloque AUSSI au niveau permission
// (couche défense supplémentaire de la migration 0002).

import { type Prisma, prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_AUDIT_PREFIX = '00000000-0000-4000-8000-bbbb';

async function cleanup(): Promise<void> {
  // On ne peut PAS deleteMany sur audit_entries (le trigger nous en empêche).
  // Stratégie : on tire les ids puis on désactive temporairement le trigger
  // SI la DB est dev/test. En CI testcontainers, le container est jeté
  // donc le cleanup est inutile. On utilise la stratégie suivante :
  //   1. Tenter de désactiver le trigger SESSION REPLICATION ROLE = replica
  //   2. Cleanup
  //   3. Réactiver
  // C'est une astuce hack mais documentée :
  //   https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-SESSION-REPLICATION-ROLE
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM conformite_audit_entries WHERE id::text LIKE '${TEST_AUDIT_PREFIX}%'`,
    );
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function insertAuditRow(suffix: string): Promise<{ id: string }> {
  const id = `${TEST_AUDIT_PREFIX}${suffix.padStart(4, '0')}`;
  const data: Prisma.AuditEntryUncheckedCreateInput = {
    id,
    conseillerComplianceId: null,
    eventType: 'admin.viewed_dossier',
    actorId: '00000000-0000-4000-8000-cccc0001',
    actorRole: 'admin',
    payload: { targetId: '00000000-0000-4000-8000-aaaa0001' },
    idempotencyKey: null,
    correlationId: null,
  };
  await prisma.auditEntry.create({ data });
  return { id };
}

describe('[invariant] conformite_audit_entries append-only (T081b)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('autorise INSERT (cas nominal du AuditLogWriter)', async () => {
    const inserted = await insertAuditRow('0001');
    const found = await prisma.auditEntry.findUnique({ where: { id: inserted.id } });
    expect(found).not.toBeNull();
  });

  it('REJETTE tout UPDATE avec exception "append-only"', async () => {
    const inserted = await insertAuditRow('0002');
    await expect(
      prisma.auditEntry.update({
        where: { id: inserted.id },
        data: { eventType: 'admin.viewed_document' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE tout DELETE avec exception "append-only"', async () => {
    const inserted = await insertAuditRow('0003');
    await expect(prisma.auditEntry.delete({ where: { id: inserted.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it('REJETTE UPDATE en masse via updateMany', async () => {
    await insertAuditRow('0004');
    await expect(
      prisma.auditEntry.updateMany({
        where: { id: { startsWith: TEST_AUDIT_PREFIX } },
        data: { eventType: 'admin.viewed_document' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE DELETE en masse via deleteMany', async () => {
    await insertAuditRow('0005');
    await expect(
      prisma.auditEntry.deleteMany({
        where: { id: { startsWith: TEST_AUDIT_PREFIX } },
      }),
    ).rejects.toThrow(/append-only/i);
  });
});
