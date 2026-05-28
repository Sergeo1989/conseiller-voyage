#!/usr/bin/env tsx
// Enforcement de la frontière feature-slice front (Principe VIII.a §6 de la
// constitution v2.3.0). Fail le build si un fichier importe en profondeur
// dans une feature dont il ne fait PAS partie.
//
// Convention :
//   - depuis features/<F>/**   : imports deep vers @/features/<F>/... OK
//   - depuis ailleurs (app/, shared/, ou features/<autre>/**) :
//     les imports vers une feature DOIVENT passer par son barrel
//     `@/features/<F>` (et jamais `@/features/<F>/actions/...`,
//     `@/features/<F>/ui/...`, etc.).
//
// Heuristique simple basée sur regex (pas d'analyse AST). Suffisant pour
// les cas usuels.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_SRC = join(ROOT, 'apps', 'web', 'src');
const FEATURES_DIR = join(WEB_SRC, 'features');

const FEATURE_PATH_REGEX = /['"]\@\/features\/([a-z0-9-]+)\/([a-z0-9-]+)\/[^'"]+['"]/g;

/** Sous-dossiers internes à une feature qu'on considère comme "deep" path. */
const INTERNAL_SUBDIRS = new Set([
  'actions',
  'application',
  'domain',
  'hooks',
  'infrastructure',
  'lib',
  'schemas',
  'store',
  'ui',
]);

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly targetFeature: string;
  readonly targetSubdir: string;
  readonly currentFeature: string | null;
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      out.push(...(await listFiles(full)));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function currentFeatureOf(filePath: string): string | null {
  const rel = relative(FEATURES_DIR, filePath);
  if (rel.startsWith('..')) return null;
  const seg = rel.split(/[/\\]/)[0];
  return seg && !seg.includes('..') ? seg : null;
}

function isViolationMatch(
  match: RegExpExecArray,
  currentFeature: string | null,
): { targetFeature: string; targetSubdir: string } | null {
  const [, targetFeature, targetSubdir] = match;
  if (!targetFeature || !targetSubdir) return null;
  if (!INTERNAL_SUBDIRS.has(targetSubdir)) return null;
  if (currentFeature === targetFeature) return null;
  return { targetFeature, targetSubdir };
}

function collectViolations(
  content: string,
  file: string,
  currentFeature: string | null,
  out: Violation[],
): void {
  const lines = content.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx] ?? '';
    FEATURE_PATH_REGEX.lastIndex = 0;
    for (let m = FEATURE_PATH_REGEX.exec(line); m !== null; m = FEATURE_PATH_REGEX.exec(line)) {
      const hit = isViolationMatch(m, currentFeature);
      if (!hit) continue;
      out.push({
        file: relative(ROOT, file),
        line: idx + 1,
        targetFeature: hit.targetFeature,
        targetSubdir: hit.targetSubdir,
        currentFeature,
      });
    }
  }
}

async function main(): Promise<void> {
  const files = await listFiles(WEB_SRC);
  const violations: Violation[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const currentFeature = currentFeatureOf(file);
    collectViolations(content, file, currentFeature, violations);
  }

  if (violations.length === 0) {
    process.stdout.write('✅ Feature boundaries: 0 violation (Principe VIII.a §6).\n');
    return;
  }

  process.stderr.write(
    `\n❌ Feature boundary violations (${violations.length}) — Principe VIII.a §6\n\nLes imports cross-feature DOIVENT passer par le barrel @/features/<f>,\npas par un chemin profond comme @/features/<f>/actions/... ou /ui/...\n\n`,
  );

  for (const v of violations) {
    const fromLabel = v.currentFeature ? `feature "${v.currentFeature}"` : 'hors features/';
    process.stderr.write(
      `  ${v.file}:${v.line}\n    ↳ ${fromLabel} importe @/features/${v.targetFeature}/${v.targetSubdir}/...\n    → remplacer par: import { ... } from '@/features/${v.targetFeature}';\n\n`,
    );
  }

  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`Erreur inattendue: ${err}\n`);
  process.exit(2);
});
