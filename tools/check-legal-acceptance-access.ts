#!/usr/bin/env tsx
// T040 — Linter custom : refuse l'accès direct à `prisma.legalAcceptance`
// hors de PrismaLegalAcceptanceRepository.
//
// Garde-fou critique (ADR-0008 + data-model.md) : toute lecture de
// LegalAcceptance doit passer par `findWithAnonymization()` pour
// récupérer la jointure avec auth_legal_acceptance_anonymizations.
// Sinon, un consommateur pourrait lire le `subjectId` brut d'une row
// anonymisée Loi 25 — fuite PII rétroactive.
//
// Le seul accès direct autorisé à `prisma.legalAcceptance.*` est dans le
// fichier PrismaLegalAcceptanceRepository.ts qui encapsule la logique.
// Tests d'intégration sous test/integration/identite/ sont aussi
// autorisés (fixtures + cleanup).
//
// Wired en CI dans .github/workflows/ci.yml (à venir avec ce commit).

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API_SRC = join(ROOT, 'apps', 'api', 'src');
const API_TEST = join(ROOT, 'apps', 'api', 'test');

// Patterns interdits qui contournent findWithAnonymization()
const FORBIDDEN_PATTERNS = [
  /\bprisma\.legalAcceptance\.(findUnique|findFirst|findMany|count|aggregate|groupBy)\b/,
];

// Fichiers explicitement autorisés à accéder directement à prisma.legalAcceptance.*
const ALLOWED_FILES: ReadonlySet<string> = new Set([
  // Le repository qui encapsule l'accès et fournit findWithAnonymization()
  'apps/api/src/modules/identite/infrastructure/prisma-legal-acceptance-repository.ts',
]);

// Préfixes de répertoires autorisés (tests fixtures + cleanup)
const ALLOWED_DIR_PREFIXES = [
  'apps/api/test/integration/identite/', // tests d'invariants triggers
  'apps/api/test/integration/conformite/', // cross-module erasure test
];

interface Violation {
  file: string;
  line: number;
  snippet: string;
  pattern: string;
}

async function walkTs(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTs(full)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function isFileAllowed(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (ALLOWED_FILES.has(normalized)) return true;
  return ALLOWED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function scanFile(file: string): Promise<Violation[]> {
  const relPath = relative(ROOT, file).replace(/\\/g, '/');
  if (isFileAllowed(relPath)) return [];

  const content = await readFile(file, 'utf-8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    for (const pattern of FORBIDDEN_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        violations.push({
          file: relPath,
          line: i + 1,
          snippet: line.trim(),
          pattern: match[0],
        });
      }
    }
  }
  return violations;
}

async function main(): Promise<void> {
  const files = [...(await walkTs(API_SRC)), ...(await walkTs(API_TEST))];

  const allViolations: Violation[] = [];
  for (const file of files) {
    const violations = await scanFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    process.stdout.write(
      `[check-legal-acceptance-access] ✓ No direct access to prisma.legalAcceptance.* outside the repository (${files.length} files scanned).\n`,
    );
    return;
  }

  process.stderr.write(
    '\n❌ Direct prisma.legalAcceptance.* access detected outside repository:\n\n',
  );
  for (const v of allViolations) {
    process.stderr.write(`  ${v.file}:${v.line}\n`);
    process.stderr.write(`    ${v.snippet}\n`);
    process.stderr.write(`    Forbidden: ${v.pattern}\n\n`);
  }
  process.stderr.write(
    '👉 Use PrismaLegalAcceptanceRepository.findWithAnonymization() or listBySubject() instead.\n',
  );
  process.stderr.write(
    '   Direct prisma.legalAcceptance.* access bypasses the LEFT JOIN with anonymizations\n',
  );
  process.stderr.write('   and would leak PII for Loi 25-erased rows (cf. ADR-0008).\n\n');
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(
    `[check-legal-acceptance-access] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(2);
});
