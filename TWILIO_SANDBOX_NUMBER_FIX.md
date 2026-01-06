# Twilio Sandbox Number Mismatch Fix

## Error
```
Twilio SMS error: Mismatch between the 'From' number +14155238886 and the account ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Problem
The sandbox number +14155238886 is not associated with your Twilio account (ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX).

## Solutions

### Option 1: Find Your Account's Sandbox Number

The sandbox number must belong to your specific Twilio account. To find it:

1. **Log into Twilio Console**: https://console.twilio.com
2. **Go to**: Messaging > Try it out > Send a WhatsApp message
3. **Look for**: "From" number or "Sandbox number"
4. **Alternative**: Phone Numbers > Manage > Active numbers
   - Look for numbers with "Sandbox" in the name or description
   - Or numbers that show as available for testing

### Option 2: Use Trial Number

If you're on a Twilio trial account:

1. **Go to**: Phone Numbers > Manage > Buy a number
2. **Search for**: A number in your area (or any available number)
3. **Purchase**: Trial accounts get one free number
4. **Use that number** instead of the sandbox number

### Option 3: Verify/Add the Number to Your Account

If +14155238886 should work:

1. **Go to**: Phone Numbers > Manage > Active numbers
2. **Click**: "Buy a number" or "Add a number"
3. **Search for**: +14155238886
4. **If it exists**: Make sure it's in your account's active numbers

### Option 4: Use the Original Toll-Free Number (Verify It)

If you want to use +18444849529:

1. **Go to**: Phone Numbers > Manage > Active numbers
2. **Find**: +18444849529
3. **Complete verification** (may require business verification for toll-free)
4. **Update SSM back to toll-free**:
   ```bash
   aws ssm put-parameter \
     --region us-east-1 \
     --name "/spartan-ai/twilio/phone-number" \
     --type "SecureString" \
     --value "+18444849529" \
     --description "Twilio Phone Number for alert-handler Lambda" \
     --overwrite
   ```

## Quick Fix Command

Once you have the correct number for your account:

```bash
# Replace with your actual account's sandbox/trial number
CORRECT_NUMBER="+1XXXXXXXXXX"  # Your number here

aws ssm put-parameter \
  --region us-east-1 \
  --name "/spartan-ai/twilio/phone-number" \
  --type "SecureString" \
  --value "$CORRECT_NUMBER" \
  --description "Twilio Phone Number for alert-handler Lambda" \
  --overwrite

echo "✅ Updated! Test again."
```

## Current Configuration

- **Account SID**: ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (redacted)
- **Current From Number**: +14155238886 (not associated with account)
- **To Number**: +18017358534
- **Status**: Number mismatch error

## Next Steps

1. Find the correct sandbox/trial number for your Twilio account
2. Update SSM parameter with the correct number
3. Test again

---

**Note**: The sandbox number must belong to the same Twilio account as your Account SID.

