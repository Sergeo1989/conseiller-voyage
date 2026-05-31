// T028 — Port RedisRematchLock (idempotence re-matching admin FR-016).
//
// L'adapter Redis (T061 Phase 3) utilise SETNX EX 30s sur la clé
// `matching:rematch:${briefId}`. Le but : empêcher un double-clic admin de
// déclencher deux re-matchings concurrents sur le même brief, qui pourraient
// produire deux MR concurrents et corrompre la superseded chain.

export type RematchLockAcquireResult =
  | { readonly kind: 'acquired' }
  | { readonly kind: 'already_held' }; // un autre re-matching est en cours

export interface RedisRematchLock {
  /**
   * Acquire le verrou pour `briefId` pendant `ttlMs` millisecondes.
   * Retourne 'already_held' si un autre processus détient déjà le verrou.
   */
  acquire(briefId: string, ttlMs: number): Promise<RematchLockAcquireResult>;

  /**
   * Release explicite (best-effort — le TTL Redis le ferait de toute façon).
   * À appeler dans le `finally` du use case TriggerRematch.
   */
  release(briefId: string): Promise<void>;
}

export const REDIS_REMATCH_LOCK = Symbol.for('RedisRematchLock');
