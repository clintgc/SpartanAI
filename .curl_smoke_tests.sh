#!/usr/bin/env bash
set -euo pipefail
API=https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1
KEY=gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl
ACCOUNT=550e8400-e29b-41d4-a716-446655440000
IMG=https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg
SCAN_ID=efd2713c-076c-4795-8025-14223ed33b97
HDR=(-H "x-api-key: ${KEY}" -H "x-account-id: ${ACCOUNT}" -H "Content-Type: application/json")

echo "GET /api/v1/scans?accountID=${ACCOUNT}"
curl -s "${API}/api/v1/scans?accountID=${ACCOUNT}" "${HDR[@]}" | jq . || true

echo "PUT /api/v1/consent"
curl -s -X PUT "${API}/api/v1/consent" "${HDR[@]}" -d '{"consent":true}' | jq . || true

echo "POST /api/v1/scan (image URL)"
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
curl -s -X POST "${API}/api/v1/scan" "${HDR[@]}" -d "$PAYLOAD" | jq . || true

echo "GET /api/v1/scan/${SCAN_ID}"
curl -s "${API}/api/v1/scan/${SCAN_ID}" "${HDR[@]}" | jq . || true
