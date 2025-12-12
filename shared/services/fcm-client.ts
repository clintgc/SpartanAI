import * as admin from 'firebase-admin';

export interface FcmConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

export interface FcmNotification {
  title?: string;
  body?: string;
  data?: Record<string, string>;
  silent?: boolean; // If true, send data-only (no notification)
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
   * Supports both visible notifications and silent data-only messages
   */
  async sendNotification(
    deviceTokens: string[],
    notification: FcmNotification
  ): Promise<admin.messaging.BatchResponse> {
    if (deviceTokens.length === 0) {
      throw new Error('No device tokens provided');
    }

    const message: admin.messaging.MulticastMessage = {
      // Only include notification field if not silent (data-only)
      ...(notification.silent ? {} : {
        notification: {
          title: notification.title || '',
          body: notification.body || '',
        },
      }),
      data: notification.data || {},
      tokens: deviceTokens,
      // For silent messages, set content_available to allow background processing
      ...(notification.silent ? { 
        apns: { 
          headers: { 'apns-priority': '5' } // Low priority for background
        },
        android: {
          priority: 'normal' as const
        }
      } : {}),
    };

    return await admin.messaging().sendEachForMulticast(message);
  }

  /**
   * Send FCM notification to a single device
   * Supports both visible notifications and silent data-only messages
   */
  async sendToDevice(
    deviceToken: string,
    notification: FcmNotification
  ): Promise<string> {
    const message: admin.messaging.Message = {
      // Only include notification field if not silent (data-only)
      ...(notification.silent ? {} : {
        notification: {
          title: notification.title || '',
          body: notification.body || '',
        },
      }),
      data: notification.data || {},
      token: deviceToken,
      // For silent messages, set content_available to allow background processing
      ...(notification.silent ? { 
        apns: { 
          headers: { 'apns-priority': '5' } // Low priority for background
        },
        android: {
          priority: 'normal' as const
        }
      } : {}),
    };

    return await admin.messaging().send(message);
  }

  /**
   * Send silent data-only FCM message (for background app updates)
   * Example: Silent fetch scan details without showing notification
   */
  async sendSilentData(
    deviceTokens: string[],
    data: Record<string, string>
  ): Promise<admin.messaging.BatchResponse> {
    return this.sendNotification(deviceTokens, {
      data,
      silent: true,
    });
  }
}

