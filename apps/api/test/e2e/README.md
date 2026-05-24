# Tests E2E Playwright — Module Conformité

Scénarios bout-en-bout qui exercent l'application complète
(navigateur → Next.js → NestJS → Postgres → S3 LocalStack).

## Prérequis runtime

```bash
# 1. Démarrer l'infra dev
docker compose -f docker-compose.dev.yml up -d

# 2. Appliquer les migrations
pnpm --filter @cv/db migrate:deploy

# 3. Seeder les utilisateurs de test (Auth.js)
pnpm --filter @cv/db seed:dev

# 4. Lancer apps/api ET apps/web
pnpm --filter @cv/api dev &
pnpm --filter @cv/web dev &

# 5. Installer les binaires Playwright (une fois)
pnpm --filter @cv/api exec playwright install chromium

# 6. Lancer les tests
pnpm --filter @cv/api test:e2e
```

Pour CI, un job composé démarre l'infra via `services:` GitHub Actions
puis lance les tests avec `PLAYWRIGHT_BASE_URL` pointant vers les
apps déployées en preview.

## Conventions

- Un test = un scénario fonctionnel bout-en-bout. Pas de tests
  unitaires déguisés.
- Les sélecteurs préfèrent les rôles ARIA (`getByRole`, `getByLabel`)
  plutôt que CSS — robustesse + cohérence avec axe-core.
- Tests `@a11y` : `pnpm test:a11y` filtre uniquement les tests
  marqués `[a11y]`.

## Scénarios couverts

| Fichier | Tâche | Scénario |
|---|---|---|
| `conformite-us1.spec.ts` | T081 | Conseiller soumet → admin approuve → statut verified |
