import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // CSP, HSTS et autres en-têtes seront configurés dans middleware.ts (T030e)
};

export default withNextIntl(nextConfig);
