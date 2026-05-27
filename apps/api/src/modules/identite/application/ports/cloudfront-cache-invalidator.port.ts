// T030 — Port invalidation CloudFront pour pages profil (feature 007, R4 / C2).
//
// SC-006 (99% retrait ≤ 10s) impose une invalidation double :
//   1. Next.js ISR via revalidatePath (callback /api/revalidate)
//   2. CloudFront via createInvalidation (s-maxage=300 sinon stale)
//
// Wrappe @aws-sdk/client-cloudfront@^3. Best-effort : si CloudFront échoue,
// le caller loggue + relance via la queue retry (BullMQ). Le filet
// s-maxage=300 borne la fenêtre dégradée.

export interface CloudFrontCacheInvalidator {
  /**
   * Crée une invalidation pour les chemins donnés. Best-effort.
   *
   * @example
   *   invalidatePaths(['/fr/conseiller/marie-dupont', '/en/conseiller/marie-dupont'])
   *
   * @throws Si l'API CloudFront est inaccessible — le caller doit catch
   *         et planifier un retry via BullMQ.
   */
  invalidatePaths(paths: readonly string[]): Promise<void>;
}

export const CLOUDFRONT_CACHE_INVALIDATOR = Symbol.for('CloudFrontCacheInvalidator');
