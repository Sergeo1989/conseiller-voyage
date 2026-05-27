// T093 — NotificationsStack (CDK TypeScript).
//
// Infrastructure pour les notifications transactionnelles SES + SNS :
//   1. SNS topic `notifications-ses-events` (ca-central-1).
//   2. SES Configuration Set `notifications-prod` / `notifications-staging`
//      avec event destination → topic SNS (Bounce/Complaint/Delivery).
//   3. Lambda `lambda-bounces-handler` souscrite au topic.
//   4. IAM roles least-privilege pour la Lambda.
//   5. Secrets Manager : pepper email hash + HMAC SNS secret.
//
// ADR-0005 : AWS ECS Fargate ca-central-1. Tout en région canadienne.

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

export interface NotificationsStackProps extends cdk.StackProps {
  readonly stage: 'prod' | 'staging';
  readonly apiUrl: string;
}

export class NotificationsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NotificationsStackProps) {
    super(scope, id, {
      ...props,
      env: { region: 'ca-central-1', ...props.env },
    });

    const suffix = props.stage === 'prod' ? '' : `-${props.stage}`;

    // -------------------------------------------------------------------------
    // Secrets Manager
    // -------------------------------------------------------------------------

    const emailHashPepperSecret = new secretsmanager.Secret(this, 'EmailHashPepper', {
      secretName: `conseiller-voyage${suffix}/notifications/email-hash-pepper`,
      description: 'HMAC pepper for email address hashing (notifications suppression list)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ pepper: '' }),
        generateStringKey: 'pepper',
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const snsHmacSecret = new secretsmanager.Secret(this, 'SnsHmacSecret', {
      secretName: `conseiller-voyage${suffix}/notifications/sns-hmac-secret`,
      description: 'HMAC secret shared between Lambda bounces handler and NestJS API',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ secret: '' }),
        generateStringKey: 'secret',
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    // -------------------------------------------------------------------------
    // SNS topic
    // -------------------------------------------------------------------------

    const sesTopic = new sns.Topic(this, 'SesEventsTopic', {
      topicName: `notifications-ses-events${suffix}`,
      displayName: `Conseiller Voyage — SES events (${props.stage})`,
    });

    // -------------------------------------------------------------------------
    // Lambda bounces handler
    // -------------------------------------------------------------------------

    const lambdaRole = new iam.Role(this, 'BouncesLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    snsHmacSecret.grantRead(lambdaRole);

    const bouncesLambda = new lambda.Function(this, 'BouncesHandler', {
      functionName: `cv-bounces-handler${suffix}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../../apps/lambda-bounces-handler/dist'),
      role: lambdaRole,
      environment: {
        NOTIFICATIONS_SNS_HMAC_SECRET: snsHmacSecret.secretValueFromJson('secret').unsafeUnwrap(),
        NOTIFICATIONS_API_URL: props.apiUrl,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: `Parse SES bounce/complaint/delivery events and forward to ${props.apiUrl}`,
    });

    sesTopic.addSubscription(new snsSubscriptions.LambdaSubscription(bouncesLambda));

    // -------------------------------------------------------------------------
    // SES Configuration Set
    // -------------------------------------------------------------------------

    const configSetName = `notifications${suffix}`;

    new ses.CfnConfigurationSet(this, 'SesConfigurationSet', {
      name: configSetName,
    });

    new ses.CfnConfigurationSetEventDestination(this, 'SesEventDestination', {
      configurationSetName: configSetName,
      eventDestination: {
        name: 'SnsDestination',
        enabled: true,
        matchingEventTypes: ['bounce', 'complaint', 'delivery', 'renderingFailure', 'reject'],
        snsDestination: {
          topicArn: sesTopic.topicArn,
        },
      },
    });

    // -------------------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------------------

    new cdk.CfnOutput(this, 'SesTopicArn', {
      value: sesTopic.topicArn,
      description: 'SNS topic ARN for SES events',
    });

    new cdk.CfnOutput(this, 'SesConfigSetName', {
      value: configSetName,
      description: 'SES Configuration Set name (use in NOTIFICATIONS_SES_CONFIG_SET env var)',
    });

    new cdk.CfnOutput(this, 'EmailHashPepperSecretArn', {
      value: emailHashPepperSecret.secretArn,
      description: 'ARN of the email hash pepper secret',
    });

    new cdk.CfnOutput(this, 'SnsHmacSecretArn', {
      value: snsHmacSecret.secretArn,
      description: 'ARN of the SNS HMAC secret',
    });
  }
}
