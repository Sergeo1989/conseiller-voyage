// T024 — Canonicalisation d'une adresse courriel.
//
// Pour la suppression list, on stocke un hash de la forme canonique
// pour éviter les bypass via variantes Gmail (`user+tag@gmail.com`,
// `u.s.e.r@gmail.com` arrivent dans la même boîte). Sans canonicalisation,
// un spammeur peut générer N variantes pour saturer le quota SES.
//
// Comportement :
//   - Trim et lowercase systématique.
//   - Pour @gmail.com / @googlemail.com : strip les points dans la
//     partie locale + strip tout après `+`.
//   - Pour les autres domaines : lowercase + trim seulement (Outlook,
//     Yahoo, etc. NE traitent PAS les dots comme Gmail).
//
// Fonction pure — pas d'I/O, déterministe.

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Retourne la forme canonique d'une adresse courriel utilisée pour
 * le hash de la suppression list. Ne valide PAS l'adresse (à faire en
 * amont avec Zod) — accepte n'importe quelle string, mais lance si la
 * forme `local@domain` est cassée.
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    throw new Error(`Invalid email format for canonicalization: ${email}`);
  }
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (!GMAIL_DOMAINS.has(domain)) {
    return `${local}@${domain}`;
  }

  // Strip everything after `+` (Gmail alias)
  const plusIndex = local.indexOf('+');
  const localWithoutAlias = plusIndex === -1 ? local : local.slice(0, plusIndex);

  // Strip dots (Gmail ignore les points dans la partie locale)
  const localWithoutDots = localWithoutAlias.replace(/\./g, '');

  if (localWithoutDots.length === 0) {
    throw new Error(`Invalid email format for canonicalization: ${email}`);
  }

  // Normaliser le domaine à gmail.com (googlemail.com est un alias historique)
  return `${localWithoutDots}@gmail.com`;
}
