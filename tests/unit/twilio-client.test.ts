import twilio from 'twilio';
import { TwilioClient } from '../../shared/services/twilio-client';

jest.mock('twilio', () => {
  const messages = {
    create: jest.fn().mockResolvedValue({
      sid: 'SM123',
      status: 'queued',
      to: '+15555550100',
    }),
  };
  return jest.fn(() => ({ messages }));
});

describe('TwilioClient', () => {
  const baseConfig = {
    accountSid: 'AC123',
    authToken: 'token',
    phoneNumber: '+15550001234',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends SMS when E.164 is valid', async () => {
    const client = new TwilioClient(baseConfig);
    const resp = await client.sendSms({ to: '+15555550100', body: 'Hello' });

    expect(resp).toEqual({
      messageSid: 'SM123',
      status: 'queued',
      to: '+15555550100',
    });
    expect((twilio as unknown as jest.Mock).mock.results[0].value.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15555550100',
        from: '+15550001234',
        body: 'Hello',
      })
    );
  });

  it('throws on non-E.164 numbers', async () => {
    const client = new TwilioClient(baseConfig);
    await expect(client.sendSms({ to: '555-0100', body: 'Hi' })).rejects.toThrow(/Invalid phone number format/);
  });
});

