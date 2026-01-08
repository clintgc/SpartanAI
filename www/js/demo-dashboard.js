// Spartan AI Demo Dashboard - Main JavaScript

// Configuration
const CONFIG = {
    apiBaseUrl: localStorage.getItem('apiBaseUrl') || '',
    apiKey: localStorage.getItem('apiKey') || '',
    accountId: 'demo-account-001',
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
    document.getElementById('lowesLogo').addEventListener('click', () => {
        MapManager.loadLocations();
    });
    
    document.getElementById('spartanLogo').addEventListener('click', () => {
        if (!isScanning) {
            BatchScanEngine.startBatchScan();
        }
    });
    
    document.getElementById('closePOI').addEventListener('click', () => {
        POIPanelManager.hidePOI();
    });
    
    document.getElementById('configForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveConfig();
    });
    
    document.getElementById('skipConfig').addEventListener('click', () => {
        hideConfigModal();
    });
});

// Configuration Management
function showConfigModal() {
    document.getElementById('configModal').classList.remove('hidden');
}

function hideConfigModal() {
    document.getElementById('configModal').classList.add('hidden');
}

function saveConfig() {
    const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (apiBaseUrl && apiKey) {
        CONFIG.apiBaseUrl = apiBaseUrl;
        CONFIG.apiKey = apiKey;
        localStorage.setItem('apiBaseUrl', apiBaseUrl);
        localStorage.setItem('apiKey', apiKey);
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
            
            // Update UI
            document.getElementById('locationCount').textContent = locations.length;
            updateStatus('Ready', 'ready');
            
        } catch (error) {
            console.error('Error loading locations:', error);
            updateStatus('Error loading locations', 'error');
        }
    },
    
    addPin(location, color = 'green') {
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
        
        const marker = L.marker([location.lat, location.lon], { icon })
            .addTo(map)
            .bindPopup(`<strong>${location.name}</strong><br>${location.address}`);
        
        markers[location.id] = marker;
    },
    
    pulsePin(locationId, duration = CONFIG.pulseDuration) {
        const marker = markers[locationId];
        if (!marker) return;
        
        // Change pin to red
        const icon = L.divIcon({
            className: 'custom-marker pulse-pin',
            html: `<div style="
                width: 16px;
                height: 16px;
                background: #FF4444;
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(255,68,68,0.8);
            "></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
        });
        
        marker.setIcon(icon);
        
        // Intensify heatmap
        this.updateHeatmap(true);
        
        // Revert after duration
        setTimeout(() => {
            const greenIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    width: 12px;
                    height: 12px;
                    background: #00FF88;
                    border: 2px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6],
            });
            marker.setIcon(greenIcon);
        }, duration);
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
        const shuffled = [...locations].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    },
    
    simulateMockScans(count) {
        const shuffled = [...locations].sort(() => 0.5 - Math.random());
        
        for (let i = 0; i < count; i++) {
            const location = shuffled[i];
            const cameraName = `Parking-Lot-Cam-${String(Math.floor(Math.random() * 10) + 1).padStart(2, '0')}`;
            const topScore = Math.floor(Math.random() * 50) + 20; // 20-70% for low-threat
            
            const logEntry = {
                scanId: `mock-${Date.now()}-${i}`,
                location: `${location.city}, ${location.state}`,
                storeName: location.name,
                cameraName: cameraName,
                timestamp: new Date().toISOString(),
                status: 'COMPLETED',
                topScore: topScore
            };
            
            ScanLogManager.addLogEntry(logEntry);
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
            if (i < testImagesBase64.length && testImagesBase64[i]) {
                imageBase64 = testImagesBase64[i];
                console.log(`Using test image ${i + 1} for scan ${i + 1}`);
            } else {
                // Placeholder for remaining scans (will be replaced with real images later)
                imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                console.log(`Using placeholder image for scan ${i + 1} (will be replaced with real image later)`);
            }
            
            try {
                // Submit scan
                const scanResponse = await this.submitScan(location, cameraName, imageBase64);
                
                if (scanResponse && scanResponse.scanId) {
                    // Add initial log entry
                    const logEntry = {
                        scanId: scanResponse.scanId,
                        location: `${location.city}, ${location.state}`,
                        storeName: location.name,
                        cameraName: cameraName,
                        timestamp: new Date().toISOString(),
                        status: scanResponse.status || 'PENDING',
                        topScore: scanResponse.topScore || null
                    };
                    
                    ScanLogManager.addLogEntry(logEntry);
                    
                    // If we have immediate results and it's high-threat, handle it
                    if (scanResponse.topScore && scanResponse.topScore > CONFIG.highThreatThreshold) {
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
                        this.handleHighThreat(scanResult, location);
                    } else if (scanResponse.status === 'PENDING') {
                        // Start polling if status is PENDING
                        this.pollScanStatus(scanResponse.scanId, location);
                    }
                }
            } catch (error) {
                console.error('Error submitting scan:', error);
                const logEntry = {
                    scanId: `error-${Date.now()}-${i}`,
                    location: `${location.city}, ${location.state}`,
                    storeName: location.name,
                    cameraName: cameraName,
                    timestamp: new Date().toISOString(),
                    status: 'ERROR',
                    topScore: null
                };
                ScanLogManager.addLogEntry(logEntry);
            }
        }
    },
    
    async submitScan(location, cameraName, imageBase64) {
        const url = `${CONFIG.apiBaseUrl}/api/v1/scan`;
        
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
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CONFIG.apiKey
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    },
    
    async pollScanStatus(scanId, location) {
        const url = `${CONFIG.apiBaseUrl}/api/v1/scan/${scanId}`;
        let pollCount = 0;
        const maxPolls = 24; // 24 * 5s = 2 minutes max
        
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
                        'x-api-key': CONFIG.apiKey,
                        'x-account-id': CONFIG.accountId
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
                
                // Update log entry
                // Response format from scan-detail-handler: { scanId, accountID, status, topScore, matchLevel, ... }
                const topScore = scanData.topScore || 0;
                const status = scanData.status || 'COMPLETED';
                
                ScanLogManager.updateLogStatus(scanId, status, topScore);
                
                // Check for high-threat
                if (topScore > CONFIG.highThreatThreshold) {
                    // Build scan result object for POI panel
                    const scanResult = {
                        scanId: scanData.scanId,
                        id: scanData.scanId,
                        status: scanData.status,
                        topScore: scanData.topScore,
                        matchLevel: scanData.matchLevel,
                        viewMatchesUrl: scanData.viewMatchesUrl,
                        // Try to get matches from metadata or construct from topScore
                        matches: scanData.topScore ? [{
                            id: scanData.scanId,
                            score: scanData.topScore,
                            scoreLevel: scanData.matchLevel || 'HIGH',
                            subject: {
                                id: 'subject-1',
                                name: 'Person of Interest',
                                type: 'WANTED',
                                photo: scanData.metadata?.imageUrl
                            }
                        }] : [],
                        metadata: scanData.metadata
                    };
                    
                    this.handleHighThreat(scanResult, location);
                    clearInterval(pollInterval);
                    activePolling.delete(scanId);
                } else if (status === 'COMPLETED' || status === 'FAILED') {
                    clearInterval(pollInterval);
                    activePolling.delete(scanId);
                    
                    // Update status when all polling completes
                    if (activePolling.size === 0) {
                        updateStatus('Ready', 'ready');
                        isScanning = false;
                    }
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
    
    handleHighThreat(scanResult, location) {
        // Pulse pin red
        MapManager.pulsePin(location.id, CONFIG.pulseDuration);
        
        // Queue alert
        const alert = {
            id: `alert-${Date.now()}`,
            scanId: scanResult.scanId || scanResult.id,
            timestamp: new Date().toISOString(),
            storeName: location.name,
            location: `${location.city}, ${location.state}`,
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
                    storeName: location.name,
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
                            }]
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
        
        // Extract data
        const topMatch = scanData.matches && scanData.matches[0];
        const biometrics = scanData.biometrics && (Array.isArray(scanData.biometrics) ? scanData.biometrics[0] : scanData.biometrics);
        const crimes = scanData.crimes || [];
        const topScore = scanData.topScore || (topMatch?.score) || 0;
        const subjectName = topMatch?.subject?.name || 'Person of Interest';
        const subjectPhoto = topMatch?.subject?.photo || scanData.image || scanData.metadata?.imageUrl || '';
        
        content.innerHTML = `
            <div class="poi-section">
                ${subjectPhoto ? `<img src="${subjectPhoto}" alt="Subject" class="poi-photo" onerror="this.style.display='none';">` : ''}
                <div class="poi-score">${topScore}%</div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Name</div>
                    <div class="poi-info-value">${subjectName}</div>
                </div>
                <div class="poi-info-item">
                    <div class="poi-info-label">Score Level</div>
                    <div class="poi-info-value">${topMatch?.scoreLevel || 'HIGH'}</div>
                </div>
            </div>
            
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

