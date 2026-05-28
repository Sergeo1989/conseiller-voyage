// @cv/profil-domain — logique pure du domaine de profil conseiller (feature 005 / dossier 007).
//
// Pas de framework, pas d'I/O, pas de Prisma. TDD strict (Principe VI constitution v2.2.0).
// Tous les modules ci-dessous sont des fonctions pures déterministes.
//
// Modules :
//   - result            : Result<T, E> discriminated union + ok/err helpers
//   - slug              : slugify FR-CA + genererSlugUnique + SLUGS_RESERVES_FRAMEWORK
//   - magic-number      : detecterFormatImage (JPEG/PNG/WebP, 12 octets)
//   - statut-profil     : calculerStatutProfil + profilEstComplet
//   - nom-affiche       : formaterNomAffiche (FR-CA, particules + noms composés)
//   - suggested-window  : fenetreValiditeSuggested (24h)
//   - suggested-cookie  : encodeSuggestedCookie / decodeSuggestedCookie (HMAC SHA-256)
//   - dtos/             : schémas Zod partagés api+web (editer-profil, upload-photo, etc.)
//
// Cf. specs/007-profil-conseiller/plan.md, research.md, contracts/.

export * from './result';
export * from './slug';
export * from './magic-number';
export * from './statut-profil';
export * from './nom-affiche';
export * from './suggested-window';
export * from './suggested-cookie';
export * from './dtos';
