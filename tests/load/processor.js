// Artillery processor for custom functions and data generation
const { faker } = require('@faker-js/faker');

// Generate random base64 image (small test image)
function generateRandomBase64Image() {
  // Generate a small 1x1 pixel PNG in base64
  // In production, you might want to use actual test images
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return base64Image;
}

// Generate random account ID
function generateAccountID() {
  return `test-account-${faker.string.alphanumeric(8).toLowerCase()}`;
}

// Generate random camera ID
function generateCameraID() {
  return `camera-${faker.string.alphanumeric(6).toLowerCase()}`;
}

// Generate random location coordinates
function generateLocation() {
  return {
    lat: parseFloat(faker.location.latitude().toFixed(6)),
    lon: parseFloat(faker.location.longitude().toFixed(6)),
  };
}

module.exports = {
  generateRandomBase64Image,
  generateAccountID,
  generateCameraID,
  generateLocation,
  // Custom function to log request details
  logRequest: function(context, events, done) {
    console.log(`Request: ${context.vars.method} ${context.vars.url}`);
    return done();
  },
  // Custom function to validate response
  validateResponse: function(requestParams, response, context, events, done) {
    if (response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 202) {
      events.emit('counter', 'custom.errors', 1);
      events.emit('histogram', 'custom.response_time', response.timings.response);
    }
    return done();
  },
};

