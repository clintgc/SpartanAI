import { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockSend })),
    },
    DeleteCommand: class { constructor(public input: any) {} },
    QueryCommand: class { constructor(public input: any) {} },
  };
});

// Import handler after mocks
import { handler } from '../../functions/gdpr-deletion-handler';

describe('gdpr-deletion-handler', () => {
  const baseEvent: Partial<APIGatewayProxyEvent> = {
    pathParameters: { accountID: 'acct-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CONSENT_TABLE_NAME = 'test-consent';
    process.env.QUOTAS_TABLE_NAME = 'test-quotas';
    process.env.WEBHOOK_SUBSCRIPTIONS_TABLE_NAME = 'test-webhook-subscriptions';
    process.env.SCANS_TABLE_NAME = 'test-scans';
    process.env.THREAT_LOCATIONS_TABLE_NAME = 'test-threat-locations';
  });

  it('returns 400 if accountID missing', async () => {
    const resp = await handler({ pathParameters: {} } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('deletes consent and returns 200 when no related records', async () => {
    // Delete consent success
    mockSend
      .mockResolvedValueOnce({}) // Delete consent
      .mockResolvedValueOnce({ Items: [] }) // quotas query
      .mockResolvedValueOnce({ Items: [] }) // webhooks query
      .mockResolvedValueOnce({ Items: [] }) // scans query
      .mockResolvedValueOnce({ Items: [] }); // threat locations query

    const resp = await handler(baseEvent as any);
    expect(resp.statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalled();
  });

  it('returns 207 when some deletions fail', async () => {
    // Consent delete fails, quotas query returns one item then delete succeeds
    mockSend
      .mockRejectedValueOnce(new Error('consent fail')) // delete consent
      .mockResolvedValueOnce({ Items: [{ year: '2025' }] }) // quotas query
      .mockResolvedValueOnce({}) // delete quota
      .mockResolvedValueOnce({ Items: [] }) // webhooks query
      .mockResolvedValueOnce({ Items: [] }) // scans query
      .mockResolvedValueOnce({ Items: [] }); // threat locations query

    const resp = await handler(baseEvent as any);
    expect(resp.statusCode).toBe(207);
    expect(resp.body).toContain('Data deletion completed with errors');
  });
});

