#!/usr/bin/env bash
set -euo pipefail
API=https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1
KEY=gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl
ACCOUNT=550e8400-e29b-41d4-a716-446655440000
IMG=https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg
HDR=(-H "x-api-key: ${KEY}" -H "x-account-id: ${ACCOUNT}" -H "Content-Type: application/json")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║              TESTING ALERTING FLOW (SNS → Twilio/FCM/Webhooks)              ║"
echo "║                    Thermopylae-Stage Environment                             ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Submit scan
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Submitting scan with test image${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

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

SCAN_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API}/api/v1/scan" "${HDR[@]}" -d "$PAYLOAD")
HTTP_CODE=$(echo "$SCAN_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$SCAN_RESPONSE" | sed '/HTTP_STATUS:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}❌ Failed to submit scan. HTTP $HTTP_CODE${NC}"
  echo "$BODY"
  exit 1
fi

SCAN_ID=$(echo "$BODY" | jq -r '.scanId // empty')
CAPTIS_ID=$(echo "$BODY" | jq -r '.captisId // empty')

if [ -z "$SCAN_ID" ]; then
  echo -e "${RED}❌ No scanId in response${NC}"
  echo "$BODY"
  exit 1
fi

echo -e "${GREEN}✅ Scan submitted successfully${NC}"
echo "   Scan ID: $SCAN_ID"
echo "   Captis ID: $CAPTIS_ID"
echo ""

# Step 2: Wait and poll for results
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Waiting for scan to complete and checking results${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "Polling scan status (this may take 30-120 seconds for Captis to process)..."
MAX_WAIT=180
WAIT_TIME=0
POLL_INTERVAL=10

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  sleep $POLL_INTERVAL
  WAIT_TIME=$((WAIT_TIME + POLL_INTERVAL))
  
  SCAN_DETAIL_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${API}/api/v1/scan/${SCAN_ID}" "${HDR[@]}")
  SCAN_DETAIL_HTTP=$(echo "$SCAN_DETAIL_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
  SCAN_DETAIL_BODY=$(echo "$SCAN_DETAIL_RESPONSE" | sed '/HTTP_STATUS:/d')
  
  if [ "$SCAN_DETAIL_HTTP" = "200" ]; then
    STATUS=$(echo "$SCAN_DETAIL_BODY" | jq -r '.status // empty')
    TOP_SCORE=$(echo "$SCAN_DETAIL_BODY" | jq -r '.topScore // 0')
    MATCH_LEVEL=$(echo "$SCAN_DETAIL_BODY" | jq -r '.matchLevel // empty')
    
    echo "   Status: $STATUS, Top Score: $TOP_SCORE%, Match Level: $MATCH_LEVEL (waited ${WAIT_TIME}s)"
    
    if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
      break
    fi
  fi
done

echo ""

# Step 3: Check scan results
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Analyzing scan results${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

SCAN_DETAIL_RESPONSE=$(curl -s "${API}/api/v1/scan/${SCAN_ID}" "${HDR[@]}")
STATUS=$(echo "$SCAN_DETAIL_RESPONSE" | jq -r '.status // empty')
TOP_SCORE=$(echo "$SCAN_DETAIL_RESPONSE" | jq -r '.topScore // 0')
MATCH_LEVEL=$(echo "$SCAN_DETAIL_RESPONSE" | jq -r '.matchLevel // empty')

echo "Final Scan Status:"
echo "  Status: $STATUS"
echo "  Top Score: $TOP_SCORE%"
echo "  Match Level: $MATCH_LEVEL"
echo ""

if [ "$STATUS" != "COMPLETED" ]; then
  echo -e "${YELLOW}⚠️  Scan not completed yet. Status: $STATUS${NC}"
  echo "   You may need to wait longer or check CloudWatch logs for poll handler execution."
  echo ""
fi

# Get current thresholds (defaults shown, but may be customized per account)
echo "Getting current thresholds for account..."
THRESHOLDS_RESPONSE=$(curl -s "${API}/api/v1/thresholds" "${HDR[@]}" 2>/dev/null || echo "")
if [ -n "$THRESHOLDS_RESPONSE" ] && echo "$THRESHOLDS_RESPONSE" | jq -e '.thresholds' >/dev/null 2>&1; then
  HIGH_THRESHOLD=$(echo "$THRESHOLDS_RESPONSE" | jq -r '.thresholds.highThreshold // 89')
  MEDIUM_THRESHOLD=$(echo "$THRESHOLDS_RESPONSE" | jq -r '.thresholds.mediumThreshold // 75')
  LOW_THRESHOLD=$(echo "$THRESHOLDS_RESPONSE" | jq -r '.thresholds.lowThreshold // 50')
  echo "   Using account-specific thresholds: HIGH=$HIGH_THRESHOLD, MEDIUM=$MEDIUM_THRESHOLD, LOW=$LOW_THRESHOLD"
else
  HIGH_THRESHOLD=89
  MEDIUM_THRESHOLD=75
  LOW_THRESHOLD=50
  echo "   Using default thresholds: HIGH=$HIGH_THRESHOLD, MEDIUM=$MEDIUM_THRESHOLD, LOW=$LOW_THRESHOLD"
fi

# Determine expected alerting behavior (using configurable thresholds)
TOP_SCORE_INT=${TOP_SCORE%.*}  # Convert to integer
HIGH_THRESHOLD_INT=${HIGH_THRESHOLD%.*}
MEDIUM_THRESHOLD_INT=${MEDIUM_THRESHOLD%.*}
LOW_THRESHOLD_INT=${LOW_THRESHOLD%.*}

if [ "$TOP_SCORE_INT" -gt "$HIGH_THRESHOLD_INT" ]; then
  EXPECTED_ALERTS="HIGH threat (>${HIGH_THRESHOLD}%)"
  EXPECTED_ACTIONS="SMS (Twilio) + FCM + Webhook + Location logging"
elif [ "$TOP_SCORE_INT" -gt "$MEDIUM_THRESHOLD_INT" ] && [ "$TOP_SCORE_INT" -le "$HIGH_THRESHOLD_INT" ]; then
  EXPECTED_ALERTS="MEDIUM threat (${MEDIUM_THRESHOLD}-${HIGH_THRESHOLD}%)"
  EXPECTED_ACTIONS="FCM only"
elif [ "$TOP_SCORE_INT" -gt "$LOW_THRESHOLD_INT" ] && [ "$TOP_SCORE_INT" -le "$MEDIUM_THRESHOLD_INT" ]; then
  EXPECTED_ALERTS="LOW threat (${LOW_THRESHOLD}-${MEDIUM_THRESHOLD}%)"
  EXPECTED_ACTIONS="Weekly email aggregation only"
else
  EXPECTED_ALERTS="No threat (<${LOW_THRESHOLD}%)"
  EXPECTED_ACTIONS="No alerts"
fi

echo -e "${BLUE}Expected Alerting Behavior:${NC}"
echo "  Threat Level: $EXPECTED_ALERTS"
echo "  Actions: $EXPECTED_ACTIONS"
echo ""

# Step 4: Check CloudWatch logs
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: CloudWatch Log Verification Instructions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "To verify alerting flow, check CloudWatch logs for:"
echo ""
echo "1. ${GREEN}Poll Handler${NC} (/aws/lambda/spartan-ai-poll-handler):"
echo "   - Look for: 'Poll handler invoked'"
echo "   - Look for: 'Publishing to HIGH_THREAT_TOPIC_ARN' or 'MEDIUM_THREAT_TOPIC_ARN'"
echo "   - Look for: 'topScore' and 'matchLevel' in logs"
echo ""
echo "2. ${GREEN}Alert Handler${NC} (/aws/lambda/spartan-ai-alert-handler):"
echo "   - Look for: 'Alert handler invoked'"
if [ "$TOP_SCORE_INT" -gt "$HIGH_THRESHOLD_INT" ]; then
  echo "   - Look for: 'SMS sent: <messageSid>' (if USER_PHONE_NUMBER is configured)"
  echo "   - Look for: 'FCM notifications sent' (if device tokens are registered)"
fi
if [ "$TOP_SCORE_INT" -gt "$MEDIUM_THRESHOLD_INT" ]; then
  echo "   - Look for: 'FCM notifications sent' (if device tokens are registered)"
fi
echo ""
echo "3. ${GREEN}Webhook Dispatcher${NC} (/aws/lambda/spartan-ai-webhook-dispatcher):"
if [ "$TOP_SCORE_INT" -gt "$HIGH_THRESHOLD_INT" ]; then
  echo "   - Look for: 'Webhook dispatcher invoked'"
  echo "   - Look for: 'Webhook sent to' (if webhooks are registered)"
fi
echo ""
echo "4. ${GREEN}SNS Topics${NC} (check SNS metrics in CloudWatch):"
if [ "$TOP_SCORE_INT" -gt "$HIGH_THRESHOLD_INT" ]; then
  echo "   - spartan-ai-high-threat-alerts: Should have 1+ published messages"
  echo "   - spartan-ai-webhook-notifications: Should have 1+ published messages"
elif [ "$TOP_SCORE_INT" -gt "$MEDIUM_THRESHOLD_INT" ] && [ "$TOP_SCORE_INT" -le "$HIGH_THRESHOLD_INT" ]; then
  echo "   - spartan-ai-medium-threat-alerts: Should have 1+ published messages"
fi
echo ""

# Step 5: Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "Scan ID: $SCAN_ID"
echo "Top Score: $TOP_SCORE%"
echo "Match Level: $MATCH_LEVEL"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Check CloudWatch logs using the instructions above"
echo "2. Verify SNS messages were published to the correct topics"
echo "3. If high threat (>89%):"
echo "   - Verify Twilio SMS was sent (check logs for 'SMS sent')"
echo "   - Verify FCM notification was sent (check logs for 'FCM notifications sent')"
echo "   - Verify webhook was dispatched (check webhook-dispatcher logs)"
echo "4. If medium threat (75-89%):"
echo "   - Verify FCM notification was sent"
echo ""
echo -e "${GREEN}✅ Test scan submitted. Check CloudWatch logs to verify alerting flow.${NC}"

