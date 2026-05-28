// Next.js 15 — convention `app/robots.ts` génère /robots.txt dynamique.
// Sert un robots.txt valide pour satisfaire l'audit SEO Lighthouse
// (Principe XII). En prod, on autorise tout sauf /admin/* + /api/*
// (routes auth-required ou techniques) ; en preview/staging on bloque
// tout (sécurité contre indexation accidentelle d'environnements
// non-prod).

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const IS_PROD = process.env.NODE_ENV === 'production' && !SITE_URL.includes('localhost');

export default function robots(): MetadataRoute.Robots {
  if (!IS_PROD) {
    // Staging / preview / dev — pas d'indexation moteur.
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/mfa/',
          '/parametres/',
          '/conseiller/profil',
          '/conseiller/profil/apercu',
          '/cgu-conseiller/re-accepter',
          '/verifier-email',
          '/reinitialiser-mot-de-passe',
          '/changer-mot-de-passe',
          '/accepter-invitation',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
