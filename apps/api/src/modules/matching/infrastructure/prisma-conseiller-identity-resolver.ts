// T041 [US2] — PrismaConseillerIdentityResolver.
// Résout ConseillerProfile.id depuis AuthUser.id (GRANT SELECT cross-module
// sur profile_conseiller_profiles, déjà accordé au rôle app_matching).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { ConseillerIdentityResolver } from '../application/ports';

@Injectable()
export class PrismaConseillerIdentityResolver implements ConseillerIdentityResolver {
  async resolveProfileIdByAuthUserId(authUserId: string): Promise<string | null> {
    const profile = await prisma.conseillerProfile.findUnique({
      where: { authUserId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }
}
