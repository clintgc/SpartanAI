#!/bin/bash

# Batch test script for all images in test_images folder
# Tests all 4 images sequentially and shows results

set -e

API="https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1"
API_KEY="gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl"
ACCOUNT_ID="550e8400-e29b-41d4-a716-446655440000"
IMAGE_DIR="/Users/clintgc/SpaceMonkeyII/tests/test_images"

# Array of images to test
IMAGES=(
    "Anthony-FL.jpeg"
    "ArmedRobbery-MI.webp"
    "ASSAULT-NC2.webp"
    "Burglary-OR.webp"
)

echo "🧪 Spartan AI Batch Image Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing ${#IMAGES[@]} images..."
echo ""

# Results array
declare -a RESULTS

for i in "${!IMAGES[@]}"; do
    IMAGE_FILE="${IMAGES[$i]}"
    IMAGE_PATH="${IMAGE_DIR}/${IMAGE_FILE}"
    IMAGE_NUM=$((i + 1))
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📸 Test $IMAGE_NUM/${#IMAGES[@]}: $IMAGE_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -f "$IMAGE_PATH" ]; then
        echo "❌ Error: Image file not found: $IMAGE_PATH"
        RESULTS+=("$IMAGE_FILE: ERROR - File not found")
        continue
    fi
    
    # Detect MIME type
    FILE_EXT="${IMAGE_FILE##*.}"
    case "$FILE_EXT" in
        jpg|jpeg)
            MIME_TYPE="image/jpeg"
            ;;
        png)
            MIME_TYPE="image/png"
            ;;
        webp)
            MIME_TYPE="image/webp"
            ;;
        gif)
            MIME_TYPE="image/gif"
            ;;
        *)
            MIME_TYPE="image/jpeg"
            ;;
    esac
    
    # Convert to base64
    echo "🔄 Converting to base64..."
    BASE64_DATA=$(base64 -i "$IMAGE_PATH" 2>/dev/null || base64 "$IMAGE_PATH")
    IMAGE_DATA="data:${MIME_TYPE};base64,${BASE64_DATA}"
    
    # Generate timestamp (use 2025 to match existing quota record)
    TIMESTAMP="2025-12-19T12:00:00Z"
    CAMERA_ID="test-cam-$(date +%s)-${IMAGE_NUM}"
    
    # Submit scan
    echo "🚀 Submitting scan request..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API}/api/v1/scan" \
      -H "x-api-key: ${API_KEY}" \
      -H "x-account-id: ${ACCOUNT_ID}" \
      -H "Content-Type: application/json" \
      -d "{
        \"image\": \"${IMAGE_DATA}\",
        \"metadata\": {
          \"cameraID\": \"${CAMERA_ID}\",
          \"accountID\": \"${ACCOUNT_ID}\",
          \"location\": {
            \"lat\": 37.7749,
            \"lon\": -122.4194
          },
          \"timestamp\": \"${TIMESTAMP}\"
        }
      }")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "202" ]; then
        echo "❌ Error: Request failed with status $HTTP_CODE"
        echo "$BODY"
        RESULTS+=("$IMAGE_FILE: ERROR - HTTP $HTTP_CODE")
        continue
    fi
    
    SCAN_ID=$(echo "$BODY" | jq -r '.scanId' 2>/dev/null)
    
    if [ -z "$SCAN_ID" ] || [ "$SCAN_ID" = "null" ]; then
        echo "❌ Error: Could not extract scanId"
        RESULTS+=("$IMAGE_FILE: ERROR - No scanId")
        continue
    fi
    
    echo "✅ Scan submitted: $SCAN_ID"
    echo "⏳ Polling for results..."
    
    # Poll for results
    MAX_ATTEMPTS=30
    ATTEMPT=0
    FINAL_STATUS=""
    FINAL_SCORE=0
    FINAL_LEVEL="NONE"
    
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
        
        if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
            FINAL_STATUS="$STATUS"
            FINAL_SCORE="$TOP_SCORE"
            FINAL_LEVEL="$MATCH_LEVEL"
            break
        fi
        
        echo "   [Attempt $ATTEMPT] Status: $STATUS..."
        sleep 2
    done
    
    # Format result
    if [ "$FINAL_STATUS" = "COMPLETED" ]; then
        if (( $(echo "$FINAL_SCORE > 89" | bc -l 2>/dev/null || echo "0") )); then
            THREAT_ICON="🔴"
            THREAT_TEXT="HIGH"
        elif (( $(echo "$FINAL_SCORE > 75" | bc -l 2>/dev/null || echo "0") )); then
            THREAT_ICON="🟡"
            THREAT_TEXT="MEDIUM"
        elif (( $(echo "$FINAL_SCORE > 50" | bc -l 2>/dev/null || echo "0") )); then
            THREAT_ICON="🟢"
            THREAT_TEXT="LOW"
        else
            THREAT_ICON="⚪"
            THREAT_TEXT="NONE"
        fi
        
        echo ""
        echo "$THREAT_ICON Result: $THREAT_TEXT THREAT"
        echo "   Score: ${FINAL_SCORE}%"
        echo "   Level: $FINAL_LEVEL"
        echo "   Scan ID: $SCAN_ID"
        
        RESULTS+=("$IMAGE_FILE: $THREAT_TEXT - ${FINAL_SCORE}% (Level: $FINAL_LEVEL)")
    else
        echo "⏰ Timeout: Scan did not complete"
        RESULTS+=("$IMAGE_FILE: TIMEOUT")
    fi
    
    # Small delay between tests
    if [ $i -lt $((${#IMAGES[@]} - 1)) ]; then
        echo "   Waiting 3 seconds before next test..."
        sleep 3
    fi
done

# Print summary
echo ""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for result in "${RESULTS[@]}"; do
    echo "  • $result"
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

