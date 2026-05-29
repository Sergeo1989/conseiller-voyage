// Charge .env avant tout import de modules qui instancient env.ts.
// Sans cela, tests d'intégration qui importent un adapter dépendant de
// env.ts (ex. PrismaProfilPublicReader → CLOUDFRONT_PROFILES_PUBLIC_URL,
// JoseTokenIssuer → AUTH_TOKEN_SECRET, etc.) sortent en process.exit(1).
import 'dotenv/config';

// Safety net pour Vitest 2 : au app.close() de tests d'intégration, des
// commandes Redis (heartbeats BullMQ, throttler cleanup) peuvent être en file
// d'attente au moment où la socket ferme. ioredis rejette alors ces promesses
// avec « Connection is closed. » — non await-able côté lib donc unhandled
// rejection → Vitest fait sortir le run en code 1 même si tous les tests
// passent. On absorbe uniquement ce message précis, scope test, jamais prod.
process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error && reason.message === 'Connection is closed.') {
    return;
  }
  throw reason;
});
