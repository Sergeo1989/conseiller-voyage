// CountActiveAdminsUseCase — métrique d'observabilité + UI admin (R10).
//
// Compte les users role=admin avec au moins un MfaSecret enabled.
// Cache mémoire 60s pour amortir les rafales (Prometheus scrape 15s
// + appels UI).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  readonly value: number;
  readonly cachedAt: number;
}

@Injectable()
export class CountActiveAdminsUseCase {
  private cache: CacheEntry | null = null;

  async execute(): Promise<number> {
    if (this.cache && Date.now() - this.cache.cachedAt < CACHE_TTL_MS) {
      return this.cache.value;
    }
    const count = await prisma.authUser.count({
      where: {
        role: 'admin',
        mfaSecrets: { some: { enabledAt: { not: null } } },
      },
    });
    this.cache = { value: count, cachedAt: Date.now() };
    return count;
  }

  /** Invalidation explicite (appelée après reset admin sur cible role=admin). */
  invalidate(): void {
    this.cache = null;
  }
}
