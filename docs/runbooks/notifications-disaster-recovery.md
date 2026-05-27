# Runbook — Récupération après incident (notifications transactionnelles)

**Responsable** : équipe on-call  
**SLO** : RTO 4 h, RPO 24 h (constitution Principe X)  
**Dashboard** : [`cv-notifications-deliverability`](../dashboards/notifications.json)

---

## Scénario 1 — SNS / Lambda HS

**Symptôme** : Alerte Grafana `notification-sns-events-idle` (aucun event SNS reçu depuis > 15 min).

**Impact** : La boucle de feedback bounce/complaint/delivery est interrompue.
Les emails continuent d'être envoyés via SES, mais la `suppression_list` n'est
plus alimentée automatiquement.

**Actions** :

1. Vérifier le statut Lambda `cv-bounces-handler` dans la console AWS
   (`ca-central-1`).
2. Vérifier les erreurs Lambda dans CloudWatch Logs :
   ```bash
   aws logs tail /aws/lambda/cv-bounces-handler --follow --region ca-central-1
   ```
3. Vérifier la file SNS : la rétention native SNS est 14 jours — les events sont
   toujours présents pour replay.
4. Si la Lambda est en erreur : redéployer depuis le dernier artifact CDK :
   ```bash
   pnpm --filter @cv/infra cdk deploy CvNotificationsStack --region ca-central-1
   ```
5. Après rétablissement : rejouer les events SNS accumulés (subscription filter
   `RedrivePolicy` sur la DLQ SNS).
6. Confirmer la reprise : l'alerte `notification-sns-events-idle` doit se lever
   dans les 15 min suivant le replay.

---

## Scénario 2 — AWS Secrets Manager HS

**Symptôme** : `NOTIFICATIONS_EMAIL_HASH_PEPPER` ou `NOTIFICATIONS_SNS_HMAC_SECRET`
non disponibles au boot → worker crash au démarrage.

**Impact** : Aucun email envoyé, worker BullMQ ne démarre pas.

**Actions** :

1. Vérifier le statut Secrets Manager dans la console AWS (`ca-central-1`).
2. Si interruption de service AWS : basculer temporairement sur la valeur en variable
   d'environnement ECS Task Definition (en clair — procédure d'urgence uniquement,
   rotation immédiate post-incident).
3. Mettre à jour la Task Definition ECS :
   ```bash
   aws ecs update-service --cluster cv-cluster --service cv-api \
     --force-new-deployment --region ca-central-1
   ```
4. Post-incident : remettre la lecture via Secrets Manager, **effacer** la variable
   d'environnement en clair de la Task Definition.

---

## Scénario 3 — DNS HS (domaine expéditeur)

**Symptôme** : Bounces en masse (alerte `notification-bounce-rate-high`), ou
soft bounces SMTP `550 5.1.1 The email account that you tried to reach does not exist`.

**Impact** : Réputation SES dégradée → risque de suspension du compte SES.

**Actions** :

1. Vérifier l'identité de domaine SES dans la console AWS :
   état DKIM et SPF.
2. Vérifier la zone DNS (Route 53 ou registrar) :
   - Enregistrements CNAME DKIM toujours présents.
   - `v=spf1 include:amazonses.com ~all` présent.
3. Si le domaine est expiré : renouveler en urgence, restaurer les enregistrements.
4. Pendant l'indisponibilité DNS : mettre en pause la queue BullMQ :
   ```bash
   # Pause via Redis CLI
   redis-cli -u $REDIS_URL XADD notifications:control '*' action pause
   ```
5. Post-rétablissement DNS : vérifier que l'identité SES repasse en "Verified",
   puis reprendre la queue.

---

## Scénario 4 — Base de données primaire HS

**Symptôme** : Prisma error `Can't reach database server` dans les logs API.

**Impact** : Aucun log d'envoi créé, aucune suppression list consultable.
Les jobs BullMQ en mémoire Redis survivent au crash DB.

**Actions** :

1. Le mode dégradé NestJS : les jobs BullMQ échouent avec retry exponentiel
   (max 5, dead-letter après 5 échecs) — RPO 24 h maintenu.
2. Activer le replica RDS en read-write (failover Aurora ou promotion read replica) :
   ```bash
   aws rds failover-db-cluster --db-cluster-identifier cv-postgres \
     --region ca-central-1
   ```
3. Mettre à jour `DATABASE_URL` en Secrets Manager vers le nouveau endpoint.
4. Redémarrer le service ECS :
   ```bash
   aws ecs update-service --cluster cv-cluster --service cv-api \
     --force-new-deployment --region ca-central-1
   ```
5. Vérifier les dead-letter dans la console admin
   `/admin/notifications/dead-letter` et retry si nécessaire.
