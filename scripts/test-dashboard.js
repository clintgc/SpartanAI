#!/usr/bin/env node
// Test script for demo dashboard

const fs = require('fs');
const path = require('path');

const errors = [];
const warnings = [];

// Test 1: Check all required files exist
console.log('Testing file structure...');
const requiredFiles = [
    'www/demo-dashboard.html',
    'www/css/demo-dashboard.css',
    'www/js/demo-dashboard.js',
    'www/js/image-loader.js',
    'www/data/locations.json'
];

requiredFiles.forEach(file => {
    if (!fs.existsSync(file)) {
        errors.push(`Missing file: ${file}`);
    } else {
        console.log(`  ✓ ${file}`);
    }
});

// Test 2: Check test images
console.log('\nTesting test images...');
const testImagesDir = 'www/img/test-images';
if (fs.existsSync(testImagesDir)) {
    const images = fs.readdirSync(testImagesDir);
    console.log(`  ✓ Found ${images.length} test images`);
    if (images.length !== 4) {
        warnings.push(`Expected 4 test images, found ${images.length}`);
    }
} else {
    errors.push(`Missing test images directory: ${testImagesDir}`);
}

// Test 3: Validate locations.json
console.log('\nValidating locations.json...');
try {
    const locations = JSON.parse(fs.readFileSync('www/data/locations.json', 'utf8'));
    console.log(`  ✓ Valid JSON with ${locations.length} locations`);
    
    if (locations.length < 1748) {
        warnings.push(`Expected at least 1,748 locations, found ${locations.length}`);
    }
    
    // Check for required fields
    const sample = locations[0];
    const requiredFields = ['id', 'name', 'city', 'state', 'lat', 'lon', 'address'];
    requiredFields.forEach(field => {
        if (!(field in sample)) {
            errors.push(`Missing field '${field}' in locations`);
        }
    });
    
    // Check for East Bay CA locations
    const eastBayCount = locations.filter(loc => 
        loc.city && ['Oakland', 'San Leandro', 'Hayward', 'Fremont', 'Union City', 
                     'Berkeley', 'Richmond', 'Concord', 'Pleasanton', 'Livermore'].includes(loc.city)
    ).length;
    console.log(`  ✓ Found ${eastBayCount} East Bay CA locations`);
    
} catch (error) {
    errors.push(`Invalid JSON in locations.json: ${error.message}`);
}

// Test 4: Check HTML structure
console.log('\nValidating HTML structure...');
const html = fs.readFileSync('www/demo-dashboard.html', 'utf8');

// Check for required DOM elements
const requiredElements = [
    'spartanLogo',
    'lowesLogo',
    'statusIndicator',
    'map',
    'locationCount',
    'scanLogsTable',
    'scanLogsBody',
    'alertsQueue',
    'alertCount',
    'poiPanel',
    'poiContent',
    'closePOI',
    'configModal'
];

requiredElements.forEach(id => {
    if (!html.includes(`id="${id}"`)) {
        errors.push(`Missing DOM element with id="${id}"`);
    } else {
        console.log(`  ✓ Found element: #${id}`);
    }
});

// Test 5: Check JavaScript references
console.log('\nValidating JavaScript references...');
const js = fs.readFileSync('www/js/demo-dashboard.js', 'utf8');

// Check for required functions/classes
const requiredFunctions = [
    'MapManager',
    'BatchScanEngine',
    'ScanLogManager',
    'AlertManager',
    'POIPanelManager'
];

requiredFunctions.forEach(func => {
    if (!js.includes(`${func} =`)) {
        errors.push(`Missing function/class: ${func}`);
    } else {
        console.log(`  ✓ Found: ${func}`);
    }
});

// Test 6: Check CSS file
console.log('\nValidating CSS...');
const css = fs.readFileSync('www/css/demo-dashboard.css', 'utf8');
if (css.length < 1000) {
    warnings.push('CSS file seems too small');
} else {
    console.log(`  ✓ CSS file size: ${(css.length / 1024).toFixed(2)} KB`);
}

// Test 7: Check for Leaflet dependencies
console.log('\nChecking dependencies...');
if (html.includes('leaflet')) {
    console.log('  ✓ Leaflet.js referenced');
} else {
    errors.push('Leaflet.js not found in HTML');
}

if (html.includes('leaflet.heat')) {
    console.log('  ✓ Leaflet.heat referenced');
} else {
    warnings.push('Leaflet.heat not found in HTML');
}

// Test 8: Check image loader
console.log('\nValidating image loader...');
const imageLoader = fs.readFileSync('www/js/image-loader.js', 'utf8');
if (imageLoader.includes('loadTestImages')) {
    console.log('  ✓ Image loader has loadTestImages function');
} else {
    errors.push('Image loader missing loadTestImages function');
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('TEST SUMMARY');
console.log('='.repeat(50));

if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ All tests passed!');
    process.exit(0);
} else {
    if (errors.length > 0) {
        console.log(`\n❌ ERRORS (${errors.length}):`);
        errors.forEach(err => console.log(`  - ${err}`));
    }
    if (warnings.length > 0) {
        console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
        warnings.forEach(warn => console.log(`  - ${warn}`));
    }
    process.exit(errors.length > 0 ? 1 : 0);
}

