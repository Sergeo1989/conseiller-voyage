// HttpNextjsRevalidator — appel HTTP Bearer-secret vers /api/revalidate
// côté apps/web (T092). Best-effort.

import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../../env';
import type { NextjsRevalidator } from '../application/ports/nextjs-revalidator.port';

@Injectable()
export class HttpNextjsRevalidator implements NextjsRevalidator {
  private readonly logger = new Logger('NextjsRevalidator');
  private readonly siteUrl = env.NEXT_PUBLIC_SITE_URL;
  private readonly secret = env.CV_REVALIDATE_SECRET;

  async revalidatePath(path: string): Promise<void> {
    try {
      const res = await fetch(`${this.siteUrl}/api/revalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        this.logger.warn(`Next.js revalidate failed (status=${res.status}, path=${path})`);
      }
    } catch (err) {
      this.logger.warn(
        { err, path },
        'Next.js revalidate threw — fallback s-maxage=300 CloudFront',
      );
    }
  }
}
