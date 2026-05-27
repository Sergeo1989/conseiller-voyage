// Port pour invalider le cache Next.js ISR via l'endpoint Bearer-secret
// /api/revalidate côté apps/web (feature 007 T092 + T093).
//
// Complète CloudFrontCacheInvalidator (T030) — invalidation double
// requise pour SC-006 (99% retrait ≤ 10s, cf. R4 + C2).

export interface NextjsRevalidator {
  /**
   * Invalide une page Next.js par path. Best-effort : log + swallow
   * en cas d'échec (le filet s-maxage=300 borne la fenêtre dégradée).
   */
  revalidatePath(path: string): Promise<void>;
}

export const NEXTJS_REVALIDATOR = Symbol.for('NextjsRevalidator');
