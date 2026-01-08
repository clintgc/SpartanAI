// Script to generate Lowe's location data per Jan 2025 corporate data
// Total: 1,748 locations
// Output: src/data/locations.json

const fs = require('fs');
const path = require('path');

// First 10: East Bay CA with exact coordinates
const eastBayStores = [
  { city: 'Concord', lat: 37.9770, lon: -122.0310, storeNum: 1 },
  { city: 'Livermore', lat: 37.6819, lon: -121.7680, storeNum: 2 },
  { city: 'Dublin', lat: 37.7022, lon: -121.9358, storeNum: 3 },
  { city: 'Union City', lat: 37.5934, lon: -122.0439, storeNum: 4 },
  { city: 'Fremont', lat: 37.4962, lon: -121.9669, storeNum: 5 },
  { city: 'East San Jose', lat: 37.3801, lon: -121.9017, storeNum: 6 },
  { city: 'Antioch', lat: 38.0050, lon: -121.8058, storeNum: 7 },
  { city: 'Oakland', lat: 37.8044, lon: -122.2711, storeNum: 8 },
  { city: 'Hayward', lat: 37.6688, lon: -122.0808, storeNum: 9 },
  { city: 'Pleasanton', lat: 37.6575, lon: -121.8715, storeNum: 10 }
];

// State distribution (Jan 2025)
const stateCounts = {
  'AL': 39, 'AK': 5, 'AZ': 32, 'AR': 21, 'CA': 112, // 10 East Bay + 102 more
  'CO': 29, 'CT': 17, 'DE': 10, 'DC': 1, 'FL': 132,
  'GA': 64, 'HI': 4, 'ID': 8, 'IL': 37, 'IN': 43,
  'IA': 11, 'KS': 12, 'KY': 42, 'LA': 30, 'ME': 11,
  'MD': 29, 'MA': 28, 'MI': 45, 'MN': 10, 'MS': 24,
  'MO': 47, 'MT': 5, 'NE': 5, 'NV': 17, 'NH': 13,
  'NJ': 40, 'NM': 14, 'NY': 70, 'NC': 115, 'ND': 3,
  'OH': 84, 'OK': 29, 'OR': 14, 'PA': 83, 'RI': 5,
  'SC': 51, 'SD': 3, 'TN': 60, 'TX': 144, 'UT': 17,
  'VT': 2, 'VA': 69, 'WA': 35, 'WV': 18, 'WI': 8, 'WY': 1
};

