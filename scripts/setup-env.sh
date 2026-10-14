#!/bin/bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

# Never replace existing configuration or copy secrets between files.
for target in .env .env.local; do
  if [ -e "$target" ]; then
    printf 'Keeping existing %s unchanged.\n' "$target"
  else
    cp -- .env.example "$target"
    printf 'Created %s from the hosted Studio template.\n' "$target"
  fi
done

printf '%s\n' \
  'Set Rayu service URLs and the backend-matching RAYU_STUDIO_SERVER_SECRET.' \
  'Connect AI providers and service integrations through Studio Settings, not env keys.' \
  'For Compose build variables in .env.local, use:' \
  'docker compose --env-file .env --env-file .env.local --profile production up --build'
