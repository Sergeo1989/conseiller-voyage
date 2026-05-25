// US3 — Cache de statut conformité (TTL 60 s + invalidation pub/sub).
//
// Lecture rapide pour les consommateurs internes (matching, SEO).
// Le cache stocke la réponse VerificationStatus et est invalidé
// explicitement quand un événement conformite.status.changed est
// publié par OutboxPublisher → RedisConformiteEventPublisher.

import type { ConseillerId } from '@cv/shared/conformite';

/** Réponse publique exposée par ConformiteQueryPort. */
export interface VerificationStatus {
  readonly conseillerId: ConseillerId;
  readonly verified: boolean;
  readonly lastVerifiedAt: Date | null;
}

export interface ConformiteStatusCache {
  /** Lit le statut depuis le cache. null si MISS ou expiré. */
  get(conseillerId: ConseillerId): Promise<VerificationStatus | null>;
  /** Set avec TTL (configurable côté adapter, défaut 60s). */
  set(status: VerificationStatus): Promise<void>;
  /** Invalidation explicite — appelé sur réception d'un événement status.changed. */
  invalidate(conseillerId: ConseillerId): Promise<void>;
}

export const CONFORMITE_STATUS_CACHE = Symbol.for('ConformiteStatusCache');
