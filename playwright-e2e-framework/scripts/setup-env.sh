#!/usr/bin/env bash
# ===========================================================
# ENVIRONMENT SETUP
# ===========================================================
# This script sets up the environment for test execution
# Usage: source scripts/setup-env.sh

set -euo pipefail

export NO_PROXY="127.0.0.1,localhost,*.org,.org,.amazonaws.com"
export CI="${CI:-false}"

# Determine environment
ENV=${ENV:-dev}
export ENV

echo ""
echo "🌍 Setting up environment: $ENV"

# Set isCI variable
if [ "$CI" = "true" ]; then
  isCI=true
  echo "   Running in CI mode"
else
  isCI=false
  
  # Load environment file
  # Priority: .env.<env> --> .<env>.env -> .env
  if [ -n "$ENV" ] && [ -f ".env.$ENV" ]; then
    ENV_FILE=".env.$ENV"
  elif [ -n "$ENV" ] && [ -f ".$ENV.env" ]; then
    ENV_FILE=".$ENV.env"
  elif [ -f .env ]; then
    ENV_FILE=".env"
  else
    ENV_FILE=""
  fi

  export ENV_FILE
  
  if [ -n "$ENV_FILE" ]; then
    echo "   Loading: $ENV_FILE"
    source "$ENV_FILE"
  else
    echo "   ❌ No .env file found for environment '$ENV'"
    echo "   Tried: .env.$ENV, .$ENV.env, .env"
    exit 1
  fi
fi

# Validate APP_URL for single-app mode
if [ -z "$APPS" ] && [ -z "$APP_URL" ]; then
  echo "   ⚠️  APP_URL not set"
fi

echo "   ✅ Environment configured"
