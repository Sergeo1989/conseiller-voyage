// Hook d'instrumentation Next.js — appelé une fois au boot par runtime.
// Charge les configs Sentry (server / edge) selon le runtime courant.
// Cf. https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
