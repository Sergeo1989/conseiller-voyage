// T030 — Stack production CDK pour Conseiller Voyage.
// VPC, ECS Cluster, RDS PostgreSQL Multi-AZ, ElastiCache Redis, S3 buckets,
// KMS, IAM, ALB. Région ca-central-1 (Loi 25 — Principe II).
//
// État : squelette compilable et synthétisable. Le wiring final des Fargate
// Services (web, api, workers) avec leurs images Docker, secrets et
// task roles est à compléter en Phase 3+ quand les apps seront prêtes
// à déployer. Cf. ADR-0005.

import {
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticache as elasticache,
  aws_kms as kms,
  aws_rds as rds,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class CvProdStack extends Stack {
  public readonly vpc: ec2.IVpc;
  public readonly documentsBucket: s3.IBucket;
  public readonly database: rds.IDatabaseInstance;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- Réseau ---
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 3,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // --- Clé KMS partagée (chiffrement S3, RDS, Secrets Manager) ---
    const kmsKey = new kms.Key(this, 'KmsKey', {
      alias: 'alias/cv-prod',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
      description: 'Conseiller Voyage — KMS key partagée pour SSE',
    });

    // --- S3 bucket pour les documents conformité (ADR-0001) ---
    this.documentsBucket = new s3.Bucket(this, 'ConformiteDocuments', {
      bucketName: 'cv-conformite-prod',
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'AbortIncompleteMultipartUpload',
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          id: 'TransitionToDeepArchiveAfter24Months',
          transitions: [
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(730),
            },
          ],
        },
      ],
      serverAccessLogsPrefix: 's3-access-logs/',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // --- RDS PostgreSQL Multi-AZ ---
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: this.vpc,
      description: 'Access to RDS PostgreSQL',
      allowAllOutbound: false,
    });

    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      storageEncrypted: true,
      storageEncryptionKey: kmsKey,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      deleteAutomatedBackups: false,
      removalPolicy: RemovalPolicy.RETAIN,
      securityGroups: [dbSecurityGroup],
      enablePerformanceInsights: true,
    });

    // --- ElastiCache Redis (sessions, BullMQ, cache statut conformité) ---
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      description: 'Access to Redis',
      allowAllOutbound: false,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnets for Redis cluster',
      subnetIds: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
    });

    new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: 'Conseiller Voyage — Redis (sessions, BullMQ, cache)',
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t4g.small',
      numCacheClusters: 2,
      automaticFailoverEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
    });

    // --- ECS Cluster ---
    new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
      clusterName: 'cv-prod',
      containerInsights: true,
    });

    // --- Services Fargate à wiring ultérieur ---
    // TODO Phase 3+ :
    //   - FargateService 'web'      → image Next.js, health /healthz, 2-6 tasks
    //   - FargateService 'api'      → image NestJS, health /readyz, 2-8 tasks
    //   - FargateService 'workers'  → BullMQ workers, pas de health HTTP, 1-4 tasks
    //   - ALB en front + CloudFront en CDN + ACM cert
    //   - Secrets Manager : DATABASE_URL, AUTH_SECRET, SENTRY_DSN, etc.
    //   - Task roles IAM par service (least privilege)
  }
}
