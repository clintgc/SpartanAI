import { EventBridgeEvent } from 'aws-lambda';

const mockPollUntilComplete = jest.fn();
const mockUpdateThreatLocation = jest.fn();
const mockDocSend = jest.fn();
const mockSnsSend = jest.fn();

jest.mock('../../shared/services/captis-client', () => {
  return {
    CaptisClient: jest.fn().mockImplementation(() => ({
      pollUntilComplete: mockPollUntilComplete,
    })),
  };
});

jest.mock('../../shared/services/dynamodb-service', () => {
  return {
    DynamoDbService: jest.fn().mockImplementation(() => ({
      updateThreatLocation: mockUpdateThreatLocation,
    })),
  };
});

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({ send: mockDocSend })),
    },
    UpdateCommand: class { constructor(public input: any) {} },
    GetCommand: class { constructor(public input: any) {} },
  };
});

jest.mock('@aws-sdk/client-sns', () => {
  const actual = jest.requireActual('@aws-sdk/client-sns');
  return {
    ...actual,
    SNSClient: jest.fn().mockImplementation(() => ({ send: mockSnsSend })),
    PublishCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

import { handler } from '../../functions/poll-handler';

describe('poll-handler', () => {
  const baseEvent: EventBridgeEvent<'PollScan', any> = {
    'detail-type': 'PollScan',
    source: 'spartan-ai',
    id: 'id',
    account: 'acct',
    region: 'us-east-1',
    version: '1',
    time: new Date().toISOString(),
    resources: [],
    detail: {
      scanId: 'scan-1',
      captisId: 'captis-1',
      accountID: 'acct-1',
      captisAccessKey: 'key',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SCANS_TABLE_NAME = 'test-scans';
    process.env.HIGH_THREAT_TOPIC_ARN = 'arn:high';
    process.env.MEDIUM_THREAT_TOPIC_ARN = 'arn:med';
    process.env.WEBHOOK_TOPIC_ARN = 'arn:webhook';
  });

  it('updates scan and publishes SNS for high threat', async () => {
    mockPollUntilComplete.mockResolvedValue({
      status: 'COMPLETED',
      matches: [{ score: 95, subject: { id: 'subj-1' } }],
      viewMatchesUrl: 'https://view',
    });
    // UpdateCommand then GetCommand
    mockDocSend
      .mockResolvedValueOnce({}) // update scan
      .mockResolvedValueOnce({ Item: { metadata: { location: { lat: 1, lon: 2 } } } }); // get scan for location

    await handler(baseEvent);

    // Update scan called
    const updateCall = mockDocSend.mock.calls[0][0] as any;
    expect(updateCall.input.TableName).toBe('test-scans');
    expect(updateCall.input.ExpressionAttributeValues[':score']).toBe(95);

    // SNS high threat publish called
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ TopicArn: 'arn:high' }),
      })
    );
    // Webhook topic for high threat
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ TopicArn: 'arn:webhook' }),
      })
    );
    // Threat location update called
    expect(mockUpdateThreatLocation).toHaveBeenCalledWith(
      'subj-1',
      'acct-1',
      expect.objectContaining({ lat: 1, lon: 2 })
    );
  });

  it('publishes medium threat and skips webhook', async () => {
    mockPollUntilComplete.mockResolvedValue({
      status: 'COMPLETED',
      matches: [{ score: 80, subject: { id: 'subj-2' } }],
      viewMatchesUrl: 'https://view2',
    });
    mockDocSend
      .mockResolvedValueOnce({}) // update
      .mockResolvedValueOnce({ Item: { metadata: { location: { lat: 5, lon: 6 } } } });

    await handler(baseEvent);

    // medium topic
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ TopicArn: 'arn:med' }),
      })
    );
    // no webhook publish for medium
    const webhookCalls = mockSnsSend.mock.calls.filter(c => c[0].input.TopicArn === 'arn:webhook');
    expect(webhookCalls).toHaveLength(0);
  });

  it('logs low threat without SNS publish', async () => {
    mockPollUntilComplete.mockResolvedValue({
      status: 'COMPLETED',
      matches: [{ score: 60, subject: { id: 'subj-3' } }],
    });
    mockDocSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { metadata: { location: { lat: 0, lon: 0 } } } });

    await handler(baseEvent);

    const snsTopics = mockSnsSend.mock.calls.map(c => c[0].input.TopicArn);
    expect(snsTopics).not.toContain('arn:high');
    expect(snsTopics).not.toContain('arn:med');
  });
});

