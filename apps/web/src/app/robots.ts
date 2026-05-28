// Next.js 15 — convention `app/robots.ts` génère /robots.txt dynamique.
// Sert un robots.txt valide pour satisfaire l'audit SEO Lighthouse
// (Principe XII). Autorise / par défaut sauf les routes privées.
//
// Anti-indexation staging : option BLOCK_INDEX=true (env var) force
// `disallow /`. Sinon le bon robots.txt prod est servi (utilisé aussi
// en CI Lighthouse pour que is-crawlable passe).
//
// Note Lighthouse robots-txt audit : la directive `Sitemap:` exige une URL
// ABSOLUE (RFC + Google docs). Next.js 15 MetadataRoute.Robots relativise
// l'URL quand elle correspond à l'origin → 'Invalid sitemap URL' bloque
// l'audit. On omet `sitemap:` ici — le sitemap est servi via
// app/sitemap.ts et découvrable via les <link rel="alternate"> des
// metadata. L'audit `robots-txt` valide la syntaxe sans exiger Sitemap.

import type { MetadataRoute } from 'next';

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
  };
}
