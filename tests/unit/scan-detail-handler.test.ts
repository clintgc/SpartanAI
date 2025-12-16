import { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockSend })),
    },
    GetCommand: class { constructor(public input: any) {} },
  };
});

import { handler } from '../../functions/scan-detail-handler';

describe('scan-detail-handler', () => {
  const baseEvent: Partial<APIGatewayProxyEvent> = {
    headers: { 'x-account-id': 'acct-1' },
    requestContext: { identity: { accountId: 'acct-1' } } as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SCANS_TABLE_NAME = 'test-scans';
  });

  it('400 when id missing', async () => {
    const resp = await handler({ ...baseEvent, pathParameters: {} } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('401 when no auth', async () => {
    const resp = await handler({
      ...baseEvent,
      headers: {},
      requestContext: { identity: {} as any },
      pathParameters: { id: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(401);
  });

  it('404 when not found', async () => {
    mockSend.mockResolvedValueOnce({}); // GetCommand returns no Item
    const resp = await handler({
      ...baseEvent,
      pathParameters: { id: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(404);
  });

  it('403 when account mismatch', async () => {
    mockSend.mockResolvedValueOnce({ Item: { scanId: 'scan-1', accountID: 'other' } });
    const resp = await handler({
      ...baseEvent,
      pathParameters: { id: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(403);
  });

  it('200 when authorized and found', async () => {
    const item = { scanId: 'scan-1', accountID: 'acct-1', topScore: 75 };
    mockSend.mockResolvedValueOnce({ Item: item });
    const resp = await handler({
      ...baseEvent,
      pathParameters: { id: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toContain('scan-1');
  });
});

