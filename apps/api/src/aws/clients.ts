// T026 — Clients AWS SDK v3 (S3, SES, Secrets Manager).
// Credentials via task role ECS en prod (cf. ADR-0005), via env vars
// en dev local (LocalStack — voir docker-compose.dev.yml).

import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { env } from '../env';

const baseConfig = {
  region: env.AWS_REGION,
  ...(env.AWS_S3_ENDPOINT && {
    endpoint: env.AWS_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
};

export const s3Client = new S3Client(baseConfig);
export const sesClient = new SESv2Client(baseConfig);
export const secretsManagerClient = new SecretsManagerClient(baseConfig);
