#!/usr/bin/env bash
set -euo pipefail
API=https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1
KEY=gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl
ACCOUNT=550e8400-e29b-41d4-a716-446655440000
IMG=https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg
HDR=(-H "x-api-key: ${KEY}" -H "x-account-id: ${ACCOUNT}" -H "Content-Type: application/json")

echo "=== Quick Alerting Flow Verification ==="
echo ""

# Step 1: Submit scan
echo "1. Submitting scan..."
PAYLOAD=$(cat <<JSON
{
  "image": "${IMG}",
  "metadata": {
    "cameraID": "test-cam-alert",
    "accountID": "${ACCOUNT}",
    "location": {"lat": 37.7749, "lon": -122.4194},
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
JSON
)

RESPONSE=$(curl -s -w "\nHTTP:%{http_code}" -X POST "${API}/api/v1/scan" "${HDR[@]}" -d "$PAYLOAD")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to submit scan. HTTP $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

SCAN_ID=$(echo "$BODY" | jq -r '.scanId // empty')
CAPTIS_ID=$(echo "$BODY" | jq -r '.captisId // empty')

if [ -z "$SCAN_ID" ]; then
  echo "❌ No scanId in response"
  exit 1
fi

echo "✅ Scan submitted: $SCAN_ID"
echo "   Captis ID: $CAPTIS_ID"
echo ""

# Step 2: Get current thresholds
echo "2. Getting current thresholds..."
THRESHOLDS_RESPONSE=$(curl -s "${API}/api/v1/thresholds" "${HDR[@]}" 2>/dev/null || echo "")
if [ -n "$THRESHOLDS_RESPONSE" ] && echo "$THRESHOLDS_RESPONSE" | jq -e '.thresholds' >/dev/null 2>&1; then
  HIGH_THRESHOLD=$(echo "$THRESHOLDS_RESPONSE" | jq -r '.thresholds.highThreshold // 89')
  MEDIUM_THRESHOLD=$(echo "$THRESHOLDS_RESPONSE" | jq -r '.thresholds.mediumThreshold // 75')
  LOW_THRESHOLD=$(echo "$THRESHOLDS_RESPONSE" | jq -r '.thresholds.lowThreshold // 50')
  echo "✅ Thresholds: HIGH=$HIGH_THRESHOLD, MEDIUM=$MEDIUM_THRESHOLD, LOW=$LOW_THRESHOLD"
else
  echo "⚠️  Could not fetch thresholds, using defaults"
  HIGH_THRESHOLD=89
  MEDIUM_THRESHOLD=75
  LOW_THRESHOLD=50
fi
echo ""

# Step 3: Wait and check scan status
echo "3. Waiting for scan to complete (checking every 10s, max 2 minutes)..."
MAX_WAIT=120
WAIT_TIME=0
POLL_INTERVAL=10

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  sleep $POLL_INTERVAL
  WAIT_TIME=$((WAIT_TIME + POLL_INTERVAL))
  
  SCAN_DETAIL=$(curl -s "${API}/api/v1/scan/${SCAN_ID}" "${HDR[@]}")
  STATUS=$(echo "$SCAN_DETAIL" | jq -r '.status // empty')
  TOP_SCORE=$(echo "$SCAN_DETAIL" | jq -r '.topScore // 0')
  MATCH_LEVEL=$(echo "$SCAN_DETAIL" | jq -r '.matchLevel // empty')
  
  echo "   [$WAIT_TIME s] Status: $STATUS, Score: $TOP_SCORE%, Level: $MATCH_LEVEL"
  
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
    break
  fi
done

echo ""

# Step 4: Final results
echo "4. Final Scan Results:"
SCAN_DETAIL=$(curl -s "${API}/api/v1/scan/${SCAN_ID}" "${HDR[@]}")
STATUS=$(echo "$SCAN_DETAIL" | jq -r '.status // empty')
TOP_SCORE=$(echo "$SCAN_DETAIL" | jq -r '.topScore // 0')
MATCH_LEVEL=$(echo "$SCAN_DETAIL" | jq -r '.matchLevel // empty')

echo "   Status: $STATUS"
echo "   Top Score: $TOP_SCORE%"
echo "   Match Level: $MATCH_LEVEL"
echo ""

# Determine expected alerts
TOP_SCORE_INT=${TOP_SCORE%.*}
HIGH_THRESHOLD_INT=${HIGH_THRESHOLD%.*}
MEDIUM_THRESHOLD_INT=${MEDIUM_THRESHOLD%.*}

if [ "$TOP_SCORE_INT" -gt "$HIGH_THRESHOLD_INT" ]; then
  echo "✅ Expected: HIGH threat alert"
  echo "   - SNS: spartan-ai-high-threat-alerts"
  echo "   - Actions: SMS + FCM + Webhook + Location logging"
elif [ "$TOP_SCORE_INT" -gt "$MEDIUM_THRESHOLD_INT" ]; then
  echo "✅ Expected: MEDIUM threat alert"
  echo "   - SNS: spartan-ai-medium-threat-alerts"
  echo "   - Actions: FCM only"
else
  echo "ℹ️  LOW threat or no alert"
  echo "   - Will be aggregated in weekly email"
fi
echo ""

echo "=== Next Steps ==="
echo "Check CloudWatch logs for:"
echo "1. /aws/lambda/spartan-ai-poll-handler - Look for SNS publish"
echo "2. /aws/lambda/spartan-ai-alert-handler - Look for SMS/FCM"
echo "3. /aws/lambda/spartan-ai-webhook-dispatcher - Look for webhook dispatch"
echo ""
echo "Scan ID: $SCAN_ID"
echo "Check logs with:"
echo "aws logs tail /aws/lambda/spartan-ai-poll-handler --follow --since 5m"

