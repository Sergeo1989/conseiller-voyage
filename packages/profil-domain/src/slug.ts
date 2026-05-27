// T013 — Slugification FR-CA + génération de slug unique (Q1 / FR-015).
//
// Pipeline déterministe (recherche R1) :
//   1. Mapping explicite œ/æ (NFD ne les sépare pas)
//   2. NFD + diacritic strip pour les accents canadiens
//   3. Minuscules Unicode-aware
//   4. Substitution caractères non-[a-z0-9] par tirets
//   5. Bornes : collapse les tirets consécutifs + retire en début/fin
//      + tronque à 60 chars en préservant un mot complet.
//
// Politique de désambiguïsation :
//   - Pas de collision (slug absent de slugExistant ∪ slugReserve ∪
//     SLUGS_RESERVES_FRAMEWORK) → retourne le slug brut.
//   - Collision → essaie `<slug>-2`, `<slug>-3`, ..., jusqu'à 100 tentatives.
//   - Échec après 100 tentatives → SlugDisambiguationExhaustedError.

/** Liste de mots réservés au framework (anti-collision avec routes Next.js). */
export const SLUGS_RESERVES_FRAMEWORK: ReadonlySet<string> = new Set([
  // Segments App Router cohabitant avec /conseiller/[slug]
  'profil',
  'profile',
  // Segments génériques à risque
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'inscription',
  'connexion',
  'mot-de-passe-oublie',
  'mot-de-passe-reinitialiser',
  'verifier-email',
  'parametres',
  'settings',
  'index',
  'home',
  'accueil',
  // Routes intake / matching futures
  'intake',
  'comment-ca-marche',
  'mentions-legales',
  'cgu',
  'politique-loi25',
  // Robots / sitemap
  'robots.txt',
  'sitemap.xml',
  'sitemap',
  // Réservations défensives
  'public',
  'private',
  'static',
  'assets',
  'apercu',
  'aperçu',
  'preview',
  'new',
  'edit',
  'delete',
  'create',
  'nouveau',
  'modifier',
  'supprimer',
  'me',
  'moi',
  'compte',
  'account',
  'aide',
  'support',
  'contact',
  'faq',
]);

const MAX_SLUG_LENGTH = 60;
const MAX_DISAMBIGUATION_ATTEMPTS = 100;

/** Erreur explicite quand la désambiguïsation échoue (> 100 collisions). */
export class SlugDisambiguationExhaustedError extends Error {
  constructor(base: string) {
    super(
      `Impossible de générer un slug unique pour "${base}" après ${MAX_DISAMBIGUATION_ATTEMPTS} tentatives`,
    );
    this.name = 'SlugDisambiguationExhaustedError';
  }
}

/**
 * Convertit (prenom, nom) en slug FR-CA déterministe.
 *
 * Fonction pure : entrées identiques → sortie identique. Pas d'I/O.
 *
 * @example
 *   slugify('Marie', 'Dupont')          // 'marie-dupont'
 *   slugify('Élise', 'Côté')            // 'elise-cote'
 *   slugify('Jean-Pierre', 'Le Goff')   // 'jean-pierre-le-goff'
 *   slugify('Sébastien', "d'Aragon")    // 'sebastien-d-aragon'
 */
export function slugify(prenom: string, nom: string): string {
  const combine = `${prenom} ${nom}`;

  // 1. Mapping explicite des lettres composées que NFD ne sépare pas.
  const withoutLigatures = combine
    .replaceAll('œ', 'oe')
    .replaceAll('Œ', 'oe')
    .replaceAll('æ', 'ae')
    .replaceAll('Æ', 'ae');

  // 2. NFD + diacritic strip — convertit é → e, à → a, ç → c, etc.
  const withoutDiacritics = withoutLigatures.normalize('NFD').replace(/\p{Diacritic}/gu, '');

  // 3. Minuscules.
  const lower = withoutDiacritics.toLowerCase();

  // 4. Substitution caractères non-[a-z0-9] par tirets.
  const onlySafe = lower.replace(/[^a-z0-9]+/g, '-');

  // 5. Collapse tirets consécutifs + strip bornes.
  const stripped = onlySafe.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

  // 6. Troncature à MAX_SLUG_LENGTH en préservant un mot complet.
  if (stripped.length <= MAX_SLUG_LENGTH) return stripped;

  const truncated = stripped.slice(0, MAX_SLUG_LENGTH);
  const lastDash = truncated.lastIndexOf('-');
  if (lastDash > 0) {
    return truncated.slice(0, lastDash);
  }
  return truncated;
}

export interface SlugDisponibiliteContext {
  /** Slugs déjà attribués à des conseillers actifs (lus depuis ConseillerProfile.slug). */
  readonly slugExistant: ReadonlySet<string>;
  /** Slugs réservés à vie après effacement Loi 25 / révocation permanente (SlugReservation). */
  readonly slugReserve: ReadonlySet<string>;
}

/**
 * Génère un slug unique pour (prenom, nom) en évitant les collisions avec :
 *   1. Les slugs déjà attribués (slugExistant)
 *   2. Les slugs réservés Loi 25 (slugReserve)
 *   3. La liste de mots framework (SLUGS_RESERVES_FRAMEWORK)
 *
 * Désambiguïsation par suffixe numérique incrémenté (`-2`, `-3`, ...).
 * Lève SlugDisambiguationExhaustedError après 100 tentatives.
 *
 * Fonction pure : ne fait aucun appel DB. Les sets sont passés en paramètre.
 */
export function genererSlugUnique(
  prenom: string,
  nom: string,
  ctx: SlugDisponibiliteContext,
): string {
  const base = slugify(prenom, nom);

  const isDisponible = (candidate: string): boolean =>
    !ctx.slugExistant.has(candidate) &&
    !ctx.slugReserve.has(candidate) &&
    !SLUGS_RESERVES_FRAMEWORK.has(candidate);

  if (isDisponible(base)) return base;

  for (let suffixe = 2; suffixe <= MAX_DISAMBIGUATION_ATTEMPTS; suffixe++) {
    const candidate = `${base}-${suffixe}`;
    if (isDisponible(candidate)) return candidate;
  }

  throw new SlugDisambiguationExhaustedError(base);
}