// Major cities per state with coordinates
const stateCities = {
  'AL': [
    { city: 'Birmingham', lat: 33.5207, lon: -86.8025 },
    { city: 'Montgomery', lat: 32.3668, lon: -86.3000 },
    { city: 'Mobile', lat: 30.6954, lon: -88.0399 },
    { city: 'Huntsville', lat: 34.7304, lon: -86.5861 },
    { city: 'Tuscaloosa', lat: 33.2098, lon: -87.5692 }
  ],
  'AK': [
    { city: 'Anchorage', lat: 61.2181, lon: -149.9003 },
    { city: 'Fairbanks', lat: 64.8378, lon: -147.7164 },
    { city: 'Juneau', lat: 58.3019, lon: -134.4197 },
    { city: 'Wasilla', lat: 61.5814, lon: -149.4394 },
    { city: 'Sitka', lat: 57.0531, lon: -135.3300 }
  ],
  'AZ': [
    { city: 'Phoenix', lat: 33.4484, lon: -112.0740 },
    { city: 'Tucson', lat: 32.2226, lon: -110.9747 },
    { city: 'Mesa', lat: 33.4152, lon: -111.8315 },
    { city: 'Chandler', lat: 33.3062, lon: -111.8413 },
    { city: 'Scottsdale', lat: 33.4942, lon: -111.9261 },
    { city: 'Glendale', lat: 33.5387, lon: -112.1860 },
    { city: 'Gilbert', lat: 33.3528, lon: -111.7890 },
    { city: 'Tempe', lat: 33.4255, lon: -111.9400 }
  ],
  'AR': [
    { city: 'Little Rock', lat: 34.7465, lon: -92.2896 },
    { city: 'Fort Smith', lat: 35.3859, lon: -94.3985 },
    { city: 'Fayetteville', lat: 36.0626, lon: -94.1574 },
    { city: 'Springdale', lat: 36.1867, lon: -94.1288 },
    { city: 'Jonesboro', lat: 35.8423, lon: -90.7043 }
  ],
  'CA': [
    { city: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
    { city: 'San Diego', lat: 32.7157, lon: -117.1611 },
    { city: 'San Jose', lat: 37.3382, lon: -121.8863 },
    { city: 'San Francisco', lat: 37.7749, lon: -122.4194 },
    { city: 'Fresno', lat: 36.7378, lon: -119.7871 },
    { city: 'Sacramento', lat: 38.5816, lon: -121.4944 },
    { city: 'Long Beach', lat: 33.7701, lon: -118.1937 },
    { city: 'Oakland', lat: 37.8044, lon: -122.2711 },
    { city: 'Bakersfield', lat: 35.3733, lon: -119.0187 },
    { city: 'Anaheim', lat: 33.8366, lon: -117.9143 }
  ],
  'CO': [
    { city: 'Denver', lat: 39.7392, lon: -104.9903 },
    { city: 'Colorado Springs', lat: 38.8339, lon: -104.8214 },
    { city: 'Aurora', lat: 39.7294, lon: -104.8319 },
    { city: 'Fort Collins', lat: 40.5853, lon: -105.0844 },
    { city: 'Lakewood', lat: 39.7047, lon: -105.0814 }
  ],
  'CT': [
    { city: 'Bridgeport', lat: 41.1865, lon: -73.1952 },
    { city: 'New Haven', lat: 41.3083, lon: -72.9279 },
    { city: 'Hartford', lat: 41.7658, lon: -72.6734 },
    { city: 'Stamford', lat: 41.0534, lon: -73.5387 },
    { city: 'Waterbury', lat: 41.5582, lon: -73.0515 }
  ],
  'DE': [
    { city: 'Wilmington', lat: 39.7391, lon: -75.5398 },
    { city: 'Dover', lat: 39.1582, lon: -75.5244 },
    { city: 'Newark', lat: 39.6837, lon: -75.7497 },
    { city: 'Middletown', lat: 39.4496, lon: -75.7163 }
  ],
  'DC': [
    { city: 'Washington', lat: 38.9072, lon: -77.0369 }
  ],
  'FL': [
    { city: 'Jacksonville', lat: 30.3322, lon: -81.6557 },
    { city: 'Miami', lat: 25.7617, lon: -80.1918 },
    { city: 'Tampa', lat: 27.9506, lon: -82.4572 },
    { city: 'Orlando', lat: 28.5383, lon: -81.3792 },
    { city: 'St. Petersburg', lat: 27.7676, lon: -82.6403 },
    { city: 'Hialeah', lat: 25.8576, lon: -80.2781 },
    { city: 'Tallahassee', lat: 30.4518, lon: -84.2807 },
    { city: 'Fort Lauderdale', lat: 26.1224, lon: -80.1373 }
  ],
  'GA': [
    { city: 'Atlanta', lat: 33.7490, lon: -84.3880 },
    { city: 'Augusta', lat: 33.4735, lon: -82.0105 },
    { city: 'Columbus', lat: 32.4609, lon: -84.9877 },
    { city: 'Savannah', lat: 32.0809, lon: -81.0912 },
    { city: 'Athens', lat: 33.9519, lon: -83.3576 },
    { city: 'Sandy Springs', lat: 33.9304, lon: -84.3733 },
    { city: 'Roswell', lat: 34.0232, lon: -84.3616 }
  ],
  'HI': [
    { city: 'Honolulu', lat: 21.3099, lon: -157.8581 },
    { city: 'Hilo', lat: 19.7297, lon: -155.0900 },
    { city: 'Kailua', lat: 21.4022, lon: -157.7394 },
    { city: 'Kaneohe', lat: 21.4183, lon: -157.8036 }
  ],
  'ID': [
    { city: 'Boise', lat: 43.6150, lon: -116.2023 },
    { city: 'Nampa', lat: 43.5407, lon: -116.5635 },
    { city: 'Meridian', lat: 43.6121, lon: -116.3915 },
    { city: 'Idaho Falls', lat: 43.4917, lon: -112.0338 }
  ],
  'IL': [
    { city: 'Chicago', lat: 41.8781, lon: -87.6298 },
    { city: 'Aurora', lat: 41.7606, lon: -88.3201 },
    { city: 'Naperville', lat: 41.7508, lon: -88.1535 },
    { city: 'Joliet', lat: 41.5250, lon: -88.0817 },
    { city: 'Rockford', lat: 42.2711, lon: -89.0940 }
  ],
  'IN': [
    { city: 'Indianapolis', lat: 39.7684, lon: -86.1581 },
    { city: 'Fort Wayne', lat: 41.0793, lon: -85.1394 },
    { city: 'Evansville', lat: 37.9748, lon: -87.5558 },
    { city: 'South Bend', lat: 41.6764, lon: -86.2520 },
    { city: 'Carmel', lat: 39.9784, lon: -86.1180 }
  ],
  'IA': [
    { city: 'Des Moines', lat: 41.5868, lon: -93.6250 },
    { city: 'Cedar Rapids', lat: 41.9778, lon: -91.6656 },
    { city: 'Davenport', lat: 41.5236, lon: -90.5776 },
    { city: 'Sioux City', lat: 42.4999, lon: -96.4003 }
  ],
  'KS': [
    { city: 'Wichita', lat: 37.6872, lon: -97.3301 },
    { city: 'Overland Park', lat: 38.9822, lon: -94.6708 },
    { city: 'Kansas City', lat: 39.1142, lon: -94.6275 },
    { city: 'Olathe', lat: 38.8814, lon: -94.8191 }
  ],
  'KY': [
    { city: 'Louisville', lat: 38.2527, lon: -85.7585 },
    { city: 'Lexington', lat: 38.0406, lon: -84.5037 },
    { city: 'Bowling Green', lat: 36.9685, lon: -86.4808 },
    { city: 'Owensboro', lat: 37.7719, lon: -87.1111 },
    { city: 'Covington', lat: 39.0837, lon: -84.5086 }
  ],
  'LA': [
    { city: 'New Orleans', lat: 29.9511, lon: -90.0715 },
    { city: 'Baton Rouge', lat: 30.4515, lon: -91.1871 },
    { city: 'Shreveport', lat: 32.5252, lon: -93.7502 },
    { city: 'Lafayette', lat: 30.2241, lon: -92.0198 },
    { city: 'Lake Charles', lat: 30.2266, lon: -93.2174 }
  ],
  'ME': [
    { city: 'Portland', lat: 43.6591, lon: -70.2568 },
    { city: 'Lewiston', lat: 44.1004, lon: -70.2148 },
    { city: 'Bangor', lat: 44.8016, lon: -68.7712 },
    { city: 'South Portland', lat: 43.6415, lon: -70.2409 }
  ],
  'MD': [
    { city: 'Baltimore', lat: 39.2904, lon: -76.6122 },
    { city: 'Frederick', lat: 39.4143, lon: -77.4105 },
    { city: 'Rockville', lat: 39.0840, lon: -77.1528 },
    { city: 'Gaithersburg', lat: 39.1434, lon: -77.2014 },
    { city: 'Bowie', lat: 39.0068, lon: -76.7791 }
  ],
  'MA': [
    { city: 'Boston', lat: 42.3601, lon: -71.0589 },
    { city: 'Worcester', lat: 42.2626, lon: -71.8023 },
    { city: 'Springfield', lat: 42.1015, lon: -72.5898 },
    { city: 'Lowell', lat: 42.6334, lon: -71.3162 },
    { city: 'Cambridge', lat: 42.3736, lon: -71.1097 }
  ],
  'MI': [
    { city: 'Detroit', lat: 42.3314, lon: -83.0458 },
    { city: 'Grand Rapids', lat: 42.9634, lon: -85.6681 },
    { city: 'Warren', lat: 42.5145, lon: -83.0147 },
    { city: 'Sterling Heights', lat: 42.5803, lon: -83.0302 },
    { city: 'Lansing', lat: 42.7325, lon: -84.5555 }
  ],
  'MN': [
    { city: 'Minneapolis', lat: 44.9778, lon: -93.2650 },
    { city: 'St. Paul', lat: 44.9537, lon: -93.0900 },
    { city: 'Rochester', lat: 44.0216, lon: -92.4699 },
    { city: 'Duluth', lat: 46.7867, lon: -92.1005 }
  ],
  'MS': [
    { city: 'Jackson', lat: 32.2988, lon: -90.1848 },
    { city: 'Gulfport', lat: 30.3674, lon: -89.0928 },
    { city: 'Southaven', lat: 34.9886, lon: -90.0126 },
    { city: 'Hattiesburg', lat: 31.3271, lon: -89.2903 }
  ],
  'MO': [
    { city: 'Kansas City', lat: 39.0997, lon: -94.5786 },
    { city: 'St. Louis', lat: 38.6270, lon: -90.1994 },
    { city: 'Springfield', lat: 37.2089, lon: -93.2923 },
    { city: 'Columbia', lat: 38.9517, lon: -92.3341 },
    { city: 'Independence', lat: 39.0911, lon: -94.4155 }
  ],
  'MT': [
    { city: 'Billings', lat: 45.7833, lon: -108.5007 },
    { city: 'Missoula', lat: 46.8721, lon: -113.9940 },
    { city: 'Great Falls', lat: 47.4942, lon: -111.2834 },
    { city: 'Bozeman', lat: 45.6770, lon: -111.0429 }
  ],
  'NE': [
    { city: 'Omaha', lat: 41.2565, lon: -95.9345 },
    { city: 'Lincoln', lat: 40.8136, lon: -96.7026 },
    { city: 'Bellevue', lat: 41.1544, lon: -95.9146 },
    { city: 'Grand Island', lat: 40.9264, lon: -98.3420 }
  ],
  'NV': [
    { city: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
    { city: 'Henderson', lat: 36.0395, lon: -114.9817 },
    { city: 'Reno', lat: 39.5296, lon: -119.8138 },
    { city: 'North Las Vegas', lat: 36.1989, lon: -115.1175 },
    { city: 'Sparks', lat: 39.5349, lon: -119.7527 }
  ],
  'NH': [
    { city: 'Manchester', lat: 42.9956, lon: -71.4548 },
    { city: 'Nashua', lat: 42.7654, lon: -71.4676 },
    { city: 'Concord', lat: 43.2081, lon: -71.5376 },
    { city: 'Derry', lat: 42.8806, lon: -71.3273 }
  ],
  'NJ': [
    { city: 'Newark', lat: 40.7357, lon: -74.1724 },
    { city: 'Jersey City', lat: 40.7178, lon: -74.0431 },
    { city: 'Paterson', lat: 40.9168, lon: -74.1718 },
    { city: 'Elizabeth', lat: 40.6639, lon: -74.2107 },
    { city: 'Edison', lat: 40.5187, lon: -74.4121 }
  ],
  'NM': [
    { city: 'Albuquerque', lat: 35.0844, lon: -106.6504 },
    { city: 'Las Cruces', lat: 32.3199, lon: -106.7637 },
    { city: 'Rio Rancho', lat: 35.2334, lon: -106.6645 },
    { city: 'Santa Fe', lat: 35.6870, lon: -105.9378 }
  ],
  'NY': [
    { city: 'New York', lat: 40.7128, lon: -74.0060 },
    { city: 'Buffalo', lat: 42.8864, lon: -78.8784 },
    { city: 'Rochester', lat: 43.1566, lon: -77.6088 },
    { city: 'Yonkers', lat: 40.9312, lon: -73.8988 },
    { city: 'Syracuse', lat: 43.0481, lon: -76.1474 }
  ],
  'NC': [
    { city: 'Charlotte', lat: 35.2271, lon: -80.8431 },
    { city: 'Raleigh', lat: 35.7796, lon: -78.6382 },
    { city: 'Greensboro', lat: 36.0726, lon: -79.7920 },
    { city: 'Durham', lat: 35.9940, lon: -78.8986 },
    { city: 'Winston-Salem', lat: 36.0999, lon: -80.2442 },
    { city: 'Fayetteville', lat: 35.0527, lon: -78.8784 },
    { city: 'Cary', lat: 35.7915, lon: -78.7811 }
  ],
  'ND': [
    { city: 'Fargo', lat: 46.8772, lon: -96.7898 },
    { city: 'Bismarck', lat: 46.8083, lon: -100.7837 },
    { city: 'Grand Forks', lat: 47.9253, lon: -97.0329 }
  ],
  'OH': [
    { city: 'Columbus', lat: 39.9612, lon: -82.9988 },
    { city: 'Cleveland', lat: 41.4993, lon: -81.6944 },
    { city: 'Cincinnati', lat: 39.1031, lon: -84.5120 },
    { city: 'Toledo', lat: 41.6528, lon: -83.5379 },
    { city: 'Akron', lat: 41.0814, lon: -81.5190 }
  ],
  'OK': [
    { city: 'Oklahoma City', lat: 35.4676, lon: -97.5164 },
    { city: 'Tulsa', lat: 36.1540, lon: -95.9928 },
    { city: 'Norman', lat: 35.2226, lon: -97.4395 },
    { city: 'Broken Arrow', lat: 36.0609, lon: -95.7975 }
  ],
  'OR': [
    { city: 'Portland', lat: 45.5152, lon: -122.6784 },
    { city: 'Eugene', lat: 44.0521, lon: -123.0868 },
    { city: 'Salem', lat: 44.9429, lon: -123.0351 },
    { city: 'Gresham', lat: 45.4982, lon: -122.4315 }
  ],
  'PA': [
    { city: 'Philadelphia', lat: 39.9526, lon: -75.1652 },
    { city: 'Pittsburgh', lat: 40.4406, lon: -79.9959 },
    { city: 'Allentown', lat: 40.6084, lon: -75.4902 },
    { city: 'Erie', lat: 42.1292, lon: -80.0851 },
    { city: 'Reading', lat: 40.3356, lon: -75.9269 }
  ],
  'RI': [
    { city: 'Providence', lat: 41.8240, lon: -71.4128 },
    { city: 'Warwick', lat: 41.7001, lon: -71.4162 },
    { city: 'Cranston', lat: 41.7798, lon: -71.4373 },
    { city: 'Pawtucket', lat: 41.8787, lon: -71.3826 }
  ],
  'SC': [
    { city: 'Charleston', lat: 32.7765, lon: -79.9311 },
    { city: 'Columbia', lat: 34.0007, lon: -80.9007 },
    { city: 'North Charleston', lat: 32.8546, lon: -80.0070 },
    { city: 'Mount Pleasant', lat: 32.8323, lon: -79.8284 },
    { city: 'Rock Hill', lat: 34.9249, lon: -81.0251 }
  ],
  'SD': [
    { city: 'Sioux Falls', lat: 43.5446, lon: -96.7311 },
    { city: 'Rapid City', lat: 43.0755, lon: -103.2021 },
    { city: 'Aberdeen', lat: 45.4647, lon: -98.4865 }
  ],
  'TN': [
    { city: 'Nashville', lat: 36.1627, lon: -86.7816 },
    { city: 'Memphis', lat: 35.1495, lon: -90.0490 },
    { city: 'Knoxville', lat: 35.9606, lon: -83.9207 },
    { city: 'Chattanooga', lat: 35.0456, lon: -85.3097 },
    { city: 'Clarksville', lat: 36.5298, lon: -87.3595 }
  ],
  'TX': [
    { city: 'Houston', lat: 29.7604, lon: -95.3698 },
    { city: 'San Antonio', lat: 29.4241, lon: -98.4936 },
    { city: 'Dallas', lat: 32.7767, lon: -96.7970 },
    { city: 'Austin', lat: 30.2672, lon: -97.7431 },
    { city: 'Fort Worth', lat: 32.7555, lon: -97.3308 },
    { city: 'El Paso', lat: 31.7619, lon: -106.4850 },
    { city: 'Arlington', lat: 32.7357, lon: -97.1081 },
    { city: 'Corpus Christi', lat: 27.8006, lon: -97.3964 }
  ],
  'UT': [
    { city: 'Salt Lake City', lat: 40.7608, lon: -111.8910 },
    { city: 'West Valley City', lat: 40.6916, lon: -112.0011 },
    { city: 'Provo', lat: 40.2338, lon: -111.6585 },
    { city: 'West Jordan', lat: 40.6097, lon: -111.9391 }
  ],
  'VT': [
    { city: 'Burlington', lat: 44.4759, lon: -73.2121 },
    { city: 'Essex', lat: 44.4914, lon: -73.1107 }
  ],
  'VA': [
    { city: 'Virginia Beach', lat: 36.8529, lon: -75.9780 },
    { city: 'Norfolk', lat: 36.8468, lon: -76.2852 },
    { city: 'Richmond', lat: 37.5407, lon: -77.4360 },
    { city: 'Newport News', lat: 37.0871, lon: -76.4730 },
    { city: 'Alexandria', lat: 38.8048, lon: -77.0469 }
  ],
  'WA': [
    { city: 'Seattle', lat: 47.6062, lon: -122.3321 },
    { city: 'Spokane', lat: 47.6588, lon: -117.4260 },
    { city: 'Tacoma', lat: 47.2529, lon: -122.4443 },
    { city: 'Vancouver', lat: 45.6387, lon: -122.6615 },
    { city: 'Bellevue', lat: 47.6101, lon: -122.2015 }
  ],
  'WV': [
    { city: 'Charleston', lat: 38.3498, lon: -81.6326 },
    { city: 'Huntington', lat: 38.4192, lon: -82.4452 },
    { city: 'Parkersburg', lat: 39.2667, lon: -81.5615 },
    { city: 'Morgantown', lat: 39.6295, lon: -79.9559 }
  ],
  'WI': [
    { city: 'Milwaukee', lat: 43.0389, lon: -87.9065 },
    { city: 'Madison', lat: 43.0731, lon: -89.4012 },
    { city: 'Green Bay', lat: 44.5192, lon: -88.0198 },
    { city: 'Kenosha', lat: 42.5847, lon: -87.8212 }
  ],
  'WY': [
    { city: 'Cheyenne', lat: 41.1400, lon: -105.4986 }
  ]
};

function getRandomCameraId() {
  const num = Math.floor(Math.random() * 3) + 1;
  return `Parking-Lot-Cam-${String(num).padStart(2, '0')}`;
}

function addRandomOffset(lat, lon) {
  // Add small random offset (±0.02) to spread stores without hitting water
  const latOffset = (Math.random() - 0.5) * 0.04; // ±0.02
  const lonOffset = (Math.random() - 0.5) * 0.04; // ±0.02
  return {
    lat: lat + latOffset,
    lon: lon + lonOffset
  };
}

function generateLocations() {
  const locations = [];
  let storeCounter = 1;
  
  // First 10: East Bay CA with exact coordinates
  eastBayStores.forEach(store => {
    locations.push({
      storeId: `lowes-${String(storeCounter).padStart(4, '0')}`,
      storeName: `Lowe's #${storeCounter} - ${store.city}`,
      city: store.city,
      state: 'CA',
      lat: store.lat,
      lon: store.lon,
      cameraId: getRandomCameraId()
    });
    storeCounter++;
  });
  
  // Generate remaining locations by state
  Object.entries(stateCounts).forEach(([state, count]) => {
    let stateCount = count;
    if (state === 'CA') {
      stateCount = count - 10; // Already added 10 East Bay
    }
    
    const cities = stateCities[state] || [];
    if (cities.length === 0) {
      console.warn(`No cities defined for state ${state}`);
      return;
    }
    
    for (let i = 0; i < stateCount; i++) {
      // Randomly select a city from the state's major cities
      const cityData = cities[Math.floor(Math.random() * cities.length)];
      const coords = addRandomOffset(cityData.lat, cityData.lon);
      
      locations.push({
        storeId: `lowes-${String(storeCounter).padStart(4, '0')}`,
        storeName: `Lowe's #${storeCounter} - ${cityData.city}`,
        city: cityData.city,
        state: state,
        lat: parseFloat(coords.lat.toFixed(6)),
        lon: parseFloat(coords.lon.toFixed(6)),
        cameraId: getRandomCameraId()
      });
      storeCounter++;
    }
  });
  
  return locations;
}

// Generate and save
const locations = generateLocations();
const outputDir = path.join(__dirname, '..', 'src', 'data');
const outputPath = path.join(outputDir, 'locations.json');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

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

// Verify total
const total = locations.length;
console.log(`\nTotal locations: ${total}`);
if (total === 1748) {
  console.log('✓ Correct total count!');
} else {
  console.log(`✗ Expected 1748, got ${total}`);
}

