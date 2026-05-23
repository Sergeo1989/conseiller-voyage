// T022 — En-têtes de sécurité HTTP via Fastify helmet.
// Applique CSP strict, HSTS, X-Content-Type-Options, Referrer-Policy,
// Permissions-Policy sur toutes les réponses (Principe IX).
// Cf. constitution Principe IX *En-têtes HTTP*.

import helmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export async function registerSecurityHeaders(app: NestFastifyApplication): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    permittedCrossDomainPolicies: false,
    hidePoweredBy: true,
    noSniff: true,
    xssFilter: false, // Deprecated header
  });
}
