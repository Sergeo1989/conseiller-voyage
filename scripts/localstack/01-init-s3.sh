#!/usr/bin/env bash
# Script d'init LocalStack — exécuté automatiquement quand LocalStack est "ready"
# (montage volume → /etc/localstack/init/ready.d/, cf. docker-compose.dev.yml).
#
# Cible la parité avec ADR-0001 (S3 ca-central-1 en prod) :
#   - Crée le bucket cv-conformite-dev
#   - Configure CORS pour autoriser les uploads presignés depuis le navigateur
#     (origin http://localhost:3000 = apps/web en dev)
#   - Active versioning (parité prod : audit + recovery accidentelle)
#
# Idempotent : on peut le rejouer sans crash.

set -euo pipefail

BUCKET="cv-conformite-dev"
WEB_ORIGIN="http://localhost:3000"

echo "[localstack-init] Configuration bucket S3 : ${BUCKET}"

# 1. Création du bucket (no-op si déjà existant)
if awslocal s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "[localstack-init] Bucket ${BUCKET} déjà existant — skip create."
else
  awslocal s3 mb "s3://${BUCKET}"
  echo "[localstack-init] ✓ Bucket ${BUCKET} créé."
fi

# 2. CORS — autorise les uploads presignés direct browser → S3
#    En prod ca-central-1, même config mais avec l'origin réelle du domaine.
awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration "{
  \"CORSRules\": [
    {
      \"AllowedHeaders\": [\"*\"],
      \"AllowedMethods\": [\"GET\", \"PUT\", \"POST\", \"DELETE\", \"HEAD\"],
      \"AllowedOrigins\": [\"${WEB_ORIGIN}\"],
      \"ExposeHeaders\": [\"ETag\"],
      \"MaxAgeSeconds\": 3000
    }
  ]
}"
echo "[localstack-init] ✓ CORS configuré (origin ${WEB_ORIGIN})."

# 3. Versioning — parité avec la prod (récupération accidentelle + audit)
awslocal s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled
echo "[localstack-init] ✓ Versioning activé."

echo "[localstack-init] Setup S3 terminé."
