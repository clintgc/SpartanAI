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

      // Send webhook to each subscription with concurrency limit
      // Rate limiting: Process webhooks in batches to avoid overwhelming downstream systems
      const CONCURRENCY_LIMIT = 5;
      const webhookResults: Array<{ success: boolean; url: string; error?: any }> = [];

      // Helper function to send a single webhook
      const sendWebhook = async (subscription: typeof enabledSubscriptions[0]) => {
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
          return { success: false, url: subscription.webhookUrl, error };
        }
      };

      // Process webhooks in batches with concurrency limit
      for (let i = 0; i < enabledSubscriptions.length; i += CONCURRENCY_LIMIT) {
        const batch = enabledSubscriptions.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.allSettled(
          batch.map(subscription => sendWebhook(subscription))
        );
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            webhookResults.push(result.value);
          } else {
            webhookResults.push({
              success: false,
              url: batch[index].webhookUrl,
              error: result.reason,
            });
          }
        });
      }

      // Log summary
      const successCount = webhookResults.filter(r => r.success).length;
      const failureCount = webhookResults.filter(r => !r.success).length;
      console.log(`Webhook dispatch completed: ${successCount} successful, ${failureCount} failed`);
    } catch (error) {
      console.error('Error processing webhook:', error);
      throw error;
    }
  }
};

