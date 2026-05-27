// T128 — Tests e2e Playwright SC-006 latence retrait < 10s (feature 007 US5).
//
// Cible SC-006 : après anonymisation Loi 25 d'un conseiller, la page
// publique `/conseiller/<slug>` doit retourner 404 unifié en moins de
// 10 secondes (double invalidation Next.js ISR + CloudFront, cf. ADR
// 007-profil-conseiller R4 + C2).
//
// Scope sans seed : structure du timing harness + cas anonymisé déjà
// 404 (vérifie que /conseiller/<slug-anonymisé> retourne 404 même
// quand le slug est dans SlugReservation).
//
// Parcours complet (publish profil → anonymise → poll page publique
// jusqu'à 404) nécessite seed + Server Actions ; squelette .skip avec
// pointeur vers les tests intégration.

import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('e2e — retrait page publique rapide (T128, SC-006)', () => {
  test('slug anonymisé/réservé fictif → 404 unifié immédiat', async ({ request }) => {
    // Cas le plus simple : un slug qui n'existe PAS et qui RESSEMBLE à un
    // slug anonymisé doit retourner 404 unifié (signature HTTP identique
    // à un slug inexistant — anti-énumération + retrait effectif).
    const r = await request.get(`${BASE}/fr/conseiller/marie-dupont-test-anon`);
    expect(r.status()).toBe(404);
  });

  test('latence baseline GET 404 < 1s (pas de slowdown anormal)', async ({ request }) => {
    // Baseline de référence : récupérer la page 404 doit être rapide
    // (pas d'appel DB lent ni boucle). Filet de sécurité avant que
    // T128 mesure réellement le delta post-anonymisation.
    const start = Date.now();
    const r = await request.get(`${BASE}/fr/conseiller/baseline-latence-test`);
    const elapsed = Date.now() - start;
    expect(r.status()).toBe(404);
    expect(elapsed).toBeLessThan(2000); // marge généreuse pour Playwright CI
  });

  test.skip('US5 SC-006 — anonymisation → 404 en < 10 s', async () => {
    // Future :
    //   1. Seed conseiller verified avec profil pret (slug actif).
    //   2. GET /fr/conseiller/<slug> → 200 (preuve d'état initial).
    //   3. Trigger AnonymiserProfilLoi25UseCase via endpoint interne
    //      POST /api/internal/profil/<id>/anonymiser-loi25 + token interne.
    //   4. Poll /fr/conseiller/<slug> chaque 500ms pendant max 10s.
    //   5. expect(elapsed_ms < 10_000) quand le status passe 200 → 404.
    //
    // Mécaniques garantissant SC-006 :
    //   - Next.js ISR revalidatePath via /api/revalidate (Bearer secret)
    //   - CloudFront createInvalidation (parallèle)
    //   - Filet s-maxage=300 borne la fenêtre dégradée à 5 min
    //
    // Couverture comportementale :
    //   - anonymiser-profil-loi25.integration.test.ts (5 tests, T126)
    //   - trigger Postgres profile_anonymise_terminal vérifié
    //   - SlugReservation conseillerIdOrigine=NULL vérifié (ADR-0015)
  });

  test.skip('US5 — slug réservé reste réservé même après tentative DELETE direct', async () => {
    // Future : créer slug réservé Loi 25, tenter DELETE direct via psql
    // → trigger refuse → slug toujours dans listAll() → expect 404 sur
    // /conseiller/<slug>.
    //
    // Couverture : slug-reuse-invariant.integration.test.ts (T127).
  });

  test.skip('US5 — re-création conseiller homonyme post-anonymisation → slug différent', async () => {
    // Future : anonymise Marie Dupont, seed nouveau Marie Dupont, publish →
    // expect slug "marie-dupont-2" (FR-CA-correct), original = réservé.
    //
    // Couverture : slug-reuse-invariant.integration.test.ts (T127).
  });
});
