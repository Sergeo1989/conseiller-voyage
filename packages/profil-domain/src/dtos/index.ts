// T024 — Barrel des DTOs Zod partagés api+web.
//
// Ces schémas sont consommés par :
//   - apps/api : ZodValidationPipe + DTOs des controllers profil
//   - apps/web : react-hook-form @hookform/resolvers/zod sur les forms
//     d'édition profil + Server Actions

export * from './editer-profil.dto';
export * from './upload-photo.dto';
export * from './masquer-profil.dto';
export * from './suggested-cookie-entry.dto';
