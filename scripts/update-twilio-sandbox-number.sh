#!/bin/bash
# Script to update Twilio phone number to sandbox number for testing

set -e

echo "Twilio Sandbox Number Setup"
echo "=========================="
echo ""
echo "For testing, you can use the Twilio Sandbox number instead of your toll-free number."
echo ""
echo "To find your Twilio Sandbox number:"
echo "1. Log into Twilio Console: https://console.twilio.com"
echo "2. Navigate to: Messaging > Try it out > Send a WhatsApp message"
echo "3. Or check: Messaging > Settings > Phone Numbers"
echo ""
echo "The sandbox number is typically in format: +1 415-xxx-xxxx"
echo ""
read -p "Enter your Twilio Sandbox number (E.164 format, e.g., +14155551234): " SANDBOX_NUMBER

if [ -z "$SANDBOX_NUMBER" ]; then
  echo "❌ No number provided. Exiting."
  exit 1
fi

# Validate E.164 format (basic check)
if [[ ! "$SANDBOX_NUMBER" =~ ^\+[1-9][0-9]{10,14}$ ]]; then
  echo "⚠️  Warning: Number doesn't match E.164 format (+[country][number])"
  read -p "Continue anyway? (y/n): " CONTINUE
  if [ "$CONTINUE" != "y" ]; then
    exit 1
  fi
fi

echo ""
echo "📝 Updating SSM parameter with sandbox number..."
aws ssm put-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/phone-number" \
  --type "SecureString" \
  --value "$SANDBOX_NUMBER" \
  --description "Twilio Sandbox Phone Number for alert-handler Lambda (testing)" \
  --overwrite

echo "✅ Updated /spartan-ai/twilio/phone-number to: $SANDBOX_NUMBER"
echo ""
echo "📱 Important: Make sure the recipient phone number (+18017358534) has joined the sandbox:"
echo "   - Send 'join [your-sandbox-code]' to the sandbox number from +18017358534"
echo "   - Find your sandbox code in Twilio Console > Messaging > Try it out"
echo ""
echo "🔄 The Lambda will use this number on the next alert trigger."
echo "   No redeployment needed - it reads from SSM at runtime."

