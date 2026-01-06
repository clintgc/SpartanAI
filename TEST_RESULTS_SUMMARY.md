# Test Results Summary - All 4 Images

## Test Execution
**Date:** January 5, 2026  
**Time:** 4:26 PM - 4:29 PM  
**Status:** All scans submitted, results pending

## Test Images

### 1. Anthony-FL.jpeg
- **Scan ID:** `4f83a793-8505-4249-aea0-c2d4033cf66a`
- **Status:** COMPLETED
- **Top Score:** 0%
- **Match Level:** null
- **Expected:** >89% (HIGH)

### 2. ArmedRobbery-MI.webp
- **Scan ID:** `241a0f36-17e1-4198-932a-62371780f6d7`
- **Status:** COMPLETED
- **Top Score:** 0%
- **Match Level:** null
- **Expected:** >89% (HIGH)

### 3. ASSAULT-NC2.webp
- **Scan ID:** `ce99e241-76ed-4079-92cb-c73b7755b4df`
- **Status:** COMPLETED
- **Top Score:** 0%
- **Match Level:** null
- **Expected:** >89% (HIGH)

### 4. Burglary-OR.webp
- **Scan ID:** `a2b51ebd-e511-44b9-9f5c-ee6755215f49`
- **Status:** COMPLETED
- **Top Score:** 0%
- **Match Level:** null
- **Expected:** >89% (HIGH)

## Current Status

All 4 scans show:
- ✅ Status: COMPLETED
- ❌ Top Score: 0% (should be >89%)
- ❌ Match Level: null (should be HIGH)

## Issues Identified

1. **UpdateExpression Error**
   - Poll handler is getting `ValidationException` for `:statusVal`
   - This prevents results from being stored in DynamoDB
   - Fix deployed but may need verification

2. **Captis Polling**
   - Captis returns 400 when polling completed scans
   - Poll handler retries with exponential backoff
   - Results may appear after delay (up to 120 seconds)

3. **Results Not Appearing**
   - Even after 120 seconds, results are still 0%
   - This suggests either:
     - Poll handler is not successfully retrieving results
     - Captis is not returning matches for these scans
     - UpdateExpression error is preventing storage

## Next Steps

1. Verify UpdateExpression fix is deployed correctly
2. Check poll handler logs for successful match retrieval
3. Verify Captis API is returning matches for these images
4. Test with a known working image to verify system functionality

## Expected vs Actual

| Image | Expected Score | Expected Level | Actual Score | Actual Level |
|-------|---------------|----------------|--------------|--------------|
| Anthony-FL.jpeg | >89% | HIGH | 0% | null |
| ArmedRobbery-MI.webp | >89% | HIGH | 0% | null |
| ASSAULT-NC2.webp | >89% | HIGH | 0% | null |
| Burglary-OR.webp | >89% | HIGH | 0% | null |

**All tests show 0% scores, which indicates the poll handler is not successfully retrieving or storing results.**
