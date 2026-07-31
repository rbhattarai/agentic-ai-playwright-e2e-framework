#!/usr/bin/env bash
# ===========================================================
# MULTI-APP CONFIGURATION
# ===========================================================
# This script configures multiple applications for testing
# Usage: source scripts/multi-app-setup.sh

set -euo pipefail

# Source certificate conversion functions
source "$(dirname "${BASH_SOURCE[0]}")/convert-certs.sh"
source "$(dirname "${BASH_SOURCE[0]}")/app-config-helpers.sh"

load_all_apps_from_config() {
  echo "📱 Loading all apps from apps.config.json..."

  APPS=$(list_configured_apps)

  if [ -z "$APPS" ]; then
    echo "❌ No apps found in apps.config.json"
    exit 1
  fi

  echo "   Found apps: $APPS"
}

read_cert_config_values() {
  local CERT_CONFIG_OUTPUT=$1

  CERT_ENABLED=""
  CERT_TYPE=""
  CERT_ALIAS=""
  MATCH_TYPE=""
  MATCH_VALUE=""
  PASSWORD_VAR=""
  SELECTED_PROFILE=""

  while IFS=$'\t' read -r KEY VALUE; do
    case "$KEY" in
      enabled) CERT_ENABLED="$VALUE" ;;
      profileName) SELECTED_PROFILE="$VALUE" ;;
      type) CERT_TYPE="$VALUE" ;;
      certAlias) CERT_ALIAS="$VALUE" ;;
      matchType) MATCH_TYPE="$VALUE" ;;
      matchValue) MATCH_VALUE="$VALUE" ;;
      passwordEnvVar) PASSWORD_VAR="$VALUE" ;;
    esac
  done <<< "$CERT_CONFIG_OUTPUT"
}

configure_app_certificate() {
  local APP_SELECTION=$1
  local APP_KEY
  local PROFILE_NAME
  local CERT_CONFIG

  IFS=$'\t' read -r APP_KEY PROFILE_NAME <<< "$(parse_app_selection "$APP_SELECTION")"

  echo ""
  echo "🔧 Configuring: $APP_KEY"
  if [ -n "$PROFILE_NAME" ]; then
    echo "   🎯 Requested profile: $PROFILE_NAME"
  fi

  CERT_CONFIG=$(load_cert_config "$APP_KEY" "$PROFILE_NAME" 2>&1) || {
    print_cert_config_error "$APP_KEY" "$PROFILE_NAME" "$CERT_CONFIG"
    exit 1
  }

  read_cert_config_values "$CERT_CONFIG"

  if [ -z "$CERT_ENABLED" ]; then
    echo "   ❌ App '$APP_KEY' not found in apps.config.json"
    exit 1
  fi

  if [ "$CERT_ENABLED" != "true" ]; then
    echo "   🔓 No certificate required"
    return
  fi

  if [ -n "$SELECTED_PROFILE" ]; then
    echo "   🪪 Using certificate profile: $SELECTED_PROFILE"
  fi

  if [ "$CERT_TYPE" = "p12-to-pem" ] || [ "$CERT_TYPE" = "pfx-to-pem" ]; then
    convert_p12_to_pem "$APP_KEY" "$CERT_ALIAS" "$MATCH_TYPE" "$MATCH_VALUE" "$PASSWORD_VAR"
  elif [ "$CERT_TYPE" = "custom-pem" ]; then
    echo "   ℹ️  Using custom PEM certificates (paths from environment)"
  fi
}

setup_multi_app() {
  local APPS=$1
  
  echo ""
  echo "🚀 MULTI-APP MODE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  ensure_app_config_exists
  
  # If no apps specified, load all apps from apps.config.json
  if [ -z "$APPS" ]; then
    load_all_apps_from_config
  else
    echo "📱 Apps to configure: $APPS"
  fi
  
  export ACTIVE_APPS="$APPS"
  
  # Parse apps and process each one
  IFS=',' read -ra APP_ARRAY <<< "$APPS"
  
  for APP_SELECTION in "${APP_ARRAY[@]}"; do
    APP_SELECTION=$(echo "$APP_SELECTION" | xargs) # trim whitespace
    configure_app_certificate "$APP_SELECTION"
  done
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ All apps configured successfully"
  echo ""
}
