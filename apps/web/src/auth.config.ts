// T017 — Configuration Auth.js v5 partagée entre auth.ts (serveur Node) et
// le middleware Next.js (edge runtime). Séparation requise car @auth/prisma-
// adapter n'est pas compatible edge runtime.

import type { NextAuthConfig } from 'next-auth';

/**
 * Le préfixe `__Host-` impose au navigateur secure=true + path=/ + no Domain,
 * ce qui exige HTTPS. C'est la bonne valeur en prod (durcissement CSRF/
 * fixation), mais en dev HTTP localhost le navigateur refuse silencieusement
 * de stocker le cookie → auth.js ne voit jamais la session.
 *
 * En dev on bascule sur le nom Auth.js par défaut (`authjs.session-token`)
 * et secure=false, ce qui matche aussi le cookie posé par devLoginAction
 * (cf. apps/web/src/app/[locale]/login/actions.ts).
 *
 * Côté API NestJS, l'AuthGuard accepte les DEUX noms (prod + dev) — cf.
 * apps/api/src/modules/identite/interface/auth.guard.ts.
 */
const useSecureCookies = process.env.NODE_ENV === 'production';

const SESSION_COOKIE_NAME = useSecureCookies ? '__Host-cv.session.token' : 'authjs.session-token';

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
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
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
