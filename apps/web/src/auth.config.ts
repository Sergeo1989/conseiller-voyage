// T017 — Configuration Auth.js v5 partagée entre auth.ts (serveur Node) et
// le middleware Next.js (edge runtime). Séparation requise car @auth/prisma-
// adapter n'est pas compatible edge runtime.

import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [
    // À compléter en feature 002 (identité) :
    //   - Passkey/WebAuthn (TOTP — exigence Principe IX pour conseillers)
    //   - Magic link voyageur (sans création de compte permanent)
    //   - Provider admin (TOTP + restrictions IP)
  ],
  pages: {
    signIn: '/connexion',
    error: '/connexion/erreur',
  },
  cookies: {
    sessionToken: {
      name: '__Host-cv.session.token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },
  callbacks: {
    // Élévation MFA tracée — exposée aux routes via session.user
    async session({ session, user }) {
      if (session.user) {
        // user.id et user.role viennent du PrismaAdapter
        session.user.id = user.id;
      }
      return session;
    },
  },
};
