import * as admin from 'firebase-admin';
import { FcmClient } from '../../shared/services/fcm-client';

jest.mock('firebase-admin', () => {
  const messagingMock = {
    sendEachForMulticast: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
    send: jest.fn().mockResolvedValue('msg-1'),
  };
  return {
    apps: [],
    initializeApp: jest.fn(() => ({ name: 'app' })),
    app: jest.fn(() => ({ name: 'app' })),
    credential: {
      cert: jest.fn((creds) => creds),
    },
    messaging: jest.fn(() => messagingMock),
  };
});

describe('FcmClient', () => {
  const baseConfig = {
    projectId: 'pid',
    privateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    clientEmail: 'test@test.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends multicast notification with notification block when not silent', async () => {
    const client = new FcmClient(baseConfig);
    const resp = await client.sendNotification(['t1', 't2'], { title: 'Hi', body: 'Body', data: { a: 'b' } });

    expect(resp).toEqual({ successCount: 1, failureCount: 0 });
    const msg = (admin.messaging as jest.Mock).mock.results[0].value.sendEachForMulticast.mock.calls[0][0];
    expect(msg.notification).toEqual({ title: 'Hi', body: 'Body' });
    expect(msg.tokens).toEqual(['t1', 't2']);
  });

  it('sends silent data-only notification', async () => {
    const client = new FcmClient(baseConfig);
    await client.sendSilentData(['t1'], { key: 'value' });

    const calls = (admin.messaging as jest.Mock).mock.results[0].value.sendEachForMulticast.mock.calls;
    const msg = calls[0][0];
    expect(msg.notification).toBeUndefined();
    expect(msg.data).toEqual({ key: 'value' });
    expect(msg.apns?.headers?.['apns-priority']).toBe('5');
  });

  it('sendToDevice uses messaging.send with token', async () => {
    const client = new FcmClient(baseConfig);
    const resp = await client.sendToDevice('t1', { title: 'One', body: 'Two' });
    expect(resp).toBe('msg-1');
    const msg = (admin.messaging as jest.Mock).mock.results[0].value.send.mock.calls[0][0];
    expect(msg.token).toBe('t1');
    expect(msg.notification).toEqual({ title: 'One', body: 'Two' });
  });
});

