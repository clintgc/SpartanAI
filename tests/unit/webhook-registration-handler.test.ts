import { APIGatewayProxyEvent } from 'aws-lambda';

const mockGetWebhookSubscriptions = jest.fn();
const mockCreateWebhookSubscription = jest.fn();

jest.mock('../../shared/services/dynamodb-service', () => {
  return {
    DynamoDbService: jest.fn().mockImplementation(() => ({
      getWebhookSubscriptions: mockGetWebhookSubscriptions,
      createWebhookSubscription: mockCreateWebhookSubscription,
    })),
  };
});

import { handler } from '../../functions/webhook-registration-handler';

describe('webhook-registration-handler', () => {
  const baseEvent: Partial<APIGatewayProxyEvent> = {
    headers: { 'x-account-id': 'acct-1' },
    requestContext: { identity: { accountId: 'acct-1' } } as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('400 when body missing', async () => {
    const resp = await handler(baseEvent as any);
    expect(resp.statusCode).toBe(400);
  });

  it('400 on invalid JSON', async () => {
    const resp = await handler({
      ...baseEvent,
      body: '{bad}',
    } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('400 on invalid URL (http)', async () => {
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ webhookUrl: 'http://example.com' }),
    } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('400 on private IP', async () => {
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ webhookUrl: 'https://192.168.1.1/hook' }),
    } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('400 when accountID missing', async () => {
    const resp = await handler({
      headers: {},
      requestContext: { identity: {} as any },
      body: JSON.stringify({ webhookUrl: 'https://example.com/hook' }),
    } as any);
    expect(resp.statusCode).toBe(400);
  });

  it('409 when duplicate enabled URL exists', async () => {
    mockGetWebhookSubscriptions.mockResolvedValue([
      { webhookUrl: 'https://example.com/hook', enabled: true, webhookId: 'w1' },
    ]);
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ webhookUrl: 'https://example.com/hook' }),
    } as any);
    expect(resp.statusCode).toBe(409);
  });

  it('201 creates webhook and returns id', async () => {
    mockGetWebhookSubscriptions.mockResolvedValue([]);
    mockCreateWebhookSubscription.mockResolvedValue(undefined);
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ webhookUrl: 'https://example.com/hook' }),
    } as any);
    expect(resp.statusCode).toBe(201);
    expect(mockCreateWebhookSubscription).toHaveBeenCalled();
    const body = JSON.parse(resp.body);
    expect(body.webhookId).toBeDefined();
    expect(body.accountID).toBe('acct-1');
  });
});

