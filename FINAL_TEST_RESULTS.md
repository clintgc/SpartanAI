# Final Test Results - All 4 Images

## Test Date
January 6, 2026

## Results Summary

All 4 test images were successfully tested and return scores >89% as expected:

| Image | Scan ID | Top Score | Match Level | Status |
|-------|---------|-----------|-------------|--------|
| **1. Anthony-FL.jpeg** | `d4db4dff-f123-465d-8b98-19c51cec28a8` | **98.08%** | **HIGH** | ✅ |
| **2. ArmedRobbery-MI.webp** | `499270a5-72f6-41ca-8f09-01ba075fa1ea` | **92.21%** | **HIGH** | ✅ |
| **3. ASSAULT-NC2.webp** | `4dd52ef3-35d3-4a25-ab2d-7a2b59aaa76b` | **89.68%** | **HIGH** | ✅ |
| **4. Burglary-OR.webp** | `8309caa3-1373-44b2-91ea-118c9c61d20b` | **99.05%** | **HIGH** | ✅ |

## Key Fixes Applied

### 1. Captis API Response Structure
- **Issue:** GET `/scan/{id}` returns `{ scan: {...} }` structure, not flat response
- **Fix:** Unwrap the `scan` object from the response

### 2. Matches Location
- **Issue:** Matches are in `recordList` array, not `matches` field
- **Fix:** Transform `recordList` to `matches` format

### 3. Score Location
- **Issue:** Score is in `record.match.score`, not `record.score`
- **Fix:** Extract score from `record.match.score`

### 4. Match Level Storage
- **Issue:** `matchLevel` was calculated but not stored in DynamoDB
- **Fix:** Added `matchLevel` to UpdateExpression

## API Endpoint Details

### POST /pub/asi/v4/resolve
- **Purpose:** Submit image for scanning
- **Response:** Returns scan ID and initial status
- **Status:** ✅ Working

### GET /pub/asi/v4/scan/{scanId}
- **Purpose:** Poll for scan results
- **Response Structure:**
  ```json
  {
    "scan": {
      "id": "...",
      "recordList": [
        {
          "match": {
            "id": "...",
            "score": 98.08,
            "scoreLevel": "HIGH"
          },
          "subject": {
            "id": "...",
            "name": "...",
            "type": "..."
          }
        }
      ]
    }
  }
  ```
- **Status:** ✅ Working (after fixes)

## Polling Flow

1. Scan handler submits image to Captis
2. Captis returns initial response (usually with 0 matches)
3. Scan handler triggers poll handler via EventBridge
4. Poll handler polls GET `/scan/{id}` endpoint
5. Poll handler extracts matches from `recordList`
6. Poll handler calculates `matchLevel` based on thresholds
7. Results stored in DynamoDB with `topScore` and `matchLevel`

## Thresholds Used

- **HIGH:** >89% (default global threshold)
- **MEDIUM:** >70% (default global threshold)
- **LOW:** >50% (default global threshold)

All 4 images exceed the HIGH threshold (>89%), so all return `matchLevel: HIGH`.

## Conclusion

✅ **All 4 test images successfully return >89% scores**  
✅ **Polling mechanism is working correctly**  
✅ **Results are being extracted and stored properly**  
✅ **Match levels are being calculated and stored**

The system is now fully functional for handling delayed Captis results!

