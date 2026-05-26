# Runbook — Rotation de `AUTH_TOKEN_SECRET`

**Feature** : 002 (auth conseiller + admin)
**Variable** : `AUTH_TOKEN_SECRET` (32 octets base64, stocké AWS Secrets Manager prod)

## Quand

- Suspicion de fuite du secret.
- Rotation préventive annuelle (recommandé).
- Compromission d'un opérateur ayant eu accès au secret.

## Effet de la rotation

Tous les JWT signés avec l'ancien secret deviennent invalides immédiatement :

- Liens de vérification email en attente → 400 INVALID_OR_EXPIRED_TOKEN
- Liens de reset password en attente (TTL 1h) → idem
- Liens d'invitation admin en attente (TTL 72h) → idem

Les **sessions ouvertes** (cookies `__Host-cv.session.token`) ne sont **PAS** affectées — elles utilisent un token de session DB, pas un JWT.

## Procédure (single-secret MVP)

### 1. Annoncer la maintenance (T-15 min)

Communiquer dans Slack #ops :
> Maintenance auth de 15 min — les liens email envoyés dans la dernière heure pourraient ne plus fonctionner. Les utilisateurs concernés pourront en redemander un.

### 2. Générer le nouveau secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Mettre à jour AWS Secrets Manager

```bash
aws secretsmanager update-secret \
  --secret-id cv-auth-token-secret \
  --secret-string "$NEW_SECRET" \
  --region ca-central-1
```

### 4. Rolling restart des tâches ECS

```bash
aws ecs update-service \
  --cluster cv-prod \
  --service cv-api \
  --force-new-deployment \
  --region ca-central-1
```

Attendre que toutes les tâches soient en `RUNNING` avec la nouvelle config.

### 5. Vérifier post-rotation

- Signup test → vérifier que l'email reçu contient un lien fonctionnel
- Tester un reset password → idem
- Surveiller les logs Pino côté API : 400 INVALID_OR_EXPIRED_TOKEN attendus pour les vieux JWT, pas d'erreur 500

### 6. Communiquer la fin

> Maintenance auth terminée. Si vous avez des liens email d'avant la maintenance, demandez-en un nouveau via le bouton de renvoi.

## Évolution future (post-MVP)

Pour permettre la rotation sans casser les liens en vol, implémenter
le **double-secret** :

- `AUTH_TOKEN_SECRET` (nouveau)
- `AUTH_TOKEN_SECRET_PREVIOUS` (ancien, accepté pour vérif uniquement, jamais utilisé pour signer)

Le verifyToken accepte les deux. Les invitations admin (TTL 72h) survivent à la rotation. À implémenter si la rotation devient fréquente (politique > 1/an).

## Lien

- Research R10 (`specs/006-auth-conseiller-admin/research.md`)
