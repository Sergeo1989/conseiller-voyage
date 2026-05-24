// T097 — ConformiteQueryFacade.
//
// Implémente le contrat public ConformiteQueryPort exposé aux modules
// consommateurs (matching, SEO). Wrap GetVerificationStatusUseCase +
// subscribe Redis pub/sub via ConformiteEventPublisher.
//
// La facade s'abonne aux événements status.changed et invalide le
// cache automatiquement (propagation négative < 10 s FR-022).

import type { ConformiteQueryPort, VerificationStatusDto } from '@cv/shared/conformite';
import { ConseillerIdSchema } from '@cv/shared/conformite';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  CONFORMITE_EVENT_PUBLISHER,
  type ConformiteEventPublisher,
} from '../../application/ports/conformite-event-publisher.port';
import {
  CONFORMITE_STATUS_CACHE,
  type ConformiteStatusCache,
} from '../../application/ports/conformite-status-cache.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { GetVerificationStatusUseCase } from '../../application/use-cases/get-verification-status.use-case';

@Injectable()
export class ConformiteQueryFacade implements ConformiteQueryPort, OnModuleInit {
  constructor(
    private readonly getStatus: GetVerificationStatusUseCase,
    @Inject(CONFORMITE_EVENT_PUBLISHER)
    private readonly publisher: ConformiteEventPublisher,
    @Inject(CONFORMITE_STATUS_CACHE)
    private readonly cache: ConformiteStatusCache,
  ) {}

  onModuleInit(): void {
    // Invalidation automatique du cache sur tout status.changed
    this.publisher.subscribe(async (event) => {
      if (event.type === 'conformite.status.changed') {
        await this.cache.invalidate(event.conseillerId);
      }
    });
  }

  async getVerificationStatus(args: {
    conseillerId: string;
    strict?: boolean;
  }): Promise<VerificationStatusDto> {
    const conseillerId = ConseillerIdSchema.parse(args.conseillerId);
    const result = await this.getStatus.execute({
      conseillerId,
      ...(args.strict !== undefined && { strict: args.strict }),
    });
    return {
      conseillerId: result.conseillerId,
      verified: result.verified,
      lastVerifiedAt: result.lastVerifiedAt?.toISOString() ?? null,
    };
  }

  onStatusChanged(
    handler: (event: {
      conseillerId: string;
      previousStatus: string;
      newStatus: string;
      transitionKind: 'positive' | 'negative';
      cause: string;
    }) => void,
  ): () => void {
    return this.publisher.subscribe((event) => {
      if (event.type !== 'conformite.status.changed') return;
      handler({
        conseillerId: event.conseillerId,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        transitionKind: event.transitionKind,
        cause: event.cause,
      });
    });
  }
}
