// T027 — Décision pure : faut-il bloquer un envoi vers cet email ?
//
// Consulte une entry suppression list et un instant `now`. Décide si
// l'envoi doit être abandonné. Permet aux use cases de rester
// déterministes (Principe VI) sans I/O DB.

export interface SuppressionListEntryView {
  readonly recipientEmailHashHMAC: string;
  readonly reason: 'hard_bounce' | 'soft_bounce_repeated' | 'complaint' | 'manual';
  readonly addedAt: Date;
  /** null = permanent. Non-null = soft bounce avec TTL. */
  readonly expiresAt: Date | null;
  /** Non-null = soft-deleted (admin a retiré manuellement). */
  readonly removedAt: Date | null;
}

export type SuppressionDecision =
  | { suppress: false }
  | { suppress: true; reason: SuppressionListEntryView['reason'] };

/**
 * Retourne `{ suppress: true, reason }` si l'envoi doit être bloqué,
 * `{ suppress: false }` sinon.
 *
 * Règles :
 *   - Pas d'entry → pas de suppression.
 *   - `removedAt` non-null → entry retirée par admin → pas de suppression.
 *   - `expiresAt` non-null et passé → soft bounce périmé → pas de
 *     suppression (la purge auto le retirera, mais on est tolérant
 *     en attendant).
 *   - Sinon → suppression avec la raison de l'entry.
 */
export function shouldSuppress(
  entry: SuppressionListEntryView | null,
  now: Date,
): SuppressionDecision {
  if (entry === null) return { suppress: false };
  if (entry.removedAt !== null) return { suppress: false };
  if (entry.expiresAt !== null && entry.expiresAt.getTime() <= now.getTime()) {
    return { suppress: false };
  }
  return { suppress: true, reason: entry.reason };
}
