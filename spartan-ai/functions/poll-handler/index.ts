import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { CaptisClient } from '../../shared/services/captis-client';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const snsClient = new SNSClient({});
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

interface PollEvent {
  scanId: string;
  captisId: string;
  accountID: string;
  captisAccessKey: string;
}

export const handler = async (event: EventBridgeEvent<'PollScan', PollEvent>): Promise<void> => {
  console.log('Poll handler invoked', JSON.stringify(event, null, 2));

  const { scanId, captisId, accountID, captisAccessKey } = event.detail;

  try {
    const captisClient = new CaptisClient({
      baseUrl: process.env.CAPTIS_BASE_URL || 'https://asi-api.solveacrime.com',
      accessKey: captisAccessKey,
    });

    // Poll until complete (max 120 seconds)
    const result = await captisClient.pollUntilComplete(captisId, 120000, 5000);

    // Update scan record
    const topScore = result.matches?.[0]?.score || 0;
    const matchLevel = topScore > 89 ? 'HIGH' : topScore > 74 ? 'MEDIUM' : topScore > 49 ? 'LOW' : undefined;

    await docClient.send(
      new UpdateCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        Key: { scanId },
        UpdateExpression: 'SET #status = :status, topScore = :score, viewMatchesUrl = :url, updatedAt = :updated',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': result.status,
          ':score': topScore,
          ':url': result.viewMatchesUrl || null,
          ':updated': new Date().toISOString(),
        },
      })
    );

    // Determine alert tier and publish to SNS
    if (matchLevel) {
      const alertPayload = {
        scanId,
        topScore,
        matchLevel,
        threatLocation: {
          lat: 0, // Will be populated from scan metadata
          lon: 0,
        },
        viewMatchesUrl: result.viewMatchesUrl || '',
        accountID,
      };

      if (topScore > 89) {
        // High threat - SMS + FCM + webhook
        await snsClient.send(
          new PublishCommand({
            TopicArn: process.env.HIGH_THREAT_TOPIC_ARN!,
            Message: JSON.stringify(alertPayload),
          })
        );
      } else if (topScore > 74) {
        // Medium threat - FCM only
        await snsClient.send(
          new PublishCommand({
            TopicArn: process.env.MEDIUM_THREAT_TOPIC_ARN!,
            Message: JSON.stringify(alertPayload),
          })
        );
      } else if (topScore > 49) {
        // Low threat - will be aggregated in weekly email
        // Store for email aggregation
        console.log(`Low threat match (${topScore}%) stored for weekly aggregation`);
      }

      // Store threat location if match found
      if (result.matches && result.matches.length > 0) {
        const subjectId = result.matches[0].subject.id;
        // Get location from scan metadata
        const scanResult = await docClient.send(
          new GetCommand({
            TableName: process.env.SCANS_TABLE_NAME!,
            Key: { scanId },
          })
        );
        
        if (scanResult.Item?.metadata?.location) {
          await dbService.updateThreatLocation(
            subjectId,
            accountID,
            scanResult.Item.metadata.location
          );
        }
      }

      // Publish to webhook topic if high threat
      if (topScore > 89) {
        await snsClient.send(
          new PublishCommand({
            TopicArn: process.env.WEBHOOK_TOPIC_ARN!,
            Message: JSON.stringify(alertPayload),
          })
        );
      }
    }
  } catch (error) {
    console.error('Poll handler error:', error);
    throw error;
  }
};

