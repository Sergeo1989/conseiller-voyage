// T018 — Adapter Prisma du port AuthSessionReader.
// Lit la table auth_sessions partagée avec apps/web (Auth.js v5).
// Cache local courte durée (5s) pour amortir les rafales de requêtes
// authentifiées d'un même utilisateur sans compromettre la révocation
// (Principe IX — révocation < 30s en pire cas).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AuthRole,
  AuthSession,
  AuthSessionReader,
} from '../application/ports/auth-session-reader.port';

const CACHE_TTL_MS = 5_000;
const MAX_CACHE_SIZE = 1_000;

interface CacheEntry {
  session: AuthSession | null;
  cachedAt: number;
}

@Injectable()
export class PrismaAuthSessionReader implements AuthSessionReader {
  private readonly cache = new Map<string, CacheEntry>();

  async findValidByToken(sessionToken: string): Promise<AuthSession | null> {
    const cached = this.cache.get(sessionToken);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.session;
    }

    const row = await prisma.authSession.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    const now = new Date();
    const session: AuthSession | null =
      row && row.expires > now
        ? {
            sessionToken: row.sessionToken,
            expiresAt: row.expires,
            user: {
              id: row.user.id,
              email: row.user.email,
              role: row.user.role as AuthRole,
              mfaVerifiedAt: row.mfaVerifiedAt,
            },
          }
        : null;

    this.cacheSet(sessionToken, session);
    return session;
  }

  private cacheSet(key: string, session: AuthSession | null): void {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      // Stratégie d'éviction simpliste : on vide tout. Si le volume devient
      // un problème, basculer vers LRU (ex: lru-cache).
      this.cache.clear();
    }
    this.cache.set(key, { session, cachedAt: Date.now() });
  }
}
