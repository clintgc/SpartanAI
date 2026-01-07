#!/bin/bash
# Script to update the ACM certificate ARN in terraform.tfvars

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Certificate ARN required"
  echo ""
  echo "Usage: ./update-certificate.sh <CERTIFICATE_ARN>"
  echo ""
  echo "Example:"
  echo "  ./update-certificate.sh arn:aws:acm:us-east-1:052380405056:certificate/12345678-1234-1234-1234-123456789012"
  exit 1
fi

CERT_ARN="$1"
TFVARS_FILE="terraform.tfvars"

# Validate ARN format
if [[ ! "$CERT_ARN" =~ ^arn:aws:acm:us-east-1:[0-9]+:certificate/[a-f0-9-]+$ ]]; then
  echo "❌ Error: Invalid certificate ARN format"
  echo "Expected format: arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
  exit 1
fi

# Check if terraform.tfvars exists
if [ ! -f "$TFVARS_FILE" ]; then
  echo "❌ Error: $TFVARS_FILE not found"
  exit 1
fi

# Backup original file
cp "$TFVARS_FILE" "${TFVARS_FILE}.backup"
echo "✅ Created backup: ${TFVARS_FILE}.backup"

# Update certificate ARN
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s|acm_certificate_arn = \".*\"|acm_certificate_arn = \"$CERT_ARN\"|" "$TFVARS_FILE"
else
  # Linux
  sed -i "s|acm_certificate_arn = \".*\"|acm_certificate_arn = \"$CERT_ARN\"|" "$TFVARS_FILE"
fi

echo "✅ Updated $TFVARS_FILE with new certificate ARN:"
echo "   $CERT_ARN"
echo ""
echo "📋 Next steps:"
echo "   1. Review the changes: diff terraform.tfvars terraform.tfvars.backup"
echo "   2. Run: terraform plan"
echo "   3. If plan looks good: terraform apply"

