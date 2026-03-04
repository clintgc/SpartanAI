# Demo Dashboard Test Guide

## Test Results Summary

✅ **All automated tests passed!**

- ✓ All required files exist
- ✓ JavaScript syntax valid
- ✓ HTML structure complete
- ✓ All DOM elements present
- ✓ 4 test images loaded
- ✓ 1,917 locations in JSON (includes 10 East Bay CA)
- ✓ All managers and functions present
- ✓ Dependencies (Leaflet.js, Leaflet.heat) referenced

## Manual Testing Steps

### 1. Start Local Server

```bash
cd www
python3 -m http.server 8000
```

Or use any other HTTP server (Node.js, PHP, etc.)

### 2. Open Dashboard

Navigate to: `http://localhost:8000/demo-dashboard.html`

### 3. Test Configuration Modal

- On first load, configuration modal should appear
- Test "Skip (Demo Mode)" button - should close modal
- Test "Save Configuration" with valid API URL and key
- Configuration should be saved to localStorage

### 4. Test Location Loading

- Click on "LOWE'S" logo/text in header
- Map should load with ~1,748 green pins
- Heatmap should appear (blue gradient)
- Location count should update to show number loaded
- Status should change to "Loading locations..." then "Ready"

### 5. Test Batch Scan (Demo Mode)

**Without API credentials:**
- Click on Spartan AI logo
- 990 mock scans should appear instantly in scan logs table
- 10 simulated scans should start (30s intervals)
- First 4 should be high-threat (>89%)
- Status should show "Scanning..."

**Expected behavior:**
- Scan logs table populates with entries
- Status badges show PENDING → COMPLETED
- Scores appear (first 4 should be 90-99%)
- High-threat alerts appear in sidebar
- Red pulsing pins appear on map for high-threats

### 6. Test High-Threat Alerts

- Wait for first high-threat alert (should be within ~2-5 seconds)
- Alert should appear in "High-Threat Alerts" sidebar
- Click on an alert
- POI panel should slide in from right
- Should display:
  - Subject photo (test image)
  - Score (90-99%)
  - Name (based on test image)
  - Biometrics section
  - Criminal record section
  - Action buttons

### 7. Test POI Panel

- Verify subject photo displays correctly
- Check all biometric fields render
- Verify crimes list shows properly
- Test "Call Store" button (should show mock alert)
- Test "Emergency Services" button (should show mock alert)
- Test close button (×) - panel should hide

### 8. Test with Real API (Optional)

If you have API Gateway URL and API Key:

1. Enter credentials in config modal
2. Click "Save Configuration"
3. Click Lowe's logo to load locations
4. Click Spartan AI logo to start batch scan
5. First 4 scans should use real test images
6. API calls should be made to POST /api/v1/scan
7. Polling should occur every 5s via GET /api/v1/scan/{id}
8. Real high-threat results should appear

### 9. Test Responsive Design

- Resize browser window
- Layout should adapt (stacks on mobile)
- All panels should remain accessible
- Map should remain functional

## Expected Test Image Results

The 4 test images should all trigger high-threat alerts:

1. **Anthony-FL.jpeg** - Should score >89%
2. **ArmedRobbery-MI.webp** - Should score >89%
3. **ASSAULT-NC2.webp** - Should score >89%
4. **Burglary-OR.webp** - Should score >89%

## Known Limitations

- Demo mode uses simulated data (not real Captis API calls)
- Placeholder images used for scans 5-10 (will be replaced with real images)
- API polling has 2-minute timeout
- Map pins revert to green after 30 seconds

## Troubleshooting

### Images not loading
- Check browser console for CORS errors
- Verify images exist in `www/img/test-images/`
- Check network tab for 404 errors

### Map not displaying
- Check browser console for Leaflet errors
- Verify Leaflet.js CDN is accessible
- Check for JavaScript errors

### Scans not appearing
- Check browser console for errors
- Verify locations are loaded first
- Check that batch scan was triggered

### API calls failing
- Verify API Gateway URL format (should end with `/v1`)
- Check API key is valid
- Check browser console for error messages
- Verify CORS is enabled on API Gateway

## Browser Compatibility

Tested and should work in:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

Requires:
- Modern browser with ES6+ support
- Fetch API support
- LocalStorage support

