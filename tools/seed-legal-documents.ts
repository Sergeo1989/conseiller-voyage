#!/usr/bin/env tsx
// T038 — Script post-deploy idempotent qui seed auth_legal_documents
// depuis packages/legal-content/**/*.mdx.
//
// Sémantique :
//   - Pour chaque MDX validé (cf. tools/check-legal-mdx.ts) :
//     * Calcule checksum SHA-256 du corps + génère contentSnapshot
//     * Si row (type, version) absente → INSERT
//     * Si row présente avec MÊME checksum → no-op silencieux
//     * Si row présente avec checksum DIFFÉRENT → ERREUR bloquante (drift)
//   - Le script ne supprime jamais de row (Loi 25 + triggers immutables).
//
// Wired en post-deploy via une étape CD séparée (à venir avec
// l'infrastructure CDK). En dev, peut être lancé manuellement après
// `pnpm db:migrate` pour seed la BD locale.
//
// Usage :
//   pnpm tsx tools/seed-legal-documents.ts
//   # ou via le script package.json :
//   pnpm legal:seed

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@cv/db';
import { type MdxFile, validateLegalMdxFiles } from '@cv/legal';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LEGAL_CONTENT_ROOT = join(ROOT, 'packages', 'legal-content');

async function listMdxFilesRecursive(dir: string): Promise<string[]> {
  let exists = false;
  try {
    await stat(dir);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listMdxFilesRecursive(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

interface SeedResult {
  inserted: number;
  skipped: number;
  errors: number;
}

async function seedOne(item: {
  type: import('@cv/legal').LegalDocumentType;
  version: number;
  checksum: string;
  body: string;
  publishedAt: Date;
  effectiveAt: Date;
  path: string;
}): Promise<'inserted' | 'skipped' | 'error'> {
  const existing = await prisma.legalDocument.findUnique({
    where: { type_version: { type: item.type, version: item.version } },
  });
  if (existing) {
    if (existing.checksum !== item.checksum) {
      process.stderr.write(
        `  ✗ ${item.path} — DRIFT: stored checksum=${existing.checksum.slice(0, 12)}... incoming=${item.checksum.slice(0, 12)}.... Bump version before re-seeding.\n`,
      );
      return 'error';
    }
    process.stdout.write(
      `  ↻ ${item.path} — already seeded (type=${item.type}, version=${item.version})\n`,
    );
    return 'skipped';
  }
  await prisma.legalDocument.create({
    data: {
      type: item.type,
      version: item.version,
      checksum: item.checksum,
      contentSnapshot: item.body,
      publishedAt: item.publishedAt,
      effectiveAt: item.effectiveAt,
    },
  });
  process.stdout.write(
    `  ✓ ${item.path} — inserted (type=${item.type}, version=${item.version})\n`,
  );
  return 'inserted';
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrateur de seed séquentiel — validation préalable + iteration MDX + comptage outcomes ; chaque branche est triviale individuellement, complexité vient de l'agrégat
async function main(): Promise<SeedResult> {
  const absolutePaths = await listMdxFilesRecursive(LEGAL_CONTENT_ROOT);

  if (absolutePaths.length === 0) {
    process.stdout.write(
      '[legal:seed] No MDX files found in packages/legal-content/ — nothing to seed.\n',
    );
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  const files: MdxFile[] = [];
  for (const absPath of absolutePaths) {
    const contents = await readFile(absPath, 'utf-8');
    files.push({
      path: relative(ROOT, absPath).replace(/\\/g, '/'),
      contents,
    });
  }

  // 1. Validation préalable (refuse de seed si MDX invalide ou incohérent)
  const validation = validateLegalMdxFiles(files);
  if (!validation.ok) {
    process.stderr.write('[legal:seed] FAILED — MDX validation errors:\n');
    for (const err of validation.errors) {
      process.stderr.write(`  ✗ ${err.path} — ${err.message}\n`);
    }
    process.stderr.write('[legal:seed] Run `pnpm legal:verify` for diagnostic. Seed aborted.\n');
    return { inserted: 0, skipped: 0, errors: validation.errors.length };
  }

  // 2. Seed idempotent par fichier
  process.stdout.write(`[legal:seed] Seeding ${validation.parsed.length} MDX file(s)...\n`);
  const result: SeedResult = { inserted: 0, skipped: 0, errors: 0 };
  for (const item of validation.parsed) {
    const outcome = await seedOne({
      type: item.frontmatter.type,
      version: item.frontmatter.version,
      checksum: item.checksum,
      body: item.body,
      publishedAt: new Date(item.frontmatter.publishedAt),
      effectiveAt: new Date(item.frontmatter.effectiveAt),
      path: item.path,
    });
    if (outcome === 'inserted') result.inserted++;
    else if (outcome === 'skipped') result.skipped++;
    else result.errors++;
  }

  return result;
}

main()
  .then(async (result) => {
    process.stdout.write(
      `[legal:seed] Done — inserted=${result.inserted}, skipped=${result.skipped}, errors=${result.errors}\n`,
    );
    await prisma.$disconnect();
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    process.stderr.write(
      `[legal:seed] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    await prisma.$disconnect();
    process.exit(2);
  });
