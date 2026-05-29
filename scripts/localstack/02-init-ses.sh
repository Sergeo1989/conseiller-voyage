#!/usr/bin/env bash
# Script d'init LocalStack pour le service SES — exécuté automatiquement
# quand LocalStack est "ready" (montage volume → /etc/localstack/init/ready.d/,
# cf. docker-compose.dev.yml).
#
# Cible la parité avec ADR-0006 (SES ca-central-1 en prod) :
#   - Crée les verified identities utilisées par les features qui envoient
#     des courriels transactionnels (auth, conformité, intake, ...).
#
# En LocalStack, la création d'identité est suffisante pour autoriser
# l'envoi (pas de DKIM/SPF/DMARC à valider). En prod, la setup est
# documentée dans docs/runbooks/ses-setup.md.
#
# Idempotent : on peut le rejouer sans crash.

set -euo pipefail

REGION="ca-central-1"

# Liste des identités à provisionner. Une ligne = un email expéditeur.
# Ajouter une nouvelle ligne quand une nouvelle feature introduit un
# nouveau "from" (cf. issue tracker + ADR-0006).
SENDER_IDENTITIES=(
  "auth-noreply@conseiller-voyage.local"        # feature 002 + 005 + 006
  "conformite-noreply@conseiller-voyage.local"  # feature 001
  "intake-noreply@conseiller-voyage.local"      # feature 002-voyageur-intake (T009)
)

echo "[localstack-init] Configuration identités SES (${REGION})"

for IDENTITY in "${SENDER_IDENTITIES[@]}"; do
  if awslocal sesv2 get-email-identity \
      --email-identity "${IDENTITY}" \
      --region "${REGION}" >/dev/null 2>&1; then
    echo "[localstack-init] Identity ${IDENTITY} déjà existante — skip."
  else
    awslocal sesv2 create-email-identity \
      --email-identity "${IDENTITY}" \
      --region "${REGION}"
    echo "[localstack-init] ✓ Identity ${IDENTITY} créée."
  fi
done

echo "[localstack-init] Setup SES terminé."
