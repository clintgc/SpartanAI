import { SNSEvent } from 'aws-lambda';
import axios from 'axios';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { AlertPayload } from '../../shared/models';
import 'source-map-support/register';

const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

export const handler = async (event: SNSEvent): Promise<void> => {
  console.log('Webhook dispatcher invoked', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const alertPayload: AlertPayload = JSON.parse(record.Sns.Message);
      const { accountID } = alertPayload;

      // Get all enabled webhook subscriptions for this account
      const subscriptions = await dbService.getWebhookSubscriptions(accountID);
      const enabledSubscriptions = subscriptions.filter(sub => sub.enabled);

      if (enabledSubscriptions.length === 0) {
        console.log(`No webhook subscriptions found for account ${accountID}`);
        continue;
      }

      // Send webhook to each subscription
      const webhookPromises = enabledSubscriptions.map(async (subscription) => {
        try {
          const response = await axios.post(
            subscription.webhookUrl,
            {
              scanId: alertPayload.scanId,
              topScore: alertPayload.topScore,
              matchLevel: alertPayload.matchLevel,
              threatLocation: alertPayload.threatLocation,
              viewMatchesUrl: alertPayload.viewMatchesUrl,
            },
            {
              timeout: 10000, // 10 second timeout
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Spartan-AI-Webhook/1.0',
              },
            }
          );

          console.log(`Webhook sent successfully to ${subscription.webhookUrl}: ${response.status}`);
          return { success: true, url: subscription.webhookUrl };
        } catch (error) {
          console.error(`Webhook failed for ${subscription.webhookUrl}:`, error);
          // In production, implement retry logic with exponential backoff
          return { success: false, url: subscription.webhookUrl, error };
        }
      });

      await Promise.allSettled(webhookPromises);
    } catch (error) {
      console.error('Error processing webhook:', error);
      throw error;
    }
  }
};

