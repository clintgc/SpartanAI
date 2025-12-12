import { SNSEvent } from 'aws-lambda';
import { TwilioClient } from '../../shared/services/twilio-client';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { AlertPayload } from '../../shared/models';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import * as admin from 'firebase-admin';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

// Initialize Firebase Admin (FCM)
let firebaseApp: admin.app.App | null = null;
if (process.env.FCM_SERVER_KEY) {
  try {
    firebaseApp = admin.apps.length > 0 
      ? admin.app() 
      : admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FCM_PROJECT_ID,
            privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FCM_CLIENT_EMAIL,
          }),
        });
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

export const handler = async (event: SNSEvent): Promise<void> => {
  console.log('Alert handler invoked', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const alertPayload: AlertPayload = JSON.parse(record.Sns.Message);
      const { scanId, topScore, matchLevel, accountID } = alertPayload;

      // Get scan metadata for location
      const scanResult = await docClient.send(
        new GetCommand({
          TableName: process.env.SCANS_TABLE_NAME!,
          Key: { scanId },
        })
      );

      const location = scanResult.Item?.metadata?.location || alertPayload.threatLocation;

      // Update alert payload with actual location
      alertPayload.threatLocation = location;

      // High threat (>89%) - Send SMS + FCM + log location
      if (topScore > 89) {
        // Send SMS via Twilio
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
          try {
            const twilioClient = new TwilioClient({
              accountSid: process.env.TWILIO_ACCOUNT_SID,
              authToken: process.env.TWILIO_AUTH_TOKEN,
              phoneNumber: process.env.TWILIO_PHONE_NUMBER,
            });

            // Get user phone from account profile (in production, fetch from account DB)
            // For now, using placeholder - in production this should come from account profile
            const userPhone = process.env.USER_PHONE_NUMBER || ''; // Should be fetched from account profile

            if (userPhone) {
              const smsBody = `High threat detected (${topScore}% match). View details: ${alertPayload.viewMatchesUrl}`;
              const smsResult = await twilioClient.sendSms({
                to: userPhone,
                body: smsBody,
              });
              console.log(`SMS sent: ${smsResult.messageSid}`);
            }
          } catch (error) {
            console.error('Twilio SMS error:', error);
            // Continue processing even if SMS fails
          }
        }

        // Send FCM notification
        await sendFcmNotification(alertPayload);

        // Log threat location
        if (scanResult.Item?.metadata?.location && alertPayload.matchLevel === 'HIGH') {
          const subjectId = 'unknown'; // Would come from scan result
          await dbService.updateThreatLocation(
            subjectId,
            accountID,
            location
          );
        }
      } else if (topScore > 74) {
        // Medium threat (75-89%) - FCM only
        await sendFcmNotification(alertPayload);
      }

      console.log(`Alert processed for scan ${scanId} with score ${topScore}%`);
    } catch (error) {
      console.error('Error processing alert:', error);
      throw error;
    }
  }
};

async function sendFcmNotification(alertPayload: AlertPayload): Promise<void> {
  if (!firebaseApp) {
    console.warn('Firebase not initialized, skipping FCM notification');
    return;
  }

  try {
    // In production, fetch device tokens from account profile
    const deviceTokens: string[] = []; // Should be fetched from account profile

    if (deviceTokens.length === 0) {
      console.warn('No device tokens found for account');
      return;
    }

    const message = {
      notification: {
        title: `Threat Detected (${alertPayload.topScore}%)`,
        body: `Match level: ${alertPayload.matchLevel}`,
      },
      data: {
        scanId: alertPayload.scanId,
        topScore: alertPayload.topScore.toString(),
        matchLevel: alertPayload.matchLevel,
        viewMatchesUrl: alertPayload.viewMatchesUrl,
      },
      tokens: deviceTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`FCM notifications sent: ${response.successCount} successful, ${response.failureCount} failed`);
  } catch (error) {
    console.error('FCM notification error:', error);
  }
}

