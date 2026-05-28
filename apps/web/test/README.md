# Tests `apps/web` — guide d'exécution

## Vue d'ensemble

| Dossier | Outil | Tag CLI | Quoi |
|---|---|---|---|
| `test/e2e/` | Playwright | `pnpm test:e2e` | Parcours utilisateur bout en bout |
| `test/a11y/` | Playwright + axe-core | `pnpm test:a11y` | Tests `@a11y` (WCAG 2.1 AA bloquants, Principe XI) |
| `test/_helpers/` | — | — | Utilitaires partagés (cookie session, etc.) |

## Tests authentifiés — pattern `test.skip(!ENV_VAR, ...)`

Beaucoup de tests sous `test/e2e/` et `test/a11y/` requièrent une
**session authentifiée** (conseiller ou admin). Le pattern adopté :

```ts
const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;

test.skip(!CONSEILLER_SESSION, 'E2E_CONSEILLER_SESSION absente.');

test('dashboard authentifié — widgets a11y @a11y', async ({ page, context }) => {
  await setupSessionCookie(context, CONSEILLER_SESSION!);
  await page.goto('/fr/conseiller');
  // ... assertions
});
```

Sans la variable d'env, les tests sautent (`skip`) sans erreur. La
couverture comportementale reste assurée par les tests d'intégration
Testcontainers côté `apps/api` qui n'ont pas besoin du navigateur.

## Activer les tests authentifiés

Trois conditions :

1. **`apps/web` démarré** avec `ENABLE_DEV_ENDPOINTS=true`
   ```bash
   ENABLE_DEV_ENDPOINTS=true DEV_SEED_TOKEN=<32+ chars> pnpm --filter @cv/web dev
   ```
2. **Variables d'environnement** pour Playwright :
   ```bash
   export E2E_SEED_ENABLED=true
   export DEV_SEED_TOKEN=<même valeur que côté apps/web>
   ```
3. **Lancer Playwright** comme d'habitude :
   ```bash
   pnpm --filter @cv/web test:a11y   # tests a11y uniquement
   pnpm --filter @cv/web test:e2e    # tests e2e uniquement
   ```

Le `globalSetup` (`test/global-setup.ts`) appelle alors
`POST /api/_dev/seed-session` pour créer un AuthUser conseiller (avec
profil `pret`) et un AuthUser admin, puis stocke leurs sessionTokens
dans `process.env.E2E_CONSEILLER_SESSION` / `E2E_ADMIN_SESSION`.
Les `test.skip(!CONSEILLER_SESSION, ...)` deviennent alors actifs.

## Refus en production

Le Route Handler `/api/_dev/seed-session` est verrouillé par triple
défense :

- `NODE_ENV === 'production'` → **404**
- `ENABLE_DEV_ENDPOINTS !== 'true'` → **404**
- `X-Dev-Seed-Authorization` absent ou ≠ `DEV_SEED_TOKEN` → **403**

Sans ces protections, ne **JAMAIS** déployer un build qui contient ce
fichier — le `tools/check-feature-boundaries.ts` CI ne le voit pas ;
c'est le code source qui doit refuser.

## CI

En CI, on n'active **pas** les tests authentifiés par défaut — les jobs
`a11y` et `lighthouse` du workflow `.github/workflows/ci.yml` lancent
les tests non-authentifiés uniquement. L'activation E2E full nécessite
un environnement de staging avec DB Postgres dédiée (préfiguration
feature 021).

## Rédiger un nouveau test authentifié

1. Importer le helper :
   ```ts
   import { setupSessionCookie } from '../_helpers/auth';
   ```
2. Déclarer le pattern skip :
   ```ts
   const SESSION = process.env.E2E_CONSEILLER_SESSION; // ou _ADMIN_
   test.skip(!SESSION, 'E2E_CONSEILLER_SESSION absente.');
   ```
3. Setter le cookie dans le test :
   ```ts
   await setupSessionCookie(context, SESSION!);
   await page.goto('/fr/conseiller/profil');
   ```
