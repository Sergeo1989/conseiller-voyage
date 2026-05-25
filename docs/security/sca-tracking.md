# SCA Tracking — Dépendances vulnérables

**Snapshot au 2026-05-25** (premier scan post-merge feature 001).
**Politique** : CI bloque sur `critical` ; les `high` sont **warnings** en
attendant le major upgrade NestJS 10 → 11 + Fastify 4 → 5.

## Critical (1)

| Package | Version | Patched | Path | Action |
|---|---|---|---|---|
| `@fastify/middie` | 8.3.3 | ≥ 9.3.2 | apps/api > @nestjs/platform-fastify@10.4.22 | Major NestJS 11 (cf. plan ci-dessous) |

## High (15)

| Package | Version | Patched | Path principal |
|---|---|---|---|
| `@fastify/middie` | 8.3.3 | ≥ 9.1.0, ≥ 9.2.0, ≥ 9.3.2 | @nestjs/platform-fastify (3 advisories) |
| `fastify` | 4.28.1 | ≥ 5.7.2 | @nestjs/platform-fastify |
| `@nestjs/platform-fastify` | 10.4.22 | ≥ 11.1.14, ≥ 11.1.16 | direct dep |
| `@opentelemetry/sdk-node` | 0.55.0 | ≥ 0.217.0 | direct + transitive |
| `@opentelemetry/auto-instrumentations-node` | 0.51.0 | ≥ 0.75.0 | direct |
| `glob` | 10.4.5 | ≥ 10.5.0 | transitive via @fastify/static, license-checker |
| `rollup` | 3.29.5 | ≥ 3.30.0 | transitive via @sentry/nextjs |
| `picomatch` | 4.0.1 | ≥ 4.0.4 | transitive via @nestjs/cli (dev only) |
| `lodash` | 4.17.21 | ≥ 4.18.0 (n'existe pas) | transitive via @nestjs/swagger — faux positif probable |
| `fast-uri` | 2.4.0 | ≥ 3.1.1, ≥ 3.1.2 | transitive via fastify |

## Plan de remédiation

### Étape 1 — Quick wins via overrides (< 1 h, low risk)

Ajouter `pnpm.overrides` dans le `package.json` racine pour forcer les
versions patched des **transitives** :

```json
"pnpm": {
  "overrides": {
    "glob@>=10.2.0 <10.5.0": "10.5.0",
    "rollup@>=3.0.0 <3.30.0": "3.30.0",
    "picomatch@>=4.0.0 <4.0.4": "4.0.4",
    "fast-uri@<3.1.2": "3.1.2"
  }
}
```

Couvre 4 vulnérabilités HIGH sans breaking change. À tester en local
avec `pnpm install` + `pnpm test` + `pnpm build` avant push.

### Étape 2 — Major upgrade NestJS 11 + Fastify 5 (~4-6 h, medium risk)

NestJS 11 (release Q1 2026) supporte Fastify 5 natif. Migration :

1. `pnpm --filter @cv/api up @nestjs/common @nestjs/core @nestjs/platform-fastify @nestjs/bullmq @nestjs/swagger @nestjs/throttler @nestjs/testing --latest`
2. Adapter les changements breaking (Fastify 5 plugins, `app.useGlobalGuards` signature, etc.)
3. Lancer tous les tests integration en local
4. Si Pino transport change, adapter
5. Tag : `v0.2.0-nestjs11`

Couvre 6 vulnérabilités HIGH + 1 CRITICAL.

### Étape 3 — OpenTelemetry SDK upgrade (~2-3 h, medium risk)

OpenTelemetry JS a fait des breaking changes API entre 0.55 et 0.75
puis à nouveau jusqu'à 0.217.

1. Lire les changelogs majeurs (en particulier les renamings de span
   processors et de resource detectors).
2. `pnpm --filter @cv/api up @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node --latest`
3. Adapter `apps/api/src/common/observability/otel.ts` aux nouveaux noms.
4. Vérifier les exports métier (custom metrics) sont toujours collectés
   correctement en local + Grafana Cloud.

Couvre 2 vulnérabilités HIGH.

### Étape 4 — Lodash via @nestjs/swagger (~30 min, low risk)

Le `lodash <=4.17.23` advisory réfère à `_.template` injection. Mais
**`lodash` n'a pas de version >= 4.18.0 publiée** (la lib s'est arrêtée à
4.17.x). C'est un faux positif : `@nestjs/swagger` n'utilise pas
`_.template`. Action : whitelist via `pnpm.overrides` ou ignorer l'advisory.

Confirmation manuelle :

```bash
grep -r "_.template\|lodash/template" node_modules/@nestjs/swagger
# devrait retourner vide
```

### Étape 5 — fastify-cookie / @fastify/middie via NestJS 11 (étape 2 le couvre)

## SLA cible

Conformément à la constitution §*Chaîne d'approvisionnement* :

- **Critical** : sous 7 jours du first scan
- **High** : sous 30 jours du first scan

Pour la critique actuelle (`@fastify/middie`), date limite = **2026-06-01**.
Pour les 15 HIGH, date limite = **2026-06-24**.

## Renovate à activer après merge feature 001

Configurer Renovate sur le repo GitHub pour automation des PR mineurs et
patches hebdomadaires. Major upgrades restent manuels.

Référence : https://docs.renovatebot.com/configuration-options/
