// Constantes partagées par les Server Actions auth.
// L'URL de l'API NestJS n'est pas dans la lib http générique parce que
// les actions auth (signup, login, reset) ne forwardent PAS le cookie
// session par défaut — c'est un cas particulier voulu (signup public).

export const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
