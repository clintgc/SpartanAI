# Polling Issue Analysis

## Problem

1. **Captis returns COMPLETED with 0 matches immediately**
   - Logs show: `"hasMatches":false,"matchesCount":0`
   - Status: `COMPLETED`
   - No matches in response

2. **Poll handler gets 400 error when trying to poll**
   - Error: `Captis poll error: 400 - {"requestId":"badf06d3","statusCode":400}`
   - This happens because we're trying to poll a scan that's already COMPLETED

3. **Expected behavior**
   - User expects all 4 test images to return >89% scores
   - But Captis is returning 0 matches

## Root Cause Analysis

### Possible Causes:

1. **Captis database doesn't contain these subjects**
   - The test images might not match anything in Captis's database
   - This would explain why we get 0 matches

2. **Captis returns COMPLETED too quickly**
   - Captis might be returning COMPLETED before processing is done
   - We might need to poll even when status is COMPLETED if matches are empty

3. **API call parameters**
   - The `async=true` parameter might not be working as expected
   - We might need different parameters for these images

4. **Image format/quality**
   - The images might not be in a format Captis can process
   - Or the quality might be too low for matching

## Current Flow

1. Scan handler calls Captis with `async=true`
2. Captis returns immediately with `status: COMPLETED`, `matches: []`
3. Scan handler sees 0 matches, triggers poll handler
4. Poll handler tries to poll, gets 400 error (scan already complete)

## Solutions

### Option 1: Don't poll if status is COMPLETED
- If Captis returns COMPLETED, accept it as final result
- Only poll if status is PENDING or PROCESSING
- **Issue**: We'll miss cases where Captis needs more time

### Option 2: Poll even when COMPLETED with 0 matches
- If status is COMPLETED but matches are empty, still poll
- Wait a few seconds and check again
- **Issue**: Captis returns 400 when polling completed scans

### Option 3: Check with Captis support
- Verify if these test images should match
- Check if there's a delay before matches appear
- Confirm API usage is correct

### Option 4: Use different Captis endpoint
- Check if there's a different endpoint for checking results
- Or if we need to use a different API version

## Recommended Next Steps

1. **Verify test images with Captis**
   - Confirm these images should return matches
   - Check if there's a delay before matches appear

2. **Handle 400 error gracefully**
   - If poll returns 400, check if scan is truly complete
   - Store the 0 matches as final result

3. **Add retry logic with delay**
   - If COMPLETED with 0 matches, wait 5-10 seconds
   - Then check again (might need different endpoint)

4. **Check Captis API documentation**
   - Verify correct polling endpoint
   - Check if there's a status endpoint separate from results

## Current Status

- ✅ EventBridge permissions fixed
- ✅ Poll handler triggers correctly
- ❌ Poll handler gets 400 error from Captis
- ❌ Results show 0 matches (expected >89%)

## Test Images

All 4 images should return >89%:
1. `Anthony-FL.jpeg`
2. `ArmedRobbery-MI.webp`
3. `ASSAULT-NC2.webp`
4. `Burglary-OR.webp`

All are returning 0 matches currently.

