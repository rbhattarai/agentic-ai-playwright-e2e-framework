#!/usr/bin/env bash
set -e

ENV_FILE="$1"
if [ -z "$ENV_FILE" ]; then
  echo "Usage: validate-env.sh <env-file>"
  exit 2
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE"
  exit 2
fi

source <(grep -v '^#' "$ENV_FILE" | sed -n 's/^[[:space:]]*\([^=]*\)=\(.*\)$/export \1=\2/p')

missing=0
for var in APP_URL APP_NAME; do
  if [ -z "${!var}" ]; then
    echo "Missing required variable: $var"
    missing=1
  fi
done

if [ $missing -eq 1 ]; then
  echo "One or more required variables are missing in $ENV_FILE"
  exit 3
fi

echo "Env file $ENV_FILE looks OK"
exit 0
