import * as admin from 'firebase-admin';

export interface FcmConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

export interface FcmNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class FcmClient {
  private app: admin.app.App;

  constructor(config: FcmConfig) {
    if (admin.apps.length === 0) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.projectId,
          privateKey: config.privateKey.replace(/\\n/g, '\n'),
          clientEmail: config.clientEmail,
        }),
      });
    } else {
      this.app = admin.app();
    }
  }

  /**
   * Send FCM notification to device tokens
   */
  async sendNotification(
    deviceTokens: string[],
    notification: FcmNotification
  ): Promise<admin.messaging.BatchResponse> {
    if (deviceTokens.length === 0) {
      throw new Error('No device tokens provided');
    }

    const message: admin.messaging.MulticastMessage = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      tokens: deviceTokens,
    };

    return await admin.messaging().sendEachForMulticast(message);
  }

  /**
   * Send FCM notification to a single device
   */
  async sendToDevice(
    deviceToken: string,
    notification: FcmNotification
  ): Promise<string> {
    const message: admin.messaging.Message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      token: deviceToken,
    };

    return await admin.messaging().send(message);
  }
}

