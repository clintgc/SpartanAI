// Image Loader - Converts test images to base64

const TEST_IMAGES = [
    'img/test-images/Anthony-FL.jpeg',
    'img/test-images/ArmedRobbery-MI.webp',
    'img/test-images/ASSAULT-NC2.webp',
    'img/test-images/Burglary-OR.webp',
    'img/test-images/AmirFatenMekky.bmp',
    'img/test-images/Assault-FL.webp',
    'img/test-images/Assault-Robbery-AL.png',
    'img/test-images/ThreatSubject1.webp',
    'img/test-images/Violent-NV.webp',
    'img/test-images/WANTED-CA.webp',
    'img/test-images/Wanted_FL3.webp'
];

// Cache for loaded images
let imageBase64Cache = {};

/**
 * Clear the image cache (useful when images are updated on server)
 */
function clearImageCache() {
    imageBase64Cache = {};
    console.log('🗑️  Image cache cleared');
}

/**
 * Convert image file to base64
 */
async function imageToBase64(imagePath) {
    if (imageBase64Cache[imagePath]) {
        return imageBase64Cache[imagePath];
    }
    
    try {
        const response = await fetch(imagePath);
        
        // Check if response is OK (status 200-299)
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check if response is actually an image
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error(`Invalid content type: ${contentType}`);
        }
        
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64 = reader.result.split(',')[1];
                if (!base64 || base64.length < 100) {
                    reject(new Error('Base64 conversion failed or result too short'));
                    return;
                }
                imageBase64Cache[imagePath] = base64;
                resolve(base64);
            };
            reader.onerror = () => {
                reject(new Error('FileReader error'));
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`❌ Error loading image ${imagePath}:`, error.message || error);
        // Return a larger placeholder if image fails to load (must be > 100 chars for validation)
        // This is a 10x10 pixel PNG in base64
        return 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAjSURBVHgB7dExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A8CqQABAc0XJwAAAABJRU5ErkJggg==';
    }
}

/**
 * Load all test images and return as base64 array
 */
async function loadTestImages() {
    // Check if images are already cached
    if (Object.keys(imageBase64Cache).length === TEST_IMAGES.length) {
        console.log(`✅ Using ${TEST_IMAGES.length} cached images`);
        return TEST_IMAGES.map(path => imageBase64Cache[path] || '');
    }
    
    const base64Images = [];
    const loadedImages = [];
    const failedImages = [];
    
    console.log(`🖼️  Loading ${TEST_IMAGES.length} test images in parallel...`);
    
    // Load all images in parallel for better performance
    const loadPromises = TEST_IMAGES.map(async (imagePath, i) => {
        const imageName = imagePath.split('/').pop();
        
        try {
            const base64 = await imageToBase64(imagePath);
            
            // Check if we got a placeholder (short base64 means it failed)
            if (base64 && base64.length > 200) {
                loadedImages.push(imageName);
                const sizeKB = (base64.length / 1024).toFixed(1);
                console.log(`  ✅ Loaded ${i + 1}/${TEST_IMAGES.length}: ${imageName} (${sizeKB} KB)`);
                return { index: i, base64, success: true, name: imageName };
            } else {
                failedImages.push(imageName);
                console.warn(`  ⚠️  Failed to load ${i + 1}/${TEST_IMAGES.length}: ${imageName} - using placeholder (base64 length: ${base64?.length || 0})`);
                return { index: i, base64, success: false, name: imageName };
            }
        } catch (error) {
            failedImages.push(imageName);
            console.error(`  ❌ Error loading ${i + 1}/${TEST_IMAGES.length}: ${imageName}`, error);
            // Always add placeholder to maintain array length (11 items total)
            const placeholder = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAjSURBVHgB7dExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A8CqQABAc0XJwAAAABJRU5ErkJggg==';
            return { index: i, base64: placeholder, success: false, name: imageName };
        }
    });
    
    // Wait for all images to load
    const results = await Promise.all(loadPromises);
    
    // Sort results by index to maintain order
    results.sort((a, b) => a.index - b.index);
    
    // Build the base64Images array in correct order
    results.forEach(result => {
        base64Images.push(result.base64);
    });
    
    // Ensure we always return exactly TEST_IMAGES.length items
    if (base64Images.length !== TEST_IMAGES.length) {
        console.error(`⚠️  Array length mismatch! Expected ${TEST_IMAGES.length}, got ${base64Images.length}`);
        // Pad with placeholders if needed
        while (base64Images.length < TEST_IMAGES.length) {
            base64Images.push('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAjSURBVHgB7dExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A8CqQABAc0XJwAAAABJRU5ErkJggg==');
        }
    }
    
    console.log(`\n📊 Image Loading Summary:`);
    console.log(`  ✅ Successfully loaded: ${loadedImages.length}/${TEST_IMAGES.length}`);
    console.log(`  📦 Total items in array: ${base64Images.length}/${TEST_IMAGES.length}`);
    if (loadedImages.length > 0) {
        console.log(`  ✅ Loaded images: ${loadedImages.join(', ')}`);
    }
    if (failedImages.length > 0) {
        console.warn(`  ⚠️  Failed to load: ${failedImages.length} image(s)`);
        console.warn(`  ❌ Failed images: ${failedImages.join(', ')}`);
        console.warn(`  💡 Tip: Check browser Network tab to see which images returned 404`);
    }
    
    // Final verification
    if (base64Images.length !== TEST_IMAGES.length) {
        console.error(`  ❌ CRITICAL: Array length mismatch! Expected ${TEST_IMAGES.length}, got ${base64Images.length}`);
    } else {
        console.log(`  ✅ Array length correct: ${base64Images.length} items`);
    }
    console.log('');
    
    return base64Images;
}

// Export for use in demo-dashboard.js
if (typeof window !== 'undefined') {
    window.ImageLoader = {
        loadTestImages,
        imageToBase64,
        clearImageCache,
        TEST_IMAGES
    };
}

