import { DynamoDbService } from '../../shared/services/dynamodb-service';

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      ...actual.DynamoDBDocumentClient,
      from: jest.fn(() => ({
        send: mockSend,
      })),
    },
    GetCommand: class { constructor(public input: any) {} },
    UpdateCommand: class { constructor(public input: any) {} },
    PutCommand: class { constructor(public input: any) {} },
    DeleteCommand: class { constructor(public input: any) {} },
    QueryCommand: class { constructor(public input: any) {} },
  };
});

const mockSend = jest.fn();

describe('DynamoDbService', () => {
  const service = new DynamoDbService('test');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getQuota issues GetCommand with quotas table', async () => {
    mockSend.mockResolvedValue({ Item: { scansUsed: 10 } });
    const result = await service.getQuota('acct', '2025');

    expect(result).toEqual({ scansUsed: 10 });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ TableName: 'test-quotas' }),
    }));
  });

  it('incrementQuota uses ADD expression to bump scansUsed', async () => {
    mockSend.mockResolvedValue({});
    await service.incrementQuota('acct', '2025');

    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.TableName).toBe('test-quotas');
    expect(cmd.input.UpdateExpression).toContain('ADD scansUsed :inc');
    expect(cmd.input.ExpressionAttributeValues[':inc']).toBe(1);
  });

  it('updateThreatLocation appends new location with timestamp', async () => {
    // First GetCommand returns existing locations
    mockSend
      .mockResolvedValueOnce({ Item: { locations: [{ lat: 1, lon: 2, timestamp: 'old' }] } })
      .mockResolvedValueOnce({});

    await service.updateThreatLocation('subj-1', 'acct-1', { lat: 10, lon: 20 });

    // First call is GetCommand, second is UpdateCommand
    const updateCall = mockSend.mock.calls[1][0] as any;
    expect(updateCall.input.TableName).toBe('test-threat-locations');
    expect(updateCall.input.UpdateExpression).toContain('locations = :locations');
    const newLocations = updateCall.input.ExpressionAttributeValues[':locations'];
    expect(newLocations).toHaveLength(2);
    expect(newLocations[1]).toEqual(expect.objectContaining({ lat: 10, lon: 20 }));
  });

  it('registerDeviceToken writes device token with timestamps', async () => {
    mockSend.mockResolvedValue({});
    await service.registerDeviceToken('acct', 'token-1', 'ios', '1.0.0');

    const putCall = mockSend.mock.calls[0][0] as any;
    expect(putCall.input.TableName).toBe('test-device-tokens');
    expect(putCall.input.Item.deviceToken).toBe('token-1');
    expect(putCall.input.Item.platform).toBe('ios');
  });
});

