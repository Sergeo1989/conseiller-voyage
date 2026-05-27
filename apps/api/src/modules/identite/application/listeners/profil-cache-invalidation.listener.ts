// T093 — Helper d'invalidation cross-cache (Next.js + CloudFront).
//
// Pas un listener event-bus à proprement parler — les use cases (editer,
// uploader, masquer, anonymiser) ont déjà des hooks d'invalidation
// inline. Cette classe les factorise pour cohérence.
//
// Pattern double invalidation (C2 + R4) :
//   1. Next.js revalidatePath via Bearer secret /api/revalidate
//   2. CloudFront createInvalidation
// Le filet `s-maxage=300` côté Next.js page borne la fenêtre dégradée à 5 min.

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CLOUDFRONT_CACHE_INVALIDATOR,
  type CloudFrontCacheInvalidator,
} from '../ports/cloudfront-cache-invalidator.port';
import { NEXTJS_REVALIDATOR, type NextjsRevalidator } from '../ports/nextjs-revalidator.port';

@Injectable()
export class ProfilCacheInvalidator {
  private readonly logger = new Logger('ProfilCacheInvalidator');

  constructor(
    @Inject(NEXTJS_REVALIDATOR)
    private readonly nextjs: NextjsRevalidator,
    @Inject(CLOUDFRONT_CACHE_INVALIDATOR)
    private readonly cloudfront: CloudFrontCacheInvalidator,
  ) {}

  /**
   * Invalide les caches Next.js ISR + CloudFront pour `/fr/conseiller/<slug>`
   * et `/en/conseiller/<slug>`. Best-effort.
   */
  async invalidateProfilSlug(slug: string): Promise<void> {
    const paths = [`/fr/conseiller/${slug}`, `/en/conseiller/${slug}`];
    // En parallèle — l'un n'attend pas l'autre, les deux sont best-effort.
    await Promise.all([
      ...paths.map((p) => this.nextjs.revalidatePath(p).catch(() => undefined)),
      this.cloudfront.invalidatePaths(paths).catch(() => undefined),
    ]);
    this.logger.debug(`Caches invalidated for slug=${slug}`);
  }

  /** Invalide aussi sitemap.xml (changement de la liste des slugs publiables). */
  async invalidateSitemap(): Promise<void> {
    await this.nextjs.revalidatePath('/sitemap.xml').catch(() => undefined);
  }
}
