# Runbook — Monitoring de la liste d'emails jetables

**Feature** : 002-voyageur-intake
**Cf.** [ADR-0019](../adr/0019-intake-disposable-emails-list.md), [FR-021](../../specs/002-voyageur-intake/spec.md)
**Tâche** : T140

## Pourquoi

La liste des emails jetables (`intake:disposable-emails` Redis SET) est
rafraîchie automatiquement chaque semaine par
`IntakeDisposableEmailsRefreshJob` (T098). Si ce job échoue
silencieusement plusieurs semaines, la blocklist devient stale et des
domaines jetables récents passent au travers, augmentant le bruit
anti-spam.

Ce runbook documente :
1. Comment vérifier que le job tourne.
2. Comment forcer un refresh manuel.
3. Comment gérer un échec persistant (network, GitHub down).

## Vérification de santé

### Indicateur 1 — Taille du Redis SET

```bash
docker exec cv-redis-dev redis-cli SCARD intake:disposable-emails
# attendu : ~3500+ domaines
# si < 1000 → liste corrompue ou jamais initialisée
```

En production : exporter via Grafana / Sentry métriques OpenTelemetry
`intake_disposable_emails_set_cardinality`.

### Indicateur 2 — Last refresh timestamp

Le job logge à chaque exécution :
```
[IntakeDisposableEmailsRefreshJob] Disposable list refreshed : N domains in intake:disposable-emails
```

Rechercher dans Loki/Grafana :
```
{service_name="cv-api"} |= "Disposable list refreshed"
```

Si dernier log > 14 jours → alerte. Le job devrait tourner toutes les
7 jours (env `INTAKE_DISPOSABLE_EMAILS_REFRESH_INTERVAL_HOURS=168`).

### Indicateur 3 — Métrique abuse vs config

Si `intake_brief_abuse_blocked_total{reason="disposable_email"}` est
**zéro** sur 7 jours alors qu'on attend du trafic, c'est suspect
(soit le bot trafic est nul, soit la liste ne fonctionne pas).

## Forcer un refresh manuel

```bash
# Via Nest CLI (à implémenter en Phase 8+) :
pnpm --filter @cv/api exec tsx -e "
  import { NestFactory } from '@nestjs/core';
  import { AppModule } from './src/app.module';
  import { IntakeDisposableEmailsRefreshJob } from './src/modules/intake/infrastructure/jobs/intake-disposable-emails-refresh.job';

  const app = await NestFactory.createApplicationContext(AppModule);
  const job = app.get(IntakeDisposableEmailsRefreshJob);
  const count = await job.refresh();
  console.log('Refreshed', count, 'domains');
  await app.close();
"
```

Ou plus simplement, via Adminer / psql + Redis CLI :

```bash
# 1. Récupérer la liste manuellement :
curl -s https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf \
  | grep -v '^#' | grep -v '^$' > /tmp/blocklist.txt

# 2. Reset Redis SET :
docker exec cv-redis-dev redis-cli DEL intake:disposable-emails
cat /tmp/blocklist.txt | xargs -I{} docker exec cv-redis-dev redis-cli SADD intake:disposable-emails {}

# 3. Vérifier :
docker exec cv-redis-dev redis-cli SCARD intake:disposable-emails
```

## Gestion d'un échec persistant

Si le fetch GitHub raw échoue plusieurs fois (network, GitHub down, fork
renommé), l'adapter `DisposableEmailCheckerImpl` retombe automatiquement
sur :

1. **Tier 2** — Package npm `disposable-email-domains` (~3 500 domaines
   embarqués dans le runtime Node).
2. **Tier 3** — Snapshot statique
   `packages/shared/src/intake/disposable-emails-snapshot.json` (148
   domaines majeurs).

Pas d'incident immédiat. Mais investiguer dans les 14 jours :

1. GitHub upstream toujours actif ? Si non, **mettre à jour
   `GITHUB_URL`** dans le job + commit.
2. Réseau ECS bloqué (NAT gateway down) ? → escalade infra.
3. Sandbox SES / proxy ajoutant timeout 30s ? → augmenter `AbortSignal.timeout`.

## Trigger captcha (ADR-0019)

Si malgré les 3 tiers, `intake_brief_abuse_blocked_total > 50/jour`
sur 7 jours consécutifs → activer **hCaptcha** sur `/voyage/nouveau`.
Décision documentée dans ADR-0019. Procédure :

1. Acheter une clé hCaptcha (Europe résidence, conforme Loi 25).
2. Variable env `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + secret server-side
   `HCAPTCHA_SECRET_KEY`.
3. Ajouter le composant `<HCaptcha />` dans `BriefStep5ContactConsentement`
   avant le bouton Soumettre.
4. Server Action `submitBriefAction` valide le token via API hCaptcha
   AVANT d'appeler le NestJS.
5. Mettre à jour ADR-0019 status → `accepté, captcha activé YYYY-MM-DD`.

## Références

- ADR-0019 — Liste publique GitHub + chaîne de fallback 3-tier
- spec.md FR-021
- `apps/api/src/modules/intake/infrastructure/jobs/intake-disposable-emails-refresh.job.ts`
- `apps/api/src/modules/intake/infrastructure/disposable-email-checker.ts`
- `packages/shared/src/intake/disposable-emails-snapshot.json`
