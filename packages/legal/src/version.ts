// Fonctions pures de comparaison de versions de documents légaux.
// Cf. plan 004 section *Constitution Check VI* + research R4.
//
// TDD validé (Principe VI NON-NÉGOCIABLE) — tests dans __tests__/version.test.ts.

/**
 * Résultat de la comparaison d'une version courante avec la dernière
 * version acceptée par un utilisateur.
 */
export type LegalVersionComparisonResult = 'up_to_date' | 'outdated' | 'never_accepted';

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, got ${value}`);
  }
  if (value <= 0) {
    throw new Error(`${label} must be > 0, got ${value}`);
  }
}

/**
 * Compare la version courante d'un document avec la dernière version
 * acceptée par un utilisateur.
 *
 * @param currentDocumentVersion version active actuellement (entier positif strict)
 * @param lastAcceptedVersion dernière version acceptée par l'utilisateur, ou `null` s'il n'a jamais accepté
 * @returns `'never_accepted'` si lastAcceptedVersion === null
 * @returns `'up_to_date'` si lastAcceptedVersion === currentDocumentVersion
 * @returns `'outdated'` si lastAcceptedVersion < currentDocumentVersion
 * @throws si les versions sont ≤ 0, non-entières, ou si lastAcceptedVersion > currentDocumentVersion
 */
export function compareLegalVersion(
  currentDocumentVersion: number,
  lastAcceptedVersion: number | null,
): LegalVersionComparisonResult {
  assertPositiveInteger(currentDocumentVersion, 'currentDocumentVersion');

  if (lastAcceptedVersion === null) {
    return 'never_accepted';
  }

  assertPositiveInteger(lastAcceptedVersion, 'lastAcceptedVersion');

  if (lastAcceptedVersion > currentDocumentVersion) {
    // Incohérence forward — un user ne devrait jamais avoir accepté une
    // version future. Si ça arrive, c'est un bug en amont (race
    // condition, données corrompues) qu'on veut détecter explicitement.
    throw new Error(
      `lastAcceptedVersion (${lastAcceptedVersion}) is greater than currentDocumentVersion (${currentDocumentVersion}) — possible data corruption`,
    );
  }

  return lastAcceptedVersion === currentDocumentVersion ? 'up_to_date' : 'outdated';
}

/**
 * Détermine si une ré-acceptation est requise au regard de la version
 * courante du document. Wrapper sémantique autour de `compareLegalVersion`.
 *
 * @param lastAcceptedVersion dernière version acceptée par l'utilisateur (ou null)
 * @param currentVersion version courante active
 * @returns `true` si l'utilisateur doit ré-accepter (jamais accepté OU obsolète)
 */
export function shouldRequireReacceptance(
  lastAcceptedVersion: number | null,
  currentVersion: number,
): boolean {
  const result = compareLegalVersion(currentVersion, lastAcceptedVersion);
  return result !== 'up_to_date';
}
