// Sous-paquet intake partagé entre apps/api et apps/web.
// Cf. specs/002-voyageur-intake/.
//
// État de remplissage (T001 placeholder — Phase 1 Setup) :
//   T017-T018 — branded UUID types                              ⏳
//   T019-T020 — Zod schemas (SubmitBrief, VerifyMagicLink, …)   ⏳
//   T021     — contracts (IntakeQueryPort, BriefSummary)        ⏳
//   T022     — formatters (budget, spécialité, familiarité)     ⏳
//   T099     — disposable-emails-snapshot.json (fallback R3)    ⏳
//
// Les exports seront ajoutés au fur et à mesure. Pour l'instant le
// barrel est vide — c'est attendu (Phase 1 n'écrit aucune logique métier).
export {};
