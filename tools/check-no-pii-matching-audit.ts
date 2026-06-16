#!/usr/bin/env tsx
// T093b — Scanner anti-PII sur les tables matching (FR-020 + SC-009 + Loi 25).
//
// Garantie : `matching_audit_entries.payload` (audit append-only, rétention
// 7 ans) et `matching_result_entries.scoreComponents` (post-anonymisation
// cascade redacté en {"redacted":"loi25"}) ne doivent JAMAIS contenir de PII
// voyageur (email, téléphone, prénom/nom, adresse). Le typage applicatif le
// force déjà (MatchingAuditPayload n'expose que des IDs techniques) ; ce CLI
// est une vérification defense-in-depth exécutée en CI hebdo contre la DB
// staging.
//
// Étendu feature 012 : `lead_transitions.reason` (motif ≤ 500 chars, jamais de
// PII) et `lead_notification_outbox.lastError` (message d'échec SES) sont aussi
// scannées (FR-004 / FR-009 — aucune coordonnée voyageur, audit append-only).
//
// Périmètre : colonnes texte/JSONB ci-dessus uniquement. Les logs Pino structurés
// vivent dans Grafana Loki (OTel) — non scannables depuis le FS, couverts par
// la politique de rétention Loki (90 j) + le caractère PII-safe des champs
// loggés (cf. T087).
//
// Usage : pnpm exec tsx tools/check-no-pii-matching-audit.ts
//   - exit 0 : aucune PII détectée (ou DB/table absente → skip non bloquant)
//   - exit 1 : PII détectée (échec CI — incident Loi 25)
//   - exit 2 : erreur inattendue
//
// Pattern hérité du backlog 008 (T141-T143) + tools/check-mfa-secrets-not-leaked.ts.

import { prisma } from '@cv/db';

interface PiiPattern {
  readonly label: string;
  readonly regex: RegExp;
}

// Patterns conservateurs — pensés pour NE PAS matcher les UUIDs (briefId,
// conseillerId, matchingResultId) ni les scores décimaux légitimes.
const PII_PATTERNS: PiiPattern[] = [
  {
    label: 'adresse courriel',
    regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  },
  {
    // Téléphone NA avec séparateurs OBLIGATOIRES — un UUID (groupes 8-4-4-4-12
    // sans `.`/espace, hyphens hors positions 3-3-4) ne peut pas matcher.
    label: 'numéro de téléphone',
    regex: /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/,
  },
  {
    // Clés JSON suggérant un champ PII direct — la vraie ligne de défense.
    label: 'clé JSON PII (prénom/nom/contact/adresse)',
    regex:
      /"(?:email|courriel|firstName|prenom|prénom|lastName|nom|fullName|phone|telephone|téléphone|postalCode|codePostal|address|adresse)"\s*:/i,
  },
];

interface Finding {
  readonly table: string;
  readonly column: string;
  readonly id: string;
  readonly label: string;
  readonly snippet: string;
}

function scanText(table: string, column: string, id: string, txt: string): Finding[] {
  const findings: Finding[] = [];
  for (const { label, regex } of PII_PATTERNS) {
    const match = txt.match(regex);
    if (match) {
      // On ne ré-émet PAS la PII en clair dans les logs CI : snippet masqué.
      const masked = match[0].replace(/[A-Za-z0-9]/g, '•').slice(0, 40);
      findings.push({ table, column, id, label, snippet: masked });
    }
  }
  return findings;
}

async function scanColumn(table: string, column: string, idColumn = 'id'): Promise<Finding[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; txt: string }[]>(
    `SELECT "${idColumn}"::text AS id, "${column}"::text AS txt FROM ${table}`,
  );
  const findings: Finding[] = [];
  for (const row of rows) {
    findings.push(...scanText(table, column, row.id, row.txt ?? ''));
  }
  return findings;
}

function isAbsentDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // 42P01 = undefined_table (relation n'existe pas), P1001 = can't reach DB,
  // P1003 = database does not exist. Skip non bloquant dans ces cas.
  return (
    /42P01/.test(message) ||
    /P1001/.test(message) ||
    /P1003/.test(message) ||
    /does not exist/i.test(message) ||
    /can't reach database/i.test(message)
  );
}

async function main(): Promise<void> {
  // Contrat du workflow : sans DATABASE_URL (secret staging non configuré),
  // skip non bloquant. Une URL vide ne produit pas une erreur Prisma reconnue
  // par isAbsentDbError, donc on court-circuite ici explicitement.
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    process.stdout.write(
      '[check-no-pii-matching-audit] DATABASE_URL absent — skip non bloquant (DB staging non configurée).\n',
    );
    process.exit(0);
  }

  process.stdout.write(
    '[check-no-pii-matching-audit] Scan matching_audit_entries + matching_result_entries + lead_* (012)...\n',
  );

  let findings: Finding[];
  try {
    findings = [
      ...(await scanColumn('matching_audit_entries', 'payload')),
      ...(await scanColumn('matching_result_entries', 'scoreComponents')),
      // Feature 012 — colonnes texte libres des leads (FR-004 / FR-009).
      ...(await scanColumn('lead_transitions', 'reason')),
      ...(await scanColumn('lead_notification_outbox', 'lastError')),
      // Feature 016 — enrichissement intake : destinations enrichies (jsonb).
      // Aucun texte libre n'y est persisté, mais on scanne en défense (SC-004).
      // PK = briefId (pas de colonne `id`).
      ...(await scanColumn('intake_brief_enrichments', 'enrichedDestinations', 'briefId')),
    ];
  } catch (err) {
    if (isAbsentDbError(err)) {
      process.stdout.write(
        '[check-no-pii-matching-audit] DB ou tables matching absentes — skip non bloquant.\n',
      );
      await prisma.$disconnect();
      process.exit(0);
    }
    process.stderr.write(
      `[check-no-pii-matching-audit] erreur inattendue : ${err instanceof Error ? err.message : String(err)}\n`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  await prisma.$disconnect();

  if (findings.length === 0) {
    process.stdout.write('✅ [check-no-pii-matching-audit] Aucune PII détectée — OK\n');
    process.exit(0);
  }

  process.stderr.write(
    `\n❌ [check-no-pii-matching-audit] ${findings.length} VIOLATION(S) PII — Loi 25 / FR-020 / SC-009 :\n\n`,
  );
  for (const f of findings) {
    process.stderr.write(
      `  ${f.table}.${f.column} (id=${f.id})\n    → ${f.label} : ${f.snippet}\n\n`,
    );
  }
  process.stderr.write(
    'Une colonne d’audit/scoring contient de la PII voyageur. Auditer le use case\n' +
      'qui écrit cette ligne (matching_audit_writer / matching_result_writer) et\n' +
      'retirer le champ. Incident à tracer (rétention audit 7 ans).\n',
  );
  process.exit(1);
}

main().catch(async (err) => {
  process.stderr.write(`check-no-pii-matching-audit failed: ${String(err)}\n`);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
