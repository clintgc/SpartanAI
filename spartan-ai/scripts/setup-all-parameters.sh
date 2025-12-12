#!/bin/bash
# Script to set up all required parameters in AWS SSM Parameter Store

set -e

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

echo "Setting up Spartan AI parameters in AWS SSM Parameter Store..."
echo ""

# Captis Access Key (required)
if [ -z "$CAPTIS_ACCESS_KEY" ]; then
  echo "❌ CAPTIS_ACCESS_KEY is required"
  exit 1
fi

echo "📝 Setting Captis access key..."
aws ssm put-parameter \
  --name "/spartan-ai/captis/access-key" \
  --value "$CAPTIS_ACCESS_KEY" \
  --type "SecureString" \
  --overwrite \
  --description "Captis API access key for ASI endpoint" \
  > /dev/null
echo "✅ Captis access key configured"

# Twilio parameters (optional)
if [ -n "$TWILIO_ACCOUNT_SID" ]; then
  echo "📝 Setting Twilio account SID..."
  aws ssm put-parameter \
    --name "/spartan-ai/twilio/account-sid" \
    --value "$TWILIO_ACCOUNT_SID" \
    --type "SecureString" \
    --overwrite \
    > /dev/null
  echo "✅ Twilio account SID configured"
fi

if [ -n "$TWILIO_AUTH_TOKEN" ]; then
  echo "📝 Setting Twilio auth token..."
  aws ssm put-parameter \
    --name "/spartan-ai/twilio/auth-token" \
    --value "$TWILIO_AUTH_TOKEN" \
    --type "SecureString" \
    --overwrite \
    > /dev/null
  echo "✅ Twilio auth token configured"
fi

if [ -n "$TWILIO_PHONE_NUMBER" ]; then
  echo "📝 Setting Twilio phone number..."
  aws ssm put-parameter \
    --name "/spartan-ai/twilio/phone-number" \
    --value "$TWILIO_PHONE_NUMBER" \
    --type "String" \
    --overwrite \
    > /dev/null
  echo "✅ Twilio phone number configured"
fi

# SendGrid API key (optional)
if [ -n "$SENDGRID_API_KEY" ]; then
  echo "📝 Setting SendGrid API key..."
  aws ssm put-parameter \
    --name "/spartan-ai/sendgrid/api-key" \
    --value "$SENDGRID_API_KEY" \
    --type "SecureString" \
    --overwrite \
    > /dev/null
  echo "✅ SendGrid API key configured"
fi

# FCM Server Key (optional)
if [ -n "$FCM_SERVER_KEY" ]; then
  echo "📝 Setting FCM server key..."
  aws ssm put-parameter \
    --name "/spartan-ai/fcm/server-key" \
    --value "$FCM_SERVER_KEY" \
    --type "SecureString" \
    --overwrite \
    > /dev/null
  echo "✅ FCM server key configured"
fi

echo ""
echo "✅ All parameters configured successfully!"
echo ""
echo "To verify, run:"
echo "  aws ssm get-parameter --name /spartan-ai/captis/access-key --with-decryption"

