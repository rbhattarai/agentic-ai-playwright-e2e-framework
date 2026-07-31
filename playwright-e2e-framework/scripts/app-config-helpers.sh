#!/usr/bin/env bash

APP_CONFIG_FILE="apps.config.json"
APP_CONFIG_READER="$(dirname "${BASH_SOURCE[0]}")/app-config-reader.js"

ensure_app_config_exists() {
  if [ ! -f "$APP_CONFIG_FILE" ]; then
    echo "❌ apps.config.json not found!"
    echo "   Please create apps.config.json with your app configurations"
    exit 1
  fi
}

list_configured_apps() {
  node "$APP_CONFIG_READER" list-apps "$APP_CONFIG_FILE"
}

parse_app_selection() {
  local APP_SELECTION=$1
  local APP_KEY=${APP_SELECTION%%:*}
  local PROFILE_NAME=""

  if [[ "$APP_SELECTION" == *:* ]]; then
    PROFILE_NAME=${APP_SELECTION#*:}
  fi

  printf '%s\t%s\n' "$APP_KEY" "$PROFILE_NAME"
}

load_cert_config() {
  local APP_KEY=$1
  local PROFILE_NAME=$2

  node "$APP_CONFIG_READER" resolve-cert-config "$APP_CONFIG_FILE" "$APP_KEY" "$PROFILE_NAME"
}

print_cert_config_error() {
  local APP_KEY=$1
  local PROFILE_NAME=$2
  local ERROR_OUTPUT=$3

  if echo "$ERROR_OUTPUT" | grep -q '^APP_NOT_FOUND'; then
    echo "   ❌ App '$APP_KEY' not found in apps.config.json"
  elif echo "$ERROR_OUTPUT" | grep -q '^PROFILE_NOT_FOUND'; then
    echo "   ❌ Profile '${PROFILE_NAME:-}' not found for app '$APP_KEY'"
  else
    echo "$ERROR_OUTPUT"
  fi
}