#!/bin/bash

###############################################################################
# Script: download-certs.sh
# Description: Download client certificates from GitLab Secure Files
# Usage: ./scripts/download-certs.sh
# Note: Requires SECURE_FILES_DOWNLOAD_PATH environment variable in CI
###############################################################################

set -e

echo "================================================"
echo "📥 Downloading Certificates from Secure Storage"
echo "================================================"

# Ensure certs directory exists
mkdir -p certs

# Download secure files from GitLab
echo "Downloading secure files from GitLab Vault..."
if curl -sSf https://gitlab.com/gitlab-org/incubation-engineering/mobile-devops/download-secure-files/-/raw/main/installer | bash; then
  echo "✅ Successfully downloaded secure files installer"
else
  echo "❌ Failed to download secure files installer"
  exit 1
fi

# Copy downloaded files to certs directory
if [ -d ".secure_files" ] && [ "$(ls -A .secure_files 2>/dev/null)" ]; then
  echo "Copying secure files to certs directory..."
  cp .secure_files/* certs/
  echo "✅ Certificates copied successfully"
  
  # List certificates (without showing content)
  echo ""
  echo "Available certificates:"
  ls -lh certs/
else
  echo "⚠️  Warning: No secure files found in .secure_files directory"
  echo "Continuing without certificates..."
fi

echo ""
echo "✅ Certificate download complete"
echo "================================================"
