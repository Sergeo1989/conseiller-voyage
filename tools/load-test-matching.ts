#!/usr/bin/env tsx
// T101b — Test de charge léger du pipeline matching (à lancer en STAGING).
//
// Mesure la latence du calcul + persistance synchrone de PerformMatchingUseCase
// (cible SC-001 / SLO Principe X : p95 < 800 ms) sur un échantillon de briefs
// actifs réels, à un débit d'environ 1 brief/s.
//
// ⚠️ Nécessite la stack complète accessible via les variables d'environnement
// (DATABASE_URL + REDIS_URL + secrets) — typiquement exécuté contre staging :
//
//   DATABASE_URL=... REDIS_URL=... pnpm exec tsx tools/load-test-matching.ts --briefs 60 --rate 1
//
// Le harness ne SEED PAS de données (le seeding cross-module verified/brief est
// fragile) : il rejoue le matching sur des briefs `active` réels n'ayant PAS
// encore de MatchingResult, de façon à exercer le vrai chemin de scoring +
// persistance. Si l'échantillon est insuffisant, il l'indique et sort en
// skip non bloquant.
//
// Sortie : histogramme p50/p95/p99 + verdict. Exit 1 si p95 ≥ 800 ms.

import { prisma } from '@cv/db';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../apps/api/src/app.module';
import { PerformMatchingUseCase } from '../apps/api/src/modules/matching/application/use-cases/perform-matching.use-case';

interface Options {
  readonly briefs: number;
  readonly rate: number; // briefs/seconde
}

function parseArgs(argv: string[]): Options {
  let briefs = 60;
  let rate = 1;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--briefs' && argv[i + 1]) briefs = Number(argv[i + 1]);
    if (argv[i] === '--rate' && argv[i + 1]) rate = Number(argv[i + 1]);
  }
  return { briefs: Math.max(1, briefs), rate: Math.max(0.1, rate) };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Briefs `active` sans MatchingResult actif → exercent le vrai chemin de calcul. */
async function pickEligibleBriefIds(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT b."id"::text AS id
       FROM "intake_voyageur_briefs" b
       LEFT JOIN "matching_results" m
         ON m."briefId" = b."id" AND m."supersededAt" IS NULL
      WHERE b."status" = 'active' AND m."id" IS NULL
      ORDER BY b."createdAt" DESC
      LIMIT ${Math.trunc(limit)}`,
  );
  return rows.map((r) => r.id);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const intervalMs = Math.round(1000 / opts.rate);

  process.stdout.write(
    `[load-test-matching] cible ${opts.briefs} briefs @ ~${opts.rate}/s (interval ${intervalMs} ms)\n`,
  );

  let briefIds: string[];
  try {
    briefIds = await pickEligibleBriefIds(opts.briefs);
  } catch (err) {
    process.stdout.write(
      `[load-test-matching] DB inaccessible ou tables absentes — skip non bloquant : ${err instanceof Error ? err.message : String(err)}\n`,
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  if (briefIds.length < Math.min(10, opts.briefs)) {
    process.stdout.write(
      `[load-test-matching] Échantillon insuffisant (${briefIds.length} briefs actifs non matchés). Seeder davantage de briefs en staging avant de mesurer — skip non bloquant.\n`,
    );
    await prisma.$disconnect();
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const performMatching = app.get(PerformMatchingUseCase);

  const durations: number[] = [];
  for (const briefId of briefIds) {
    const start = Date.now();
    await performMatching.execute({ briefId });
    durations.push(Date.now() - start);
    await sleep(intervalMs);
  }

  await app.close();
  await prisma.$disconnect();

  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const max = sorted[sorted.length - 1] ?? 0;

  process.stdout.write('\n[load-test-matching] Résultats (calcul + persistance synchrone) :\n');
  process.stdout.write(`  n      = ${durations.length}\n`);
  process.stdout.write(`  p50    = ${p50} ms\n`);
  process.stdout.write(`  p95    = ${p95} ms  (cible SC-001 < 800 ms)\n`);
  process.stdout.write(`  p99    = ${p99} ms\n`);
  process.stdout.write(`  max    = ${max} ms\n\n`);

  const P95_BUDGET_MS = 800;
  if (p95 >= P95_BUDGET_MS) {
    process.stderr.write(
      `❌ [load-test-matching] p95 = ${p95} ms ≥ budget ${P95_BUDGET_MS} ms (SC-001). À investiguer avant PR.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`✅ [load-test-matching] p95 = ${p95} ms < ${P95_BUDGET_MS} ms — OK\n`);
  process.exit(0);
}

main().catch(async (err) => {
  process.stderr.write(`load-test-matching failed: ${String(err)}\n`);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
