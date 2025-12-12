#!/bin/bash
# Script to set up Captis access key in AWS SSM Parameter Store

set -e

CAPTIS_ACCESS_KEY=${1:-$CAPTIS_ACCESS_KEY}

if [ -z "$CAPTIS_ACCESS_KEY" ]; then
  echo "Usage: $0 <captis-access-key>"
  echo "Or set CAPTIS_ACCESS_KEY environment variable"
  exit 1
fi

echo "Setting Captis access key in AWS SSM Parameter Store..."

aws ssm put-parameter \
  --name "/spartan-ai/captis/access-key" \
  --value "$CAPTIS_ACCESS_KEY" \
  --type "SecureString" \
  --overwrite \
  --description "Captis API access key for ASI endpoint"

echo "✅ Captis access key stored in SSM Parameter Store at /spartan-ai/captis/access-key"

