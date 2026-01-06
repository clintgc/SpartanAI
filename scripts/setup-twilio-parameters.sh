#!/bin/bash
# Script to create Twilio SSM parameters for alert-handler Lambda

set -e

echo "Creating Twilio SSM parameters in AWS SSM Parameter Store (us-east-1)..."
echo ""

# Create Twilio Account SID parameter
echo "📝 Creating Twilio Account SID parameter..."
aws ssm put-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/sid" \
  --type "SecureString" \
  --value "YOUR_TWILIO_ACCOUNT_SID_HERE" \
  --description "Twilio Account SID for alert-handler Lambda" \
  --overwrite
echo "✅ Twilio Account SID parameter created"

# Create Twilio Auth Token parameter
echo "📝 Creating Twilio Auth Token parameter..."
aws ssm put-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/auth-token" \
  --type "SecureString" \
  --value "YOUR_TWILIO_AUTH_TOKEN_HERE" \
  --description "Twilio Auth Token for alert-handler Lambda" \
  --overwrite
echo "✅ Twilio Auth Token parameter created"

# Create Twilio Phone Number parameter
echo "📝 Creating Twilio Phone Number parameter..."
aws ssm put-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/phone-number" \
  --type "SecureString" \
  --value "+18444849529" \
  --description "Twilio Phone Number for alert-handler Lambda" \
  --overwrite
echo "✅ Twilio Phone Number parameter created"

echo ""
echo "✅ All Twilio parameters created successfully!"
echo ""
echo "Verifying parameters..."
echo ""

# Verify parameters
echo "Verifying /spartan-ai/twilio/sid..."
aws ssm get-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/sid" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text > /dev/null && echo "✅ SID parameter verified"

echo "Verifying /spartan-ai/twilio/auth-token..."
aws ssm get-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/auth-token" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text > /dev/null && echo "✅ Auth Token parameter verified"

echo "Verifying /spartan-ai/twilio/phone-number..."
aws ssm get-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/phone-number" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text > /dev/null && echo "✅ Phone Number parameter verified"

echo ""
echo "🎉 All parameters created and verified successfully!"
echo ""
echo "Next steps:"
echo "1. Deploy the CDK stack: cd infrastructure && cdk deploy"
echo "2. The alert-handler Lambda will automatically have access to these parameters"
echo "   (IAM permissions are already configured in the CDK stack)"

