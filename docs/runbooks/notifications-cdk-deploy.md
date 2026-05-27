# Runbook — Déploiement CDK stack notifications (T094)

## Pré-requis

- AWS CLI configuré avec profil `cv-deploy` (région `ca-central-1`)
- Node.js ≥ 20 + pnpm installé
- CDK bootstrapped : `pnpm cdk bootstrap aws://ACCOUNT_ID/ca-central-1`

## Déploiement initial

```bash
cd infra/cdk
pnpm install
pnpm cdk deploy NotificationsStack-prod --profile cv-deploy --require-approval broadening
```

## Variables de sortie importantes

Après déploiement, noter les `CfnOutput` :

| Output | Usage |
|--------|-------|
| `NotificationsSnsTopicArn` | Configurer la souscription Lambda dans AWS Console |
| `NotificationsConfigSetName` | Valeur de `NOTIFICATIONS_SES_CONFIG_SET` dans Secrets Manager |
| `NotificationsEmailHashPepperSecretArn` | ARN pour `NOTIFICATIONS_EMAIL_HASH_PEPPER` |
| `NotificationsSnsHmacSecretArn` | ARN pour `NOTIFICATIONS_SNS_HMAC_SECRET` |

## Rotation des secrets

Les secrets Secrets Manager sont auto-générés. Pour rotation manuelle :

```bash
aws secretsmanager rotate-secret \
  --secret-id <NotificationsSnsHmacSecretArn> \
  --profile cv-deploy
```

Après rotation du HMAC secret, redéployer la Lambda bounces handler pour prendre la nouvelle valeur.

## Vérification post-déploiement

1. Vérifier que le ConfigurationSet SES est actif :
   ```bash
   aws sesv2 get-configuration-set \
     --configuration-set-name notifications-prod \
     --profile cv-deploy
   ```

2. Envoyer un email de test via SES sandbox et vérifier l'event Delivery dans CloudWatch Logs de la Lambda.

3. Exécuter le script de simulation :
   ```bash
   NOTIFICATIONS_SNS_HMAC_SECRET=$(aws secretsmanager get-secret-value --secret-id <ARN> --query SecretString --output text) \
   tsx scripts/dev/simulate-sns-bounce.ts bounce test@example.com
   ```

## Rollback

```bash
pnpm cdk destroy NotificationsStack-prod --profile cv-deploy
```

Les Secrets Manager ne sont pas supprimés automatiquement (protection). Supprimer manuellement si nécessaire.

## Contacts

- Incidents SES : `#ops-page` Slack
- Alertes DLQ/bounce : voir `docs/dashboards/notifications-alerts.yaml`
