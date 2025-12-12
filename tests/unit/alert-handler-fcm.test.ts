import { SNSEvent } from 'aws-lambda';
import { handler } from '../../functions/alert-handler';

// Mock dependencies
jest.mock('../../shared/services/dynamodb-service');
jest.mock('../../shared/services/fcm-client');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-dynamodb');

describe('Alert Handler FCM Integration', () => {
  const mockDeviceTokens = [
    { accountID: 'test-account-001', deviceToken: 'token-1', registeredAt: '2024-01-01T00:00:00Z' },
    { accountID: 'test-account-001', deviceToken: 'token-2', registeredAt: '2024-01-01T00:00:00Z' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Set environment variables
    process.env.FCM_SERVER_KEY = JSON.stringify({
      projectId: 'test-project',
      privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      clientEmail: 'test@test.iam.gserviceaccount.com',
    });
    process.env.SCANS_TABLE_NAME = 'test-scans';
    process.env.TABLE_PREFIX = 'test';
  });

  afterEach(() => {
    delete process.env.FCM_SERVER_KEY;
    delete process.env.SCANS_TABLE_NAME;
    delete process.env.TABLE_PREFIX;
  });

  const createMockSnsEvent = (topScore: number): SNSEvent => {
    return {
      Records: [
        {
          EventSource: 'aws:sns',
          EventVersion: '1.0',
          EventSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:test-topic:subscription-id',
          Sns: {
            Type: 'Notification',
            MessageId: 'test-message-id',
            TopicArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
            Subject: 'Test Alert',
            Message: JSON.stringify({
              scanId: 'test-scan-123',
              topScore,
              matchLevel: topScore > 89 ? 'HIGH' : 'MEDIUM',
              threatLocation: {
                lat: 40.7128,
                lon: -74.0060,
              },
              viewMatchesUrl: 'https://example.com/scan/test-scan-123',
              accountID: 'test-account-001',
            }),
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1',
            Signature: 'test-signature',
            SigningCertUrl: 'https://sns.us-east-1.amazonaws.com/cert.pem',
            UnsubscribeUrl: 'https://sns.us-east-1.amazonaws.com/unsubscribe',
            MessageAttributes: {},
          },
        },
      ],
    };
  };

  it('should send FCM notification for 75-89% match (MEDIUM threat)', async () => {
    const snsEvent = createMockSnsEvent(80); // 80% match

    // Mock DynamoDB service
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getDeviceTokens = jest.fn().mockResolvedValue(mockDeviceTokens);

    // Mock DynamoDB DocumentClient for scan lookup
    const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({
      Item: {
        scanId: 'test-scan-123',
        metadata: {
          location: { lat: 40.7128, lon: -74.0060 },
        },
      },
    });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    // Mock FCM client
    const { FcmClient } = require('../../shared/services/fcm-client');
    const mockSendNotification = jest.fn().mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    FcmClient.prototype.sendNotification = mockSendNotification;

    await handler(snsEvent);

    // Verify device tokens were fetched from DynamoDB
    expect(DynamoDbService.prototype.getDeviceTokens).toHaveBeenCalledWith('test-account-001');

    // Verify FCM notification was sent with correct parameters
    expect(mockSendNotification).toHaveBeenCalledWith(
      ['token-1', 'token-2'],
      expect.objectContaining({
        title: '⚠️ Medium Threat Detected (80%)',
        body: 'Threat detected. Match level: MEDIUM',
        data: expect.objectContaining({
          scanId: 'test-scan-123',
          topScore: '80',
          matchLevel: 'MEDIUM',
          threatLevel: 'MEDIUM',
          viewMatchesUrl: 'https://example.com/scan/test-scan-123',
          accountID: 'test-account-001',
        }),
      })
    );
  });

  it('should send FCM notification for >89% match (HIGH threat)', async () => {
    const snsEvent = createMockSnsEvent(95); // 95% match

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getDeviceTokens = jest.fn().mockResolvedValue(mockDeviceTokens);
    DynamoDbService.prototype.updateThreatLocation = jest.fn().mockResolvedValue(undefined);

    const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({
      Item: {
        scanId: 'test-scan-123',
        metadata: {
          location: { lat: 40.7128, lon: -74.0060 },
        },
      },
    });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const { FcmClient } = require('../../shared/services/fcm-client');
    const mockSendNotification = jest.fn().mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    FcmClient.prototype.sendNotification = mockSendNotification;

    await handler(snsEvent);

    // Verify FCM notification was sent with HIGH threat title
    expect(mockSendNotification).toHaveBeenCalledWith(
      ['token-1', 'token-2'],
      expect.objectContaining({
        title: '🚨 High Threat Detected (95%)',
        body: 'Immediate action required. Match level: HIGH',
        data: expect.objectContaining({
          threatLevel: 'HIGH',
        }),
      })
    );
  });

  it('should handle no device tokens gracefully', async () => {
    const snsEvent = createMockSnsEvent(80);

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getDeviceTokens = jest.fn().mockResolvedValue([]);

    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({
      Item: {
        scanId: 'test-scan-123',
        metadata: {
          location: { lat: 40.7128, lon: -74.0060 },
        },
      },
    });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const { FcmClient } = require('../../shared/services/fcm-client');
    const mockSendNotification = jest.fn();
    FcmClient.prototype.sendNotification = mockSendNotification;

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await handler(snsEvent);

    // Verify device tokens were queried
    expect(DynamoDbService.prototype.getDeviceTokens).toHaveBeenCalledWith('test-account-001');

    // Verify FCM was not called
    expect(mockSendNotification).not.toHaveBeenCalled();

    // Verify warning was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No device tokens found for account test-account-001')
    );

    consoleSpy.mockRestore();
  });

  it('should handle FCM client initialization failure gracefully', async () => {
    const snsEvent = createMockSnsEvent(80);

    // Mock invalid FCM config
    process.env.FCM_SERVER_KEY = 'invalid-json';

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getDeviceTokens = jest.fn().mockResolvedValue(mockDeviceTokens);

    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({
      Item: {
        scanId: 'test-scan-123',
        metadata: {
          location: { lat: 40.7128, lon: -74.0060 },
        },
      },
    });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await handler(snsEvent);

    // Verify warning about FCM not being initialized
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('FCM client not initialized')
    );

    consoleSpy.mockRestore();
  });

  it('should include all required data fields in FCM notification', async () => {
    const snsEvent = createMockSnsEvent(85);

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getDeviceTokens = jest.fn().mockResolvedValue(mockDeviceTokens);

    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({
      Item: {
        scanId: 'test-scan-123',
        metadata: {
          location: { lat: 40.7128, lon: -74.0060 },
        },
      },
    });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const { FcmClient } = require('../../shared/services/fcm-client');
    const mockSendNotification = jest.fn().mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    FcmClient.prototype.sendNotification = mockSendNotification;

    await handler(snsEvent);

    // Verify all data fields are present
    const fcmCall = mockSendNotification.mock.calls[0];
    const notificationData = fcmCall[1].data;

    expect(notificationData).toHaveProperty('scanId', 'test-scan-123');
    expect(notificationData).toHaveProperty('topScore', '85');
    expect(notificationData).toHaveProperty('matchLevel', 'MEDIUM');
    expect(notificationData).toHaveProperty('threatLevel', 'MEDIUM');
    expect(notificationData).toHaveProperty('viewMatchesUrl', 'https://example.com/scan/test-scan-123');
    expect(notificationData).toHaveProperty('accountID', 'test-account-001');
    expect(notificationData).toHaveProperty('timestamp');
  });
});

