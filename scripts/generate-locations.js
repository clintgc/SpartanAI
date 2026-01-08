// Script to generate synthetic Lowe's location data
// Total: 1,748 locations

const fs = require('fs');
const path = require('path');

// 10 East Bay CA locations with real coordinates
const eastBayLocations = [
  { city: 'Oakland', lat: 37.8044, lon: -122.2711, address: '2000 Hegenberger Rd, Oakland, CA 94621' },
  { city: 'San Leandro', lat: 37.7249, lon: -122.1561, address: '15555 E 14th St, San Leandro, CA 94578' },
  { city: 'Hayward', lat: 37.6688, lon: -122.0808, address: '24401 Mission Blvd, Hayward, CA 94544' },
  { city: 'Fremont', lat: 37.5485, lon: -121.9886, address: '43800 Osgood Rd, Fremont, CA 94539' },
  { city: 'Union City', lat: 37.5958, lon: -122.0190, address: '31200 Dyer St, Union City, CA 94587' },
  { city: 'Berkeley', lat: 37.8715, lon: -122.2730, address: '2000 Eastshore Hwy, Berkeley, CA 94710' },
  { city: 'Richmond', lat: 37.9358, lon: -122.3477, address: '1150 Hilltop Mall Rd, Richmond, CA 94806' },
  { city: 'Concord', lat: 37.9780, lon: -122.0311, address: '1400 Willow Pass Rd, Concord, CA 94520' },
  { city: 'Pleasanton', lat: 37.6624, lon: -121.8747, address: '6000 Johnson Dr, Pleasanton, CA 94588' },
  { city: 'Livermore', lat: 37.6819, lon: -121.7680, address: '2400 Las Positas Rd, Livermore, CA 94551' }
];

// State distribution (from PRD)
const stateDistribution = {
  'TX': 144,
  'FL': 132,
  'NC': 115,
  'CA': 112, // Includes 10 East Bay, so 102 more needed
  'GA': 95,
  'VA': 88,
  'PA': 82,
  'OH': 78,
  'NY': 75,
  'MI': 72,
  'IL': 68,
  'TN': 65,
  'IN': 62,
  'MO': 58,
  'MD': 55,
  'WI': 52,
  'AZ': 48,
  'MA': 45,
  'WA': 42,
  'SC': 40,
  'MN': 38,
  'CO': 35,
  'AL': 32,
  'LA': 30,
  'KY': 28,
  'OR': 25,
  'CT': 22,
  'IA': 20,
  'AR': 18,
  'MS': 16,
  'KS': 15,
  'UT': 14,
  'NV': 13,
  'NM': 12,
  'WV': 11,
  'NE': 10,
  'ID': 9,
  'HI': 8,
  'NH': 7,
  'ME': 6,
  'RI': 5,
  'MT': 4,
  'DE': 3,
  'SD': 2,
  'ND': 2,
  'AK': 1,
  'VT': 1,
  'WY': 1,
  'DC': 1
};

// State center coordinates for distribution
const stateCenters = {
  'TX': { lat: 31.9686, lon: -99.9018 },
  'FL': { lat: 27.7663, lon: -81.6868 },
  'NC': { lat: 35.5397, lon: -79.8431 },
  'CA': { lat: 36.1162, lon: -119.6816 },
  'GA': { lat: 32.1656, lon: -82.9001 },
  'VA': { lat: 37.7693, lon: -78.1699 },
  'PA': { lat: 40.5908, lon: -77.2098 },
  'OH': { lat: 40.3888, lon: -82.7649 },
  'NY': { lat: 42.1657, lon: -74.9481 },
  'MI': { lat: 43.3266, lon: -84.5361 },
  'IL': { lat: 40.3495, lon: -88.9861 },
  'TN': { lat: 35.7478, lon: -86.6923 },
  'IN': { lat: 39.8494, lon: -86.2583 },
  'MO': { lat: 38.4561, lon: -92.2884 },
  'MD': { lat: 39.0639, lon: -76.8021 },
  'WI': { lat: 44.2685, lon: -89.6165 },
  'AZ': { lat: 33.7298, lon: -111.4312 },
  'MA': { lat: 42.2302, lon: -71.5301 },
  'WA': { lat: 47.0379, lon: -120.5015 },
  'SC': { lat: 33.8569, lon: -80.9450 },
  'MN': { lat: 44.9551, lon: -93.1022 },
  'CO': { lat: 39.0598, lon: -105.3111 },
  'AL': { lat: 32.3617, lon: -86.2791 },
  'LA': { lat: 30.4581, lon: -91.1874 },
  'KY': { lat: 38.1868, lon: -84.8753 },
  'OR': { lat: 44.5720, lon: -123.0700 },
  'CT': { lat: 41.5978, lon: -72.7554 },
  'IA': { lat: 41.5909, lon: -93.6209 },
  'AR': { lat: 34.7360, lon: -92.3311 },
  'MS': { lat: 32.3200, lon: -90.2070 },
  'KS': { lat: 39.0473, lon: -95.6752 },
  'UT': { lat: 40.1500, lon: -111.8624 },
  'NV': { lat: 39.1608, lon: -119.7539 },
  'NM': { lat: 35.6672, lon: -105.9646 },
  'WV': { lat: 38.3495, lon: -81.6333 },
  'NE': { lat: 40.8097, lon: -96.6753 },
  'ID': { lat: 43.6170, lon: -116.1996 },
  'HI': { lat: 21.3089, lon: -157.8262 },
  'NH': { lat: 43.2205, lon: -71.5498 },
  'ME': { lat: 44.3235, lon: -69.7653 },
  'RI': { lat: 41.8236, lon: -71.4222 },
  'MT': { lat: 46.5958, lon: -112.0270 },
  'DE': { lat: 39.1619, lon: -75.5267 },
  'SD': { lat: 44.3668, lon: -100.3364 },
  'ND': { lat: 46.8208, lon: -100.7837 },
  'AK': { lat: 64.2008, lon: -149.4937 },
  'VT': { lat: 44.2664, lon: -72.5805 },
  'WY': { lat: 41.1400, lon: -105.4986 },
  'DC': { lat: 38.9072, lon: -77.0369 }
};

