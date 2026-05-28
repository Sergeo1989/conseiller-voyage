// Charge .env avant tout import de modules qui instancient env.ts.
// Sans cela, tests d'intégration qui importent un adapter dépendant de
// env.ts (ex. PrismaProfilPublicReader → CLOUDFRONT_PROFILES_PUBLIC_URL,
// JoseTokenIssuer → AUTH_TOKEN_SECRET, etc.) sortent en process.exit(1).
import 'dotenv/config';
