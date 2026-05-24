#!/usr/bin/env tsx
// T030a — Enforcement de la frontière modulaire (Principe V de la
// constitution). Fail le build si un fichier sous apps/api/src/modules/<X>/
// utilise un symbole Prisma préfixé par un autre module.
//
// Heuristique simple basée sur regex (pas d'analyse AST). Suffisant pour
// les cas usuels — quand un développeur tape `prisma.matching_lead.findUnique`
// dans le module conformite, c'est détecté.
//
// Pour étendre les préfixes : éditer MODULE_PREFIXES ci-dessous.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MODULES_ROOT = join(ROOT, 'apps', 'api', 'src', 'modules');

// Préfixes Prisma reconnus par module — à synchroniser avec data-model.md
// de chaque feature. Les modèles Prisma sont nommés en PascalCase
// (`ConformiteCertificat`) et les tables sont `snake_case` (`conformite_*`).
const MODULE_PREFIXES: Record<string, string[]> = {
  conformite: ['Conformite', 'conformite_'],
  identite: ['Auth'],
  intake: ['Intake', 'intake_'],
  matching: ['Matching', 'matching_'],
  facturation: ['Facturation', 'facturation_'],
  seo: ['Seo', 'seo_'],
};

interface Violation {
  file: string;
  importingModule: string;
  forbiddenSymbol: string;
  fromModule: string;
}

async function walkTs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
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

async function scanFile(file: string, currentModule: string): Promise<Violation[]> {
  const content = await readFile(file, 'utf-8');
  const violations: Violation[] = [];

  for (const [otherModule, prefixes] of Object.entries(MODULE_PREFIXES)) {
    if (otherModule === currentModule) continue;
    for (const prefix of prefixes) {
      const re = new RegExp(`\\b${prefix}\\w+`);
      const match = content.match(re);
      if (match) {
        violations.push({
          file: relative(ROOT, file),
          importingModule: currentModule,
          forbiddenSymbol: match[0],
          fromModule: otherModule,
        });
      }
    }
  }

  return violations;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function main(): Promise<void> {
  let modules: string[] = [];
  try {
    const stats = await stat(MODULES_ROOT);
    if (!stats.isDirectory()) {
      process.stdout.write('[check-module-boundaries] modules/ not a directory, skipping.\n');
      return;
    }
    modules = (await readdir(MODULES_ROOT, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    process.stdout.write('[check-module-boundaries] No modules directory yet, skipping.\n');
    return;
  }

  const allViolations: Violation[] = [];
  for (const moduleName of modules) {
    const files = await walkTs(join(MODULES_ROOT, moduleName));
    for (const file of files) {
      const violations = await scanFile(file, moduleName);
      allViolations.push(...violations);
    }
  }

  if (allViolations.length === 0) {
    process.stdout.write(
      `[check-module-boundaries] ✓ No cross-module Prisma imports (${modules.length} module(s) scanned).\n`,
    );
    return;
  }

  process.stderr.write('\n❌ Cross-module boundary violations detected:\n\n');
  for (const v of allViolations) {
    process.stderr.write(
      `  ${v.file}\n    Module '${v.importingModule}' references '${v.forbiddenSymbol}' owned by module '${v.fromModule}'\n    → Use ${v.fromModule}'s public facade (e.g., ${capitalize(v.fromModule)}QueryFacade) instead.\n\n`,
    );
  }
  process.exit(1);
}

void main();