function generateLocation(state, index, totalForState, isEastBay = false) {
  const center = stateCenters[state];
  const storeNumber = index + 1;
  
  // Generate coordinates with some variance around state center
  const latVariance = (Math.random() - 0.5) * 4; // ±2 degrees
  const lonVariance = (Math.random() - 0.5) * 4;
  
  let city, address;
  if (isEastBay) {
    const location = eastBayLocations[index];
    return {
      id: `lowes-${state.toLowerCase()}-${storeNumber}`,
      name: `Lowe's #${storeNumber} - ${location.city}`,
      city: location.city,
      state: state,
      lat: location.lat,
      lon: location.lon,
      address: location.address
    };
  } else {
    // Generate synthetic city name
    const cityNames = ['Springfield', 'Franklin', 'Georgetown', 'Madison', 'Washington', 'Jackson', 'Lincoln', 'Jefferson', 'Monroe', 'Adams'];
    city = `${cityNames[Math.floor(Math.random() * cityNames.length)]}${Math.floor(Math.random() * 10)}`;
    address = `${Math.floor(Math.random() * 9999) + 1} Main St, ${city}, ${state} ${String(Math.floor(Math.random() * 90000) + 10000)}`;
  }
  
  return {
    id: `lowes-${state.toLowerCase()}-${storeNumber}`,
    name: `Lowe's #${storeNumber} - ${city}`,
    city: city,
    state: state,
    lat: center.lat + latVariance,
    lon: center.lon + lonVariance,
    address: address
  };
}

function generateAllLocations() {
  const locations = [];
  let storeCounter = 1;
  
  // Add 10 East Bay CA locations first
  eastBayLocations.forEach((loc, index) => {
    locations.push({
      id: `lowes-ca-eastbay-${index + 1}`,
      name: `Lowe's #${storeCounter} - ${loc.city}`,
      city: loc.city,
      state: 'CA',
      lat: loc.lat,
      lon: loc.lon,
      address: loc.address
    });
    storeCounter++;
  });
  
  // Generate locations for each state
  Object.entries(stateDistribution).forEach(([state, count]) => {
    let stateCount = count;
    if (state === 'CA') {
      stateCount = count - 10; // Already added 10 East Bay
    }
    
    for (let i = 0; i < stateCount; i++) {
      locations.push(generateLocation(state, i, stateCount, false));
      storeCounter++;
    }
  });
  
  return locations;
}

// Generate and save
const locations = generateAllLocations();
const outputPath = path.join(__dirname, '..', 'www', 'data', 'locations.json');

fs.writeFileSync(outputPath, JSON.stringify(locations, null, 2));
console.log(`Generated ${locations.length} locations`);
console.log(`Saved to ${outputPath}`);

// Verify counts
const counts = {};
locations.forEach(loc => {
  counts[loc.state] = (counts[loc.state] || 0) + 1;
});
console.log('\nState distribution:');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([state, count]) => {
  console.log(`  ${state}: ${count}`);
});

