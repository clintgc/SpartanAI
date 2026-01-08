// Spartan AI Demo Dashboard - Main JavaScript

// Configuration
const CONFIG = {
    apiBaseUrl: localStorage.getItem('apiBaseUrl') || '',
    apiKey: localStorage.getItem('apiKey') || '',
    accountId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID format required by API
    highThreatThreshold: 89,
    pollingInterval: 5000, // 5 seconds
    realScanInterval: 30000, // 30 seconds between real scans
    mockScanCount: 990,
    realScanCount: 10,
    pulseDuration: 30000, // 30 seconds
};

// Global state
let locations = [];
let map = null;
let heatLayer = null;
let markers = {};
let pulsatingMarkers = {}; // Track pulsating markers separately
let scanLogs = [];
let alerts = [];
let activePolling = new Map();
let isScanning = false;
let testImagesBase64 = []; // Cache for test images

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check if config exists
    if (!CONFIG.apiBaseUrl || !CONFIG.apiKey) {
        showConfigModal();
    }
    
    // Initialize managers
    MapManager.initMap();
    
    // Pre-load test images
    try {
        if (window.ImageLoader) {
            testImagesBase64 = await window.ImageLoader.loadTestImages();
            console.log(`Loaded ${testImagesBase64.length} test images`);
        }
    } catch (error) {
        console.error('Error loading test images:', error);
    }
    
    // Setup event listeners
    const lowesLogo = document.getElementById('lowesLogo');
    const spartanLogo = document.getElementById('spartanLogo');
    const closePOI = document.getElementById('closePOI');
    const configForm = document.getElementById('configForm');
    const skipConfig = document.getElementById('skipConfig');
    
    if (lowesLogo) {
        lowesLogo.addEventListener('click', () => {
            MapManager.loadLocations();
        });
    }
    
    if (spartanLogo) {
        spartanLogo.addEventListener('click', () => {
            if (!isScanning) {
                BatchScanEngine.startBatchScan();
            }
        });
    }
    
    if (closePOI) {
        closePOI.addEventListener('click', () => {
            POIPanelManager.hidePOI();
        });
    }
    
    if (configForm) {
        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveConfig();
        });
    } else {
        console.error('configForm element not found!');
    }
    
    if (skipConfig) {
        skipConfig.addEventListener('click', () => {
            hideConfigModal();
        });
    } else {
        console.error('skipConfig button not found!');
    }
});

// Configuration Management
function showConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal) {
        modal.classList.remove('hidden');
        console.log('Config modal shown');
    } else {
        console.error('configModal element not found!');
    }
}

function hideConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal) {
        modal.classList.add('hidden');
        console.log('Config modal hidden');
    } else {
        console.error('configModal element not found!');
    }
}

function saveConfig() {
    const apiBaseUrlEl = document.getElementById('apiBaseUrl');
    const apiKeyEl = document.getElementById('apiKey');
    
    if (!apiBaseUrlEl || !apiKeyEl) {
        console.error('API config input elements not found!');
        alert('Error: Configuration form elements not found. Please refresh the page.');
        return;
    }
    
    const apiBaseUrl = apiBaseUrlEl.value.trim();
    const apiKey = apiKeyEl.value.trim();
    
    if (apiBaseUrl && apiKey) {
        CONFIG.apiBaseUrl = apiBaseUrl;
        CONFIG.apiKey = apiKey;
        localStorage.setItem('apiBaseUrl', apiBaseUrl);
        localStorage.setItem('apiKey', apiKey);
        console.log('Configuration saved');
        hideConfigModal();
    } else {
        alert('Please enter both API Base URL and API Key');
    }
}

