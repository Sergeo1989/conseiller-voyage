# Runbook — Rotation de `INTAKE_MAGIC_LINK_SECRET`

**Feature** : 002-voyageur-intake (module intake / préqualification voyageur)
**Variable** : `INTAKE_MAGIC_LINK_SECRET` (32+ octets, stocké AWS Secrets Manager prod `cv-intake-magic-link-secret`)
**Cf.** [research.md R1](../../specs/002-voyageur-intake/research.md), tâche T008.

## Pourquoi

Le secret signe le HMAC SHA-256 du magic link voyageur de vérification email
(FR-013). Bien que le magic link soit aussi backé par un random token DB
(R1), le HMAC garantit que le contenu de l'URL ne peut pas être forgé sans
le secret. La rotation préventive **annuelle** limite la fenêtre d'exposition
en cas de compromission silencieuse.

## Quand rotationner

- **Annuel** : rotation préventive (recommandé janvier de chaque année).
- **Incident** : suspicion de fuite du secret (dump DB, logs exposés, ex-employé).
- **Compromission opérateur** : tout humain ayant eu accès au secret quitte ou change de périmètre.

## Effet de la rotation

Tous les magic links **non encore consommés** signés avec l'ancien secret
restent valides pendant la **grace period de 14 jours** (le système accepte
les 2 secrets pendant cette période). Au-delà, les anciens magic links
retournent `401 Unauthorized → page lien-expire` (FR-015).

Les briefs **déjà vérifiés** ne sont pas affectés — leur cookie session
voyageur (`__Host-cv.intake.token`) utilise un opaque token DB, pas un
HMAC (rolling renewal 7j, FR-014a).

## Procédure (rotation avec grace period 14j)

### 1. Annoncer en interne (T-1 jour)

Communiquer dans #ops :

> Rotation `INTAKE_MAGIC_LINK_SECRET` demain X:00. Grace period 14 jours
> (les magic links voyageurs en attente restent valides). Aucune action
> voyageur requise.

### 2. Générer le nouveau secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

(48 octets hex = 96 chars — bien au-delà du min 32 imposé par la validation Zod.)

### 3. Stocker la version courante et la version next dans Secrets Manager

```bash
# La valeur actuelle devient l'ancien secret (grace period)
aws secretsmanager update-secret \
  --secret-id cv-intake-magic-link-secret-previous \
  --secret-string "$CURRENT_SECRET" \
  --region ca-central-1

# La nouvelle valeur devient le secret courant
aws secretsmanager update-secret \
  --secret-id cv-intake-magic-link-secret \
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

Le code lit `INTAKE_MAGIC_LINK_SECRET` (courant — signe les nouveaux) et
`INTAKE_MAGIC_LINK_SECRET_PREVIOUS` (ancien — accepte les anciens en
vérification uniquement) depuis l'environnement.

Attendre que toutes les tâches soient en `RUNNING` avec la nouvelle config.

### 5. Vérifier post-rotation

- Soumettre un brief de test via `/voyage/nouveau` → vérifier que le magic
  link reçu fonctionne (POST `/api/intake/briefs/verify` → 200, brief
  passe en `active`).
- Tester un ancien magic link (envoyé avant rotation) → doit fonctionner
  pendant 14 jours, puis être rejeté à J+14.
- Surveiller Pino côté API : aucun crash, taux d'erreur `401` sur les
  verify magic link ne doit pas dépasser le baseline pré-rotation +1%.

### 6. Supprimer l'ancien secret (T+14 jours)

```bash
aws secretsmanager delete-secret \
  --secret-id cv-intake-magic-link-secret-previous \
  --recovery-window-in-days 7 \
  --region ca-central-1
```

(Recovery window 7j = filet de sécurité en cas de besoin de revert.)

Puis retirer la lecture de `INTAKE_MAGIC_LINK_SECRET_PREVIOUS` du code
(commit de cleanup) et redéployer.

## Variables connexes (pas rotées dans ce runbook)

| Variable | Sensibilité | Rotation |
|---|---|---|
| `INTAKE_RATE_LIMIT_EMAIL_PER_24H` | Config, pas un secret | À ajuster sur signal métrique (anti-abus) |
| `INTAKE_RATE_LIMIT_IP_PER_24H` | Config, pas un secret | Idem |
| `INTAKE_BRIEF_EXPIRATION_DAYS` | Config, pas un secret | Constitutionnel (Loi 25) — ne pas changer sans amendement |
| `INTAKE_DISPOSABLE_EMAILS_REFRESH_INTERVAL_HOURS` | Config, pas un secret | Ajustable selon le rythme upstream |

## Rollback

Si après rotation un incident sévère apparaît (ex: tous les nouveaux magic
links rejetés à cause d'un bug de signature) :

1. Inverser les valeurs `cv-intake-magic-link-secret` et `cv-intake-magic-link-secret-previous` dans Secrets Manager.
2. `aws ecs update-service ... --force-new-deployment`.
3. Investigation post-mortem AVANT de retenter la rotation.

## Audit

Toute rotation **DOIT** être loggée dans `docs/runbooks/audit-log.md` (à
créer si absent) avec : date, opérateur (humain), motif (préventif /
incident), ticket Linear / GitHub Issue de référence.
