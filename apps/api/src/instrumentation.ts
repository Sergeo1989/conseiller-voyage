// Point d'entrée d'instrumentation — importé en TOUT PREMIER par main.ts.
// Initialise OpenTelemetry + Sentry + applique la map d'erreurs Zod FR-CA
// (T030f) avant le chargement du reste de l'app.
// L'import de `./env` ici force la validation Zod des variables
// d'environnement avant tout autre code.

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
    headers: env.OTEL_EXPORTER_OTLP_HEADERS,
    environment: env.NODE_ENV,
  });
}

if (env.SENTRY_DSN) {
  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
  });
}
