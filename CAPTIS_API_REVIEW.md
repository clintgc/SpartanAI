# Captis API Documentation Review

## Current Implementation

### 1. POST /pub/asi/v4/resolve (Image Submission)
**Endpoint:** `POST https://asi-api.solveacrime.com/pub/asi/v4/resolve`

**Parameters:**
- `accessKey` (query parameter)
- `async=true` (always used)
- `minScore=50`
- `maxMatches=20`
- `timeout=120`
- `fields=matches,biometrics,subjects-wanted,crimes,viewMatchesUrl`
- `site`, `camera`, `name` (optional)

**Request Body:** Image binary data (Buffer)

**Response:** `CaptisResolveResponse`
```typescript
{
  id: string;                    // Captis scan ID
  status: "COMPLETED" | "PENDING" | "PROCESSING";
  matches?: Array<{
    id: string;
    score: number;               // 0-100
    scoreLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    subject: {
      id: string;
      name: string;
      type: string;
      photo?: string;
    };
  }>;
  viewMatchesUrl?: string;       // URL to view results in Captis UI
  timedOutFlag?: boolean;        // true if processing timed out
}
```

**Current Behavior:**
- Returns immediately with `status: "COMPLETED"` but `matches: []` (empty)
- `timedOutFlag: false` or `undefined`
- `viewMatchesUrl` may be present

### 2. GET /pub/asi/v4/scan/{scanId} (Polling)
**Endpoint:** `GET https://asi-api.solveacrime.com/pub/asi/v4/scan/{scanId}?accessKey={accessKey}`

**Current Implementation:**
- Uses `accessKey` as query parameter
- Returns 400 errors when polling completed scans
- Used for polling when `timedOutFlag=true`

**Issue:**
- Returns 400 Bad Request when scan is already COMPLETED
- May not be the correct endpoint for retrieving results

## Known Issues

### Issue 1: GET /scan/{id} Returns 400
- **Symptom:** Poll handler gets 400 errors when trying to poll completed scans
- **Possible Causes:**
  1. Endpoint doesn't support polling completed scans
  2. Authentication format incorrect
  3. Need different endpoint for results retrieval
  4. Results only available via `viewMatchesUrl` web interface

### Issue 2: Initial Response Has No Matches
- **Symptom:** Initial `/resolve` response returns `matches: []` even though results exist
- **Evidence:** User screenshot shows 96.88% match for Anthony-FL.jpeg in Captis UI
- **Possible Causes:**
  1. Results appear after delay (confirmed by user)
  2. Results only available via different endpoint
  3. Need to use `viewMatchesUrl` to access results
  4. API returns results in different format

## Questions from Documentation Review

1. **Is GET /scan/{id} the correct endpoint for polling?**
   - Documentation may specify a different endpoint
   - May need to use `/scans` endpoint with filter
   - May need different authentication method

2. **Are results available in the initial response?**
   - Current logs show `matchesCount: 0` in initial response
   - But user confirms results appear in UI
   - May need to wait longer or use different approach

3. **Should we use viewMatchesUrl?**
   - `viewMatchesUrl` is returned in response
   - May contain results or link to results
   - Could scrape or use API endpoint from URL

4. **Is there a different endpoint for retrieving results?**
   - May be `/results/{scanId}` or similar
   - May be part of `/scans` endpoint with query params
   - May require different authentication

## Next Steps

### Step 1: Check Initial Response
- Log full Captis response structure
- Check if `viewMatchesUrl` contains useful information
- Verify if results are in response but in different field

### Step 2: Verify Correct Endpoint
- Review API documentation for correct polling endpoint
- Test alternative endpoints if available
- Check if `/scans` endpoint can filter by scan ID

### Step 3: Alternative Approaches
- Use `viewMatchesUrl` if it contains API endpoint
- Implement webhook/callback if Captis supports it
- Check if results are available via different API version

## Current Test Results

All 4 images tested:
- ✅ Scans submitted successfully
- ✅ Initial response: `status: COMPLETED`, `matches: []`
- ❌ Poll handler: Gets 400 errors
- ❌ Final results: `topScore: 0%`, `matchLevel: null`
- ⚠️ Expected: >89% (HIGH) for all 4 images

## API Endpoints Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/pub/asi/v4/resolve` | POST | Submit image | ✅ Working |
| `/pub/asi/v4/scan/{id}` | GET | Poll results | ❌ Returns 400 |
| `/pub/asi/v4/scans` | GET | List scans | ✅ Working (per email) |

