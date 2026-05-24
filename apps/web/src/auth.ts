// T017 — Configuration Auth.js v5 (NextAuth) côté apps/web.
// Sessions stockées en DB Postgres via @auth/prisma-adapter — cf. ADR-0004.
// Les providers (passkey TOTP conseiller, magic-link voyageur) seront
// ajoutés en feature 002 (identité).

import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@cv/db';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
    updateAge: 24 * 60 * 60, // refresh quotidien
  },
});
