import axios from 'axios';

const mockGetWebhookSubscriptions = jest.fn();

jest.mock('../../shared/services/dynamodb-service', () => {
  return {
    DynamoDbService: jest.fn().mockImplementation(() => ({
      getWebhookSubscriptions: mockGetWebhookSubscriptions,
    })),
  };
});

jest.mock('axios');

import { handler } from '../../functions/webhook-dispatcher';

describe('webhook-dispatcher', () => {
  const baseEvent = {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            scanId: 'scan-1',
            topScore: 95,
            matchLevel: 'HIGH',
            threatLocation: { lat: 1, lon: 2 },
            viewMatchesUrl: 'https://view',
            accountID: 'acct-1',
          }),
        },
      },
    ],
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });
  });

  it('skips when no subscriptions', async () => {
    mockGetWebhookSubscriptions.mockResolvedValue([]);
    await handler(baseEvent);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('dispatches to enabled subscriptions', async () => {
    mockGetWebhookSubscriptions.mockResolvedValue([
      { webhookUrl: 'https://hook1', enabled: true },
      { webhookUrl: 'https://hook2', enabled: false },
      { webhookUrl: 'https://hook3', enabled: true },
    ]);

    await handler(baseEvent);

    const urls = (axios.post as jest.Mock).mock.calls.map(c => c[0]);
    expect(urls).toContain('https://hook1');
    expect(urls).toContain('https://hook3');
    expect(urls).not.toContain('https://hook2');
  });

  it('continues when some webhook posts fail', async () => {
    mockGetWebhookSubscriptions.mockResolvedValue([
      { webhookUrl: 'https://hook1', enabled: true },
      { webhookUrl: 'https://hook2', enabled: true },
    ]);
    (axios.post as jest.Mock)
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error('fail'));

    await handler(baseEvent);

    expect((axios.post as jest.Mock)).toHaveBeenCalledTimes(2);
  });
});

