import { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockSend })),
    },
    QueryCommand: class { constructor(public input: any) {} },
  };
});

import { handler } from '../../functions/scan-list-handler';

describe('scan-list-handler', () => {
  const baseEvent: Partial<APIGatewayProxyEvent> = {
    headers: { 'x-account-id': 'acct-1' },
    requestContext: { identity: { accountId: 'acct-1' } } as any,
    queryStringParameters: { accountID: 'acct-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SCANS_TABLE_NAME = 'test-scans';
  });

  it('401 when no auth', async () => {
    const resp = await handler({
      ...baseEvent,
      headers: {},
      requestContext: { identity: {} as any },
    } as any);
    expect(resp.statusCode).toBe(401);
  });

  it('403 when account mismatch', async () => {
    const resp = await handler({
      ...baseEvent,
      queryStringParameters: { accountID: 'other' },
    } as any);
    expect(resp.statusCode).toBe(403);
  });

  it('400 when nextToken invalid', async () => {
    const resp = await handler({
      ...baseEvent,
      queryStringParameters: { accountID: 'acct-1', nextToken: '!!!' },
    } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('caps limit to 100 and returns nextToken', async () => {
    const lastKey = { scanId: 's2' };
    mockSend.mockResolvedValueOnce({
      Items: [{ scanId: 's1' }],
      LastEvaluatedKey: lastKey,
    });

    const resp = await handler({
      ...baseEvent,
      queryStringParameters: { accountID: 'acct-1', limit: '500' },
    } as any);

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.scans).toHaveLength(1);
    expect(body.nextToken).toBe(Buffer.from(JSON.stringify(lastKey)).toString('base64'));

    const query = mockSend.mock.calls[0][0] as any;
    expect(query.input.Limit).toBe(100); // capped
    expect(query.input.TableName).toBe('test-scans');
  });
});

