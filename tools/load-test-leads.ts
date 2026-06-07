#!/usr/bin/env tsx
// T059b — Test de charge léger du chemin lead (à lancer en STAGING).
//
// Mesure la latence synchrone du chemin conseiller (consultation d'un lead =
// ViewLeadUseCase, auto-vu idempotent — représentatif des endpoints de
// transition). Cible SC-005 / SLO Principe X : p95 < 800 ms.
//
// La latence « réception événement → mise en file notification < 5 s » (SC-005)
// est asynchrone (consumer bus → outbox → job BullMQ) ; elle est observée via
// les métriques OTel `cv.matching.lead.*` en staging, pas mesurable ici en
// synchrone — ce harness couvre le versant transition synchrone.
//
// ⚠️ Stack complète requise (DATABASE_URL + REDIS_URL + secrets) — staging :
//   DATABASE_URL=... REDIS_URL=... pnpm exec tsx tools/load-test-leads.ts --leads 100 --rate 5
//
// Ne SEED PAS (seeding cross-module fragile) : rejoue sur des leads réels.
// Échantillon insuffisant → skip non bloquant. Gabarit hérité de
// tools/load-test-matching.ts (011).
//
// Sortie : histogramme p50/p95/p99 + verdict. Exit 1 si p95 ≥ 800 ms.

import { prisma } from '@cv/db';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../apps/api/src/app.module';
import { ViewLeadUseCase } from '../apps/api/src/modules/matching/application/use-cases/view-lead.use-case';

interface Options {
  readonly leads: number;
  readonly rate: number; // requêtes/seconde
}

function parseArgs(argv: string[]): Options {
  let leads = 100;
  let rate = 5;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--leads' && argv[i + 1]) leads = Number(argv[i + 1]);
    if (argv[i] === '--rate' && argv[i + 1]) rate = Number(argv[i + 1]);
  }
  return { leads: Math.max(1, leads), rate: Math.max(0.1, rate) };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pickLeads(limit: number): Promise<Array<{ id: string; conseillerId: string }>> {
  return prisma.$queryRawUnsafe<Array<{ id: string; conseillerId: string }>>(
    `SELECT "id"::text AS id, "conseillerId"::text AS "conseillerId"
       FROM "leads"
      ORDER BY "createdAt" DESC
      LIMIT ${Math.trunc(limit)}`,
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const intervalMs = Math.round(1000 / opts.rate);

  process.stdout.write(
    `[load-test-leads] cible ${opts.leads} consultations @ ~${opts.rate}/s (interval ${intervalMs} ms)\n`,
  );

  let leads: Array<{ id: string; conseillerId: string }>;
  try {
    leads = await pickLeads(opts.leads);
  } catch (err) {
    process.stdout.write(
      `[load-test-leads] DB inaccessible ou tables absentes — skip non bloquant : ${err instanceof Error ? err.message : String(err)}\n`,
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  if (leads.length < Math.min(10, opts.leads)) {
    process.stdout.write(
      `[load-test-leads] Échantillon insuffisant (${leads.length} leads). Seeder davantage en staging — skip non bloquant.\n`,
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const viewLead = app.get(ViewLeadUseCase);

  const durations: number[] = [];
  for (const lead of leads) {
    const start = Date.now();
    await viewLead.execute({ leadId: lead.id, conseillerId: lead.conseillerId });
    durations.push(Date.now() - start);
    await sleep(intervalMs);
  }

  await app.close();
  await prisma.$disconnect();

  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);

  process.stdout.write('\n[load-test-leads] Résultats (consultation synchrone) :\n');
  process.stdout.write(`  n   = ${durations.length}\n`);
  process.stdout.write(`  p50 = ${percentile(sorted, 50)} ms\n`);
  process.stdout.write(`  p95 = ${p95} ms  (cible SC-005 < 800 ms)\n`);
  process.stdout.write(`  p99 = ${percentile(sorted, 99)} ms\n`);
  process.stdout.write(`  max = ${sorted[sorted.length - 1] ?? 0} ms\n\n`);

  const P95_BUDGET_MS = 800;
  if (p95 >= P95_BUDGET_MS) {
    process.stderr.write(
      `❌ [load-test-leads] p95 = ${p95} ms ≥ budget ${P95_BUDGET_MS} ms (SC-005). À investiguer avant PR.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`✅ [load-test-leads] p95 = ${p95} ms < ${P95_BUDGET_MS} ms — OK\n`);
  process.exit(0);
}

main().catch(async (err) => {
  process.stderr.write(`load-test-leads failed: ${String(err)}\n`);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
