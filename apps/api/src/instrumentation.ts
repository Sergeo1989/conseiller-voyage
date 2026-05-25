// Point d'entrée d'instrumentation — importé en TOUT PREMIER par main.ts.
// Initialise OpenTelemetry + Sentry + applique la map d'erreurs Zod FR-CA
// (T030f) avant le chargement du reste de l'app.
// L'import de `./env` ici force la validation Zod des variables
// d'environnement avant tout autre code.

// MUST be the very first import — charge apps/api/.env dans process.env
// AVANT que ./env (validation Zod) ne s'exécute. En prod, les vraies
// valeurs viennent d'AWS Secrets Manager via task role (cf. ADR-0005).
import 'dotenv/config';

import { applyFrCAZodErrorMap } from '@cv/shared/conformite';
import { initOtel } from './common/observability/otel';
import { initSentry } from './common/observability/sentry';
import { env } from './env';

// Map d'erreurs Zod en FR-CA — Principe IV.
applyFrCAZodErrorMap();

if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  initOtel({
    serviceName: env.OTEL_SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    environment: env.NODE_ENV,
    // Conditional spread : exactOptionalPropertyTypes refuse `undefined` explicite.
    ...(env.OTEL_EXPORTER_OTLP_HEADERS !== undefined && {
      headers: env.OTEL_EXPORTER_OTLP_HEADERS,
    }),
  });
}

if (env.SENTRY_DSN) {
  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
  });
}
