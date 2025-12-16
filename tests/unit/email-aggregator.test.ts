import { EventBridgeEvent } from 'aws-lambda';
import sgMail from '@sendgrid/mail';

// Mock dependencies before importing handler
// Must mock before importing since docClient is created at module load time
const mockDocClientSend = jest.fn();

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

jest.mock('@sendgrid/mail');
jest.mock('../../shared/services/dynamodb-service');
jest.mock('@aws-sdk/client-dynamodb');

// Import handler after mocks are set up
import { handler } from '../../functions/email-aggregator';

describe('Email Aggregator', () => {
  const mockSend = jest.fn();
  const mockScanResults: any[] = [];
  const mockQueryResults: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mockScanResults.length = 0;
    mockQueryResults.length = 0;

    // Mock SendGrid
    (sgMail.setApiKey as jest.Mock) = jest.fn();
    (sgMail.send as jest.Mock) = mockSend.mockResolvedValue([{ statusCode: 202 }]);

    // Setup DynamoDB DocumentClient mock
    mockDocClientSend.mockImplementation((command) => {
      if (command.constructor.name === 'ScanCommand') {
        return Promise.resolve(mockScanResults.shift() || { Items: [] });
      }
      if (command.constructor.name === 'QueryCommand') {
        return Promise.resolve(mockQueryResults.shift() || { Items: [] });
      }
      return Promise.resolve({});
    });

    // Set environment variables
    process.env.SCANS_TABLE_NAME = 'test-scans';
    process.env.TABLE_PREFIX = 'test';
    process.env.SENDGRID_API_KEY = 'test-api-key';
    process.env.SENDGRID_FROM_EMAIL = 'alerts@test.com';
    process.env.API_BASE_URL = 'https://api.test.com';
  });

  afterEach(() => {
    delete process.env.SCANS_TABLE_NAME;
    delete process.env.TABLE_PREFIX;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.API_BASE_URL;
  });

  const createMockEvent = (): EventBridgeEvent<'ScheduledEvent', {}> => {
    return {
      version: '0',
      id: 'test-event-id',
      'detail-type': 'ScheduledEvent',
      source: 'aws.events',
      account: '123456789012',
      time: new Date().toISOString(),
      region: 'us-east-1',
      resources: ['arn:aws:events:us-east-1:123456789012:rule/test-rule'],
      detail: {},
    };
  };

  it('should deduplicate matches by subjectId and biometrics before sending email', async () => {
    const event = createMockEvent();

    // Mock scan to get accountIDs
    mockScanResults.push({
      Items: [
        { accountID: 'account-001' },
        { accountID: 'account-001' },
        { accountID: 'account-002' },
      ],
    });

    // Mock query for account-001 (with duplicates)
    mockQueryResults.push({
      Items: [
        {
          scanId: 'scan-1',
          accountID: 'account-001',
          topScore: 65,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-1',
          matches: [{ subject: { id: 'subject-1', name: 'John Doe' } }],
          biometrics: [{ age: 30, femaleScore: 0.2, x: 100, y: 200 }],
        },
        {
          scanId: 'scan-2',
          accountID: 'account-001',
          topScore: 70, // Higher score, should be kept
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-2',
          matches: [{ subject: { id: 'subject-1', name: 'John Doe' } }], // Same subject
          biometrics: [{ age: 30, femaleScore: 0.2, x: 100, y: 200 }], // Same biometrics
        },
        {
          scanId: 'scan-3',
          accountID: 'account-001',
          topScore: 60,
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-3',
          matches: [{ subject: { id: 'subject-2', name: 'Jane Smith' } }], // Different subject
          biometrics: [{ age: 25, femaleScore: 0.8, x: 150, y: 250 }],
        },
      ],
    });
    
    // Mock query for account-002 (no matches)
    mockQueryResults.push({
      Items: [], // account-002 has no matches
    });

    // Mock DynamoDbService
    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getAccountProfile = jest
      .fn()
      .mockResolvedValueOnce({
        accountID: 'account-001',
        name: 'Test User',
        email: 'test@example.com',
      })
      .mockResolvedValueOnce(null); // account-002 has no profile

    await handler(event);

    // Verify SendGrid was called once (only for account-001)
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Verify email content includes deduplicated matches (should be 2, not 3)
    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.to).toBe('test@example.com');
    expect(sendCall.subject).toContain('2 Potential Matches'); // Deduplicated from 3 to 2
    expect(sendCall.html).toContain('Test User'); // Personalized greeting
    expect(sendCall.html).toContain('John Doe'); // Subject name
    expect(sendCall.html).toContain('Jane Smith'); // Different subject
    expect(sendCall.html).toContain('70%'); // Highest score kept
    expect(sendCall.html).toContain('unsubscribe'); // Unsubscribe link
  });

  it('should handle accounts with no matches gracefully', async () => {
    const event = createMockEvent();

    mockScanResults.push({
      Items: [{ accountID: 'account-001' }],
    });

    mockQueryResults.push({
      Items: [], // No matches
    });

    await handler(event);

    // Verify SendGrid was not called
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should skip accounts without email in profile', async () => {
    const event = createMockEvent();

    mockScanResults.push({
      Items: [{ accountID: 'account-001' }],
    });

    mockQueryResults.push({
      Items: [
        {
          scanId: 'scan-1',
          accountID: 'account-001',
          topScore: 65,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-1',
          matches: [{ subject: { id: 'subject-1', name: 'John Doe' } }],
        },
      ],
    });

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getAccountProfile = jest.fn().mockResolvedValueOnce({
      accountID: 'account-001',
      name: 'Test User',
      // No email
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await handler(event);

    // Verify SendGrid was not called
    expect(mockSend).not.toHaveBeenCalled();

    // Verify warning was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No email found for account account-001')
    );

    consoleSpy.mockRestore();
  });

  it('should generate unsubscribe link with token', async () => {
    const event = createMockEvent();

    mockScanResults.push({
      Items: [{ accountID: 'account-001' }],
    });

    mockQueryResults.push({
      Items: [
        {
          scanId: 'scan-1',
          accountID: 'account-001',
          topScore: 65,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-1',
          matches: [{ subject: { id: 'subject-1', name: 'John Doe' } }],
        },
      ],
    });

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    const mockGetProfile = jest.fn().mockResolvedValueOnce({
      accountID: 'account-001',
      name: 'Test User',
      email: 'test@example.com',
      unsubscribeToken: 'existing-token-123',
    });
    DynamoDbService.prototype.getAccountProfile = mockGetProfile;

    await handler(event);

    // Verify email contains unsubscribe link
    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.html).toContain('unsubscribe');
    expect(sendCall.html).toContain('existing-token-123');
    expect(sendCall.html).toContain('test@example.com');
  });

  it('should create unsubscribe token if not exists', async () => {
    const event = createMockEvent();

    mockScanResults.push({
      Items: [{ accountID: 'account-001' }],
    });

    mockQueryResults.push({
      Items: [
        {
          scanId: 'scan-1',
          accountID: 'account-001',
          topScore: 65,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-1',
          matches: [{ subject: { id: 'subject-1', name: 'John Doe' } }],
        },
      ],
    });

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    const mockGetProfile = jest.fn().mockResolvedValueOnce({
      accountID: 'account-001',
      name: 'Test User',
      email: 'test@example.com',
      // No unsubscribeToken
    });
    const mockUpdateProfile = jest.fn().mockResolvedValueOnce(undefined);
    
    DynamoDbService.prototype.getAccountProfile = mockGetProfile;
    DynamoDbService.prototype.updateAccountProfile = mockUpdateProfile;

    await handler(event);

    // Verify profile was updated with unsubscribe token
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        accountID: 'account-001',
        unsubscribeToken: expect.any(String),
      })
    );

    // Verify email contains unsubscribe link with new token
    const sendCall = mockSend.mock.calls[0][0];
    const updateCall = mockUpdateProfile.mock.calls[0][0];
    expect(sendCall.html).toContain(updateCall.unsubscribeToken);
  });

  it('should include all required match details in email', async () => {
    const event = createMockEvent();

    mockScanResults.push({
      Items: [{ accountID: 'account-001' }],
    });

    mockQueryResults.push({
      Items: [
        {
          scanId: 'scan-1',
          accountID: 'account-001',
          topScore: 65,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          viewMatchesUrl: 'https://example.com/scan-1',
          matches: [{ subject: { id: 'subject-1', name: 'John Doe' } }],
        },
      ],
    });

    const { DynamoDbService } = require('../../shared/services/dynamodb-service');
    DynamoDbService.prototype.getAccountProfile = jest.fn().mockResolvedValueOnce({
      accountID: 'account-001',
      name: 'Test User',
      email: 'test@example.com',
      unsubscribeToken: 'token-123',
    });

    await handler(event);

    const sendCall = mockSend.mock.calls[0][0];
    const html = sendCall.html;

    // Verify all required fields are present
    expect(html).toContain('Test User'); // Personalized greeting
    expect(html).toContain('John Doe'); // Subject name
    expect(html).toContain('65%'); // Match score
    expect(html).toContain('https://example.com/scan-1'); // View matches URL
    expect(html).toContain('View Details'); // Link text
    expect(html).toContain('unsubscribe'); // Unsubscribe link
    expect(html).toContain('deduplicated'); // Deduplication note
  });
});

