// Sous-paquet conformité partagé entre apps/api et apps/web.
// État de remplissage :
//   T027 — branded UUID types                                ✅
//   T030f — Zod FR-CA error map                              ✅
//   T030g — Formatters partagés (date, monnaie)              ✅
//   T044-T046 — ports + audit payload Zod schemas             ⏳
//   T067 — Zod schemas API (RequestUploadUrls, SubmitDossier) ⏳
//   T074 — fr-CA.json + en.json placeholder (i18n)            ⏳

export * from './branded-ids';
export * from './formatters';
export * from './zod-errors';
