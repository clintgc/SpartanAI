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

jest.mock('@aws-sdk/client-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/client-dynamodb');
  return {
    ...actual,
    DynamoDBClient: jest.fn().mockImplementation(() => ({})),
  };
});

import { handler } from '../../functions/public-scan-detail-handler';

describe('public-scan-detail-handler', () => {
  const baseEvent: Partial<APIGatewayProxyEvent> = {
    headers: {},
    requestContext: {} as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SCANS_TABLE_NAME = 'test-scans';
  });

  it('returns 400 when scanId is missing', async () => {
    const resp = await handler({ ...baseEvent, pathParameters: {} } as any);
    expect(resp.statusCode).toBe(400);
    expect(JSON.parse(resp.body)).toMatchObject({ error: 'Scan ID is required' });
    expect(resp.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns 400 when pathParameters is null', async () => {
    const resp = await handler({ ...baseEvent, pathParameters: null } as any);
    expect(resp.statusCode).toBe(400);
    expect(JSON.parse(resp.body)).toMatchObject({ error: 'Scan ID is required' });
  });

  it('returns 404 when scan not found', async () => {
    mockSend.mockResolvedValueOnce({}); // GetCommand returns no Item
    const resp = await handler({
      ...baseEvent,
      pathParameters: { scanId: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(404);
    expect(JSON.parse(resp.body)).toMatchObject({ error: 'Scan not found' });
    expect(resp.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns 200 with scan data when found', async () => {
    const item = {
      scanId: 'scan-1',
      accountID: 'acct-1',
      topScore: 92.5,
      matchLevel: 'HIGH',
      status: 'COMPLETED',
      matches: [
        {
          score: 92.5,
          subject: {
            id: 'subj-1',
            name: 'TEST SUBJECT',
            photo: 'base64-image-data',
          },
        },
      ],
      crimes: [
        { description: 'Test crime', type: 'FELONY', date: '2024-01-01', status: 'CONVICTED' },
      ],
      metadata: {
        cameraID: 'cam-1',
        location: { lat: 40.7128, lon: -74.0060 },
        timestamp: '2024-01-01T00:00:00Z',
      },
    };
    mockSend.mockResolvedValueOnce({ Item: item });
    const resp = await handler({
      ...baseEvent,
      pathParameters: { scanId: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.scanId).toBe('scan-1');
    expect(body.topScore).toBe(92.5);
    expect(body.matches).toBeDefined();
    expect(body.crimes).toBeDefined();
    expect(resp.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(resp.headers?.['Content-Type']).toBe('application/json');
    expect(resp.headers?.['Cache-Control']).toBe('public, max-age=300');
  });

  it('does not require authentication (no account verification)', async () => {
    const item = {
      scanId: 'scan-1',
      accountID: 'different-account',
      topScore: 75,
    };
    mockSend.mockResolvedValueOnce({ Item: item });
    const resp = await handler({
      ...baseEvent,
      pathParameters: { scanId: 'scan-1' },
    } as any);
    // Should return 200 even though accountID doesn't match (public endpoint)
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.scanId).toBe('scan-1');
  });

  it('returns scan data with matches and crimes arrays', async () => {
    const item = {
      scanId: 'scan-1',
      matches: [
        {
          score: 95,
          subject: {
            id: 'subj-1',
            name: 'POWERS, FRANK',
            photo: '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',
          },
        },
      ],
      crimes: [
        { description: 'Armed Robbery', type: 'FELONY', date: '2020-01-15', status: 'CONVICTED' },
        { description: 'Assault', type: 'FELONY', date: '2019-06-20', status: 'CONVICTED' },
      ],
      metadata: {
        imageUrl: 'https://example.com/camera-image.jpg',
      },
    };
    mockSend.mockResolvedValueOnce({ Item: item });
    const resp = await handler({
      ...baseEvent,
      pathParameters: { scanId: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].subject.name).toBe('POWERS, FRANK');
    expect(body.crimes).toHaveLength(2);
    expect(body.metadata.imageUrl).toBe('https://example.com/camera-image.jpg');
    expect(resp.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(resp.headers?.['Content-Type']).toBe('application/json');
    expect(resp.headers?.['Cache-Control']).toBe('public, max-age=300');
  });

  it('includes CORS headers in all responses', async () => {
    mockSend.mockResolvedValueOnce({ Item: { scanId: 'scan-1' } });
    const resp = await handler({
      ...baseEvent,
      pathParameters: { scanId: 'scan-1' },
    } as any);
    expect(resp.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('handles DynamoDB errors gracefully', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));
    const resp = await handler({
      ...baseEvent,
      pathParameters: { scanId: 'scan-1' },
    } as any);
    expect(resp.statusCode).toBe(500);
    const body = JSON.parse(resp.body);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('DynamoDB error');
    expect(resp.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});