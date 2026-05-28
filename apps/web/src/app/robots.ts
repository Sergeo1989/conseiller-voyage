// Next.js 15 — convention `app/robots.ts` génère /robots.txt dynamique.
// Sert un robots.txt valide pour satisfaire l'audit SEO Lighthouse
// (Principe XII). Autorise / par défaut sauf les routes privées
// (admin, mfa, api, parametres, etc.).
//
// Anti-indexation staging : option BLOCK_INDEX=true (env var) force
// `disallow /`. Sinon le bon robots.txt prod est servi (utilisé aussi
// en CI Lighthouse pour que is-crawlable passe). Le filet supplémentaire
// pour staging : meta robots noindex via les layouts (auth)/* déjà en
// place, et CDN robots header peut surcharger.

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const BLOCK_INDEX = process.env.BLOCK_INDEX === 'true';

export default function robots(): MetadataRoute.Robots {
  if (BLOCK_INDEX) {
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
