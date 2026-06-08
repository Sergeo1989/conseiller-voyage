// Barrel d'export des templates matching (feature 012 — notifications conseiller).
//
// Templates ajoutés au fil des US :
//   US1 — lead-received (créé) : notification d'un nouveau lead au conseiller.
//   013 — conversation-new-message : nouveau message dans un fil (sans PII de contenu).

export * from './conversation-new-message';
export * from './lead-received';
