# ADR-0005 — Déploiement AWS ECS Fargate dans la région `ca-central-1`

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.1.0, Principe II — Vie privée et Loi 25 (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [ADR-0001 — Stockage objet AWS S3 ca-central-1](./0001-stockage-objet-canadien.md)
- [ADR-0006 — Pivot Resend vers AWS SES](./0006-pivot-resend-vers-aws-ses.md)

---

## Contexte

La plateforme se compose de trois processus runtime :
- `apps/web` — Next.js (App Router) — SSR + Server Actions.
- `apps/api` — NestJS (Fastify) — API REST métier.
- `apps/api` workers BullMQ — traitement asynchrone (notifications,
  expiration sweep, propagation cascade).

Toutes ces apps traitent du PII (Principe II) : briefs voyageurs,
documents conformité, données conseillers. Elles **DOIVENT** être hébergées
dans une région canadienne.

L'infra existante (ADR-0001 S3, ADR-0006 SES) est sur AWS `ca-central-1`.
Cohérence + IAM + réseau = avantage à rester sur AWS.

---

## Décision

**Déployer Next.js, NestJS et les workers BullMQ comme trois services AWS
ECS Fargate dans `ca-central-1`**, gérés via AWS CDK (TypeScript).

Architecture cible :

```
AWS ca-central-1
├── VPC privé (3 AZ)
│   ├── ECS Cluster `cv-prod`
│   │   ├── Service `web`       — 2 tasks Next.js (autoscale 2-6)
│   │   ├── Service `api`       — 2 tasks NestJS (autoscale 2-8)
│   │   └── Service `workers`   — 1 task BullMQ (autoscale 1-4)
│   ├── RDS PostgreSQL 16 (Multi-AZ, encryption at-rest KMS)
│   ├── ElastiCache Redis 7 (cluster mode, encryption in-transit)
│   ├── S3 buckets (ADR-0001)
│   └── SES (ADR-0006)
├── CloudFront distribution → `web` ECS (assets statiques + CDN)
├── ALB → `api` ECS (HTTPS, ACM cert)
└── Secrets Manager (cf. ADR séparé si nécessaire)
```

Configurations clés :
- **Images Docker** : distroless (node:22-alpine ou node:22-bookworm-slim),
  build multi-stage avec pnpm.
- **Health checks** : `/healthz` et `/readyz` exposés par chaque service
  (constitution Principe X).
- **Autoscaling** : basé sur CPU 70 % + p95 latency depuis CloudWatch.
- **Déploiement** : blue/green via CodeDeploy + CDK. Rollback applicatif
  reste possible 1 h (constitution, *Migrations DB*).
- **Logs** : envoyés à Grafana Cloud Canada via OTel (ADR-0003) ; backup
  CloudWatch Logs avec rétention 90 jours.
- **Secrets** : injectés via Secrets Manager ECS integration (variables
  d'environnement dynamiques au boot).

---

## Conséquences

**Positives** :
- **Cohérence parfaite** avec ADR-0001 (S3) et ADR-0006 (SES) : un seul
  compte AWS, un seul IAM, un seul VPC.
- **Résidence canadienne native** : aucun cross-region par défaut.
- **CDK TypeScript** : même langage que la stack applicative, types
  autocomplétés, diff visuel avant deploy.
- **Scalable** : auto-scaling horizontal de chaque service indépendamment.
- **Coût modéré au MVP** : ~80-150 USD/mois (2× Fargate web + 2× Fargate
  api + 1× Fargate workers + RDS db.t4g.medium + ElastiCache cache.t4g.small
  + ALB + CloudFront).

**Négatives** :
- **Plus de plomberie initiale que Vercel** : CDK setup, Dockerfile,
  CI/CD pipeline ECR + ECS, ~3-5 jours d'effort initial vs ~2 heures avec
  Vercel.
- **Pas d'image optimization automatique Next.js** comme avec Vercel. À
  configurer manuellement (custom loader CloudFront ou Sharp embedded).
- **Pas de preview environments gratuits** comme Vercel. À implémenter via
  ECS branches (CDK stack par branche), coût supplémentaire mais maîtrisable
  (~5 USD par branche/mois).
- **Cold start Fargate** : ~30-60 s pour démarrer une nouvelle task. Pas
  critique avec autoscale à 2 tasks minimum.

---

## Alternatives considérées

### Vercel pour Next.js (région YYZ Toronto) + AWS ECS pour NestJS

- **Avantages** : DX optimal Next.js (preview branches, edge cache, image
  optimization built-in), pas de plomberie pour le frontend.
- **Pourquoi rejetée** : (1) Vercel infrastructure de contrôle reste
  US-incorporée — Loi 25 à valider contractuellement avec DPA. Vercel
  propose Edge Functions en YYZ mais leur policy de réplication des données
  de configuration et logs n'est pas claire. (2) Hétérogénéité Vercel +
  AWS = deux IAM, deux observabilités, deux pipelines CI/CD.

### Fly.io (région YYZ Toronto)

- **Avantages** : DX excellente, container-native, `fly deploy` en 1
  commande. Région Toronto disponible.
- **Pourquoi rejetée** : éloigne de l'écosystème AWS déjà committé (S3,
  SES, KMS, Secrets Manager). Doublerait les modèles IAM (Fly + AWS).
  Plus jeune, moins de garanties enterprise (SLA, support DPA). À garder
  comme alternative si AWS devient coûteux.

### Google Cloud Run (région Montréal `northamerica-northeast1`)

- **Avantages** : serverless containers, billing à la requête, région
  canadienne native.
- **Pourquoi rejetée** : rompt avec l'écosystème AWS. Doublerait toute
  l'infra (Cloud SQL au lieu de RDS, Memorystore au lieu de ElastiCache,
  Cloud Storage au lieu de S3 — donc ADR-0001 à revoir entièrement).

### DigitalOcean App Platform (région Toronto)

- **Avantages** : DX très simple, prix prévisibles.
- **Pourquoi rejetée** : moins mature qu'AWS/GCP sur les services managés
  (DB backups, observabilité, IAM granulaire). Lock-in DO pour des
  capacités modestes.

---

## Plan de migration

Aucune migration nécessaire — première mise en production.

Si bascule future vers un autre fournisseur :
1. Nouvel ADR remplaçant celui-ci.
2. Images Docker portables (distroless standard), donc bascule du runtime
   essentiellement = changement de pipeline CI/CD.
3. CDK TypeScript spécifique à AWS — à réécrire selon le nouvel IaC.
4. RDS → équivalent géré ailleurs (pg_dump + restore).
5. Bascule DNS progressive.

---

## Références

- [Constitution v2.1.0](../../.specify/memory/constitution.md), Principe II (Loi 25), Principe X (Fiabilité)
- [ADR-0001 — Stockage objet](./0001-stockage-objet-canadien.md)
- [AWS — Régions canadiennes](https://aws.amazon.com/about-aws/global-infrastructure/regions_az/)
- [AWS ECS Fargate documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [AWS CDK v2 documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
