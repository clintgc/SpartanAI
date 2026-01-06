# Twilio Sandbox Testing Fix

## Problem
SMS messages are showing as "undelivered" because the toll-free number (+18444849529) requires verification in Twilio.

## Solution Options

### Option 1: Use Twilio Sandbox Number (Recommended for Testing)

The Twilio Sandbox provides a number that works without verification for testing.

**Steps:**

1. **Find your Sandbox Number:**
   - Log into [Twilio Console](https://console.twilio.com)
   - Go to: **Messaging** > **Try it out** > **Send a WhatsApp message**
   - Or: **Messaging** > **Settings** > **Phone Numbers**
   - Look for a number like: `+1 415-xxx-xxxx` or `+1 650-xxx-xxxx`

2. **Update SSM Parameter:**
   ```bash
   # Replace SANDBOX_NUMBER with your actual sandbox number
   aws ssm put-parameter \
     --region us-east-1 \
     --name "/spartan-ai/twilio/phone-number" \
     --type "SecureString" \
     --value "+14155551234" \
     --description "Twilio Sandbox Phone Number for alert-handler Lambda" \
     --overwrite
   ```

3. **Join the Sandbox (if not already done):**
   - From phone +18017358534, send a text to your sandbox number
   - Message: `join [your-sandbox-code]`
   - Find your sandbox code in: **Messaging** > **Try it out** > **Send a WhatsApp message**

4. **Test Again:**
   - Trigger another high-threat scan
   - SMS should now be delivered

### Option 2: Verify Toll-Free Number in Twilio

If you want to keep using the toll-free number:

1. **Verify in Twilio Console:**
   - Go to: **Phone Numbers** > **Manage** > **Active numbers**
   - Find your number: +18444849529
   - Click on it and complete verification steps
   - May require business verification for toll-free numbers

2. **No SSM Update Needed:**
   - The number is already configured
   - Just complete verification in Twilio console

## Quick Update Command

Once you have your sandbox number, run:

```bash
# Replace with your actual sandbox number
SANDBOX_NUMBER="+14155551234"  # Your sandbox number here

aws ssm put-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/phone-number" \
  --type "SecureString" \
  --value "$SANDBOX_NUMBER" \
  --description "Twilio Sandbox Phone Number for alert-handler Lambda" \
  --overwrite

echo "✅ Updated! Next alert will use sandbox number."
```

## Verify Update

```bash
aws ssm get-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/phone-number" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text
```

## Notes

- **No Redeployment Needed**: The Lambda reads from SSM at runtime
- **Sandbox Limitations**: Can only send to verified/joined numbers
- **Production**: For production, verify your toll-free number or purchase a dedicated number

## Current Configuration

- **From Number**: +18444849529 (toll-free, needs verification)
- **To Number**: +18017358534 (verified in sandbox)
- **Status**: Messages sent but undelivered due to unverified from number

---

**Next Step**: Get your sandbox number from Twilio Console and update the SSM parameter using the command above.

