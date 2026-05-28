#!/usr/bin/env tsx
// T049 — Linter custom anti-marketplace : refuse tout canal de contact
// direct sur la page publique conseiller (Principe I + ADR-0002 + SC-002).
//
// Scanne récursivement `apps/web/src/app/[locale]/conseiller/[slug]/`
// pour détecter :
//   - mailto:, tel:, sms: (liens directs)
//   - <form ... action="..."> qui pointe ailleurs que /intake
//   - Liens vers chat externes (whatsapp, messenger, telegram, etc.)
//   - Composants/textes suggérant un contact direct (aria-label, textes
//     "Contacter", "Appeler", "Courriel", "Téléphone").
//
// Le CTA légitime vers /intake?suggested= est obligatoire (cf. FR-008) ;
// le linter vérifie sa présence.
//
// Wired en CI via `package.json` script + .github/workflows.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// Scope strict : la page publique du conseiller est sous [slug]/, distincte
// du dashboard conseiller (auth) à `[locale]/conseiller/page.tsx`.
const PROFIL_PUBLIC_DIR = join(
  ROOT,
  'apps',
  'web',
  'src',
  'app',
  '[locale]',
  'conseiller',
  '[slug]',
);

// Patterns interdits — match déclenche un échec CI.
const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bmailto:/, label: 'lien mailto: interdit (canal de contact direct)' },
  { pattern: /\btel:/, label: 'lien tel: interdit (canal de contact direct)' },
  { pattern: /\bsms:/, label: 'lien sms: interdit (canal de contact direct)' },
  {
    pattern: /\b(whatsapp|wechat|telegram|skype|messenger\.com)\b/i,
    label: 'lien chat externe interdit',
  },
  {
    pattern: /<form[^>]*action=["'](?!\/[a-z-]*\/?intake|\/api\/profil|\/api\/admin)[^"']*["']/i,
    label: '<form action="..."> pointe ailleurs que /intake / API profil — interdit',
  },
  {
    pattern: /aria-label=["'][^"']*\b(contacter|appeler|téléphoner|courriel|email)\b/i,
    label: 'aria-label suggère un contact direct — interdit',
  },
];

// CTA légitime — sa PRÉSENCE est vérifiée séparément.
// Match `/intake` n'importe où dans le source (href littéral, variable JSX
// `/${locale}/intake`, template literal backtick) ; suffit que le source
// référence /intake quelque part.
const REQUIRED_CTA_PATTERN = /\/intake(\?|`|"|'|\/|\b)/;

interface Violation {
  file: string;
  line: number;
  matched: string;
  label: string;
}

function shouldSkipDir(name: string): boolean {
  return name === 'node_modules' || name.startsWith('.');
}

function isSourceFile(name: string): boolean {
  return name.endsWith('.tsx') || name.endsWith('.ts');
}

async function walkTsxFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return results;
    throw err;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !shouldSkipDir(entry.name)) {
      results.push(...(await walkTsxFiles(fullPath)));
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function scanFile(file: string): Promise<{ violations: Violation[]; hasCta: boolean }> {
  const content = await readFile(file, 'utf8');
  const lines = content.split('\n');
  const violations: Violation[] = [];
  let hasCta = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        violations.push({
          file: relative(ROOT, file),
          line: i + 1,
          matched: match[0],
          label,
        });
      }
    }
    if (REQUIRED_CTA_PATTERN.test(line)) hasCta = true;
  }

  return { violations, hasCta };
}

async function main(): Promise<void> {
  // Vérifie que le dossier existe (sinon — la feature n'a pas encore livré
  // la page publique, on skip silencieusement).
  try {
    await stat(PROFIL_PUBLIC_DIR);
  } catch {
    process.stdout.write(
      `[check-no-contact-fields-profile] ${relative(ROOT, PROFIL_PUBLIC_DIR)} absent — skip.\n`,
    );
    process.exit(0);
  }

  const files = await walkTsxFiles(PROFIL_PUBLIC_DIR);

  // Skip silencieux si aucun fichier .tsx/.ts livré (Phase 4 US2 à venir).
  if (files.length === 0) {
    process.stdout.write(
      `[check-no-contact-fields-profile] Aucun fichier dans ${relative(ROOT, PROFIL_PUBLIC_DIR)} — skip (Phase 4 US2 pas encore livrée).\n`,
    );
    process.exit(0);
  }

  const allViolations: Violation[] = [];
  let foundCta = false;

  for (const file of files) {
    const { violations, hasCta } = await scanFile(file);
    allViolations.push(...violations);
    if (hasCta) foundCta = true;
  }

  if (allViolations.length > 0) {
    console.error(
      `\n❌ Anti-marketplace violation (${allViolations.length}) — feature 005 / Principe I + ADR-0002 + SC-002 :\n`,
    );
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line}  ${v.label}\n    → match: ${v.matched.slice(0, 80)}`);
    }
    console.error('\nLa page publique conseiller ne DOIT contenir AUCUN canal de contact direct.');
    console.error('Seul CTA autorisé : <a href="/intake?suggested=..."> (cf. FR-008).');
    process.exit(1);
  }

  if (files.length > 0 && !foundCta) {
    console.error('❌ Aucun CTA vers /intake détecté dans la page publique — viole FR-008.');
    process.exit(1);
  }

  process.stdout.write(
    `✅ check-no-contact-fields-profile OK (${files.length} fichier(s) scanné(s), CTA /intake présent: ${foundCta})\n`,
  );
}

main().catch((err) => {
  console.error('check-no-contact-fields-profile failed:', err);
  process.exit(2);
});
