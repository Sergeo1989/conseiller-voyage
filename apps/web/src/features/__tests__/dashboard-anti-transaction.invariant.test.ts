// T018 [Polish] — Invariant dashboard (Principe I anti-marketplace + Principe II Loi 25).
//
// Vérifie que les TYPES DE VUE consommés par le tableau de bord conseiller
// (leads + conversations) ne portent :
//   - aucun champ transactionnel (montant/prix/paiement/réservation) ;
//   - aucune PII de contact du voyageur (nom/courriel/téléphone/adresse).
// Échec = rejet automatique à la revue. Le règlement se fait hors plateforme,
// et les coordonnées ne sont jamais exposées au conseiller (résumé non nominatif).

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
  'subtotal',
  'tva',
  'tps',
  'tvq',
  'booking',
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

// Fichiers de définition des vues exposées au front du dashboard.
const VIEW_FILES = [
  'apps/web/src/features/leads/schemas/lead.ts',
  'apps/web/src/features/conversation/api/conversations-api.ts',
];

function propertyNames(source: string): string[] {
  // `readonly x:` ou `x:` dans les interfaces/types.
  return [...source.matchAll(/(?:readonly\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)].map(
    (m) => m[1] ?? '',
  );
}

describe('Invariant anti-transaction / anti-PII — dashboard conseiller (SC-002)', () => {
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
