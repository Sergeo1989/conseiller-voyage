// T038 [Polish] — Invariant anti-marketplace (Principe I, ADR-0002, SC-003).
//
// Vérifie qu'AUCUN champ monétaire/transactionnel n'existe :
//   - dans les modèles Prisma `Conversation*` (le devis est un fichier opaque) ;
//   - dans les vues publiques du `ConversationQueryPort` (réponses 014/015).
//
// Si ce test échoue, une donnée transactionnelle a fui dans la conversation :
// c'est un rejet automatique à la revue. Le règlement se fait HORS plateforme.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tokens interdits dans les NOMS DE CHAMPS (montant/prix/paiement/réservation…).
const FORBIDDEN = [
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
  'tax',
  'tva',
  'tps',
  'tvq',
  'booking',
  'checkout',
];

/** Extrait le bloc `model X { ... }` du schéma Prisma. */
function extractModel(schema: string, model: string): string {
  const re = new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const m = schema.match(re);
  if (!m?.[1]) throw new Error(`Modèle Prisma introuvable : ${model}`);
  return m[1];
}

/** Noms de champs d'un bloc de modèle Prisma (1er token de chaque ligne utile). */
function fieldNames(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@') && !l.startsWith('/'))
    .map((l) => l.split(/\s+/)[0] ?? '')
    .filter(Boolean);
}

function assertNoForbidden(names: string[], context: string): void {
  for (const name of names) {
    const lower = name.toLowerCase();
    for (const bad of FORBIDDEN) {
      expect(lower.includes(bad), `${context} : champ transactionnel interdit « ${name} »`).toBe(
        false,
      );
    }
  }
}

describe('Invariant anti-transaction — conversation (SC-003)', () => {
  const repoRoot = resolve(process.cwd(), '..', '..');
  const schema = readFileSync(
    resolve(repoRoot, 'packages/db/prisma/schema/matching.prisma'),
    'utf-8',
  );

  const MODELS = [
    'Conversation',
    'ConversationMessage',
    'ConversationAttachment',
    'ConversationNotificationOutbox',
  ];

  for (const model of MODELS) {
    it(`modèle Prisma ${model} ne contient aucun champ transactionnel`, () => {
      assertNoForbidden(fieldNames(extractModel(schema, model)), `model ${model}`);
    });
  }

  it('vues publiques ConversationQueryPort sans champ transactionnel', () => {
    const port = readFileSync(
      resolve(repoRoot, 'packages/shared/src/matching/conversation-query.port.ts'),
      'utf-8',
    );
    // Noms de propriétés déclarés (`readonly x:` ou `x:`).
    const props = [...port.matchAll(/(?:readonly\s+)?([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map(
      (m) => m[1] ?? '',
    );
    assertNoForbidden(props, 'ConversationQueryPort');
  });
});
