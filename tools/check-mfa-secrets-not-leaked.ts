#!/usr/bin/env tsx
// Linter custom : détecte la fuite potentielle de secrets TOTP Base32
// dans les fichiers de logs.
//
// Détecte le pattern d'un secret TOTP encodé Base32 RFC 4648 sur
// exactement 32 caractères : `[A-Z2-7]{32}` (= 160 bits). Allowlist
// stricte :
//   - JWT base64url (préfixe `eyJ`)
//   - SHA-256 hex (64 chars seulement, ne matche pas notre regex 32)
//   - UUIDs (alphabet hex)
//
// Scope strict : uniquement `logs/**/*.log` et logs CI capturés. Les
// fichiers source `src/**/*.ts` ne sont pas scannés (les noms de
// variables et chaînes de doc contiennent légitimement des patterns
// similaires).
//
// À ajouter au pipeline CI : `pnpm exec tsx tools/check-mfa-secrets-not-leaked.ts`
// Retourne exit 1 si une fuite est détectée, 0 sinon.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const BASE32_SECRET_REGEX = /\b[A-Z2-7]{32}\b/g;
const ALLOWLIST_PREFIXES = ['eyJ']; // JWT
const SCAN_DIRS = ['logs', '.github/workflows', 'apps/api/logs', 'apps/web/logs'];
const SCAN_EXTENSIONS = ['.log', '.log.gz'];

interface Match {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

function walkDir(dir: string, accumulator: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walkDir(full, accumulator);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext) || extname(entry) === ext)) {
      accumulator.push(full);
    }
  }
}

function readFile(filePath: string): string {
  const buffer = readFileSync(filePath);
  if (filePath.endsWith('.gz')) {
    return gunzipSync(buffer).toString('utf-8');
  }
  return buffer.toString('utf-8');
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: scan ligne par ligne + allowlist
function scanFile(filePath: string): Match[] {
  const content = readFile(filePath);
  const matches: Match[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineMatches = line.match(BASE32_SECRET_REGEX) ?? [];
    if (lineMatches.length === 0) continue;
    // Allowlist : skip si la ligne contient un préfixe connu (JWT, etc.).
    const isAllowed = ALLOWLIST_PREFIXES.some((prefix) => line.includes(prefix));
    if (isAllowed) continue;
    for (let m = 0; m < lineMatches.length; m++) {
      matches.push({
        file: filePath,
        line: i + 1,
        snippet: line.length > 200 ? `${line.slice(0, 200)}...` : line,
      });
    }
  }
  return matches;
}

function main(): void {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    walkDir(dir, files);
  }

  if (files.length === 0) {
    process.stdout.write('[check-mfa-secrets] No log files to scan — OK\n');
    process.exit(0);
  }

  process.stdout.write(`[check-mfa-secrets] Scanning ${files.length} log files...\n`);

  const allMatches: Match[] = [];
  for (const file of files) {
    const matches = scanFile(file);
    allMatches.push(...matches);
  }

  if (allMatches.length === 0) {
    process.stdout.write(
      `[check-mfa-secrets] No Base32 secret leak detected in ${files.length} files — OK\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `[check-mfa-secrets] ❌ ${allMatches.length} POTENTIAL SECRET LEAK(S) DETECTED:\n\n`,
  );
  for (const match of allMatches) {
    process.stderr.write(`  ${match.file}:${match.line}\n    ${match.snippet}\n\n`);
  }
  process.stderr.write(
    'These look like Base32-encoded 160-bit secrets (regex /[A-Z2-7]{32}/).\n' +
      'If these are legitimate (e.g. test fixtures), add them to the allowlist\n' +
      'in tools/check-mfa-secrets-not-leaked.ts. Otherwise, audit the logging\n' +
      'sites and add scrubbing before merging.\n',
  );
  process.exit(1);
}

main();
