# Twilio Sandbox Configuration - Complete ✅

## Summary

The alert-handler Lambda has been configured to send SMS notifications to the verified Twilio sandbox phone number.

## Configuration

### Verified Phone Number
- **Recipient**: `+18017358534` (verified Twilio sandbox number)
- **Format**: E.164 format (required by Twilio)
- **Status**: ✅ Configured as `USER_PHONE_NUMBER` environment variable

### Twilio Credentials (from SSM)
- **Account SID**: `/spartan-ai/twilio/sid`
- **Auth Token**: `/spartan-ai/twilio/auth-token`
- **From Number**: `/spartan-ai/twilio/phone-number` (+18444849529)

## How It Works

1. **High Threat Alert** (>89% match score):
   - Alert-handler Lambda receives SNS event
   - Reads Twilio credentials from SSM Parameter Store
   - Sends SMS to `+18017358534` with threat details
   - Logs SMS result in CloudWatch

2. **SMS Message Format**:
   ```
   High threat detected ([score]% match). View details: [viewMatchesUrl]
   ```

## Testing

### Trigger a High Threat Alert

To test SMS functionality, you need to trigger a scan that results in a high threat score (>89%):

1. **Via API** (using Postman or curl):
   ```bash
   curl -X POST https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1/api/v1/scan \
     -H "x-api-key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "imageUrl": "https://example.com/threat-image.jpg",
       "accountID": "test-account"
     }'
   ```

2. **Wait for Processing**:
   - Scan handler processes the request
   - Poll handler checks for results
   - If score > 89%, alert-handler is triggered via SNS

3. **Check Results**:
   - **SMS**: Check phone `+18017358534` for SMS message
   - **CloudWatch Logs**: Check `/aws/lambda/spartan-ai-alert-handler` for SMS sending confirmation
   - **Twilio Console**: Check Twilio dashboard for message status

### Verify SMS Was Sent

**Check CloudWatch Logs**:
```bash
aws logs tail /aws/lambda/spartan-ai-alert-handler --follow
```

Look for:
- `SMS sent: [messageSid]` - Success
- `Twilio SMS error: [error]` - Failure

**Check Twilio Console**:
- Log into Twilio Console
- Navigate to Messaging > Logs
- Verify message was sent to `+18017358534`

## Important Notes

### Twilio Sandbox Limitations
- **Verified Numbers Only**: Twilio sandbox accounts can only send SMS to verified phone numbers
- **Current Verified Number**: `+18017358534` is the only verified number
- **To Add More Numbers**: 
  1. Send `JOIN [code]` to the Twilio sandbox number from the new phone
  2. Or upgrade to a full Twilio account

### Production Considerations
- **Account-Based Phone Numbers**: In production, phone numbers should be fetched from the account profile database, not hardcoded
- **Multi-Tenant**: Each account should have its own verified phone number(s)
- **Phone Number Validation**: Validate phone numbers are verified before sending SMS

### Current Implementation
The current code uses:
```typescript
const userPhone = process.env.USER_PHONE_NUMBER || '';
```

**Future Enhancement**: Should fetch from account profile:
```typescript
const accountProfile = await dbService.getAccountProfile(accountID);
const userPhone = accountProfile?.phoneNumber;
```

## Troubleshooting

### SMS Not Received

1. **Check Phone Number Format**:
   - Must be E.164 format: `+[country code][number]`
   - Example: `+18017358534` (not `8017358534` or `18017358534`)

2. **Check Twilio Sandbox Status**:
   - Verify the number is still verified in Twilio Console
   - Check if sandbox account is active

3. **Check CloudWatch Logs**:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/lambda/spartan-ai-alert-handler \
     --filter-pattern "Twilio" \
     --max-items 10
   ```

4. **Check SSM Parameters**:
   ```bash
   aws ssm get-parameter --name "/spartan-ai/twilio/sid" --with-decryption
   aws ssm get-parameter --name "/spartan-ai/twilio/auth-token" --with-decryption
   aws ssm get-parameter --name "/spartan-ai/twilio/phone-number" --with-decryption
   ```

5. **Check IAM Permissions**:
   - Verify Lambda execution role has `ssm:GetParameter` permission
   - Verify Lambda execution role has permission to invoke Twilio API (via SDK)

### Common Errors

**"Invalid phone number format"**:
- Ensure phone number is in E.164 format: `+18017358534`

**"The number +18017358534 is not a valid, SMS-capable inbound phone number"**:
- Number is not verified in Twilio sandbox
- Verify the number in Twilio Console

**"Authentication failed"**:
- Check SSM parameters are correct
- Verify Twilio Account SID and Auth Token

## Files Modified

1. `spartan-ai/infrastructure/lib/lambda-functions.ts`
   - Added `USER_PHONE_NUMBER: '+18017358534'` environment variable

## Next Steps

1. ✅ **Test SMS Functionality**: Trigger a high-threat alert and verify SMS is received
2. **Monitor CloudWatch Logs**: Watch for any SMS sending errors
3. **Production Planning**: 
   - Implement account profile phone number lookup
   - Set up phone number verification workflow
   - Consider upgrading to full Twilio account for production

---

**Status**: ✅ Ready for Testing
**Verified Phone**: `+18017358534`
**Deployment Date**: $(date)

