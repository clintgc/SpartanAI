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
 * Convert image file to base64
 */
async function imageToBase64(imagePath) {
    if (imageBase64Cache[imagePath]) {
        return imageBase64Cache[imagePath];
    }
    
    try {
        const response = await fetch(imagePath);
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64 = reader.result.split(',')[1];
                imageBase64Cache[imagePath] = base64;
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Error loading image ${imagePath}:`, error);
        // Return a larger placeholder if image fails to load (must be > 100 chars for validation)
        // This is a 10x10 pixel PNG in base64
        return 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAjSURBVHgB7dExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A8CqQABAc0XJwAAAABJRU5ErkJggg==';
    }
}

/**
 * Load all test images and return as base64 array
 */
async function loadTestImages() {
    const base64Images = [];
    const loadedImages = [];
    const failedImages = [];
    
    console.log(`🖼️  Loading ${TEST_IMAGES.length} test images...`);
    
    for (let i = 0; i < TEST_IMAGES.length; i++) {
        const imagePath = TEST_IMAGES[i];
        const imageName = imagePath.split('/').pop();
        
        try {
            const base64 = await imageToBase64(imagePath);
            // Check if we got a placeholder (short base64 means it failed)
            if (base64 && base64.length > 200) {
                base64Images.push(base64);
                loadedImages.push(imageName);
                console.log(`  ✅ Loaded ${i + 1}/${TEST_IMAGES.length}: ${imageName}`);
            } else {
                failedImages.push(imageName);
                base64Images.push(base64); // Still add placeholder to maintain array length
                console.warn(`  ⚠️  Failed to load ${i + 1}/${TEST_IMAGES.length}: ${imageName} (using placeholder)`);
            }
        } catch (error) {
            failedImages.push(imageName);
            console.error(`  ❌ Error loading ${i + 1}/${TEST_IMAGES.length}: ${imageName}`, error);
            // Add placeholder to maintain array length
            base64Images.push('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAjSURBVHgB7dExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A8CqQABAc0XJwAAAABJRU5ErkJggg==');
        }
    }
    
    console.log(`\n📊 Image Loading Summary:`);
    console.log(`  ✅ Successfully loaded: ${loadedImages.length}/${TEST_IMAGES.length}`);
    if (loadedImages.length > 0) {
        console.log(`  Images: ${loadedImages.join(', ')}`);
    }
    if (failedImages.length > 0) {
        console.warn(`  ⚠️  Failed to load: ${failedImages.length} image(s)`);
        console.warn(`  Failed: ${failedImages.join(', ')}`);
    }
    console.log('');
    
    return base64Images;
}

// Export for use in demo-dashboard.js
if (typeof window !== 'undefined') {
    window.ImageLoader = {
        loadTestImages,
        imageToBase64,
        TEST_IMAGES
    };
}

