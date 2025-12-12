import { SNSEvent } from 'aws-lambda';
import { TwilioClient } from '../../shared/services/twilio-client';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { FcmClient } from '../../shared/services/fcm-client';
import { AlertPayload } from '../../shared/models';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');
const ssmClient = new SSMClient({});

// Initialize FCM Client (lazy initialization)
let fcmClient: FcmClient | null = null;
let fcmInitializationPromise: Promise<void> | null = null;

/**
 * Initialize FCM client from FCM_SERVER_KEY environment variable
 * Supports both direct JSON string or SSM parameter path
 * Uses lazy initialization with promise caching to avoid multiple SSM calls
 */
async function ensureFcmClientInitialized(): Promise<void> {
  // If already initialized, return immediately
  if (fcmClient) {
    return;
  }

  // If initialization is in progress, wait for it
  if (fcmInitializationPromise) {
    return fcmInitializationPromise;
  }

  // Start initialization
  fcmInitializationPromise = (async () => {
    let fcmServerKey = process.env.FCM_SERVER_KEY;
    
    // If FCM_SERVER_KEY looks like an SSM path, read from SSM
    if (fcmServerKey && fcmServerKey.startsWith('/')) {
      try {
        const command = new GetParameterCommand({
          Name: fcmServerKey,
          WithDecryption: true,
        });
        const response = await ssmClient.send(command);
        fcmServerKey = response.Parameter?.Value;
      } catch (error) {
        console.error('Failed to read FCM_SERVER_KEY from SSM:', error);
        fcmInitializationPromise = null;
        return;
      }
    }

    if (!fcmServerKey) {
      console.warn('FCM_SERVER_KEY not set, FCM notifications will be disabled');
      fcmInitializationPromise = null;
      return;
    }

    try {
      // FCM_SERVER_KEY should be a JSON string containing Firebase service account credentials
      // Format: {"projectId":"...","privateKey":"...","clientEmail":"..."}
      const fcmConfig = JSON.parse(fcmServerKey);
      
      if (fcmConfig.projectId && fcmConfig.privateKey && fcmConfig.clientEmail) {
        fcmClient = new FcmClient({
          projectId: fcmConfig.projectId,
          privateKey: fcmConfig.privateKey,
          clientEmail: fcmConfig.clientEmail,
        });
        console.log('FCM client initialized successfully');
      } else {
        console.warn('FCM_SERVER_KEY missing required fields (projectId, privateKey, clientEmail)');
      }
    } catch (error) {
      console.error('FCM initialization error:', error);
      console.error('FCM_SERVER_KEY should be a JSON string with Firebase service account credentials');
      console.error('Expected format: {"projectId":"...","privateKey":"...","clientEmail":"..."}');
    } finally {
      fcmInitializationPromise = null;
    }
  })();

  return fcmInitializationPromise;
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

      // High threat (>89%) - Send SMS + FCM + webhook + log location
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

        // Send FCM notification for high threat
        await sendFcmNotification(alertPayload, 'HIGH');

        // Log threat location
        if (scanResult.Item?.metadata?.location && alertPayload.matchLevel === 'HIGH') {
          const subjectId = 'unknown'; // Would come from scan result
          await dbService.updateThreatLocation(
            subjectId,
            accountID,
            location
          );
        }
      } else if (topScore >= 75 && topScore <= 89) {
        // Medium threat (75-89%) - FCM in-app notification only (via SNS)
        console.log(`Processing medium threat alert (${topScore}%) - FCM notification only`);
        await sendFcmNotification(alertPayload, 'MEDIUM');
      }

      console.log(`Alert processed for scan ${scanId} with score ${topScore}%`);
    } catch (error) {
      console.error('Error processing alert:', error);
      throw error;
    }
  }
};

/**
 * Send FCM in-app notification for threat alerts
 * @param alertPayload - Alert payload from SNS
 * @param threatLevel - Threat level (HIGH for >89%, MEDIUM for 75-89%)
 */
async function sendFcmNotification(
  alertPayload: AlertPayload,
  threatLevel: 'HIGH' | 'MEDIUM'
): Promise<void> {
  // Ensure FCM client is initialized (lazy initialization)
  await ensureFcmClientInitialized();
  
  if (!fcmClient) {
    console.warn('FCM client not initialized, skipping FCM notification');
    return;
  }

  try {
    // Fetch device tokens from DynamoDB by accountID
    const deviceTokenRecords = await dbService.getDeviceTokens(alertPayload.accountID);
    const deviceTokens = deviceTokenRecords.map(record => record.deviceToken);

    if (deviceTokens.length === 0) {
      console.warn(
        `No device tokens found for account ${alertPayload.accountID}, skipping FCM notification. ` +
        `Register device tokens via API to enable FCM notifications.`
      );
      return;
    }

    console.log(`Found ${deviceTokens.length} device token(s) for account ${alertPayload.accountID}`);

    // Determine notification content based on threat level
    const title = threatLevel === 'HIGH' 
      ? `🚨 High Threat Detected (${alertPayload.topScore}%)`
      : `⚠️ Medium Threat Detected (${alertPayload.topScore}%)`;
    
    const body = threatLevel === 'HIGH'
      ? `Immediate action required. Match level: ${alertPayload.matchLevel}`
      : `Threat detected. Match level: ${alertPayload.matchLevel}`;

    // Send FCM notification using FcmClient
    const response = await fcmClient.sendNotification(deviceTokens, {
      title,
      body,
      data: {
        scanId: alertPayload.scanId,
        topScore: alertPayload.topScore.toString(),
        matchLevel: alertPayload.matchLevel,
        threatLevel,
        viewMatchesUrl: alertPayload.viewMatchesUrl,
        accountID: alertPayload.accountID,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(
      `FCM notifications sent for ${threatLevel} threat: ` +
      `${response.successCount} successful, ${response.failureCount} failed`
    );

    // Log failed tokens for cleanup
    if (response.failureCount > 0 && response.responses) {
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          console.warn(`FCM failed for token ${index}: ${resp.error?.code} - ${resp.error?.message}`);
          // In production, remove invalid tokens from storage
        }
      });
    }
  } catch (error) {
    console.error('FCM notification error:', error);
    // Don't throw - allow other alert processing to continue
  }
}

