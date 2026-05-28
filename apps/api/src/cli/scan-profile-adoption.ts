#!/usr/bin/env tsx
// T146 — CLI : mesure SC-005 *Adoption conseiller* (cohorte 30 derniers
// jours). Émet un JSON sur stdout avec ratio + métriques détaillées,
// préfigurant la feature 021 (observabilité boucle économique) sans
// la dupliquer.
//
// Usage :
//   pnpm exec tsx apps/api/src/cli/scan-profile-adoption.ts
//   pnpm exec tsx apps/api/src/cli/scan-profile-adoption.ts --window-days 60
//
// Exit codes :
//   0 = succès (JSON émis sur stdout)
//   1 = erreur env (DATABASE_URL manquant, connexion impossible)
//   2 = argument invalide
//
// Output JSON (stdout) :
//   {
//     "measuredAt": "2026-05-28T09:00:00.000Z",
//     "windowDays": 30,
//     "totalCohort": 142,
//     "byStatut": { "incomplet": 18, "pret": 121, "masque_admin": 2, "anonymise": 1 },
//     "adoptionRatio": 0.852,
//     "scTarget": 0.80,
//     "ok": true
//   }
//
// Cf. specs/007-profil-conseiller/spec.md § Success Criteria SC-005
// + docs/runbooks/profile-adoption-monitoring.md pour interprétation.

import { prisma } from '@cv/db';

interface CliArgs {
  windowDays: number;
}

const DEFAULT_WINDOW_DAYS = 30;
const SC_005_TARGET_RATIO = 0.8;

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { windowDays: DEFAULT_WINDOW_DAYS };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--window-days') {
      const raw = argv[i + 1];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 365) {
        process.stderr.write('Erreur: --window-days doit être un entier ∈ [1, 365]\n');
        process.exit(2);
      }
      args.windowDays = parsed;
      i++;
    }
  }
  return args;
}

interface AdoptionReport {
  readonly measuredAt: string;
  readonly windowDays: number;
  readonly totalCohort: number;
  readonly byStatut: Record<string, number>;
  readonly adoptionRatio: number;
  readonly scTarget: number;
  readonly ok: boolean;
}

async function buildReport(windowDays: number): Promise<AdoptionReport> {
  const measuredAt = new Date();
  const since = new Date(measuredAt.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const grouped = await prisma.conseillerProfile.groupBy({
    by: ['statut'],
    _count: { _all: true },
    where: { createdAt: { gte: since } },
  });

  const byStatut: Record<string, number> = {
    incomplet: 0,
    pret: 0,
    masque_admin: 0,
    anonymise: 0,
  };
  let totalCohort = 0;
  for (const row of grouped) {
    const count = row._count._all;
    byStatut[row.statut] = count;
    totalCohort += count;
  }

  const adoptionRatio = totalCohort === 0 ? 0 : (byStatut.pret ?? 0) / totalCohort;

  return {
    measuredAt: measuredAt.toISOString(),
    windowDays,
    totalCohort,
    byStatut,
    adoptionRatio: Math.round(adoptionRatio * 1000) / 1000,
    scTarget: SC_005_TARGET_RATIO,
    ok: adoptionRatio >= SC_005_TARGET_RATIO,
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.stderr.write('Erreur: DATABASE_URL manquant\n');
    process.exit(1);
  }

  const { windowDays } = parseArgs(process.argv.slice(2));

  try {
    const report = await buildReport(windowDays);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`Erreur inattendue: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
