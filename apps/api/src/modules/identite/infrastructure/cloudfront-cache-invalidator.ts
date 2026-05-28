// T040 — CloudFrontCacheInvalidator (feature 007, R4 + C2).
//
// Impl du port CloudFrontCacheInvalidator (T030). Si
// CLOUDFRONT_PROFILES_DISTRIBUTION_ID n'est pas configuré (dev local
// sans CloudFront), no-op silencieux + log debug. En prod, déclenche
// `CreateInvalidationCommand`.
//
// Best-effort : si l'API CloudFront est inaccessible, on log mais on
// ne throw pas — la fenêtre dégradée est bornée par `s-maxage=300`
// sur la page profil (cf. research.md R4).

import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Injectable, Logger } from '@nestjs/common';
import { cloudFrontClient } from '../../../aws/clients';
import { env } from '../../../env';
import type { CloudFrontCacheInvalidator } from '../application/ports/cloudfront-cache-invalidator.port';

@Injectable()
export class AwsCloudFrontCacheInvalidator implements CloudFrontCacheInvalidator {
  private readonly logger = new Logger('CloudFrontCacheInvalidator');
  private readonly distributionId = env.CLOUDFRONT_PROFILES_DISTRIBUTION_ID;

  async invalidatePaths(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;

    if (!this.distributionId) {
      // Dev local — pas de CloudFront. Le filet ISR Next.js suffit.
      this.logger.debug(`CloudFront skipped (no distribution ID) for paths: ${paths.join(', ')}`);
      return;
    }

    try {
      await cloudFrontClient.send(
        new CreateInvalidationCommand({
          DistributionId: this.distributionId,
          InvalidationBatch: {
            CallerReference: `profil-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            Paths: { Quantity: paths.length, Items: [...paths] },
          },
        }),
      );
      this.logger.log(`CloudFront invalidation submitted for ${paths.length} paths`);
    } catch (error) {
      // Best-effort : log + ne throw pas (le filet s-maxage=300 borne la
      // fenêtre dégradée à 5 min).
      this.logger.error(
        { err: error, paths },
        'CloudFront invalidation failed (best-effort, s-maxage=300 fallback)',
      );
    }
  }
}
