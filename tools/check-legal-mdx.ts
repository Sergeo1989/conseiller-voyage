#!/usr/bin/env tsx
// T037 — Validation CLI des fichiers MDX éditoriaux de packages/legal-content/.
//
// La logique de validation pure vit dans @cv/legal/src/mdx-validation.ts
// (testable indépendamment du disque). Ce script est l'enrobage CLI :
// scan disque, lecture fichiers, appel library, exit code + log.
//
// Wired en CI via `pnpm legal:verify` (cf. package.json racine).

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Import via subpath — `mdx-validation` n'est pas réexporté depuis
// `@cv/legal/index.ts` parce qu'il utilise `gray-matter` (node:crypto)
// incompatible avec le bundler edge runtime de Next.js.
import { type MdxFile, validateLegalMdxFiles } from '@cv/legal/mdx-validation';

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

async function main(): Promise<void> {
  const absolutePaths = await listMdxFilesRecursive(LEGAL_CONTENT_ROOT);

  if (absolutePaths.length === 0) {
    process.stdout.write(
      '[legal:verify] No MDX files found in packages/legal-content/ — OK (placeholders only)\n',
    );
    process.exit(0);
  }

  const files: MdxFile[] = [];
  for (const absPath of absolutePaths) {
    const contents = await readFile(absPath, 'utf-8');
    files.push({
      path: relative(ROOT, absPath).replace(/\\/g, '/'),
      contents,
    });
  }

  const result = validateLegalMdxFiles(files);

  if (result.errors.length > 0) {
    process.stderr.write('[legal:verify] FAILED — validation errors:\n');
    for (const err of result.errors) {
      process.stderr.write(`  ✗ ${err.path} — ${err.message}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`[legal:verify] OK — ${result.parsed.length} MDX file(s) validated\n`);
  for (const item of result.parsed) {
    process.stdout.write(
      `  ✓ ${item.path} — type=${item.frontmatter.type} version=${item.frontmatter.version} checksum=${item.checksum.slice(0, 12)}...\n`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(
    `[legal:verify] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(2);
});
