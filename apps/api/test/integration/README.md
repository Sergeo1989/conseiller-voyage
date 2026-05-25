# Tests d'intégration — Module Conformité

Tests Vitest qui frappent une vraie base PostgreSQL avec le schéma
Prisma appliqué (migrations 0000 → 0002 incluses).

## Prérequis runtime

### Option 1 — Docker Compose dev (recommandé en local)

```bash
docker compose -f docker-compose.dev.yml up -d postgres
# Attendre que PG soit ready (~5 s)

# Appliquer les migrations dans la DB de test
DATABASE_URL="postgresql://cv:cv@localhost:5432/cv_test" \
  pnpm --filter @cv/db exec prisma migrate deploy --schema=./prisma/schema

# Lancer les tests d'intégration
DATABASE_URL="postgresql://cv:cv@localhost:5432/cv_test" \
  pnpm --filter @cv/api test:integration
```

### Option 2 — Testcontainers (CI, à activer plus tard)

Quand `testcontainers` + `@testcontainers/postgresql` seront ajoutés
aux devDependencies, les tests pourront démarrer un Postgres
éphémère par run, ce qui élimine la dépendance sur l'infra dev
locale. Voir TODO en tête de chaque fichier de test.

## Conventions

- Chaque test wrap son scénario dans une **transaction Prisma**
  rollback-à-la-fin pour ne pas polluer la DB.
- Les UUIDs littéraux suivent le pattern `00000000-0000-4000-8000-XXX`
  pour rester déterministes et facilement greppables.
- Les tests d'INVARIANT (T081a/T081b) sont marqués `[invariant]`
  dans leur describe — ils ne doivent JAMAIS être supprimés sans
  amendement constitution + ADR.

## Tests présents

| Fichier | Tâche | Couvre |
|---|---|---|
| `conformite/verified-filter.integration.test.ts` | T081a | FR-007 / U1 — filtre matériel verified-only |
| `conformite/audit-trigger.integration.test.ts` | T081b | FR-019 / U2 — trigger DB append-only |
