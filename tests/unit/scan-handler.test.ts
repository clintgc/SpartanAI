import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../functions/scan-handler';

// Mock dependencies
jest.mock('../../shared/services/dynamodb-service');
jest.mock('../../shared/services/captis-client');

describe('Scan Handler', () => {
  let mockEvent: APIGatewayProxyEvent;

  beforeEach(() => {
    mockEvent = {
      body: JSON.stringify({
        image: 'base64encodedimage',
        metadata: {
          cameraID: 'camera-001',
          accountID: 'account-001',
          location: { lat: 40.7128, lon: -74.0060 },
          timestamp: new Date().toISOString(),
        },
      }),
      headers: {
        'x-captis-access-key': 'test-key',
      },
    } as APIGatewayProxyEvent;
  });

  it('should validate quota and return 429 when exceeded', async () => {
    // Mock quota exceeded
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getQuota = jest.fn().mockResolvedValue({
      scansUsed: 14400,
      scansLimit: 14400,
    });

    const response = await handler(mockEvent);
    expect(response.statusCode).toBe(429);
  });

  it('should check consent and return 403 if opted out', async () => {
    // Mock consent opted out
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getQuota = jest.fn().mockResolvedValue({
      scansUsed: 0,
      scansLimit: 14400,
    });
    DynamoDbService.prototype.getConsent = jest.fn().mockResolvedValue({
      consentStatus: false,
    });

    const response = await handler(mockEvent);
    expect(response.statusCode).toBe(403);
  });

  it('should successfully process scan request', async () => {
    // Mock successful flow
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    const { CaptisClient } = require('../../shared/services/captis-client');

    DynamoDbService.prototype.getQuota = jest.fn().mockResolvedValue({
      scansUsed: 0,
      scansLimit: 14400,
    });
    DynamoDbService.prototype.getConsent = jest.fn().mockResolvedValue({
      consentStatus: true,
    });
    DynamoDbService.prototype.incrementQuota = jest.fn().mockResolvedValue(undefined);

    CaptisClient.prototype.resolve = jest.fn().mockResolvedValue({
      id: 'captis-123',
      status: 'COMPLETED',
      timedOutFlag: false,
    });

    const response = await handler(mockEvent);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('scanId');
    expect(body.status).toBe('COMPLETED');
  });
});

