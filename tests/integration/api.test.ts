import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'https://YOUR_API_GATEWAY_URL/v1';
const API_KEY = process.env.API_KEY || 'YOUR_API_KEY';

describe('API Integration Tests', () => {
  let scanId: string;

  it('should submit a scan request', async () => {
    const response = await axios.post(
      `${API_BASE_URL}/api/v1/scan`,
      {
        image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        metadata: {
          cameraID: 'test-camera-001',
          accountID: 'test-account-001',
          location: {
            lat: 40.7128,
            lon: -74.0060,
          },
          timestamp: new Date().toISOString(),
        },
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('scanId');
    expect(response.data).toHaveProperty('status');
    scanId = response.data.scanId;
  });

  it('should retrieve scan details', async () => {
    if (!scanId) {
      throw new Error('No scanId from previous test');
    }

    const response = await axios.get(
      `${API_BASE_URL}/api/v1/scan/${scanId}`,
      {
        headers: {
          'x-api-key': API_KEY,
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('scanId', scanId);
  });

  it('should list scans', async () => {
    const response = await axios.get(
      `${API_BASE_URL}/api/v1/scans?accountID=test-account-001`,
      {
        headers: {
          'x-api-key': API_KEY,
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('scans');
    expect(Array.isArray(response.data.scans)).toBe(true);
  });

  it('should update consent', async () => {
    const response = await axios.put(
      `${API_BASE_URL}/api/v1/consent`,
      {
        consent: true,
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('consentStatus', true);
  });

  it('should register webhook', async () => {
    const response = await axios.post(
      `${API_BASE_URL}/api/v1/webhooks`,
      {
        webhookUrl: 'https://example.com/webhook',
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('webhookId');
    expect(response.data).toHaveProperty('webhookUrl', 'https://example.com/webhook');
  });
});

