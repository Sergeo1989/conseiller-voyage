import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `experimental.typedRoutes` est déprécié en Next 15 — remonté au top-level
  typedRoutes: true,

  /**
   * Externalise les packages serveur qui font des require() dynamiques
   * (Sentry + OpenTelemetry + require-in-the-middle). Webpack ne peut
   * pas tracer leurs imports statiquement → spam de warnings inoffensifs
   * ("Critical dependency: the request of a dependency is an expression").
   *
   * Avec serverExternalPackages, Next.js délègue à Node.js require()
   * natif au runtime — pas d'analyse webpack, pas de warnings. Solution
   * officielle documentée :
   *   - https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
   *   - https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#disabling-the-sentry-sdk
   */
  serverExternalPackages: [
    '@sentry/nextjs',
    '@sentry/node',
    '@sentry/opentelemetry',
    '@opentelemetry/instrumentation',
    '@opentelemetry/instrumentation-http',
    '@opentelemetry/api',
    '@prisma/client',
    'require-in-the-middle',
    'import-in-the-middle',
  ],

  // CSP, HSTS et autres en-têtes seront configurés dans middleware.ts (T030e)
};

export default withNextIntl(nextConfig);
