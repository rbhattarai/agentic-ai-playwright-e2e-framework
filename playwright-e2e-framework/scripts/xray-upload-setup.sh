#!/bin/bash

###############################################################################
# Script: xray-upload-setup.sh
# Description: Setup CA certificates for Xray upload
# Usage: ./scripts/xray-upload-setup.sh
# Environment Variables:
#   - XRAY_CA_PEM_BASE64: Base64 encoded CA certificate (optional)
###############################################################################

set -e

echo "========================================="
echo "🔐 Setting up Xray CA Certificate"
echo "========================================="

# Check if reports directory exists
if [ ! -d "reports" ]; then
  echo "❌ Error: reports directory not found"
  echo "Make sure tests have been executed before running xray upload"
  exit 1
fi

echo "Reports directory contents:"
ls -la reports || true
echo ""

# Setup CA certificate if provided
if [ -n "$XRAY_CA_PEM_BASE64" ]; then
  echo "Preparing CA PEM from XRAY_CA_PEM_BASE64..."
  
  # Remove any carriage returns and write candidate
  printf '%s' "$XRAY_CA_PEM_BASE64" | tr -d '\r' > /tmp/xray_ca_candidate
  
  # Try to decode as base64; if it fails, treat as raw PEM
  if printf '%s' "$XRAY_CA_PEM_BASE64" | base64 -d > ca.pem 2>/tmp/ca_err; then
    echo "✅ Decoded XRAY_CA_PEM_BASE64 as base64 into ca.pem"
  else
    echo "⚠️  XRAY_CA_PEM_BASE64 did not decode as base64; writing raw PEM content to ca.pem"
    cat /tmp/xray_ca_candidate > ca.pem
  fi
  
  # Export CA certificate path
  export XRAY_CA_CERT_PATH=$PWD/ca.pem
  export NODE_EXTRA_CA_CERTS=$PWD/ca.pem
  
  echo ""
  echo "Validating CA certificate..."
  if openssl x509 -in ca.pem -noout -subject -issuer -fingerprint; then
    echo "✅ CA certificate is valid"
    ls -lh ca.pem || true
  else
    echo "❌ Error: CA PEM is not a valid certificate!"
    exit 1
  fi
  
  echo ""
  echo "Environment variables set:"
  echo "  XRAY_CA_CERT_PATH=$XRAY_CA_CERT_PATH"
  echo "  NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS"
else
  echo "⚠️  No XRAY_CA_PEM_BASE64 provided; skipping CA setup"
  echo "Xray upload will use system default CA certificates"
fi

echo ""
echo "Proxy configuration:"
echo "  http_proxy: ${http_proxy:-<not set>}"
echo "  https_proxy: ${https_proxy:-<not set>}"
echo "  no_proxy: ${no_proxy:-<not set>}"

echo ""
echo "✅ Xray setup complete"
echo "========================================="

# Export variables for npm script
if [ -n "$XRAY_CA_CERT_PATH" ]; then
  echo "export XRAY_CA_CERT_PATH=$XRAY_CA_CERT_PATH"
  echo "export NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS"
fi
