#!/bin/bash
# Script to configure AWS SES DKIM for spartan.tech
# This script will guide you through the process

set -e

DOMAIN="spartan.tech"
REGION="us-east-1"

echo "=========================================="
echo "AWS SES DKIM Configuration for $DOMAIN"
echo "=========================================="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

echo "Step 1: Checking if domain is verified in SES..."
if aws ses get-identity-verification-attributes \
    --identities "$DOMAIN" \
    --region "$REGION" \
    --query "VerificationAttributes.$DOMAIN.VerificationStatus" \
    --output text 2>/dev/null | grep -q "Success"; then
    echo "✅ Domain is verified in SES"
else
    echo "⚠️  Domain is not verified in SES"
    echo ""
    echo "Please verify the domain first:"
    echo "1. Go to AWS Console → SES → Verified identities"
    echo "2. Click 'Create identity'"
    echo "3. Select 'Domain' and enter: $DOMAIN"
    echo "4. Follow the verification steps"
    echo ""
    read -p "Press Enter when domain is verified..."
fi

echo ""
echo "Step 2: Enabling DKIM for $DOMAIN..."
if aws ses set-identity-dkim-enabled \
    --identity "$DOMAIN" \
    --dkim-enabled \
    --region "$REGION" 2>&1; then
    echo "✅ DKIM enabled successfully"
else
    echo "❌ Failed to enable DKIM. You may need additional IAM permissions."
    echo "Required permissions: ses:SetIdentityDkimEnabled"
    exit 1
fi

echo ""
echo "Step 3: Getting DKIM tokens..."
DKIM_TOKENS=$(aws ses get-identity-dkim-attributes \
    --identities "$DOMAIN" \
    --region "$REGION" \
    --query "DkimAttributes.$DOMAIN.DkimTokens" \
    --output json 2>/dev/null)

if [ -z "$DKIM_TOKENS" ] || [ "$DKIM_TOKENS" == "null" ]; then
    echo "❌ Failed to get DKIM tokens. Check IAM permissions."
    echo "Required permissions: ses:GetIdentityDkimAttributes"
    exit 1
fi

echo "✅ DKIM tokens retrieved:"
echo "$DKIM_TOKENS" | jq -r '.[]' | while read -r token; do
    echo "  - $token"
done

echo ""
echo "Step 4: Getting Route 53 hosted zone ID..."
ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='$DOMAIN.'].Id" \
    --output text | cut -d'/' -f3)

if [ -z "$ZONE_ID" ]; then
    echo "❌ Route 53 hosted zone not found for $DOMAIN"
    exit 1
fi

echo "✅ Found hosted zone: $ZONE_ID"

echo ""
echo "Step 5: Creating CNAME records in Route 53..."
TOKEN_COUNT=1
echo "$DKIM_TOKENS" | jq -r '.[]' | while read -r token; do
    RECORD_NAME="_c${TOKEN_COUNT}._domainkey"
    RECORD_VALUE="_c${TOKEN_COUNT}.domainkey.${token}.dkim.amazonses.com"
    
    echo ""
    echo "Creating record: $RECORD_NAME"
    echo "  Value: $RECORD_VALUE"
    
    # Create the CNAME record
    CHANGE_BATCH=$(cat <<EOF
{
    "Changes": [{
        "Action": "UPSERT",
        "ResourceRecordSet": {
            "Name": "$RECORD_NAME.$DOMAIN",
            "Type": "CNAME",
            "TTL": 3600,
            "ResourceRecords": [{"Value": "$RECORD_VALUE"}]
        }
    }]
}
EOF
)
    
    if aws route53 change-resource-record-sets \
        --hosted-zone-id "$ZONE_ID" \
        --change-batch "$CHANGE_BATCH" &> /dev/null; then
        echo "  ✅ Record created successfully"
    else
        echo "  ❌ Failed to create record"
    fi
    
    TOKEN_COUNT=$((TOKEN_COUNT + 1))
done

echo ""
echo "=========================================="
echo "✅ DKIM Configuration Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Wait 5-10 minutes for DNS propagation"
echo "2. Check DKIM status in SES Console:"
echo "   https://console.aws.amazon.com/ses/home?region=$REGION#/verified-identities"
echo "3. Verify that all 3 tokens show as 'Verified'"
echo ""
echo "To check status manually:"
echo "  aws ses get-identity-dkim-attributes --identities $DOMAIN --region $REGION"
echo ""

