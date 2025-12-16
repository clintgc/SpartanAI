import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock dependencies before importing handler (clients are created at module load time)
const mockDocClientSend = jest.fn();
const mockSSMSend = jest.fn();
const mockCloudWatchSend = jest.fn();
const mockEventBridgeSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      ...actual.DynamoDBDocumentClient,
      from: jest.fn(() => ({
        send: mockDocClientSend,
      })),
    },
  };
});

jest.mock('@aws-sdk/client-ssm', () => {
  const actual = jest.requireActual('@aws-sdk/client-ssm');
  return {
    ...actual,
    SSMClient: jest.fn().mockImplementation(() => ({
      send: mockSSMSend,
    })),
  };
});

jest.mock('@aws-sdk/client-cloudwatch', () => {
  const actual = jest.requireActual('@aws-sdk/client-cloudwatch');
  return {
    ...actual,
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: mockCloudWatchSend,
    })),
  };
});

jest.mock('@aws-sdk/client-eventbridge', () => {
  const actual = jest.requireActual('@aws-sdk/client-eventbridge');
  return {
    ...actual,
    EventBridgeClient: jest.fn().mockImplementation(() => ({
      send: mockEventBridgeSend,
    })),
  };
});

jest.mock('../../shared/services/dynamodb-service');
jest.mock('../../shared/services/captis-client');
jest.mock('@aws-sdk/client-dynamodb');

// Import handler after mocks are set up
import { handler } from '../../functions/scan-handler';

describe('Scan Handler', () => {
  let mockEvent: APIGatewayProxyEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.CAPTIS_ACCESS_KEY = 'test-captis-key';
    process.env.CAPTIS_BASE_URL = 'https://test.captis.com';
    process.env.SCANS_TABLE_NAME = 'test-scans';
    process.env.TABLE_PREFIX = 'test';
    
    // Mock AWS SDK clients
    mockSSMSend.mockRejectedValue(new Error('SSM not configured'));
    mockCloudWatchSend.mockResolvedValue({});
    mockEventBridgeSend.mockResolvedValue({});
    mockDocClientSend.mockResolvedValue({});
    
    // Use HTTPS URL for image (passes validation) and valid UUID for accountID
    // Validation requires: starts with http/https OR length > 100
    const validImageUrl = 'https://example.com/test-image.jpg';
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';
    
    mockEvent = {
      body: JSON.stringify({
        image: validImageUrl,
        metadata: {
          cameraID: 'camera-001',
          accountID: validUUID,
          location: { lat: 40.7128, lon: -74.0060 },
          timestamp: new Date().toISOString(),
        },
      }),
      headers: {
        'x-captis-access-key': 'test-key',
      },
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/api/v1/scan',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '/api/v1/scan',
    } as APIGatewayProxyEvent;
  });

  afterEach(() => {
    delete process.env.CAPTIS_ACCESS_KEY;
    delete process.env.CAPTIS_BASE_URL;
    delete process.env.SCANS_TABLE_NAME;
    delete process.env.TABLE_PREFIX;
  });

  it('should validate quota and return 429 when exceeded', async () => {
    // Mock quota exceeded - handler calls getQuota(accountID, year)
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    
    // Mock quota that exceeds limit (triggers 429 before any other processing)
    // Set scansUsed > SCANS_LIMIT to trigger 429, and set lastWarnedAt to skip warning logic
    DynamoDbService.prototype.getQuota = jest.fn().mockResolvedValue({
      scansUsed: 14401, // Exceeds limit (>= SCANS_LIMIT)
      scansLimit: 14400,
      accountID: '550e8400-e29b-41d4-a716-446655440000',
      year: new Date().getFullYear().toString(),
      lastWarnedAt: new Date().toISOString(), // Already warned recently, skip warning logic
    });
    // Mock updateQuota with correct signature: (accountID, year, scansUsed, lastWarnedAt)
    DynamoDbService.prototype.updateQuota = jest.fn().mockResolvedValue(undefined);

    const response = await handler(mockEvent);
    expect(response.statusCode).toBe(429);
  });

  it('should check consent and return 403 if opted out', async () => {
    // Mock consent opted out
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    
    DynamoDbService.prototype.getQuota = jest.fn().mockResolvedValue({
      scansUsed: 0,
      scansLimit: 14400,
      accountID: '550e8400-e29b-41d4-a716-446655440000',
      year: new Date().getFullYear().toString(),
    });
    DynamoDbService.prototype.getConsent = jest.fn().mockResolvedValue({
      accountID: '550e8400-e29b-41d4-a716-446655440000',
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
      accountID: '550e8400-e29b-41d4-a716-446655440000',
      year: new Date().getFullYear().toString(),
    });
    DynamoDbService.prototype.getConsent = jest.fn().mockResolvedValue({
      accountID: '550e8400-e29b-41d4-a716-446655440000',
      consentStatus: true,
    });
    DynamoDbService.prototype.incrementQuota = jest.fn().mockResolvedValue(undefined);

    // Mock Captis client - resolve returns a resolve ID, then poll returns the result
    CaptisClient.prototype.resolve = jest.fn().mockResolvedValue({
      id: 'captis-123',
    });
    CaptisClient.prototype.poll = jest.fn().mockResolvedValue({
      id: 'captis-123',
      status: 'COMPLETED',
      timedOutFlag: false,
      matches: [],
      topScore: 0,
    });

    const response = await handler(mockEvent);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('scanId');
    expect(body.status).toBe('COMPLETED');
  });
});

