# Runbook — Génération et provisioning des secrets feature 004 (mentions légales)

**Public cible** : DevOps, SecOps, premier déploiement de la feature 004.
**Pré-requis** : 1Password CLI installé (`op`), AWS CLI configuré pour le rôle de déploiement.

---

## Secrets concernés

| Variable d'environnement | Usage | Longueur | Rotation |
|---|---|---|---|
| `LEGAL_COOKIE_HMAC_SECRET` | Signature HMAC-SHA256 du cookie `__Host-cv.legal-version` (ADR-0009) | 64 bytes (hex 128 chars) | Tous les 90 jours, ou immédiatement sur fuite |
| `LOI25_SUBJECT_ANONYMIZATION_SALT` | Sel SHA-256 du `subjectId` pour `LegalAcceptanceAnonymization` (ADR-0008) | 32 bytes (hex 64 chars) | **Jamais après production** (sinon historique anonymisé incompatible) |

> ⚠️ **Salt anonymisation = clé maître Loi 25.** Cf. ADR-0008 *plan d'incident* : la fuite du salt impose une procédure d'urgence (lock down DB + audit CloudTrail + notification CAI).

---

## 1. Génération des valeurs

Les deux secrets sont des chaînes hexadécimales aléatoires générées via OpenSSL :

```bash
# HMAC du cookie (64 bytes / 128 chars hex)
openssl rand -hex 64

# Salt anonymisation Loi 25 (32 bytes / 64 chars hex)
openssl rand -hex 32
```

Sortie attendue : deux chaînes hex pures, aucun préfixe, aucun espace.

---

## 2. Dev local — 1Password CLI

```bash
# Identifie l'item du vault dev
op item create \
  --category=password \
  --title="LEGAL_COOKIE_HMAC_SECRET (dev)" \
  --vault="Engineering Dev" \
  password="$(openssl rand -hex 64)"

op item create \
  --category=password \
  --title="LOI25_SUBJECT_ANONYMIZATION_SALT (dev)" \
  --vault="Engineering Dev" \
  password="$(openssl rand -hex 32)"
```

Récupération côté `.env.local` :

```bash
echo "LEGAL_COOKIE_HMAC_SECRET=$(op read 'op://Engineering Dev/LEGAL_COOKIE_HMAC_SECRET (dev)/password')" >> apps/api/.env.local
echo "LOI25_SUBJECT_ANONYMIZATION_SALT=$(op read 'op://Engineering Dev/LOI25_SUBJECT_ANONYMIZATION_SALT (dev)/password')" >> apps/api/.env.local
```

---

## 3. Staging / Prod — AWS Secrets Manager (ca-central-1)

### 3.1 Création initiale (premier déploiement uniquement)

```bash
# 1. Génère la valeur
HMAC_VAL=$(openssl rand -hex 64)
SALT_VAL=$(openssl rand -hex 32)

# 2. Crée les deux secrets dans ca-central-1
aws secretsmanager create-secret \
  --region ca-central-1 \
  --name cv/legal/cookie-hmac-secret \
  --description "HMAC-SHA256 secret for cv.legal-version cookie signature (ADR-0009). Rotated every 90d." \
  --secret-string "$HMAC_VAL" \
  --tags Key=Feature,Value=004-mentions-legales Key=Sensitivity,Value=high

aws secretsmanager create-secret \
  --region ca-central-1 \
  --name cv/legal/subject-anonymization-salt \
  --description "SHA-256 salt for subjectId hashing in LegalAcceptanceAnonymization (Loi 25, ADR-0008). DO NOT ROTATE in production." \
  --secret-string "$SALT_VAL" \
  --tags Key=Feature,Value=004-mentions-legales Key=Sensitivity,Value=critical Key=Compliance,Value=loi25

# 3. Nettoie les variables locales
unset HMAC_VAL SALT_VAL
```

### 3.2 Récupération au runtime (ECS Fargate task)

Le `taskDefinition` du service Identité doit déclarer ces secrets en injection :

```typescript
// infra/cdk/lib/identite-stack.ts — extrait à ajouter au moment du premier déploiement
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as ecs from 'aws-cdk-lib/aws-ecs';

const cookieHmac = Secret.fromSecretNameV2(this, 'LegalCookieHmac', 'cv/legal/cookie-hmac-secret');
const anonSalt = Secret.fromSecretNameV2(this, 'LegalAnonSalt', 'cv/legal/subject-anonymization-salt');

taskDef.addContainer('api', {
  // ...
  secrets: {
    LEGAL_COOKIE_HMAC_SECRET: ecs.Secret.fromSecretsManager(cookieHmac),
    LOI25_SUBJECT_ANONYMIZATION_SALT: ecs.Secret.fromSecretsManager(anonSalt),
  },
});
```

### 3.3 Rotation HMAC (90 jours)

```bash
NEW_VAL=$(openssl rand -hex 64)
aws secretsmanager update-secret \
  --region ca-central-1 \
  --secret-id cv/legal/cookie-hmac-secret \
  --secret-string "$NEW_VAL"
unset NEW_VAL

# Redémarre les services pour qu'ils prennent la nouvelle valeur
aws ecs update-service \
  --region ca-central-1 \
  --cluster cv-prod \
  --service identite-api \
  --force-new-deployment
```

> ⚠️ **Fenêtre de transition** : les cookies déjà émis avec l'ancien HMAC seront invalides après redémarrage. Le middleware doit traiter une signature invalide comme « cookie absent » (et donc déclencher une nouvelle vérification de version), pas comme une attaque. Cf. `contracts/middleware-version-check.md` cas 1 (forge detection).

### 3.4 Rotation salt anonymisation — **PROCÉDURE D'URGENCE UNIQUEMENT**

Cf. ADR-0008 section *Plan d'incident*. Ne jamais exécuter en routine — l'historique anonymisé existant deviendrait incompatible (impossible de re-hasher un sujet déjà supprimé).

---

## 4. Audit CloudTrail

Active CloudTrail data events sur les deux secrets (T099) :

```bash
aws cloudtrail put-event-selectors \
  --region ca-central-1 \
  --trail-name cv-prod-audit \
  --event-selectors '[{
    "ReadWriteType": "All",
    "IncludeManagementEvents": true,
    "DataResources": [{
      "Type": "AWS::SecretsManager::Secret",
      "Values": [
        "arn:aws:secretsmanager:ca-central-1:*:secret:cv/legal/subject-anonymization-salt-*",
        "arn:aws:secretsmanager:ca-central-1:*:secret:cv/legal/cookie-hmac-secret-*"
      ]
    }]
  }]'
```

Alerte SecOps (cf. `docs/runbooks/legal-incident-response.md`) sur tout `GetSecretValue` hors du rôle d'exécution `cv-prod-api-task-role`.

---

## 5. Vérification post-déploiement

Health check au démarrage de l'API (cf. T098 — `apps/api/src/health/health.controller.ts`) :

```bash
curl -sf https://api.staging.conseillervoyage.ca/health/legal
# attendu : {"hmacSecret":"ok","anonymizationSalt":"ok"}
```

Si la lecture des secrets échoue, le service doit refuser de démarrer (Principe IX — pas de fallback silencieux).

---

## Références

- [ADR-0008 — Anonymisation Loi 25 hash salé immutable](../adr/0008-anonymisation-loi25-hash-sale-immutable.md)
- [ADR-0009 — Middleware cookie HMAC version CGU](../adr/0009-middleware-cookie-hmac-version-cgu.md)
- [Plan feature 004](../../specs/004-mentions-legales/plan.md)
- [Constitution Principe IX — Sécurité applicative](../../.specify/memory/constitution.md)
