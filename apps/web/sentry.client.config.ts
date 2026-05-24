// T015 — Sentry SDK Next.js (client-side).
// Activé uniquement si NEXT_PUBLIC_SENTRY_DSN est défini.
// Scrubbing PII : voir apps/api/src/common/observability/sentry.ts pour la
// même logique côté serveur.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0, // Session replay désactivé (risque Loi 25, cf. ADR-0007).
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      // Ne jamais transmettre l'IP, le User-Agent réel n'est pas un problème.
      if (event.user) {
        event.user = event.user.id !== undefined ? { id: event.user.id } : {};
      }
      return event;
    },
  });
}
