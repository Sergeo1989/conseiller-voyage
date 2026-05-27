# Runbook — Gestion des secrets `NOTIFICATIONS_*`

**Feature** : 003 (notifications + courriel transactionnel)
**Secrets concernés** :

| Variable | Format | Stockage prod | Stockage dev |
|---|---|---|---|
| `NOTIFICATIONS_EMAIL_HASH_PEPPER` | 32 octets base64 (256 bits) | AWS Secrets Manager `ca-central-1` → `cv/notifications/email-hash-pepper` | 1Password CLI → `op://Conseiller Voyage Dev/notifications-pepper` |
| `NOTIFICATIONS_SNS_HMAC_SECRET` | 32 octets base64 (256 bits) | AWS Secrets Manager `ca-central-1` → `cv/notifications/sns-hmac-secret` | 1Password CLI → `op://Conseiller Voyage Dev/notifications-sns-hmac` |

Ces secrets sont **critiques** :

- Le **pepper** rend les hash de la suppression list non-réversibles.
  Sans lui, un dump DB permet la reconstruction des emails ayant
  bouncé/complaint via rainbow tables (CAI considère un hash non-salé
  comme PII identifiable).
- Le **HMAC secret SNS** authentifie les events SES → SNS → Lambda →
  backend. Sans lui, un attaquant peut spammer le webhook backend
  avec des faux bounces pour saturer la suppression list.

---

## Procédure de provisioning initiale (one-shot, dev local — T013, T014)

### Pepper hash emails

```bash
# Génération
PEPPER=$(openssl rand -base64 32)

# Stockage 1Password (dev)
op item create \
  --category=password \
  --title='notifications-pepper' \
  --vault='Conseiller Voyage Dev' \
  password="$PEPPER" \
  notesPlain='Pepper HMAC-SHA-256 pour hash emails — feature 003. Ne PAS rotater sans procédure formelle (cf. research.md R6).'
```

### HMAC secret SNS

```bash
SNS_SECRET=$(openssl rand -base64 32)

op item create \
  --category=password \
  --title='notifications-sns-hmac' \
  --vault='Conseiller Voyage Dev' \
  password="$SNS_SECRET" \
  notesPlain='Secret HMAC partagé Lambda ↔ NestJS SnsWebhookGuard — feature 003.'
```

### Chargement en dev local

`.env.local` (généré depuis 1Password CLI au démarrage) :

```bash
# Avant `pnpm dev`
export NOTIFICATIONS_EMAIL_HASH_PEPPER=$(op read "op://Conseiller Voyage Dev/notifications-pepper/password")
export NOTIFICATIONS_SNS_HMAC_SECRET=$(op read "op://Conseiller Voyage Dev/notifications-sns-hmac/password")
```

Ou via `op run` (recommandé) :

```bash
op run --env-file=.env.local.template -- pnpm dev
```

Où `.env.local.template` contient :

```
NOTIFICATIONS_EMAIL_HASH_PEPPER=op://Conseiller Voyage Dev/notifications-pepper/password
NOTIFICATIONS_SNS_HMAC_SECRET=op://Conseiller Voyage Dev/notifications-sns-hmac/password
```

---

## Procédure de provisioning prod (T015 — exécution ops avant go-live)

### Pré-requis

- Compte AWS production avec accès Secrets Manager `ca-central-1`.
- IAM role ECS task `cv-api-prod` avec policy minimale lecture des
  secrets `cv/notifications/*` (cf. CDK stack T093).

### Création des secrets

```bash
# Dans la console AWS ou via CLI :
PEPPER=$(openssl rand -base64 32)
aws secretsmanager create-secret \
  --region ca-central-1 \
  --name cv/notifications/email-hash-pepper \
  --description 'Pepper HMAC-SHA-256 pour hash emails — feature 003 — pas de rotation automatique' \
  --secret-string "{\"current\":\"$PEPPER\",\"previous\":[]}"

SNS_SECRET=$(openssl rand -base64 32)
aws secretsmanager create-secret \
  --region ca-central-1 \
  --name cv/notifications/sns-hmac-secret \
  --description 'Secret HMAC partagé Lambda ↔ NestJS — feature 003' \
  --secret-string "$SNS_SECRET"
```

### Vérification

Le boot du service NestJS doit logger (info) :

```
[@cv/api] Loaded NOTIFICATIONS_EMAIL_HASH_PEPPER from Secrets Manager (current + 0 previous)
[@cv/api] Loaded NOTIFICATIONS_SNS_HMAC_SECRET from Secrets Manager
```

Si le secret est indisponible au boot → **fail-fast** (le service refuse
de démarrer, cf. plan.md modes dégradés `Secrets Manager HS`).

---

## Rotation (procédure de crise — fuite avérée)

⚠️ La rotation du pepper a une **limitation Loi 25** : les rows déjà
effacées (`recipientEmailClear = null`) ne peuvent pas être re-hashées.
Cf. research.md R6 — les peppers historiques sont conservés
**indéfiniment** dans la liste `previous` pour matcher les vieilles
suppression list entries.

### 1. Annoncer la maintenance

Slack `#ops-page` :

> Maintenance secret notifications de 30 min — la suppression list pourrait avoir 30 sec de latence accrue le temps de la propagation.

### 2. Générer le nouveau pepper

```bash
NEW_PEPPER=$(openssl rand -base64 32)
OLD_PEPPER=$(aws secretsmanager get-secret-value --secret-id cv/notifications/email-hash-pepper --query SecretString --output text | jq -r '.current')
PREVIOUS=$(aws secretsmanager get-secret-value --secret-id cv/notifications/email-hash-pepper --query SecretString --output text | jq -c '.previous')

# Construire la nouvelle valeur : current = NEW, previous = [OLD, ...previous]
NEW_SECRET=$(jq -n --arg new "$NEW_PEPPER" --arg old "$OLD_PEPPER" --argjson prev "$PREVIOUS" \
  '{current: $new, previous: ([$old] + $prev)}')

aws secretsmanager update-secret \
  --secret-id cv/notifications/email-hash-pepper \
  --secret-string "$NEW_SECRET"
```

### 3. Recharger les services

Redémarrage rolling des tâches ECS `api` et `api-worker` (CodeDeploy ou
`aws ecs update-service --force-new-deployment`).

### 4. Vérifier

- Test : un envoi nouveau produit un hash avec le NEW pepper.
- Test : une suppression list entry ancienne reste matchée (le service
  essaie chaque pepper de la liste).

---

## Suppression / révocation d'urgence

Si compromission **certaine** :

1. Renommer immédiatement le secret en `cv/notifications/email-hash-pepper-COMPROMISED-YYYY-MM-DD`
   (empêche le service de le lire mais conserve l'historique pour
   investigation).
2. Provisionner un nouveau secret sous le nom original.
3. Redémarrer les services.
4. Audit : grep `notification_audit_entries` sur la période suspectée.
5. Notifier la CAI Québec sous 72h (Loi 25 art. 63.8 — incident de
   confidentialité).

---

## Tests CI

- `pnpm --filter @cv/api test:integration -- secrets-loader.integration.spec.ts`
  vérifie que le service refuse de démarrer si le secret est absent.
- `pnpm --filter @cv/api test:integration -- pepper-rotation.integration.spec.ts`
  vérifie le matching multi-pepper.
