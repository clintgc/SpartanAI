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
// Don't mock DynamoDbService - we'll mock the underlying DynamoDBDocumentClient instead
jest.mock('@aws-sdk/client-dynamodb');

// Import handler after mocks are set up
import { handler } from '../../functions/email-aggregator';

describe('Email Aggregator', () => {
  const mockSend = jest.fn();
  const mockScanResults: any[] = [];
  const mockQueryResults: any[] = [];
  const mockGetResults: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mockScanResults.length = 0;
    mockQueryResults.length = 0;
    mockGetResults.length = 0;

    // Mock SendGrid
    (sgMail.setApiKey as jest.Mock) = jest.fn();
    (sgMail.send as jest.Mock) = mockSend.mockResolvedValue([{ statusCode: 202 }]);

    // Setup DynamoDB DocumentClient mock
    // Handler uses: ScanCommand (get accountIDs), QueryCommand (get matches), GetCommand (get account profile)
    mockDocClientSend.mockImplementation((command) => {
      const cmdName = command.constructor.name;
      
      if (cmdName === 'ScanCommand') {
        return Promise.resolve(mockScanResults.shift() || { Items: [] });
      }
      if (cmdName === 'QueryCommand') {
        return Promise.resolve(mockQueryResults.shift() || { Items: [] });
      }
      if (cmdName === 'GetCommand') {
        // For account profiles (accountID-index or accountProfiles table)
        return Promise.resolve(mockGetResults.shift() || { Item: null });
      }
      // Return empty for other commands (UpdateCommand, etc.)
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

    // Mock account profiles via DynamoDB GetCommand
    // Handler processes account-001 first, then account-002
    // First call: account-001 profile (has email, will send email)
    mockGetResults.push({
      Item: {
        accountID: 'account-001',
        name: 'Test User',
        email: 'test@example.com',
      },
    });
    // Second call: account-002 has no profile (null) - but account-002 has no matches anyway
    // Actually, account-002 won't call getAccountProfile since it has no matches (matches.size === 0)
    // So we only need one GetCommand result for account-001

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

    // Mock account profile with no email
    mockGetResults.push({
      Item: {
        accountID: 'account-001',
        name: 'Test User',
        // No email
      },
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

    // Mock account profile with existing unsubscribe token
    mockGetResults.push({
      Item: {
        accountID: 'account-001',
        name: 'Test User',
        email: 'test@example.com',
        unsubscribeToken: 'existing-token-123',
      },
    });

    await handler(event);

    // Verify SendGrid was called
    expect(mockSend).toHaveBeenCalled();
    
    // Verify email contains unsubscribe link
    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.html).toContain('unsubscribe');
    expect(sendCall.html).toContain('existing-token-123');
    // Email is in the unsubscribe URL (URL-encoded as test%40example.com)
    // The email is encoded via encodeURIComponent, so @ becomes %40
    expect(sendCall.html).toMatch(/test(%40|@)example\.com/);
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

    // Mock account profile without unsubscribe token (will be created)
    mockGetResults.push({
      Item: {
        accountID: 'account-001',
        name: 'Test User',
        email: 'test@example.com',
        // No unsubscribeToken
      },
    });
    
    // Track PutCommand calls for updating profile with token
    // updateAccountProfile uses PutCommand, not UpdateCommand
    let putCallCount = 0;
    // Override mock to also handle PutCommand
    // Note: Arrays are already populated above, so shift() will work
    mockDocClientSend.mockImplementation((command) => {
      const cmdName = command.constructor.name;
      
      if (cmdName === 'PutCommand') {
        putCallCount++;
        return Promise.resolve({});
      }
      // Use the arrays that were populated above
      if (cmdName === 'ScanCommand') {
        const result = mockScanResults.length > 0 ? mockScanResults.shift() : { Items: [] };
        return Promise.resolve(result);
      }
      if (cmdName === 'QueryCommand') {
        const result = mockQueryResults.length > 0 ? mockQueryResults.shift() : { Items: [] };
        return Promise.resolve(result);
      }
      if (cmdName === 'GetCommand') {
        const result = mockGetResults.length > 0 ? mockGetResults.shift() : { Item: null };
        return Promise.resolve(result);
      }
      return Promise.resolve({});
    });

    await handler(event);

    // Verify profile was updated with unsubscribe token (PutCommand was called)
    expect(putCallCount).toBeGreaterThan(0);

    // Verify email contains unsubscribe link
    expect(mockSend).toHaveBeenCalled();
    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.html).toContain('unsubscribe');
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

    // Mock account profile with unsubscribe token
    mockGetResults.push({
      Item: {
        accountID: 'account-001',
        name: 'Test User',
        email: 'test@example.com',
        unsubscribeToken: 'token-123',
      },
    });

    await handler(event);

    // Verify SendGrid was called
    expect(mockSend).toHaveBeenCalled();
    
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

