#!/usr/bin/env bash
set -e

SERVICE="lys"
REGION="europe-west1"
PROJECT="cykt-399216"

if [ ! -f .env ]; then
  echo "❌ .env file not found"
  exit 1
fi

ENV_VARS=$(grep -v '^#' .env | grep -v '^$' | tr '\n' ',' | sed 's/,$//')

echo "Deploying $SERVICE ($REGION)..."

if command -v gcloud &>/dev/null; then
  GCLOUD=gcloud
elif [ -f "$HOME/.claude/bin/gcloud" ]; then
  GCLOUD="$HOME/.claude/bin/gcloud"
else
  echo "❌ gcloud not found"
  exit 1
fi

$GCLOUD run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --set-env-vars "$ENV_VARS"

echo "Deploy terminé"
echo "Service URL: https://$SERVICE-267131866578.$REGION.run.app"
