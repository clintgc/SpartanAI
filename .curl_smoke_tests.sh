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
TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4
  local expected_status=$5
  local validate_json=$6
  
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Test $TOTAL: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Method: $method"
  echo "URL: $url"
  
  # Make request
  if [ -n "$data" ]; then
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$url" "${HDR[@]}" -d "$data" 2>&1)
  else
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$url" "${HDR[@]}" 2>&1)
  fi
  
  # Extract HTTP status and body
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2 || echo "000")
  BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d' || echo "")
  
  echo "HTTP Status: $HTTP_CODE"
  
  # Check HTTP status
  if [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" = "000" ]; then
    echo -e "${RED}❌ FAIL: No HTTP response received${NC}"
    echo "Response: $RESPONSE"
    FAIL=$((FAIL + 1))
    return 1
  fi
  
  # Validate expected status code
  if [ "$HTTP_CODE" = "$expected_status" ]; then
    echo -e "${GREEN}✅ HTTP Status: $HTTP_CODE (expected $expected_status)${NC}"
  else
    echo -e "${RED}❌ HTTP Status: $HTTP_CODE (expected $expected_status)${NC}"
    FAIL=$((FAIL + 1))
    return 1
  fi
  
  # Validate JSON if requested
  if [ "$validate_json" = "true" ]; then
    if echo "$BODY" | jq . >/dev/null 2>&1; then
      echo -e "${GREEN}✅ Valid JSON response${NC}"
      echo ""
      echo "Response body:"
      echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
      
      # Additional validations based on endpoint
      if [[ "$name" == *"POST /scan"* ]]; then
        if echo "$BODY" | jq -e '.scanId' >/dev/null 2>&1; then
          export SCAN_ID_FROM_RESPONSE=$(echo "$BODY" | jq -r '.scanId // empty')
          if [ -n "$SCAN_ID_FROM_RESPONSE" ]; then
            echo -e "${GREEN}✅ Contains scanId: $SCAN_ID_FROM_RESPONSE${NC}"
          else
            echo -e "${YELLOW}⚠️  Warning: scanId is empty${NC}"
          fi
        else
          echo -e "${YELLOW}⚠️  Warning: No scanId in response${NC}"
        fi
      fi
      
      if [[ "$name" == *"GET /scans"* ]]; then
        if echo "$BODY" | jq -e '.scans' >/dev/null 2>&1; then
          SCAN_COUNT=$(echo "$BODY" | jq '.scans | length' 2>/dev/null || echo "0")
          echo -e "${GREEN}✅ Contains scans array with $SCAN_COUNT items${NC}"
        fi
      fi
      
      if [[ "$name" == *"GET /scan"* ]] && [[ "$name" != *"GET /scans"* ]]; then
        if echo "$BODY" | jq -e '.scanId' >/dev/null 2>&1; then
          echo -e "${GREEN}✅ Contains scanId${NC}"
        fi
        if echo "$BODY" | jq -e '.status' >/dev/null 2>&1; then
          STATUS=$(echo "$BODY" | jq -r '.status' 2>/dev/null || echo "")
          echo -e "${GREEN}✅ Contains status: $STATUS${NC}"
        fi
      fi
      
    else
      echo -e "${RED}❌ Invalid JSON response${NC}"
      echo "Response body:"
      echo "$BODY"
      FAIL=$((FAIL + 1))
      return 1
    fi
  else
    echo "Response body:"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  fi
  
  PASS=$((PASS + 1))
  return 0
}

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                    SPARTAN AI SMOKE TESTS                                   ║"
echo "║                    Thermopylae-Stage Environment                             ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "API Base URL: $API"
echo "Account ID: $ACCOUNT"
echo ""

# Test 1: GET /scans
test_endpoint "GET /api/v1/scans" \
  "GET" \
  "${API}/api/v1/scans?accountID=${ACCOUNT}" \
  "" \
  "200" \
  "true"

# Test 2: PUT /consent
test_endpoint "PUT /api/v1/consent" \
  "PUT" \
  "${API}/api/v1/consent" \
  '{"consent":true}' \
  "200" \
  "true"

# Test 3: POST /scan
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

test_endpoint "POST /api/v1/scan" \
  "POST" \
  "${API}/api/v1/scan" \
  "$PAYLOAD" \
  "200" \
  "true"

# Extract scanId from POST response if available
if [ -n "${SCAN_ID_FROM_RESPONSE:-}" ]; then
  SCAN_ID=$SCAN_ID_FROM_RESPONSE
  echo -e "${GREEN}Using scanId from POST response: $SCAN_ID${NC}"
fi

# Test 4: GET /scan/{id}
test_endpoint "GET /api/v1/scan/${SCAN_ID}" \
  "GET" \
  "${API}/api/v1/scan/${SCAN_ID}" \
  "" \
  "200" \
  "true"

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                              TEST SUMMARY                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Failed: $FAIL${NC}"
else
  echo -e "${GREEN}Failed: $FAIL${NC}"
fi
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                    ✅ ALL SMOKE TESTS PASSED                                 ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                    ❌ SOME TESTS FAILED                                      ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
  exit 1
fi
