import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock dependencies before importing handler (clients are created at module load time)
const mockDocClientSend = jest.fn();
const mockSSMSend = jest.fn();
const mockCloudWatchSend = jest.fn();
const mockEventBridgeSend = jest.fn();

// Mock DynamoDB client used by DynamoDbService
jest.mock('@aws-sdk/client-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/client-dynamodb');
  return {
    ...actual,
    DynamoDBClient: jest.fn().mockImplementation(() => ({})),
  };
});

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

// Don't mock DynamoDbService - we'll mock the underlying DynamoDBDocumentClient instead
jest.mock('../../shared/services/captis-client');

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
    // Mock quota exceeded - handler uses dbService.getQuota(accountID, year)
    // The service uses DynamoDBDocumentClient.send() internally
    const { CaptisClient } = require('../../shared/services/captis-client');
    
    const currentYear = new Date().getFullYear().toString();
    const recentDate = new Date().toISOString();
    
    // Track call order to return quota first, then consent
    let callIndex = 0;
    mockDocClientSend.mockImplementation((command) => {
      callIndex++;
      const tableName = command.input?.TableName;
      const isGetCommand = command.constructor.name === 'GetCommand';
      
      // First call should be for quotas table (getQuota)
      if (isGetCommand && tableName && tableName.includes('quotas')) {
        return Promise.resolve({
          Item: {
            scansUsed: 14401, // Exceeds limit (>= SCANS_LIMIT = 14400)
            scansLimit: 14400,
            accountID: '550e8400-e29b-41d4-a716-446655440000',
            year: currentYear,
            lastWarnedAt: recentDate,
          },
        });
      }
      // Second call might be for consent table (getConsent) - return null
      if (isGetCommand && tableName && tableName.includes('consent')) {
        return Promise.resolve({ Item: null });
      }
      // Return null Item for other GetCommands
      if (isGetCommand) {
        return Promise.resolve({ Item: null });
      }
      // Return empty for other commands (PutCommand, UpdateCommand, etc.)
      return Promise.resolve({});
    });
    
    // Mock Captis client in case handler continues (shouldn't happen)
    CaptisClient.prototype.resolve = jest.fn().mockResolvedValue({ id: 'captis-123' });
    CaptisClient.prototype.poll = jest.fn().mockResolvedValue({
      id: 'captis-123',
      status: 'COMPLETED',
      timedOutFlag: false,
      matches: [],
      topScore: 0,
    });

    const response = await handler(mockEvent);
    
    // Verify mock was called
    expect(mockDocClientSend).toHaveBeenCalled();
    expect(response.statusCode).toBe(429);
  });

  it('should check consent and return 403 if opted out', async () => {
    // Mock consent opted out - handler uses dbService.getQuota() and getConsent()
    const currentYear = new Date().getFullYear().toString();
    
    // Track call order: first quota, then consent
    let callIndex = 0;
    mockDocClientSend.mockImplementation((command) => {
      callIndex++;
      const tableName = command.input?.TableName;
      const isGetCommand = command.constructor.name === 'GetCommand';
      
      // First call: getQuota (quotas table) - under limit
      if (isGetCommand && tableName && tableName.includes('quotas')) {
        return Promise.resolve({
          Item: {
            scansUsed: 0,
            scansLimit: 14400,
            accountID: '550e8400-e29b-41d4-a716-446655440000',
            year: currentYear,
          },
        });
      }
      // Second call: getConsent (consent table) - opted out
      if (isGetCommand && tableName && tableName.includes('consent')) {
        return Promise.resolve({
          Item: {
            accountID: '550e8400-e29b-41d4-a716-446655440000',
            consentStatus: false, // Opted out
          },
        });
      }
      // Return null for other GetCommands
      if (isGetCommand) {
        return Promise.resolve({ Item: null });
      }
      // Return empty for other commands
      return Promise.resolve({});
    });

    const response = await handler(mockEvent);
    
    // Verify mock was called at least twice (quota + consent)
    expect(mockDocClientSend).toHaveBeenCalledTimes(2);
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

