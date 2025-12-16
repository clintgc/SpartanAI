import { APIGatewayProxyEvent } from 'aws-lambda';

const mockUpdateConsent = jest.fn();
const mockSnsSend = jest.fn();

jest.mock('../../shared/services/dynamodb-service', () => {
  return {
    DynamoDbService: jest.fn().mockImplementation(() => ({
      updateConsent: mockUpdateConsent,
    })),
  };
});

jest.mock('@aws-sdk/client-sns', () => {
  const actual = jest.requireActual('@aws-sdk/client-sns');
  return {
    ...actual,
    SNSClient: jest.fn().mockImplementation(() => ({
      send: mockSnsSend,
    })),
    PublishCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

// Import handler after mocks
import { handler } from '../../functions/consent-handler';

describe('consent-handler', () => {
  const baseEvent: Partial<APIGatewayProxyEvent> = {
    headers: { 'x-account-id': 'acct-1' },
    requestContext: { identity: {} as any, accountId: 'acct-1', apiId: 'api', protocol: 'HTTP/1.1', httpMethod: 'PUT', path: '/consent', stage: 'test', requestId: 'id', requestTimeEpoch: Date.now(), resourceId: '', resourcePath: '' } as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CONSENT_UPDATE_TOPIC_ARN;
  });

  it('returns 400 when body missing', async () => {
    const resp = await handler(baseEvent as any);
    expect(resp.statusCode).toBe(400);
    expect(mockUpdateConsent).not.toHaveBeenCalled();
  });

  it('returns 400 when consent not boolean', async () => {
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ consent: 'yes' }),
    } as any);
    expect(resp.statusCode).toBe(400);
    expect(mockUpdateConsent).not.toHaveBeenCalled();
  });

  it('returns 400 when accountID missing', async () => {
    const resp = await handler({
      ...baseEvent,
      headers: {},
      requestContext: { identity: {} as any },
      body: JSON.stringify({ consent: true }),
    } as any);
    expect(resp.statusCode).toBe(400);
    expect(mockUpdateConsent).not.toHaveBeenCalled();
  });

  it('updates consent and returns 200', async () => {
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ consent: false }),
    } as any);

    expect(resp.statusCode).toBe(200);
    expect(mockUpdateConsent).toHaveBeenCalledWith('acct-1', false);
  });

  it('publishes to SNS when topic set', async () => {
    process.env.CONSENT_UPDATE_TOPIC_ARN = 'arn:topic:consent';
    const resp = await handler({
      ...baseEvent,
      body: JSON.stringify({ consent: true }),
    } as any);

    expect(resp.statusCode).toBe(200);
    expect(mockSnsSend).toHaveBeenCalled();
    const publishInput = mockSnsSend.mock.calls[0][0].input;
    expect(publishInput.TopicArn).toBe('arn:topic:consent');
    expect(JSON.parse(publishInput.Message).consentStatus).toBe(true);
  });
});

