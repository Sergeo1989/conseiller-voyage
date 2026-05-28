// T026 — Clients AWS SDK v3 (S3, SES, Secrets Manager).
// Credentials via task role ECS en prod (cf. ADR-0005), via env vars
// en dev local (LocalStack — voir docker-compose.dev.yml).

import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
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

/**
 * S3 — désactive le checksum CRC32 auto introduit par AWS SDK v3 fin 2024.
 *
 * Pourquoi : depuis ~v3.730, le SDK ajoute un header
 *   x-amz-sdk-checksum-algorithm=CRC32
 * sur tous les PutObject. Pour les uploads PRESIGNÉS (browser PUT direct
 * vers S3 via URL signée côté serveur), ce header n'est PAS inclus dans
 * la signature → l'upload échoue avec 400 BadRequest.
 *
 * `WHEN_REQUIRED` n'active le checksum que si l'opération l'exige
 * vraiment (rare). C'est le réglage recommandé par AWS pour les
 * workflows presignés. Cf.
 *   https://github.com/aws/aws-sdk-js-v3/issues/6810
 *   https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html
 *
 * Compatible LocalStack ET AWS prod.
 */
export const s3Client = new S3Client({
  ...baseConfig,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export const sesClient = new SESv2Client(baseConfig);
export const secretsManagerClient = new SecretsManagerClient(baseConfig);

/**
 * CloudFront — utilisé pour les invalidations CDN cross-cache (feature 007,
 * FR-014 + C2). En dev local CloudFront n'existe pas ; l'adapter détecte
 * l'absence de DISTRIBUTION_ID et no-op (la page Next.js ISR suffit pour le
 * dev). En prod, region globale `us-east-1` exigée par AWS.
 */
export const cloudFrontClient = new CloudFrontClient({
  ...baseConfig,
  // CloudFront API est globale mais nécessite us-east-1 comme region pour
  // l'authentification signature v4.
  region: 'us-east-1',
});
