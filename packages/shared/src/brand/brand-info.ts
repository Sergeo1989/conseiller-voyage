// T005 — Identité de marque pour les courriels transactionnels.
//
// Conformité CASL (Loi C-28 canadienne, Règlement S.O.R./2013-221) :
// même les messages électroniques transactionnels DOIVENT inclure dans
// le corps du message le nom légal de l'expéditeur, une adresse postale
// physique valide, et un mécanisme de contact. Source unique de vérité
// pour les 3 champs ci-dessous (cf. plan.md Appendice C).
//
// ⚠️ Adresse postale à confirmer juridiquement avant go-live. Valeur
// placeholder en attendant validation du porteur produit.

export interface BrandInfo {
  /** Nom légal de l'entité (CASL exigence 1). */
  legalName: string;
  /** Adresse postale physique du siège social canadien (CASL exigence 2). */
  postalAddress: {
    street: string;
    city: string;
    province: string; // ON | QC
    postalCode: string;
    country: 'CA';
  };
  /** Adresse de contact (CASL exigence 3). */
  contactEmail: string;
  /** URL principale du site (utilisée dans signatures et links). */
  websiteUrl: string;
  /** Adresse expéditeur affichée dans le From: (sous-domaine dédié). */
  fromEmail: string;
  /** Nom affiché dans le From: (à côté de l'adresse). */
  fromName: string;
}

/**
 * Marque par défaut Conseiller Voyage. Surchargeable via variables
 * d'environnement si la marque diverge entre dev/staging/prod (par
 * exemple, expéditeur de test différent en staging).
 */
export const DEFAULT_BRAND_INFO: BrandInfo = {
  legalName: process.env.BRAND_LEGAL_NAME ?? 'Conseiller Voyage Inc.',
  postalAddress: {
    street: process.env.BRAND_STREET ?? '[ADRESSE À CONFIRMER JURIDIQUEMENT]',
    city: process.env.BRAND_CITY ?? 'Montréal',
    province: process.env.BRAND_PROVINCE ?? 'QC',
    postalCode: process.env.BRAND_POSTAL_CODE ?? 'H0H 0H0',
    country: 'CA',
  },
  contactEmail: process.env.BRAND_CONTACT_EMAIL ?? 'support@conseiller-voyage.ca',
  websiteUrl: process.env.BRAND_WEBSITE_URL ?? 'https://conseiller-voyage.ca',
  fromEmail:
    process.env.NOTIFICATIONS_FROM_EMAIL ?? 'notifications@notifications.conseiller-voyage.ca',
  fromName: process.env.NOTIFICATIONS_FROM_NAME ?? 'Conseiller Voyage',
};

/**
 * Représentation formatée mono-ligne de l'adresse postale (utilisée
 * dans les footers de templates).
 */
export function formatPostalAddress(brand: BrandInfo = DEFAULT_BRAND_INFO): string {
  const a = brand.postalAddress;
  return `${a.street}, ${a.city} (${a.province}) ${a.postalCode}, ${a.country}`;
}
