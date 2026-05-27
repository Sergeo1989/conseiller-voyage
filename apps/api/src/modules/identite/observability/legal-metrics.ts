// T095 — Métriques Prometheus exposées via OTel pour la feature 004
// (legal acceptances + cookie HMAC + middleware).
//
// Les compteurs/gauges sont enregistrés une fois au boot et exportés
// par l'instance OpenTelemetry configurée dans `apps/api/src/common/
// observability/otel.ts`.
//
// Cf. spec 004 *Métriques produit* + ADR-0008 (alerte forge detection).

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('cv.legal', '1.0.0');

// --- Compteurs business ---

export const legalAcceptancesTotal = meter.createCounter('legal_acceptances_total', {
  description: "Nombre d'acceptances enregistrées",
  unit: '1',
});

export const legalReacceptanceRequiredTotal = meter.createCounter(
  'legal_reacceptance_required_total',
  {
    description: 'Nombre de redirects vers /cgu-conseiller/re-accepter (cookie outdated)',
    unit: '1',
  },
);

export const legalDocumentPublishTotal = meter.createCounter('legal_document_publish_total', {
  description: 'Nombre de versions de documents légaux publiées (seed)',
  unit: '1',
});

// --- Compteurs cookie HMAC ---

export const legalCookiePresentTotal = meter.createCounter('legal_cookie_present_total', {
  description: 'Cookie __Host-cv.legal-version présent dans la requête',
  unit: '1',
});

export const legalCookieValidTotal = meter.createCounter('legal_cookie_valid_total', {
  description: 'Cookie HMAC vérifié (result=ok|expired|invalid)',
  unit: '1',
});

export const legalCookieForgeDetectedTotal = meter.createCounter(
  'legal_cookie_forge_detected_total',
  {
    description:
      'Signature HMAC invalide détectée — alerte SecOps (ADR-0009). Trigger Grafana CRITICAL > 5/h.',
    unit: '1',
  },
);

// --- Compteurs API ---

export const legalVersionStatusApiCallsTotal = meter.createCounter(
  'legal_version_status_api_calls_total',
  {
    description: 'Appels à GET /api/me/legal/version-status',
    unit: '1',
  },
);

export const legalMiddlewareRedirectTotal = meter.createCounter('legal_middleware_redirect_total', {
  description: 'Redirects effectués par le middleware (reason=outdated|never_accepted|api_error)',
  unit: '1',
});
