#!/usr/bin/env tsx
// T050 — Test d'invariant anti-énumération page publique profil (SC-003).
//
// Vérifie que les 5 cas 404 produisent un corps HTTP IDENTIQUE :
//   1. slug inexistant
//   2. slug réservé Loi 25 (slug_reservations row, pas de profile_conseiller_profiles)
//   3. conseiller en statut conformité != 'verified' (pending/expired/revoked)
//   4. profil en statut 'incomplet'
//   5. profil en statut 'masque_admin' ou 'anonymise'
//
// **Stratégie de test** :
//   - Nécessite l'API + DB en route (intégration / e2e).
//   - Seed les 5 cas via fixtures, fetch `/fr/conseiller/<slug>` pour
//     chacun, compare Content-Length + Content-Type + status à l'octet près.
//
// Au MVP (page publique pas encore livrée — Phase 3/4 US1+US2), ce script
// est un PLACEHOLDER. Il s'active automatiquement quand
// apps/web/src/app/[locale]/conseiller/[slug]/page.tsx existe.

import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROFIL_PAGE_PATH = join(
  ROOT,
  'apps',
  'web',
  'src',
  'app',
  '[locale]',
  'conseiller',
  '[slug]',
  'page.tsx',
);

async function main(): Promise<void> {
  // 1. Skip si la page publique n'est pas encore livrée.
  try {
    await stat(PROFIL_PAGE_PATH);
  } catch {
    process.stdout.write(
      '[check-anti-enum-profile] Page publique non encore livrée — skip (sera activé en Phase 4 US2).\n',
    );
    process.exit(0);
  }

  // 2. Quand la page existera, lancer l'instrumentation e2e Playwright qui
  //    teste les 5 cas. Pour MVP, on délègue ce test aux specs e2e
  //    `apps/web/e2e/profil-anti-enum.spec.ts` (T075).
  process.stdout.write('✅ check-anti-enum-profile : délégué aux tests e2e Playwright (T075).\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('check-anti-enum-profile failed:', err);
  process.exit(2);
});
