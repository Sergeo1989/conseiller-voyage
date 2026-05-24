// T030c — Sentry self-hosted via EC2 + Docker Compose officiel.
// Cf. ADR-0007. Sentry self-hosted nécessite Postgres + ClickHouse + Redis +
// Snuba + Vroom + plusieurs workers. ECS Fargate est mal adapté à cette
// topologie ; EC2 single-node avec docker-compose est le pattern recommandé
// par Sentry. Pour HA véritable, migrer vers Kubernetes (hors scope MVP).

import { Stack, type StackProps, aws_ec2 as ec2 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

interface SentryStackProps extends StackProps {
  vpc: ec2.IVpc;
}

export class SentryStack extends Stack {
  constructor(scope: Construct, id: string, props: SentryStackProps) {
    super(scope, id, props);

    const securityGroup = new ec2.SecurityGroup(this, 'SentrySecurityGroup', {
      vpc: props.vpc,
      description: 'Sentry self-hosted — access from VPN admin only',
      allowAllOutbound: true,
    });
    // TODO : restreindre ingress 9000 (Sentry web) à l'IP VPN admin uniquement

    // Userdata : install Docker + Compose, clone sentry self-hosted, run install.
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf install -y docker git',
      'systemctl enable --now docker',
      'curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose',
      'chmod +x /usr/local/bin/docker-compose',
      'git clone --depth 1 https://github.com/getsentry/self-hosted.git /opt/sentry',
      'cd /opt/sentry && ./install.sh --no-user-prompt',
      'cd /opt/sentry && docker compose up -d',
    );

    new ec2.Instance(this, 'SentryHost', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      // Sentry recommande 16 GB RAM minimum.
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.XLARGE),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(200, { encrypted: true }),
        },
      ],
      userData,
    });

    // TODO : EBS snapshots quotidiens via AWS Backup, CloudWatch alerting,
    //        TLS terminé sur ALB privé avec ACM cert.
  }
}
