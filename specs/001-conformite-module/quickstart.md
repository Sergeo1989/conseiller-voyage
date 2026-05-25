# Quickstart — Module Conformité

**Date** : 2026-05-22

Comment monter le module conformité en local pour développement et test.

---

## Pré-requis

- Node.js 22 LTS
- pnpm 9+
- Docker Desktop (pour Postgres, Redis, MinIO)
- Compte Doppler (ou équivalent) configuré pour les secrets de dev

---

## Setup initial du monorepo (à faire une seule fois)

```bash
# Cloner et installer
git clone <repo> conseiller-voyage
cd conseiller-voyage
pnpm install

# Démarrer les services de support
docker compose -f docker-compose.dev.yml up -d
# Démarre :
#   - postgres:16 sur localhost:5432 (db: cv_dev, user: cv_dev, pwd: cv_dev)
#   - redis:7 sur localhost:6379
#   - localstack sur localhost:4566 (S3, SES, KMS, Secrets Manager émulés)

# Configurer les secrets dev via 1Password CLI
op signin                      # première fois seulement
# → tous les `pnpm dev:*` ci-dessous sont lancés via `op run -- ...`

# Migrer la DB
pnpm --filter @cv/api db:migrate

# Seed un admin de développement
pnpm --filter @cv/api db:seed:dev
# → crée un admin: admin@cv.local / mot-de-passe-dev
```

---

## Lancer le module en développement

Une seule commande Turborepo orchestre les trois apps avec injection
secrets via 1Password CLI :

```bash
op run -- pnpm dev
# → Turborepo lance en parallèle :
#   - @cv/web (Next.js)        sur http://localhost:3000
#   - @cv/api (NestJS Fastify) sur http://localhost:3001
#   - @cv/api workers (BullMQ) en arrière-plan
```

Lint, format, typecheck (Biome + tsc) :

```bash
pnpm lint           # Biome lint (erreurs bloquantes)
pnpm format         # Biome format en place
pnpm typecheck      # tsc --noEmit
```

Pre-commit : Husky + lint-staged exécutent automatiquement `pnpm lint` et
`pnpm typecheck` sur les fichiers modifiés. Commit message validé par
commitlint (Conventional Commits obligatoires).

---

## Parcours de test manuel (US1 — MVP)

### 1. Créer un compte conseiller

> Dépend du module identité. Pour ce développement, on suppose un compte
> existant via le seed. Sinon, ouvrir le spec `000-module-identite` ou
> stubber l'auth.

```
URL: http://localhost:3000/connexion
Connexion conseiller: dev-conseiller@cv.local / mot-de-passe-dev
```

### 2. Soumettre un dossier de conformité

```
URL: http://localhost:3000/conformite/soumettre

Formulaire :
- Certificat CCV : numéro test, expires 2027-05-22
- Affiliation : Agence Test, permis OPC 5000-1234, QC
- Téléverser un PDF de test (< 5 MB)
- Cocher consentement
- Soumettre
```

→ Vérifier dans la console NestJS :
- log `dossier.submitted` avec `submissionId`
- log `audit.appended` avec `eventType=dossier.submitted`

### 3. Approuver le dossier en tant qu'admin

```
URL: http://localhost:3000/admin/conformite
Connexion admin: admin@cv.local / mot-de-passe-dev

→ Voir le dossier dans la file (paginated 20/page)
→ Cliquer pour visualiser
→ Cliquer "Approuver" avec commentaire optionnel
```

→ Vérifier :
- Statut conseiller passe à `verified` en DB :
  ```sql
  SELECT status FROM conformite_conseiller_compliances
  WHERE conseiller_id = '<dev-conseiller-uuid>';
  -- → 'verified'
  ```
- Événement `conformite.status.changed` publié (visible dans les logs).
- Le conseiller reçoit notification (courriel simulé en dev via MailHog ou similaire).

### 4. Tester la propagation cross-module

```bash
# Depuis un module fictif "matching" (script de test)
pnpm --filter @cv/api exec ts-node scripts/test-conformite-query.ts dev-conseiller-uuid

# Output attendu :
# { conseillerId: '...', verified: true, lastVerifiedAt: '2026-05-22T...', found: true }
```

### 5. Tester le mode strict (transition négative)

```bash
# Révoquer en admin
curl -X POST http://localhost:3001/api/v1/conformite/admin/conseillers/<id>/revoke \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"reason":"Test de propagation immédiate dans le quickstart."}'

# Consommer en strict immédiatement après (< 10 s)
pnpm --filter @cv/api exec ts-node scripts/test-conformite-query.ts <id> --strict

# Output attendu (< 10 secondes) :
# { conseillerId: '...', verified: false, lastVerifiedAt: '<datetime de la dernière vérification>', found: true }
```

---

## Exécuter les tests

```bash
# Tests unitaires Vitest (incluant les fonctions pures Principe VI)
pnpm --filter @cv/api test:unit

# Tests d'intégration (Nest TestingModule avec fakes en mémoire)
pnpm --filter @cv/api test:integration

# Tests e2e Playwright (full stack)
pnpm test:e2e --filter conformite

# Audit accessibilité axe-core
pnpm --filter @cv/web test:a11y
```

---

## Vérifications de conformité avant merge

À cocher dans le PR description (cf. Definition of Done de la constitution) :

- [ ] Tests TDD : commits `test:` séparés des commits `feat:` pour les fonctions pures (`computeConformiteStatus`, `isTransitionAllowed`, `validateDossierSubmission`).
- [ ] `pnpm lint && pnpm typecheck` : zéro erreur.
- [ ] `pnpm test:unit && pnpm test:integration` : passent.
- [ ] `pnpm test:a11y` : zéro erreur critique.
- [ ] Migration Prisma : exécutée en staging, rollback applicatif vérifié.
- [ ] Documents stockés en `ca-central-1` (ou MinIO local en dev).
- [ ] Tableau de bord d'observabilité créé et lié dans `apps/api/src/modules/conformite/README.md`.
- [ ] ADR-0001 (stockage objet) accepté.
- [ ] Audit log table protégée par trigger PostgreSQL (`trg_conformite_audit_block_updates`).
- [ ] Header `Idempotency-Key` accepté sur toutes les mutations.
- [ ] CSP, HSTS, X-Content-Type-Options en place via Helmet.
- [ ] Validation Zod côté serveur sur toutes les routes.
- [ ] Pas de `dangerouslySetInnerHTML`, pas de SQL brut, pas de secret en clair.

---

## Variables d'environnement requises

À configurer dans Doppler (dev) :

```dotenv
# Backend NestJS
DATABASE_URL=postgresql://cv_dev:cv_dev@localhost:5432/cv_dev
REDIS_URL=redis://localhost:6379

# Stockage objet (MinIO en dev, S3 en prod ca-central-1)
AWS_REGION=ca-central-1
AWS_S3_BUCKET=cv-conformite-dev
AWS_S3_ENDPOINT=http://localhost:9000   # MinIO en dev
AWS_ACCESS_KEY_ID=<doppler>
AWS_SECRET_ACCESS_KEY=<doppler>
AWS_KMS_KEY_ID=<doppler>                 # pour SSE-KMS en prod

# Sécurité
SESSION_SECRET=<doppler, rotation mensuelle>
IDEMPOTENCY_KEY_TTL_SECONDS=604800       # 7 jours

# Cache et propagation
CONFORMITE_STATUS_CACHE_TTL_SECONDS=60
CONFORMITE_PUBSUB_CHANNEL=conformite.status.changed

# Observabilité
OTEL_EXPORTER_OTLP_ENDPOINT=<doppler>
LOG_LEVEL=debug
```
