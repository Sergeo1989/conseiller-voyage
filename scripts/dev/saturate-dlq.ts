#!/usr/bin/env tsx
// T110 — Saturer la DLQ (notification_email_dlq_size > 50) pour tester l'alerte FR-020.
// Insère directement des entrées dead_letter via Prisma (dev uniquement).
//
// Usage :
//   tsx scripts/dev/saturate-dlq.ts [--count 60] [--cleanup]
//
// Variables d'env :
//   DATABASE_URL — connexion PostgreSQL (lue depuis .env.local par défaut via tsx)

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const COUNT = Number(args[args.indexOf('--count') + 1] || 60);
const CLEANUP = args.includes('--cleanup');

const prisma = new PrismaClient();

async function run(): Promise<void> {
  if (CLEANUP) {
    const _deleted = await prisma.notificationEmailLog.deleteMany({
      where: { correlationId: { startsWith: 'dlq-saturate-' } },
    });
    return;
  }
  const now = new Date();
  const inserts = Array.from({ length: COUNT }, (_, i) => ({
    id: randomUUID(),
    correlationId: `dlq-saturate-${Date.now()}-${i}`,
    sourceModule: 'notifications' as const,
    eventType: 'test.saturate-dlq',
    templateId: 'test.noop',
    recipientEmailClear: `dlq-test-${i}@dev.internal`,
    recipientEmailCanonical: `dlq-test-${i}@dev.internal`,
    recipientEmailHashHMAC: `dev-hash-saturate-${i}`,
    recipientLocale: 'fr-CA',
    enqueuedAt: now,
    status: 'dead_letter' as const,
    attempts: 10,
    createdAt: now,
    updatedAt: now,
  }));

  for (const entry of inserts) {
    await prisma.notificationEmailLog.create({ data: entry });
  }

  const _total = await prisma.notificationEmailLog.count({ where: { status: 'dead_letter' } });
}

void run().finally(() => prisma.$disconnect());
