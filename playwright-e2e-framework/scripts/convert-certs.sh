#!/usr/bin/env bash
# ===========================================================
# CERTIFICATE CONVERSION UTILITIES
# ===========================================================
# This script provides functions for converting certificates
# Usage: source scripts/convert-certs.sh

set -euo pipefail

find_certificate_file() {
  local MATCH_TYPE=$1
  local MATCH_VALUE=$2

  case "$MATCH_TYPE" in
    exact|glob|"")
      find certs -maxdepth 1 -type f -name "$MATCH_VALUE" 2>/dev/null | head -n 1
      ;;
    regex)
      find certs -maxdepth 1 -type f 2>/dev/null | grep -E "$MATCH_VALUE" | head -n 1 || true
      ;;
    *)
      echo "   ❌ Unsupported certificate match type: $MATCH_TYPE" >&2
      exit 1
      ;;
  esac
}

# Function to convert p12/pfx to PEM format
convert_p12_to_pem() {
  local APP_KEY=$1
  local CERT_ALIAS=$2
  local MATCH_TYPE=$3
  local MATCH_VALUE=$4
  local PASSWORD_VAR=$5
  
  mkdir -p certs
  
  echo "   🔐 Processing certificate for: $APP_KEY"
  
  # Find the certificate file
  P12_FILE=$(find_certificate_file "$MATCH_TYPE" "$MATCH_VALUE")
  
  if [ -z "$P12_FILE" ]; then
    echo "   ❌ No certificate file found matching: $MATCH_TYPE=$MATCH_VALUE"
    echo "      Please add the certificate to certs/ directory"
    exit 1
  fi
  
  echo "   📄 Found certificate: $P12_FILE"
  
  CERT_FILE="certs/${APP_KEY}_${CERT_ALIAS}_cert.pem"
  KEY_FILE="certs/${APP_KEY}_${CERT_ALIAS}_key.pem"
  
  # Get password from environment variable
  PASSWORD_BASE64=$(eval echo \$$PASSWORD_VAR)
  
  if [ -n "$PASSWORD_BASE64" ]; then
    CERT_PASSWORD=$(echo "$PASSWORD_BASE64" | base64 -d)
  else
    echo "   ❌ Missing $PASSWORD_VAR in environment"
    exit 1
  fi
  
  # Convert if not already converted
  if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "   📜 Converting to PEM format..."
    
    if [ -n "$CERT_PASSWORD" ]; then
      openssl pkcs12 -in "$P12_FILE" -clcerts -nokeys -out "$CERT_FILE" -passin pass:"$CERT_PASSWORD" -legacy 2>/dev/null || \
        openssl pkcs12 -in "$P12_FILE" -clcerts -nokeys -out "$CERT_FILE" -passin pass:"$CERT_PASSWORD"
      openssl pkcs12 -in "$P12_FILE" -nocerts -nodes -out "$KEY_FILE" -passin pass:"$CERT_PASSWORD" -legacy 2>/dev/null || \
        openssl pkcs12 -in "$P12_FILE" -nocerts -nodes -out "$KEY_FILE" -passin pass:"$CERT_PASSWORD"
    else
      # Try without password
      openssl pkcs12 -in "$P12_FILE" -clcerts -nokeys -out "$CERT_FILE" -passin pass: 2>/dev/null || true
      openssl pkcs12 -in "$P12_FILE" -nocerts -nodes -out "$KEY_FILE" -passin pass: 2>/dev/null || true
    fi
    
    echo "   ✅ Generated: $CERT_FILE"
    echo "   ✅ Generated: $KEY_FILE"
  else
    echo "   ℹ️  Using existing PEM files"
  fi
}
