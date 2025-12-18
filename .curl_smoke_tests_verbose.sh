#!/usr/bin/env bash
set -euo pipefail
API=https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1
KEY=gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl
ACCOUNT=550e8400-e29b-41d4-a716-446655440000
IMG=https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg
SCAN_ID=efd2713c-076c-4795-8025-14223ed33b97
HDR=(-H "x-api-key: ${KEY}" -H "x-account-id: ${ACCOUNT}" -H "Content-Type: application/json")

PASS=0
FAIL=0

test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4
  
  echo ""
  echo "=== Testing: $name ==="
  if [ -n "$data" ]; then
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$url" "${HDR[@]}" -d "$data")
  else
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$url" "${HDR[@]}")
  fi
  
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')
  
  echo "HTTP Status: $HTTP_CODE"
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "202" ]; then
    echo "✅ PASS"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL"
    echo "Response: $BODY"
    FAIL=$((FAIL + 1))
  fi
}

test_endpoint "GET /scans" "GET" "${API}/api/v1/scans?accountID=${ACCOUNT}" ""
test_endpoint "PUT /consent" "PUT" "${API}/api/v1/consent" '{"consent":true}'

PAYLOAD=$(cat <<JSON
{
  "image": "${IMG}",
  "metadata": {
    "cameraID": "test-cam",
    "accountID": "${ACCOUNT}",
    "location": {"lat": 37.7749, "lon": -122.4194},
    "timestamp": "2025-12-16T12:00:00Z"
  }
}
JSON
)
test_endpoint "POST /scan" "POST" "${API}/api/v1/scan" "$PAYLOAD"
test_endpoint "GET /scan/${SCAN_ID}" "GET" "${API}/api/v1/scan/${SCAN_ID}" ""

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [ $FAIL -eq 0 ]; then
  echo "✅ All smoke tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi

