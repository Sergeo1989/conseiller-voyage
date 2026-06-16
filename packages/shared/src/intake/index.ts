// Sous-paquet intake partagé entre apps/api et apps/web.
// Cf. specs/002-voyageur-intake/.
//
// État de remplissage :
//   T017-T018 — branded UUID types                              ✅
//   T019-T020 — Zod schemas (SubmitBrief, VerifyMagicLink, …)   ✅
//   T021     — contracts (IntakeQueryPort, BriefSummary)        ✅
//   T022     — formatters (budget, spécialité, familiarité)     ✅
//   T099     — disposable-emails-snapshot.json (fallback R3)    ⏳

export * from './branded-ids';
export * from './contracts';
export * from './enrichment';
export * from './formatters';
export * from './notification';
export * from './schemas';
