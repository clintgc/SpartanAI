#!/bin/bash

# Spartan AI Scan Test Script
# Usage: ./test-scan.sh <image-file-path-or-url>

set -e

API="https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1"
API_KEY="gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl"
ACCOUNT_ID="550e8400-e29b-41d4-a716-446655440000"

IMAGE_INPUT="$1"

if [ -z "$IMAGE_INPUT" ]; then
    echo "Usage: $0 <image-file-path-or-url>"
    echo "Example: $0 /path/to/image.jpg"
    echo "Example: $0 https://example.com/image.jpg"
    exit 1
fi

# Determine if input is a URL or file path
if [[ "$IMAGE_INPUT" =~ ^https?:// ]]; then
    echo "📸 Using image URL: $IMAGE_INPUT"
    IMAGE_DATA="$IMAGE_INPUT"
else
    if [ ! -f "$IMAGE_INPUT" ]; then
        echo "❌ Error: Image file not found: $IMAGE_INPUT"
        exit 1
    fi
    
    echo "📸 Converting image to base64: $IMAGE_INPUT"
    
    # Detect image type
    FILE_EXT="${IMAGE_INPUT##*.}"
    case "$FILE_EXT" in
        jpg|jpeg)
            MIME_TYPE="image/jpeg"
            ;;
        png)
            MIME_TYPE="image/png"
            ;;
        gif)
            MIME_TYPE="image/gif"
            ;;
        *)
            MIME_TYPE="image/jpeg"
            echo "⚠️  Warning: Unknown file extension, assuming JPEG"
            ;;
    esac
    
    # Convert to base64
    BASE64_DATA=$(base64 -i "$IMAGE_INPUT" 2>/dev/null || base64 "$IMAGE_INPUT")
    IMAGE_DATA="data:${MIME_TYPE};base64,${BASE64_DATA}"
    echo "✅ Image converted to base64 (${#BASE64_DATA} characters)"
fi

# Generate timestamp (use 2025 to match existing quota record)
TIMESTAMP="2025-12-19T12:00:00Z"

echo ""
echo "🚀 Submitting scan request..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Submit scan
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/v1/scan" \
  -H "x-api-key: ${API_KEY}" \
  -H "x-account-id: ${ACCOUNT_ID}" \
  -H "Content-Type: application/json" \
  -d "{
    \"image\": \"${IMAGE_DATA}\",
    \"metadata\": {
      \"cameraID\": \"test-cam-$(date +%s)\",
      \"accountID\": \"${ACCOUNT_ID}\",
      \"location\": {
        \"lat\": 37.7749,
        \"lon\": -122.4194
      },
      \"timestamp\": \"${TIMESTAMP}\"
    }
  }")

# Extract HTTP status code and body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "202" ]; then
    echo ""
    echo "❌ Error: Request failed with status $HTTP_CODE"
    exit 1
fi

# Extract scanId
SCAN_ID=$(echo "$BODY" | jq -r '.scanId' 2>/dev/null)

if [ -z "$SCAN_ID" ] || [ "$SCAN_ID" = "null" ]; then
    echo ""
    echo "❌ Error: Could not extract scanId from response"
    exit 1
fi

echo ""
echo "✅ Scan submitted successfully!"
echo "📋 Scan ID: $SCAN_ID"
echo ""
echo "⏳ Polling for results (this may take 10-30 seconds)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Poll for results
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    SCAN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API}/api/v1/scan/${SCAN_ID}" \
      -H "x-api-key: ${API_KEY}" \
      -H "x-account-id: ${ACCOUNT_ID}")
    
    SCAN_HTTP_CODE=$(echo "$SCAN_RESPONSE" | tail -n1)
    SCAN_BODY=$(echo "$SCAN_RESPONSE" | sed '$d')
    
    STATUS=$(echo "$SCAN_BODY" | jq -r '.status' 2>/dev/null)
    TOP_SCORE=$(echo "$SCAN_BODY" | jq -r '.topScore // 0' 2>/dev/null)
    MATCH_LEVEL=$(echo "$SCAN_BODY" | jq -r '.matchLevel // "NONE"' 2>/dev/null)
    
    echo "[Attempt $ATTEMPT/$MAX_ATTEMPTS] Status: $STATUS | Score: $TOP_SCORE% | Level: $MATCH_LEVEL"
    
    if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📊 Final Results:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "$SCAN_BODY" | jq '.' 2>/dev/null || echo "$SCAN_BODY"
        
        if [ "$STATUS" = "COMPLETED" ]; then
            echo ""
            if (( $(echo "$TOP_SCORE > 89" | bc -l 2>/dev/null || echo "0") )); then
                echo "🔴 HIGH THREAT DETECTED! (Score: $TOP_SCORE%)"
                echo "   → SMS, FCM, and Webhook alerts should be triggered"
            elif (( $(echo "$TOP_SCORE > 75" | bc -l 2>/dev/null || echo "0") )); then
                echo "🟡 MEDIUM THREAT DETECTED (Score: $TOP_SCORE%)"
                echo "   → FCM alert should be triggered"
            elif (( $(echo "$TOP_SCORE > 50" | bc -l 2>/dev/null || echo "0") )); then
                echo "🟢 LOW THREAT DETECTED (Score: $TOP_SCORE%)"
                echo "   → Will be included in weekly email aggregation"
            else
                echo "⚪ NO THREAT DETECTED (Score: $TOP_SCORE%)"
            fi
        fi
        
        break
    fi
    
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo ""
    echo "⏰ Timeout: Scan did not complete within $((MAX_ATTEMPTS * 2)) seconds"
    echo "   You can check manually with:"
    echo "   curl -X GET \"${API}/api/v1/scan/${SCAN_ID}\" \\"
    echo "     -H \"x-api-key: ${API_KEY}\" \\"
    echo "     -H \"x-account-id: ${ACCOUNT_ID}\""
fi

