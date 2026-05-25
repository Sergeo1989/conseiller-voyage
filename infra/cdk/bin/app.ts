#!/usr/bin/env tsx
// T030 / T030c — Entrée CDK pour Conseiller Voyage.
// Stacks instanciées :
//   - CvProdStack : VPC, ECS Cluster, RDS, ElastiCache, S3, IAM
//   - SentryStack : EC2 self-hosted Sentry (cf. ADR-0007)
// Toutes les ressources en région ca-central-1 (Loi 25 / Principe II).

import { App } from 'aws-cdk-lib';
import { CvProdStack } from '../lib/cv-prod-stack';
import { SentryStack } from '../lib/sentry-stack';

const app = new App();

const env = {
  region: 'ca-central-1',
  account: process.env.CDK_DEFAULT_ACCOUNT,
};

const prod = new CvProdStack(app, 'CvProd', {
  env,
  description: 'Conseiller Voyage — production stack (ca-central-1)',
});

new SentryStack(app, 'CvSentry', {
  env,
  description: 'Sentry self-hosted (ADR-0007)',
  vpc: prod.vpc,
});

app.synth();
