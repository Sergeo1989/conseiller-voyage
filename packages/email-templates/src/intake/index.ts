// Barrel d'export des templates intake (feature 002-voyageur-intake).
//
// Templates ajoutés au fur et à mesure des US :
//   US1 — magic-link (créé)
//   Phase 8 — expiration-reminder (T132) + erasure-confirmation (N6)

export * from './magic-link';
// 017 — notifications voyageur (issue de matching + accusé d'activation).
export * from './voyageur-activation-ack';
export * from './voyageur-advisors-ready';
export * from './voyageur-still-searching';
