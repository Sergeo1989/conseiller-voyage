// T044 — Integration test US2 : cycle de vie du lead via l'API conseiller.
// Quickstart S4 (nominal) + S5 (invalide rejeté) + S6 (concurrence optimiste)
// + S9 (append-only trigger) + S10 (révoqué bloqué) + S13 (indépendance frères).
//
// SKIP : Testcontainers Postgres + seed cross-module + session conseiller
// authentifiée (AuthGuard) requis. Validation en staging. Pattern hérité 011.

import { describe, it } from 'vitest';

describe.skip('Lead lifecycle US2 (integration)', () => {
  // S4 — cycle nominal
  it.todo('GET /leads/:id → envoye→vu (auto, FR-019) ; 2e GET ne crée pas de transition');
  it.todo('POST accept→accepte, quote-sent→devis_envoye, booking-confirmed→reservation_confirmee');
  it.todo('lead_transitions = historique horodaté append-only ; leads.current_state cohérent');

  // S5 — transition invalide
  it.todo('lead `envoye` + POST booking-confirmed → 422 INVALID_TRANSITION, état inchangé');

  // S6 — concurrence optimiste (FR-020)
  it.todo('deux POST accept quasi simultanés → un 200 accepte, l’autre 409 LEAD_STATE_CONFLICT');
  it.todo('une seule transition enregistrée');

  // S9 — append-only lead_transitions
  it.todo('UPDATE lead_transitions → rejeté par le trigger Postgres (append-only)');
  it.todo('DELETE / TRUNCATE lead_transitions → rejeté');

  // S10 — conseiller révoqué
  it.todo(
    'conseiller devenu non vérifié + POST accept → 403 CONSEILLER_NOT_VERIFIED, aucune transition',
  );

  // S13 — indépendance des leads frères (FR-016)
  it.todo('booking-confirmed sur un lead → les 2 leads frères restent inchangés');
});
