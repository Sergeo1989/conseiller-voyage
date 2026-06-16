// T035 [016 Polish] — Invariant anti-marketplace (Principe I) + anti-PII (Loi 25).
//
// La surface d'enrichissement exposée/persistée (vue publique + enregistrement)
// ne DOIT porter :
//   - aucun champ transactionnel (montant/prix/paiement/réservation) — ADR-0002 ;
//   - aucune PII de contact (nom/courriel/téléphone/adresse) — Loi 25.
// Seules des intentions structurées non identifiantes sont autorisées.
// Échec = rejet à la revue.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_TRANSACTION = [
  'amount',
  'price',
  'prix',
  'montant',
  'paiement',
  'payment',
  'facture',
  'invoice',
  'devise',
  'currency',
  'cents',
  'tva',
  'tps',
  'tvq',
  'booking',
  'reservation',
  'checkout',
];

const FORBIDDEN_PII = [
  'email',
  'courriel',
  'telephone',
  'phone',
  'adresse',
  'address',
  'lastname',
  'firstname',
  'fullname',
  'nomcomplet',
];

// Fichiers définissant la surface persistée / exposée de l'enrichissement.
const VIEW_FILES = [
  'packages/shared/src/intake/enrichment.ts',
  'apps/api/src/modules/intake/application/ports/brief-enrichment-repository.port.ts',
];

function propertyNames(source: string): string[] {
  return [...source.matchAll(/(?:readonly\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*[?:]/g)].map(
    (m) => m[1] ?? '',
  );
}

describe('Invariant anti-transaction / anti-PII — enrichissement (SC-004)', () => {
  const repoRoot = resolve(process.cwd(), '..', '..');

  for (const file of VIEW_FILES) {
    it(`${file} : aucun champ transactionnel ni PII de contact`, () => {
      const source = readFileSync(resolve(repoRoot, file), 'utf-8');
      const names = propertyNames(source).map((n) => n.toLowerCase());
      for (const name of names) {
        for (const bad of [...FORBIDDEN_TRANSACTION, ...FORBIDDEN_PII]) {
          expect(name.includes(bad), `champ interdit « ${name} » dans ${file}`).toBe(false);
        }
      }
    });
  }
});