// Map Manager
const MapManager = {
    initMap() {
        // Initialize Leaflet map centered on US
        map = L.map('map', {
            center: [39.8283, -98.5795],
            zoom: 4,
            zoomControl: true,
        });
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(map);
    },
    
    async loadLocations() {
        if (locations.length > 0) {
            return; // Already loaded
        }
        
        updateStatus('Loading locations...', 'scanning');
        
        try {
            const response = await fetch('data/locations.json');
            locations = await response.json();
            
            // Limit to first 1,748 if more were generated (per PRD spec)
            if (locations.length > 1748) {
                locations = locations.slice(0, 1748);
            }
            
            console.log(`Loaded ${locations.length} locations`);
            
            // Add pins to map
            locations.forEach(location => {
                this.addPin(location, 'green');
            });
            
            // Add heatmap
            this.updateHeatmap();
            
            // Zoom to California/western United States
            const californiaLocations = locations.filter(loc => loc.state === 'CA' || loc.state === 'California');
            if (californiaLocations.length > 0) {
                // Calculate bounds for California locations
                const lats = californiaLocations.map(loc => loc.lat);
                const lons = californiaLocations.map(loc => loc.lon);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLon = Math.min(...lons);
                const maxLon = Math.max(...lons);
                
                // Expand bounds slightly for better view
                const latPadding = (maxLat - minLat) * 0.2;
                const lonPadding = (maxLon - minLon) * 0.2;
                
                const bounds = [
                    [minLat - latPadding, minLon - lonPadding],
                    [maxLat + latPadding, maxLon + lonPadding]
                ];
                
                map.fitBounds(bounds, { padding: [50, 50] });
                console.log(`Zoomed to California region with ${californiaLocations.length} locations`);
            } else {
                // Fallback: zoom to western US if no CA locations found
                map.setView([36.7783, -119.4179], 6); // Center on California
                console.log('No California locations found, zooming to default California view');
            }
            
            // Update UI
            document.getElementById('locationCount').textContent = locations.length;
            updateStatus('Ready', 'ready');
            
        } catch (error) {
            console.error('Error loading locations:', error);
            updateStatus('Error loading locations', 'error');
        }
    },
    
    addPin(location, color = 'green') {
        // Normalize location data - handle both storeId/id and storeName/name
        const locationId = location.storeId || location.id;
        const locationName = location.storeName || location.name;
        const address = location.address || `${location.city}, ${location.state}`;
        
        // Ensure coordinates are numbers
        const lat = parseFloat(location.lat);
        const lon = parseFloat(location.lon);
        if (isNaN(lat) || isNaN(lon)) {
            console.error(`Invalid coordinates for ${locationId}: ${location.lat}, ${location.lon}`);
            return;
        }
        
        const iconColor = color === 'red' ? '#FF4444' : '#00FF88';
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 12px;
                height: 12px;
                background: ${iconColor};
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
        });
        
        const marker = L.marker([lat, lon], { icon })
            .addTo(map)
            .bindPopup(`<strong>${locationName}</strong><br>${address}`);
        
        markers[locationId] = marker;
    },
    
    pulsePin(locationId, duration = CONFIG.pulseDuration) {
        // Find location - handle both storeId and id fields
        const location = locations.find(loc => (loc.storeId || loc.id) === locationId);
        if (!location) {
            console.error(`Location data not found for ID: ${locationId}`);
            return;
        }
        
        // Parse and validate coordinates (Grok's improvement)
        const lat = parseFloat(location.lat);
        const lon = parseFloat(location.lon);
        if (isNaN(lat) || isNaN(lon)) {
            console.error(`Invalid coordinates for ${locationId}: ${location.lat}, ${location.lon}`);
            return;
        }
        
        // Validate coordinate bounds
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            console.error(`Coordinates out of bounds for ${locationId}: ${lat}, ${lon}`);
            return;
        }
        
        console.log(`Pulsating pin for location ID: ${locationId} at ${lat}, ${lon}`);
        
        // Remove any existing pulsating marker for this location
        if (pulsatingMarkers[locationId]) {
            map.removeLayer(pulsatingMarkers[locationId]);
            delete pulsatingMarkers[locationId];
        }
        
        // Create red pulsating divIcon (Grok's simplified approach: 20px base, center anchor)
        const redIcon = L.divIcon({
            className: 'pulse-pin', // Base class for animation
            html: `<div class="pulse-pin-red"></div>`,
            iconSize: [20, 20],   // Fixed size for reliable anchoring (Grok's improvement)
            iconAnchor: [10, 10], // Exact center (half of iconSize) - foolproof for circles
            popupAnchor: [0, -10] // Above for any popups
        });
        
        // Create new marker at exact coords, high z-index
        const pulsatingMarker = L.marker([lat, lon], {
            icon: redIcon,
            zIndexOffset: 1000  // On top of green pins
        }).addTo(map);
        
        // Store and verify position
        pulsatingMarkers[locationId] = pulsatingMarker;
        const markerPos = pulsatingMarker.getLatLng();
        console.log(`Pulsating marker created at: ${markerPos.lat}, ${markerPos.lng} (Expected: ${lat}, ${lon})`);
        
        // Intensify heatmap
        this.updateHeatmap(true);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (pulsatingMarkers[locationId]) {
                map.removeLayer(pulsatingMarkers[locationId]);
                delete pulsatingMarkers[locationId];
                console.log(`Removed pulsating pin for location ID: ${locationId}`);
            }
        }, duration);
    },
    
    panToLocation(lat, lon, locationId = null) {
        // Pan and zoom to the alert location at regional level (zoom 8)
        map.flyTo([lat, lon], 8, {
            duration: 1.0,
            easeLinearity: 0.25
        });
        
        // If we have a location ID and the pin is pulsating, ensure it's visible
        if (locationId && markers[locationId]) {
            // Open popup to highlight the location
            setTimeout(() => {
                markers[locationId].openPopup();
            }, 1000);
        }
        
        console.log(`Map panned to location: ${lat}, ${lon} (${locationId || 'no ID'}) at regional level`);
    },
    
    updateHeatmap(intensify = false) {
        if (heatLayer) {
            map.removeLayer(heatLayer);
        }
        
        const heatData = locations.map(loc => [loc.lat, loc.lon, intensify ? 1.0 : 0.5]);
        
        heatLayer = L.heatLayer(heatData, {
            radius: 25,
            blur: 15,
            maxZoom: 17,
            max: 1.0,
            gradient: {
                0.0: 'blue',
                0.5: 'cyan',
                0.7: 'lime',
                1.0: 'red'
            }
        }).addTo(map);
    }
};

