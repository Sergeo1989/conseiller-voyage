// T093 — GetVerificationStatusUseCase (US3 FR-022).
//
// Lecture publique exposée aux autres modules via ConformiteQueryFacade.
// Pattern cache-aside :
//   1. strict=true → bypass cache, lecture DB directe
//   2. Sinon : cache HIT → retour immédiat
//   3. cache MISS → lecture DB + write-through cache + retour
//
// La fraîcheur < 60s est garantie par :
//   - TTL cache 60s (FR-022 propagation positive)
//   - Invalidation explicite < 10s sur transition négative (FR-022)
//     via RedisConformiteEventPublisher subscribe (T096)

import type { ConseillerId } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import {
  CONFORMITE_STATUS_CACHE,
  type ConformiteStatusCache,
  type VerificationStatus,
} from '../ports/conformite-status-cache.port';

export interface GetVerificationStatusInput {
  readonly conseillerId: ConseillerId;
  /**
   * Si true, bypass le cache et lit toujours la DB.
   * À utiliser pour les décisions critiques (matching final, paiement).
   */
  readonly strict?: boolean;
}

@Injectable()
export class GetVerificationStatusUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_STATUS_CACHE) private readonly cache: ConformiteStatusCache,
  ) {}

  async execute(input: GetVerificationStatusInput): Promise<VerificationStatus> {
    if (!input.strict) {
      const cached = await this.cache.get(input.conseillerId);
      if (cached !== null) return cached;
    }

    const compliance = await this.reader.findVerifiedByConseillerId(input.conseillerId);
    const status: VerificationStatus = compliance
      ? {
          conseillerId: input.conseillerId,
          verified: true,
          lastVerifiedAt: compliance.lastVerifiedAt,
        }
      : {
          conseillerId: input.conseillerId,
          verified: false,
          lastVerifiedAt: null,
        };

    // Write-through (même pour strict=true — la prochaine lecture en
    // bénéficie).
    await this.cache.set(status);
    return status;
  }
}
