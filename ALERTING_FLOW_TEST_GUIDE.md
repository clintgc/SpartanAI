# Alerting Flow Test Guide

## Overview
This guide helps you verify that the alerting flow (SNS → Twilio/FCM/Webhooks) works correctly with configurable thresholds.

## Prerequisites
- AWS CLI configured with access to staging environment
- API Gateway URL and API key
- Test image URL (or base64 encoded image)

## Step 1: Submit a Scan

```bash
API=https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1
KEY=gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl
ACCOUNT=550e8400-e29b-41d4-a716-446655440000
IMG=https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg

curl -X POST "${API}/api/v1/scan" \
  -H "x-api-key: ${KEY}" \
  -H "x-account-id: ${ACCOUNT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"image\": \"${IMG}\",
    \"metadata\": {
      \"cameraID\": \"test-cam-alert\",
      \"accountID\": \"${ACCOUNT}\",
      \"location\": {\"lat\": 37.7749, \"lon\": -122.4194},
      \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
    }
  }"
```

**Expected Response:**
```json
{
  "scanId": "scan-xxx",
  "captisId": "captis-xxx",
  "status": "PENDING"
}
```

**Save the `scanId` for next steps.**

## Step 2: Check Current Thresholds

```bash
curl "${API}/api/v1/thresholds" \
  -H "x-api-key: ${KEY}" \
  -H "x-account-id: ${ACCOUNT}"
```

**Expected Response:**
```json
{
  "accountID": "550e8400-e29b-41d4-a716-446655440000",
  "global": {
    "highThreshold": 89,
    "mediumThreshold": 75,
    "lowThreshold": 50
  },
  "services": {}
}
```

## Step 3: Poll for Scan Completion

```bash
SCAN_ID="<scanId from step 1>"

# Poll until completed (or check manually)
while true; do
  RESPONSE=$(curl -s "${API}/api/v1/scan/${SCAN_ID}" \
    -H "x-api-key: ${KEY}" \
    -H "x-account-id: ${ACCOUNT}")
  
  STATUS=$(echo "$RESPONSE" | jq -r '.status')
  TOP_SCORE=$(echo "$RESPONSE" | jq -r '.topScore // 0')
  MATCH_LEVEL=$(echo "$RESPONSE" | jq -r '.matchLevel // empty')
  
  echo "Status: $STATUS, Score: $TOP_SCORE%, Level: $MATCH_LEVEL"
  
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
    break
  fi
  
  sleep 10
done
```

## Step 4: Verify Alerting Flow in CloudWatch

### 4.1 Poll Handler Logs

```bash
aws logs tail /aws/lambda/spartan-ai-poll-handler \
  --follow \
  --since 5m \
  --format short
```

**Look for:**
- `"Using user-level thresholds"` or `"Using global thresholds"`
- `"Publishing to SNS topic: arn:aws:sns:...:spartan-ai-high-threat-alerts"` (if score > high threshold)
- `"Publishing to SNS topic: arn:aws:sns:...:spartan-ai-medium-threat-alerts"` (if score > medium threshold)
- `"matchLevel": "HIGH"` or `"matchLevel": "MEDIUM"`

### 4.2 Alert Handler Logs

```bash
aws logs tail /aws/lambda/spartan-ai-alert-handler \
  --follow \
  --since 5m \
  --format short
```

**Look for:**
- `"Alert handler invoked"` with `matchLevel`
- `"SMS sent: <messageSid>"` (if HIGH threat and Twilio configured)
- `"FCM notifications sent: <count>"` (if HIGH or MEDIUM threat and FCM configured)
- `"Using thresholds:"` with threshold values

### 4.3 Webhook Dispatcher Logs

```bash
aws logs tail /aws/lambda/spartan-ai-webhook-dispatcher \
  --follow \
  --since 5m \
  --format short
```

**Look for:**
- `"Webhook dispatcher invoked"` (only for HIGH threats)
- `"Webhook sent to: <url>"` (if webhooks are registered)
- `"Webhook failed:"` (if there are errors)

### 4.4 SNS Topic Metrics

Check SNS metrics in CloudWatch Console:
- **spartan-ai-high-threat-alerts**: Should show published messages if score > high threshold
- **spartan-ai-medium-threat-alerts**: Should show published messages if score > medium threshold
- **spartan-ai-webhook-notifications**: Should show published messages if score > high threshold

## Step 5: Verify Threshold Configuration

### Test Custom Thresholds

```bash
# Set custom thresholds
curl -X PUT "${API}/api/v1/thresholds" \
  -H "x-api-key: ${KEY}" \
  -H "x-account-id: ${ACCOUNT}" \
  -H "Content-Type: application/json" \
  -d '{
    "highThreshold": 95,
    "mediumThreshold": 85,
    "lowThreshold": 70
  }'
```

**Expected Response:**
```json
{
  "message": "Threat score thresholds updated successfully"
}
```

### Submit Another Scan

Submit a new scan and verify that the custom thresholds are used:
- Check poll handler logs for `"Using user-level thresholds"`
- Verify that alerts are triggered based on your custom thresholds

## Expected Behavior by Score

| Score Range | Match Level | SNS Topic | Actions |
|------------|-------------|-----------|---------|
| > highThreshold | HIGH | spartan-ai-high-threat-alerts | SMS + FCM + Webhook + Location logging |
| > mediumThreshold (≤ highThreshold) | MEDIUM | spartan-ai-medium-threat-alerts | FCM only |
| > lowThreshold (≤ mediumThreshold) | LOW | None | Weekly email aggregation |
| ≤ lowThreshold | None | None | No alerts |

## Troubleshooting

### No SNS Messages Published
- Check poll handler logs for errors
- Verify scan completed successfully
- Check if score meets threshold requirements

### No SMS/FCM Sent
- Check alert handler logs for errors
- Verify Twilio/FCM credentials in SSM Parameter Store
- Check if device tokens are registered (for FCM)
- Verify phone number is in E.164 format (for SMS)

### Webhooks Not Sent
- Check webhook dispatcher logs
- Verify webhooks are registered via `/api/v1/webhooks`
- Check webhook URL is accessible (HTTPS, not private IP)

### Thresholds Not Applied
- Check poll handler logs for `"Using user-level thresholds"` or `"Using global thresholds"`
- Verify account profile has `threatThresholds` field (for user-level)
- Check SSM parameter `/spartan-ai/threat-thresholds/global` (for global)

## Quick Test Script

You can also use the provided test script:

```bash
./.test_alerting_flow.sh
```

Or the simplified verification script:

```bash
./.verify_alerting_flow.sh
```