// Batch Scan Engine
const BatchScanEngine = {
    async startBatchScan() {
        if (locations.length === 0) {
            alert('Please load locations first by clicking the Lowe\'s logo');
            return;
        }
        
        if (isScanning) {
            return;
        }
        
        isScanning = true;
        updateStatus('Scanning...', 'scanning');
        
        // Generate 10 random locations for real scans
        const realScanLocations = this.getRandomLocations(CONFIG.realScanCount);
        
        // Simulate 990 mock scans instantly
        this.simulateMockScans(CONFIG.mockScanCount);
        
        // Submit 10 real scans with 30s spacing
        if (CONFIG.apiBaseUrl && CONFIG.apiKey) {
            console.log('Using real API integration');
            this.submitRealScans(realScanLocations);
        } else {
            // Demo mode - simulate real scans too
            console.log('Using demo mode (no API credentials)');
            this.simulateRealScans(realScanLocations);
        }
    },
    
    getRandomLocations(count) {
        // For high-threat scans, use California locations only
        const californiaLocations = locations.filter(loc => loc.state === 'CA' || loc.state === 'California');
        
        if (californiaLocations.length > 0) {
            // Use California locations for real scans (which will be high-threat)
            const shuffled = [...californiaLocations].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, Math.min(count, californiaLocations.length));
            
            // If we need more locations than available in CA, fill with random
            if (selected.length < count) {
                const remaining = count - selected.length;
                const otherLocations = locations.filter(loc => loc.state !== 'CA' && loc.state !== 'California');
                const shuffledOthers = [...otherLocations].sort(() => 0.5 - Math.random());
                selected.push(...shuffledOthers.slice(0, remaining));
            }
            
            console.log(`Selected ${selected.length} locations (${selected.filter(l => l.state === 'CA' || l.state === 'California').length} from California) for real scans`);
            return selected;
        } else {
            // Fallback to random if no California locations
            const shuffled = [...locations].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        }
    },
    
    simulateMockScans(count) {
        const shuffled = [...locations].sort(() => 0.5 - Math.random());
        const totalDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
        const interval = totalDuration / count; // Time between each scan
        
        for (let i = 0; i < count; i++) {
            // Schedule each scan to appear at intervals over 5 minutes
            setTimeout(() => {
                const location = shuffled[i];
                const cameraName = `Parking-Lot-Cam-${String(Math.floor(Math.random() * 10) + 1).padStart(2, '0')}`;
                const topScore = Math.floor(Math.random() * 50) + 20; // 20-70% for low-threat
                
                const logEntry = {
                    scanId: `mock-${Date.now()}-${i}`,
                    location: `${location.city}, ${location.state}`,
                    storeName: location.storeName || location.name,
                    cameraName: cameraName,
                    timestamp: new Date().toISOString(),
                    status: 'COMPLETED',
                    topScore: topScore
                };
                
                ScanLogManager.addLogEntry(logEntry);
            }, i * interval);
        }
    },
    
    async submitRealScans(scanLocations) {
        for (let i = 0; i < scanLocations.length; i++) {
            const location = scanLocations[i];
            
            // Wait 30s between scans (except first)
            if (i > 0) {
                await this.sleep(CONFIG.realScanInterval);
            }
            
            // Generate camera name
            const cameraName = `Parking-Lot-Cam-${String(Math.floor(Math.random() * 10) + 1).padStart(2, '0')}`;
            
            // Use test images for first 4 scans, placeholder for remaining 6
            let imageBase64;
            let testImageIndex = null;
            if (i < testImagesBase64.length && testImagesBase64[i]) {
                imageBase64 = testImagesBase64[i];
                testImageIndex = i; // Store which test image we're using
                console.log(`Using test image ${i + 1} for scan ${i + 1}`);
            } else {
                // Placeholder for remaining scans (will be replaced with real images later)
                // Must be > 100 chars for validation - using a 10x10 pixel PNG
                imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAjSURBVHgB7dExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A8CqQABAc0XJwAAAABJRU5ErkJggg==';
                console.log(`Using placeholder image for scan ${i + 1} (will be replaced with real image later)`);
            }
            
            // Validate image base64 before sending
            if (!imageBase64 || imageBase64.length < 100) {
                console.warn(`Image ${i + 1} is too short (${imageBase64?.length || 0} chars), skipping scan`);
                continue;
            }
            
            try {
                // Submit scan
                const scanResponse = await this.submitScan(location, cameraName, imageBase64);
                
                if (scanResponse && scanResponse.scanId) {
                    // Store test image index with scan ID for later retrieval
                    if (testImageIndex !== null) {
                        scanResponse.testImageIndex = testImageIndex;
                    }
                    
                    // Add initial log entry
                    const logEntry = {
                        scanId: scanResponse.scanId,
                        location: `${location.city}, ${location.state}`,
                        storeName: location.storeName || location.name,
                        cameraName: cameraName,
                        timestamp: new Date().toISOString(),
                        status: scanResponse.status || 'PENDING',
                        topScore: scanResponse.topScore || null
                    };
                    
                    ScanLogManager.addLogEntry(logEntry);
                    
                    // Always poll for results, even if status is COMPLETED
                    // Captis results may not be immediately available
                    if (scanResponse.topScore && scanResponse.topScore > CONFIG.highThreatThreshold) {
                        // If we have immediate high-threat results, handle it
                        const scanResult = {
                            scanId: scanResponse.scanId,
                            id: scanResponse.scanId,
                            status: scanResponse.status,
                            topScore: scanResponse.topScore,
                            viewMatchesUrl: scanResponse.viewMatchesUrl,
                            matches: [{
                                id: scanResponse.scanId,
                                score: scanResponse.topScore,
                                scoreLevel: 'HIGH',
                                subject: {
                                    id: 'subject-1',
                                    name: 'Person of Interest',
                                    type: 'WANTED'
                                }
                            }]
                        };
                        this.handleHighThreat(scanResult, location, testImageIndex);
                    } else {
                        // Always poll to get full results (matches, crimes, biometrics)
                        // Even if status is COMPLETED, results might not be ready yet
                        // Pass testImageIndex to polling so we can use it when high-threat is detected
                        this.pollScanStatus(scanResponse.scanId, location, testImageIndex);
                    }
                }
            } catch (error) {
                console.error('Error submitting scan:', error);
                const errorMessage = error.message || 'Unknown error';
                console.error('Full error details:', {
                    url: `${CONFIG.apiBaseUrl}/api/v1/scan`,
                    location: `${location.city}, ${location.state}`,
                    error: errorMessage
                });
                
                const logEntry = {
                    scanId: `error-${Date.now()}-${i}`,
                    location: `${location.city}, ${location.state}`,
                    storeName: location.storeName || location.name,
                    cameraName: cameraName,
                    timestamp: new Date().toISOString(),
                    status: 'ERROR',
                    topScore: null,
                    errorMessage: errorMessage
                };
                ScanLogManager.addLogEntry(logEntry);
            }
        }
    },
    
    async submitScan(location, cameraName, imageBase64) {
        // Build URL - baseUrl should already include /v1
        let url = CONFIG.apiBaseUrl.trim();
        if (url.endsWith('/')) {
            url = url.slice(0, -1); // Remove trailing slash
        }
        if (!url.endsWith('/v1')) {
            url = `${url}/v1`;
        }
        url = `${url}/api/v1/scan`;
        
        console.log('Submitting scan to:', url);
        console.log('Image base64 length:', imageBase64 ? imageBase64.length : 0);
        
        const requestBody = {
            image: imageBase64,
            metadata: {
                cameraID: cameraName,
                accountID: CONFIG.accountId,
                location: {
                    lat: location.lat,
                    lon: location.lon
                },
                timestamp: new Date().toISOString()
            }
        };
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.apiKey
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                let errorMessage = `API error: ${response.status} ${response.statusText}`;
                let errorBody = null;
                try {
                    errorBody = await response.json();
                    console.error('API error response:', errorBody);
                    if (errorBody.message || errorBody.error) {
                        errorMessage = `${errorMessage} - ${errorBody.message || errorBody.error}`;
                    }
                } catch (e) {
                    // If response isn't JSON, try to get text
                    try {
                        const errorText = await response.text();
                        console.error('API error text:', errorText);
                        errorMessage = `${errorMessage} - ${errorText}`;
                    } catch (e2) {
                        // If we can't read the response, just use status
                    }
                }
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            console.log('Scan submitted successfully:', result);
            return result;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    },
    
    async pollScanStatus(scanId, location, testImageIndex = null) {
        // Build URL with accountID as query parameter to avoid CORS header issues
        let baseUrl = CONFIG.apiBaseUrl.trim();
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        if (!baseUrl.endsWith('/v1')) {
            baseUrl = `${baseUrl}/v1`;
        }
        const url = `${baseUrl}/api/v1/scan/${scanId}?accountID=${encodeURIComponent(CONFIG.accountId)}`;
        let pollCount = 0;
        const maxPolls = 24; // 24 * 5s = 2 minutes max
        
        // Store test image index with scan ID mapping for later use
        if (testImageIndex !== null) {
            if (!window.scanImageMap) {
                window.scanImageMap = {};
            }
            window.scanImageMap[scanId] = testImageIndex;
        }
        
        const pollInterval = setInterval(async () => {
            pollCount++;
            
            // Stop polling after max attempts
            if (pollCount > maxPolls) {
                clearInterval(pollInterval);
                activePolling.delete(scanId);
                ScanLogManager.updateLogStatus(scanId, 'TIMEOUT', null);
                return;
            }
            
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'x-api-key': CONFIG.apiKey
                    }
                });
                
                if (!response.ok) {
                    if (response.status === 404) {
                        // Scan not found yet, keep polling
                        return;
                    }
                    if (response.status === 403) {
                        // Forbidden - might be authorization issue, but continue polling
                        console.warn('Poll returned 403, continuing...');
                        return;
                    }
                    throw new Error(`Poll error: ${response.status}`);
                }
                
                const scanData = await response.json();
                console.log('📊 Poll result (full data):', JSON.stringify(scanData, null, 2));
                
                // Update log entry
                // Response format from scan-detail-handler: { scanId, accountID, status, topScore, matchLevel, matches, crimes, biometrics, ... }
                // Extract topScore - check matches array if topScore is 0 or missing
                let topScore = scanData.topScore || 0;
                if (topScore === 0 && scanData.matches && Array.isArray(scanData.matches) && scanData.matches.length > 0) {
                    // If topScore is 0 but we have matches, extract from first match
                    topScore = scanData.matches[0].score || 0;
                    console.log(`⚠️ topScore was 0, extracted from matches[0].score: ${topScore}`);
                }
                
                const status = scanData.status || 'COMPLETED';
                
                ScanLogManager.updateLogStatus(scanId, status, topScore);
                
                // Log scan data structure for debugging
                console.log('🔍 Scan data analysis:', {
                    scanId,
                    status,
                    topScore,
                    topScoreFromField: scanData.topScore,
                    hasMatches: !!scanData.matches,
                    matchesCount: scanData.matches?.length || 0,
                    firstMatchScore: scanData.matches?.[0]?.score,
                    matchLevel: scanData.matchLevel,
                    hasCrimes: !!scanData.crimes,
                    crimesCount: scanData.crimes?.length || 0,
                    hasBiometrics: !!scanData.biometrics,
                    biometricsCount: scanData.biometrics?.length || 0,
                    pollingRequired: scanData.pollingRequired,
                    captisId: scanData.captisId
                });
                
                // Check for high-threat - must have topScore > threshold
                if (topScore > CONFIG.highThreatThreshold) {
                    console.log('🚨 High-threat detected!', { 
                        scanId,
                        topScore, 
                        matchLevel: scanData.matchLevel,
                        hasMatches: !!scanData.matches,
                        matchesCount: scanData.matches?.length || 0,
                        matches: scanData.matches,
                        hasCrimes: !!scanData.crimes,
                        crimesCount: scanData.crimes?.length || 0,
                        crimes: scanData.crimes,
                        hasBiometrics: !!scanData.biometrics,
                        biometrics: scanData.biometrics,
                        hasImage: !!scanData.image,
                        hasMetadata: !!scanData.metadata,
                        fullScanData: scanData
                    });
                    
                    // Build scan result object for POI panel using actual data from DynamoDB
                    // Ensure we preserve all fields from the API response
                    const topMatchFromData = scanData.matches && Array.isArray(scanData.matches) && scanData.matches.length > 0
                        ? scanData.matches[0]
                        : null;
                    
                    // Extract mugshot URL from top match
                    const mugShotUrl = topMatchFromData?.subject?.photo || scanData.mugShotUrl || null;
                    
                    // Get original scan image (the image that was uploaded) from test image map
                    const storedImageIndexForImage = window.scanImageMap?.[scanId] ?? testImageIndex;
                    let originalScanImageDataUrl = null;
                    if (storedImageIndexForImage !== null && storedImageIndexForImage < testImagesBase64.length) {
                        const imagePath = window.ImageLoader?.TEST_IMAGES[storedImageIndexForImage] || '';
                        if (imagePath.endsWith('.jpeg') || imagePath.endsWith('.jpg')) {
                            originalScanImageDataUrl = `data:image/jpeg;base64,${testImagesBase64[storedImageIndexForImage]}`;
                        } else if (imagePath.endsWith('.webp')) {
                            originalScanImageDataUrl = `data:image/webp;base64,${testImagesBase64[storedImageIndexForImage]}`;
                        }
                    }
                    
                    console.log('🖼️ Image extraction:', {
                        hasTopMatch: !!topMatchFromData,
                        topMatchPhoto: topMatchFromData?.subject?.photo ? topMatchFromData.subject.photo.substring(0, 50) + '...' : 'none',
                        scanDataMugShotUrl: scanData.mugShotUrl ? scanData.mugShotUrl.substring(0, 50) + '...' : 'none',
                        finalMugShotUrl: mugShotUrl ? mugShotUrl.substring(0, 50) + '...' : 'none',
                        storedImageIndex: storedImageIndexForImage,
                        hasOriginalScan: !!originalScanImageDataUrl
                    });
                    
                    const scanResult = {
                        scanId: scanData.scanId || scanId,
                        id: scanData.scanId || scanId,
                        status: scanData.status || 'COMPLETED',
                        topScore: scanData.topScore || topScore,
                        matchLevel: scanData.matchLevel || topMatchFromData?.scoreLevel || 'HIGH',
                        viewMatchesUrl: scanData.viewMatchesUrl,
                        // Preserve subject info from top match for easy access
                        subjectName: topMatchFromData?.subject?.name || scanData.subjectName,
                        subjectType: topMatchFromData?.subject?.type || scanData.subjectType,
                        mugShotUrl: mugShotUrl,
                        // Preserve original scan image (the uploaded image)
                        testImageDataUrl: originalScanImageDataUrl || scanData.testImageDataUrl,
                        // Use actual matches from DynamoDB if available, preserve full structure
                        matches: (scanData.matches && Array.isArray(scanData.matches) && scanData.matches.length > 0)
                            ? scanData.matches.map(match => ({
                                id: match.id || scanId,
                                score: match.score || 0,
                                scoreLevel: match.scoreLevel || match.matchLevel || 'UNKNOWN',
                                subject: match.subject ? {
                                    id: match.subject.id || match.id || 'unknown',
                                    name: match.subject.name || 'Unknown',
                                    type: match.subject.type || 'UNKNOWN',
                                    photo: match.subject.photo || null
                                } : {
                                    id: match.id || 'unknown',
                                    name: 'Unknown',
                                    type: 'UNKNOWN',
                                    photo: null
                                }
                            }))
                            : (scanData.topScore ? [{
                                id: scanData.scanId || scanId,
                                score: scanData.topScore,
                                scoreLevel: scanData.matchLevel || 'HIGH',
                                subject: {
                                    id: 'subject-1',
                                    name: scanData.subjectName || 'Person of Interest',
                                    type: scanData.subjectType || 'WANTED',
                                    photo: scanData.mugShotUrl || scanData.metadata?.imageUrl || scanData.image
                                }
                            }] : []),
                        // Use actual biometrics from DynamoDB if available, preserve full structure
                        // Note: poll-handler doesn't store biometrics, so this may be empty
                        biometrics: (scanData.biometrics && Array.isArray(scanData.biometrics) && scanData.biometrics.length > 0)
                            ? scanData.biometrics
                            : [],
                        // Use actual crimes from DynamoDB if available, preserve full structure
                        crimes: (scanData.crimes && Array.isArray(scanData.crimes) && scanData.crimes.length > 0)
                            ? scanData.crimes
                            : [],
                        // Include image if available (could be base64 or URL)
                        image: scanData.image || scanData.metadata?.imageUrl,
                        // Preserve all metadata
                        metadata: scanData.metadata || {}
                    };
                    
                    console.log('📦 Built scan result for POI:', {
                        scanId: scanResult.scanId,
                        topScore: scanResult.topScore,
                        matchesCount: scanResult.matches?.length || 0,
                        crimesCount: scanResult.crimes?.length || 0,
                        biometricsCount: scanResult.biometrics?.length || 0,
                        hasImage: !!scanResult.image
                    });
                    
                    // Get test image index if available
                    const storedImageIndex = window.scanImageMap?.[scanId] ?? testImageIndex;
                    this.handleHighThreat(scanResult, location, storedImageIndex);
                    clearInterval(pollInterval);
                    activePolling.delete(scanId);
                    // Clean up mapping
                    if (window.scanImageMap) {
                        delete window.scanImageMap[scanId];
                    }
                } else if (status === 'COMPLETED' || status === 'FAILED') {
                    // If completed but no high-threat, check if we should continue polling
                    // If topScore is 0 and we have no matches, the poll-handler might still be processing
                    const hasMatches = scanData.matches && Array.isArray(scanData.matches) && scanData.matches.length > 0;
                    const pollingRequired = scanData.pollingRequired === true;
                    
                    if (topScore === 0 && !hasMatches && (pollingRequired || pollCount < 10)) {
                        // Continue polling - poll-handler might still be processing
                        console.log(`Scan ${scanId} completed but no results yet (pollingRequired: ${pollingRequired}, pollCount: ${pollCount}), continuing to poll...`);
                        return; // Continue polling
                    }
                    
                    // If completed but no high-threat, stop polling
                    console.log(`Scan ${scanId} completed with score ${topScore}% (not high-threat)`);
                    clearInterval(pollInterval);
                    activePolling.delete(scanId);
                    // Clean up mapping
                    if (window.scanImageMap) {
                        delete window.scanImageMap[scanId];
                    }
                    
                    // Update status when all polling completes
                    if (activePolling.size === 0) {
                        updateStatus('Ready', 'ready');
                        isScanning = false;
                    }
                } else {
                    // Still processing, continue polling
                    console.log(`Scan ${scanId} still processing (status: ${status}, score: ${topScore})`);
                }
                
            } catch (error) {
                console.error('Polling error:', error);
                // Don't stop polling on network errors, they might be temporary
                if (pollCount > 10) {
                    // After 10 failed attempts, give up
                    clearInterval(pollInterval);
                    activePolling.delete(scanId);
                    ScanLogManager.updateLogStatus(scanId, 'ERROR', null);
                }
            }
        }, CONFIG.pollingInterval);
        
        activePolling.set(scanId, pollInterval);
    },
    
    handleHighThreat(scanResult, location, testImageIndex = null) {
        console.log('🚨 Handling high-threat alert:', { 
            scanId: scanResult.scanId || scanResult.id,
            topScore: scanResult.topScore,
            location: location.storeName || location.name,
            locationState: location.state,
            hasMatches: !!scanResult.matches,
            hasCrimes: !!scanResult.crimes,
            hasBiometrics: !!scanResult.biometrics,
            testImageIndex
        });
        
        // Pulse pin red - ONLY for California locations (for demo purposes)
        if (location.state === 'CA' || location.state === 'California') {
            const locationName = location.storeName || location.name;
            const locationId = location.storeId || location.id;
            console.log(`Pulsating pin for California location: ${locationName}`);
            MapManager.pulsePin(locationId, CONFIG.pulseDuration);
        } else {
            const locationName = location.storeName || location.name;
            console.log(`Skipping pin pulsation for non-California location: ${locationName} (${location.state})`);
        }
        
        // If we have a test image index, add it to scanData for POI display
        if (testImageIndex !== null && testImageIndex < testImagesBase64.length) {
            const imagePath = window.ImageLoader?.TEST_IMAGES[testImageIndex] || '';
            let imageDataUrl = '';
            if (imagePath.endsWith('.jpeg') || imagePath.endsWith('.jpg')) {
                imageDataUrl = `data:image/jpeg;base64,${testImagesBase64[testImageIndex]}`;
            } else if (imagePath.endsWith('.webp')) {
                imageDataUrl = `data:image/webp;base64,${testImagesBase64[testImageIndex]}`;
            }
            
            console.log(`📷 Adding test image ${testImageIndex} to scan result:`, {
                imagePath,
                hasImageDataUrl: !!imageDataUrl,
                imageDataUrlLength: imageDataUrl.length,
                hasMatches: !!scanResult.matches,
                matchesCount: scanResult.matches?.length || 0
            });
            
            // Add test image to scan result for POI display
            if (imageDataUrl) {
                // Add to top match if available
                if (scanResult.matches && scanResult.matches.length > 0) {
                    if (!scanResult.matches[0].subject) {
                        scanResult.matches[0].subject = {};
                    }
                    // Only set if no photo already exists
                    if (!scanResult.matches[0].subject.photo) {
                        scanResult.matches[0].subject.photo = imageDataUrl;
                    }
                }
                // Also add as testImageDataUrl for fallback
                scanResult.testImageDataUrl = imageDataUrl;
                // Also add as mugShotUrl for fallback
                if (!scanResult.mugShotUrl) {
                    scanResult.mugShotUrl = imageDataUrl;
                }
            }
        }
        
        // Queue alert with location data for map panning
        const alert = {
            id: `alert-${Date.now()}-${Math.random()}`,
            scanId: scanResult.scanId || scanResult.id,
            timestamp: new Date().toISOString(),
            storeName: location.storeName || location.name,
            location: `${location.city}, ${location.state}`,
            locationId: location.storeId || location.id,
            locationLat: location.lat,
            locationLon: location.lon,
            topScore: scanResult.topScore || (scanResult.matches && scanResult.matches[0]?.score) || 0,
            scanData: scanResult
        };
        
        AlertManager.queueAlert(alert);
    },
    
    simulateRealScans(scanLocations) {
        // Simulate real scans with high-threat results
        // Use test images for first 4 scans (all should be high-threat)
        scanLocations.forEach((location, i) => {
            setTimeout(() => {
                const cameraName = `Parking-Lot-Cam-${String(Math.floor(Math.random() * 10) + 1).padStart(2, '0')}`;
                // First 4 scans use test images and should all be high-threat (>89%)
                const isHighThreat = i < 4; // First 4 are high-threat (using test images)
                const topScore = isHighThreat ? Math.floor(Math.random() * 10) + 90 : Math.floor(Math.random() * 20) + 70;
                
                const scanId = `sim-${Date.now()}-${i}`;
                
                // Get image for display in POI panel
                let subjectPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                if (i < testImagesBase64.length && testImagesBase64[i]) {
                    // Convert base64 to data URL for display
                    const imagePath = window.ImageLoader?.TEST_IMAGES[i] || '';
                    if (imagePath.endsWith('.jpeg') || imagePath.endsWith('.jpg')) {
                        subjectPhoto = `data:image/jpeg;base64,${testImagesBase64[i]}`;
                    } else if (imagePath.endsWith('.webp')) {
                        subjectPhoto = `data:image/webp;base64,${testImagesBase64[i]}`;
                    }
                }
                
                const logEntry = {
                    scanId: scanId,
                    location: `${location.city}, ${location.state}`,
                    storeName: location.storeName || location.name,
                    cameraName: cameraName,
                    timestamp: new Date().toISOString(),
                    status: 'PENDING',
                    topScore: null
                };
                
                ScanLogManager.addLogEntry(logEntry);
                
                // Simulate completion after delay
                setTimeout(() => {
                    ScanLogManager.updateLogStatus(scanId, 'COMPLETED', topScore);
                    
                    if (isHighThreat) {
                        // Generate names based on test image names
                        const imageNames = ['Anthony (FL)', 'Armed Robbery Suspect (MI)', 'Assault Suspect (NC)', 'Burglary Suspect (OR)'];
                        const crimeTypes = [
                            { type: 'FELONY', description: 'Theft, Fraud', date: '2024-01-15' },
                            { type: 'FELONY', description: 'Armed Robbery', date: '2023-12-20' },
                            { type: 'FELONY', description: 'Assault, Battery', date: '2024-02-10' },
                            { type: 'FELONY', description: 'Burglary, Theft', date: '2023-11-18' }
                        ];
                        
                        const mockScanResult = {
                            id: scanId,
                            scanId: scanId,
                            status: 'COMPLETED',
                            topScore: topScore,
                            matches: [{
                                id: `subject-${i}`,
                                score: topScore,
                                scoreLevel: 'HIGH',
                                subject: {
                                    id: `subject-${i}`,
                                    name: imageNames[i] || `Person of Interest ${i + 1}`,
                                    type: 'WANTED',
                                    photo: subjectPhoto
                                }
                            }],
                            biometrics: [{
                                age: Math.floor(Math.random() * 30) + 25,
                                femaleScore: Math.random() > 0.5 ? 0.8 : 0.2,
                                ethnicity: ['Caucasian', 'Hispanic', 'African American', 'Asian'][Math.floor(Math.random() * 4)],
                                beard: Math.random() > 0.7,
                                mask: Math.random() > 0.8,
                                eyeglasses: Math.random() > 0.6,
                                sunglasses: Math.random() > 0.9,
                                emotion: ['Neutral', 'Angry', 'Sad', 'Happy'][Math.floor(Math.random() * 4)]
                            }],
                            crimes: crimeTypes[i] ? [crimeTypes[i], {
                                description: 'Additional charges pending',
                                type: 'FELONY',
                                date: '2024-01-01',
                                status: 'ACTIVE'
                            }] : [{
                                description: 'Theft, Assault',
                                type: 'FELONY',
                                date: '2024-01-15',
                                status: 'ACTIVE'
                            }],
                            metadata: {
                                location: {
                                    lat: location.lat,
                                    lon: location.lon
                                },
                                cameraID: cameraName,
                                timestamp: new Date().toISOString()
                            }
                        };
                        
                        this.handleHighThreat(mockScanResult, location);
                    }
                    
                    // Update status when all scans complete
                    if (i === scanLocations.length - 1) {
                        setTimeout(() => {
                            updateStatus('Ready', 'ready');
                            isScanning = false;
                        }, 1000);
                    }
                }, 2000 + (i * 1000));
            }, i * CONFIG.realScanInterval);
        });
    },
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Scan Log Manager
const ScanLogManager = {
    addLogEntry(entry) {
        scanLogs.push(entry);
        this.renderLogs();
        this.updateCount();
    },
    
    updateLogStatus(scanId, status, topScore) {
        const logIndex = scanLogs.findIndex(log => log.scanId === scanId);
        if (logIndex !== -1) {
            scanLogs[logIndex].status = status;
            if (topScore !== null) {
                scanLogs[logIndex].topScore = topScore;
            }
            this.renderLogs();
        }
    },
    
    renderLogs() {
        const tbody = document.getElementById('scanLogsBody');
        tbody.innerHTML = '';
        
        if (scanLogs.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="6">No scans yet. Click Spartan AI logo to start.</td></tr>';
            return;
        }
        
        // Show last 100 entries
        const recentLogs = scanLogs.slice(-100).reverse();
        
        recentLogs.forEach(log => {
            const row = document.createElement('tr');
            row.className = 'new-entry';
            
            const time = new Date(log.timestamp).toLocaleTimeString();
            const statusClass = log.status.toLowerCase();
            const scoreClass = log.topScore ? 
                (log.topScore > 89 ? 'high' : log.topScore > 70 ? 'medium' : 'low') : '';
            
            row.innerHTML = `
                <td>${log.location}</td>
                <td>${log.storeName}</td>
                <td>${log.cameraName}</td>
                <td>${time}</td>
                <td><span class="status-badge ${statusClass}">${log.status}</span></td>
                <td class="score-cell ${scoreClass}">${log.topScore !== null ? log.topScore + '%' : '-'}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Auto-scroll to top
        tbody.parentElement.scrollTop = 0;
    },
    
    updateCount() {
        document.getElementById('scanCount').textContent = scanLogs.length;
    }
};

// Alert Manager
const AlertManager = {
    queueAlert(alert) {
        alerts.push(alert);
        this.renderAlerts();
        this.updateCount();
    },
    
    renderAlerts() {
        const queue = document.getElementById('alertsQueue');
        queue.innerHTML = '';
        
        if (alerts.length === 0) {
            queue.innerHTML = '<div class="empty-state">No high-threat alerts</div>';
            return;
        }
        
        // Show most recent first
        const recentAlerts = [...alerts].reverse();
        
        recentAlerts.forEach(alert => {
            const item = document.createElement('div');
            item.className = 'alert-item';
            item.addEventListener('click', () => {
                this.selectAlert(alert);
            });
            
            const time = new Date(alert.timestamp).toLocaleTimeString();
            
            item.innerHTML = `
                <div class="alert-time">${time}</div>
                <div class="alert-store">${alert.storeName}</div>
                <div class="alert-score">${alert.topScore}%</div>
            `;
            
            queue.appendChild(item);
        });
    },
    
    selectAlert(alert) {
        // Pan map to alert location if coordinates are available
        if (alert.locationLat && alert.locationLon) {
            MapManager.panToLocation(alert.locationLat, alert.locationLon, alert.locationId);
        } else if (alert.scanData?.metadata?.location) {
            // Fallback to metadata location
            const loc = alert.scanData.metadata.location;
            MapManager.panToLocation(loc.lat, loc.lon, alert.locationId);
        }
        
        // Show POI panel
        POIPanelManager.showPOI(alert.scanData || alert);
    },
    
    updateCount() {
        document.getElementById('alertCount').textContent = alerts.length;
    }
};

// POI Panel Manager
const POIPanelManager = {
    showPOI(scanData) {
        const panel = document.getElementById('poiPanel');
        const content = document.getElementById('poiContent');
        
        console.log('Showing POI panel with data:', scanData);
        
        // Extract data - handle various data structures
        const allMatches = scanData.matches && Array.isArray(scanData.matches) ? scanData.matches : [];
        const topMatch = allMatches.length > 0 ? allMatches[0] : null;
        
        // Handle biometrics - could be array or single object
        let biometrics = null;
        if (scanData.biometrics) {
            if (Array.isArray(scanData.biometrics) && scanData.biometrics.length > 0) {
                biometrics = scanData.biometrics[0]; // Use first biometric entry
            } else if (typeof scanData.biometrics === 'object') {
                biometrics = scanData.biometrics; // Already an object
            }
        }
        
        const crimes = Array.isArray(scanData.crimes) ? scanData.crimes : (scanData.crimes ? [scanData.crimes] : []);
        const topScore = scanData.topScore || (topMatch?.score) || 0;
        const subjectName = topMatch?.subject?.name || scanData.subjectName || scanData.mugShotUrl || 'Person of Interest';
        const subjectType = topMatch?.subject?.type || scanData.subjectType || 'WANTED';
        const subjectId = topMatch?.subject?.id || topMatch?.id || 'Unknown';
        
        // Try multiple sources for subject photo (mugshot) - prioritize Captis-provided mugshot
        let subjectPhoto = '';
        // Priority 1: Subject photo from match (Captis mugshot) - could be URL or base64
        if (topMatch?.subject?.photo) {
            const photo = topMatch.subject.photo;
            // Check if it's a URL (starts with http:// or https://) or base64/data URL
            if (photo.startsWith('http://') || photo.startsWith('https://')) {
                subjectPhoto = photo; // Direct URL
            } else if (photo.startsWith('data:image/')) {
                subjectPhoto = photo; // Data URL
            } else if (photo.startsWith('/') || photo.length > 100) {
                // Might be base64 without data: prefix, or a relative URL
                // Try to detect base64 (long string, no spaces)
                if (photo.length > 100 && !photo.includes(' ')) {
                    // Likely base64, add data URL prefix if missing
                    subjectPhoto = photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
                } else {
                    subjectPhoto = photo; // Relative URL or path
                }
            } else {
                subjectPhoto = photo; // Try as-is
            }
        }
        // Priority 2: mugShotUrl from alert payload
        else if (scanData.mugShotUrl) {
            subjectPhoto = scanData.mugShotUrl;
        }
        // Priority 3: Test image data URL (for demo/test images)
        else if (scanData.testImageDataUrl) {
            subjectPhoto = scanData.testImageDataUrl;
        }
        // Priority 4: Image from scan result
        else if (scanData.image) {
            const img = scanData.image;
            // Handle base64 or URL
            if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:image/')) {
                subjectPhoto = img;
            } else if (img.length > 100) {
                // Likely base64
                subjectPhoto = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
            } else {
                subjectPhoto = img;
            }
        }
        // Priority 5: Metadata image URL
        else if (scanData.metadata?.imageUrl) {
            subjectPhoto = scanData.metadata.imageUrl;
        }
        
        // Also check all matches for photos if top match doesn't have one
        if (!subjectPhoto && allMatches.length > 0) {
            for (const match of allMatches) {
                if (match.subject?.photo) {
                    const photo = match.subject.photo;
                    if (photo.startsWith('http://') || photo.startsWith('https://') || photo.startsWith('data:image/')) {
                        subjectPhoto = photo;
                        break;
                    } else if (photo.length > 100) {
                        subjectPhoto = photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
                        break;
                    }
                }
            }
        }
        
        // Extract original scan image (the image that was uploaded/submitted for scanning)
        let originalScanImage = '';
        // Priority 1: Test image data URL (for demo/test images - this is what was uploaded)
        if (scanData.testImageDataUrl) {
            originalScanImage = scanData.testImageDataUrl;
        }
        // Priority 2: Image from scan result metadata
        else if (scanData.image) {
            const img = scanData.image;
            if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:image/')) {
                originalScanImage = img;
            } else if (img.length > 100) {
                originalScanImage = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
            } else {
                originalScanImage = img;
            }
        }
        // Priority 3: Metadata image URL
        else if (scanData.metadata?.imageUrl) {
            originalScanImage = scanData.metadata.imageUrl;
        }
        
        console.log('📷 Image extraction:', {
            hasMugshot: !!subjectPhoto,
            hasOriginalScan: !!originalScanImage,
            mugshotSource: subjectPhoto ? (subjectPhoto.substring(0, 50) + '...') : 'none',
            originalScanSource: originalScanImage ? (originalScanImage.substring(0, 50) + '...') : 'none'
        });
        
        console.log('📸 POI Data Extraction:', { 
            scanId: scanData.scanId || scanData.id,
            topScore,
            subjectName,
            subjectType,
            subjectId,
            hasMatches: allMatches.length > 0,
            matchesCount: allMatches.length,
            hasCrimes: crimes.length > 0,
            crimesCount: crimes.length,
            hasBiometrics: !!biometrics,
            photoSources: {
                hasMatchPhoto: !!topMatch?.subject?.photo,
                hasMugShotUrl: !!scanData.mugShotUrl,
                hasTestImage: !!scanData.testImageDataUrl,
                hasImage: !!scanData.image,
                hasMetadataUrl: !!scanData.metadata?.imageUrl,
                finalPhoto: subjectPhoto ? 'Found' : 'Missing'
            },
            viewMatchesUrl: scanData.viewMatchesUrl,
            metadata: scanData.metadata
        });
        
        content.innerHTML = `
            <div class="poi-section">
                <div class="poi-images-container">
                    <div class="poi-image-wrapper">
                        <div class="poi-image-label">Original Scan</div>
                        ${originalScanImage ? `<img src="${originalScanImage}" alt="Original Scan Image" class="poi-photo poi-original" onerror="console.error('Failed to load original scan:', this.src.substring(0, 100)); this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'poi-photo-placeholder\\'>Original Scan Not Available</div>';" onload="console.log('Original scan image loaded successfully');">` : '<div class="poi-photo-placeholder">Original Scan Not Available</div>'}
                    </div>
                    <div class="poi-image-wrapper">
                        <div class="poi-image-label">Mugshot</div>
                        ${subjectPhoto ? `<img src="${subjectPhoto}" alt="Subject Mugshot" class="poi-photo poi-mugshot" onerror="console.error('Failed to load mugshot:', this.src.substring(0, 100)); this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'poi-photo-placeholder\\'>Mugshot Not Available</div>';" onload="console.log('Mugshot loaded successfully');">` : '<div class="poi-photo-placeholder">Mugshot Not Available</div>'}
                    </div>
                </div>
                <div class="poi-score">${topScore.toFixed(2)}%</div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Name</div>
                    <div class="poi-info-value">${subjectName}</div>
                </div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Subject ID</div>
                    <div class="poi-info-value">${subjectId}</div>
                </div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Type</div>
                    <div class="poi-info-value">${subjectType}</div>
                </div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Score Level</div>
                    <div class="poi-info-value">${topMatch?.scoreLevel || scanData.matchLevel || 'HIGH'}</div>
                </div>
                ${scanData.viewMatchesUrl ? `
                <div class="poi-info-item">
                    <div class="poi-info-label">View Matches</div>
                    <div class="poi-info-value"><a href="${scanData.viewMatchesUrl}" target="_blank" rel="noopener noreferrer">Open in Captis</a></div>
                </div>
                ` : ''}
                ${scanData.metadata ? `
                <div class="poi-info-item">
                    <div class="poi-info-label">Location</div>
                    <div class="poi-info-value">${scanData.metadata.location ? `${scanData.metadata.location.lat?.toFixed(4)}, ${scanData.metadata.location.lon?.toFixed(4)}` : 'Unknown'}</div>
                </div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Camera</div>
                    <div class="poi-info-value">${scanData.metadata.cameraID || 'Unknown'}</div>
                </div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Timestamp</div>
                    <div class="poi-info-value">${scanData.metadata.timestamp ? new Date(scanData.metadata.timestamp).toLocaleString() : 'Unknown'}</div>
                </div>
                ` : ''}
            </div>
            
            ${allMatches.length > 1 ? `
            <div class="poi-section">
                <h4>All Matches (${allMatches.length})</h4>
                <div class="matches-list">
                    ${allMatches.slice(0, 5).map((match, idx) => `
                        <div class="match-item">
                            <div class="match-rank">#${idx + 1}</div>
                            <div class="match-details">
                                <div class="match-name">${match.subject?.name || 'Unknown'}</div>
                                <div class="match-score">${match.score?.toFixed(2) || '0'}%</div>
                                <div class="match-level">${match.scoreLevel || 'UNKNOWN'}</div>
                            </div>
                        </div>
                    `).join('')}
                    ${allMatches.length > 5 ? `<div class="match-more">+ ${allMatches.length - 5} more matches</div>` : ''}
                </div>
            </div>
            ` : ''}
            
            ${biometrics ? `
            <div class="poi-section">
                <h4>Biometrics</h4>
                <div class="biometrics-grid">
                    ${biometrics.age ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Age</div>
                        <div class="poi-info-value">${biometrics.age}</div>
                    </div>
                    ` : ''}
                    ${biometrics.femaleScore !== undefined ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Gender</div>
                        <div class="poi-info-value">${biometrics.femaleScore > 0.5 ? 'Female' : 'Male'}</div>
                    </div>
                    ` : ''}
                    ${biometrics.ethnicity ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Ethnicity</div>
                        <div class="poi-info-value">${biometrics.ethnicity}</div>
                    </div>
                    ` : ''}
                    ${biometrics.beard !== undefined ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Beard</div>
                        <div class="poi-info-value">${biometrics.beard ? 'Yes' : 'No'}</div>
                    </div>
                    ` : ''}
                    ${biometrics.mask !== undefined ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Mask</div>
                        <div class="poi-info-value">${biometrics.mask ? 'Yes' : 'No'}</div>
                    </div>
                    ` : ''}
                    ${biometrics.eyeglasses !== undefined ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Eyeglasses</div>
                        <div class="poi-info-value">${biometrics.eyeglasses ? 'Yes' : 'No'}</div>
                    </div>
                    ` : ''}
                    ${biometrics.sunglasses !== undefined ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Sunglasses</div>
                        <div class="poi-info-value">${biometrics.sunglasses ? 'Yes' : 'No'}</div>
                    </div>
                    ` : ''}
                    ${biometrics.emotion ? `
                    <div class="poi-info-item">
                        <div class="poi-info-label">Emotion</div>
                        <div class="poi-info-value">${biometrics.emotion}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            ${crimes.length > 0 ? `
            <div class="poi-section">
                <h4>Criminal Record</h4>
                <ul class="crimes-list">
                    ${crimes.map(crime => `
                        <li class="crime-item">
                            <div class="crime-type">${crime.type || 'UNKNOWN'}</div>
                            <div class="crime-description">${crime.description || 'No description'}</div>
                            <div class="crime-meta">
                                <span>Date: ${crime.date || 'Unknown'}</span>
                                <span>Status: ${crime.status || 'Unknown'}</span>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
            ` : ''}
            
            <div class="poi-section">
                <div class="poi-actions">
                    <button class="action-btn primary" onclick="alert('Calling store... (Mock)')">Call Store</button>
                    <button class="action-btn danger" onclick="alert('Contacting emergency services... (Mock)')">Emergency Services</button>
                </div>
            </div>
        `;
        
        panel.style.display = 'flex';
    },
    
    hidePOI() {
        const panel = document.getElementById('poiPanel');
        panel.style.display = 'none';
    }
};

// Status Update Helper
function updateStatus(text, type = 'ready') {
    const indicator = document.getElementById('statusIndicator');
    const dot = indicator.querySelector('.status-dot');
    const textEl = indicator.querySelector('.status-text');
    
    textEl.textContent = text;
    dot.className = 'status-dot ' + type;
}

