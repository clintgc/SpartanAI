import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { CaptisClient } from '../../shared/services/captis-client';
import { ThresholdService } from '../../shared/services/threshold-service';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const snsClient = new SNSClient({});
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');
const thresholdService = new ThresholdService(dbService);

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

    // Get configurable thresholds for this account
    const thresholds = await thresholdService.getThresholds(accountID, 'captis');
    
    // Update scan record
    const topScore = result.matches?.[0]?.score || 0;
    const matchLevel = topScore > thresholds.highThreshold 
      ? 'HIGH' 
      : topScore > thresholds.mediumThreshold 
        ? 'MEDIUM' 
        : topScore > thresholds.lowThreshold 
          ? 'LOW' 
          : undefined;

    // Build update expression dynamically to avoid issues with undefined values
    const updateItems: string[] = [];
    const expressionAttributeValues: Record<string, any> = {
      ':score': topScore,
      ':updated': new Date().toISOString(),
    };

    if (result.status) {
      updateItems.push('#status = :statusVal');
      expressionAttributeValues[':statusVal'] = result.status;
    }

    if (result.viewMatchesUrl) {
      updateItems.push('viewMatchesUrl = :url');
      expressionAttributeValues[':url'] = result.viewMatchesUrl;
    } else {
      updateItems.push('viewMatchesUrl = :url');
      expressionAttributeValues[':url'] = null;
    }

    updateItems.push('topScore = :score');
    updateItems.push('updatedAt = :updated');
    
    // Add matchLevel if calculated
    if (matchLevel) {
      updateItems.push('matchLevel = :level');
      expressionAttributeValues[':level'] = matchLevel;
    } else {
      updateItems.push('matchLevel = :level');
      expressionAttributeValues[':level'] = null;
    }

    // Store matches array for alert page display
    if (result.matches && result.matches.length > 0) {
      updateItems.push('matches = :matches');
      expressionAttributeValues[':matches'] = result.matches;
    } else {
      updateItems.push('matches = :matches');
      expressionAttributeValues[':matches'] = null;
    }

    // Store crimes array for alert page display
    if (result.crimes && result.crimes.length > 0) {
      updateItems.push('crimes = :crimes');
      expressionAttributeValues[':crimes'] = result.crimes;
    } else {
      updateItems.push('crimes = :crimes');
      expressionAttributeValues[':crimes'] = null;
    }

    // Store image URL if available
    if (result.image) {
      updateItems.push('#image = :image');
      expressionAttributeValues[':image'] = result.image;
    }

    const expressionAttributeNames: Record<string, string> = {};
    if (result.status) {
      expressionAttributeNames['#status'] = 'status';
    }
    if (result.image) {
      expressionAttributeNames['#image'] = 'image';
    }

    await docClient.send(
      new UpdateCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        Key: { scanId },
        UpdateExpression: `SET ${updateItems.join(', ')}`,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    // Determine alert tier and publish to SNS
    if (matchLevel) {
      // Get subject information from top match
      const topMatch = result.matches?.[0];
      const mugShotUrl = topMatch?.subject?.photo;
      const subjectName = topMatch?.subject?.name;
      const subjectType = topMatch?.subject?.type;
      
      // Generate alert landing page URL
      // Format: https://alerts.spartan.tech/scan/{scanId}
      // For now, using a placeholder that will work with the alert.html page
      // When CloudFront is set up, this should be the actual domain
      const alertBaseUrl = process.env.ALERT_LANDING_PAGE_URL || 'https://alerts.spartan.tech/scan';
      const viewMatchesUrl = result.viewMatchesUrl || `${alertBaseUrl}/${scanId}`;
      
      const alertPayload = {
        scanId,
        topScore,
        matchLevel,
        threatLocation: {
          lat: 0, // Will be populated from scan metadata
          lon: 0,
        },
        viewMatchesUrl,
        accountID,
        ...(mugShotUrl && { mugShotUrl }),
        ...(subjectName && { subjectName }),
        ...(subjectType && { subjectType }),
        ...(result.crimes && result.crimes.length > 0 && { crimes: result.crimes }),
      };

      if (topScore > thresholds.highThreshold) {
        // High threat - SMS + FCM + webhook
        await snsClient.send(
          new PublishCommand({
            TopicArn: process.env.HIGH_THREAT_TOPIC_ARN!,
            Message: JSON.stringify(alertPayload),
          })
        );
      } else if (topScore > thresholds.mediumThreshold) {
        // Medium threat - FCM only
        await snsClient.send(
          new PublishCommand({
            TopicArn: process.env.MEDIUM_THREAT_TOPIC_ARN!,
            Message: JSON.stringify(alertPayload),
          })
        );
      } else if (topScore > thresholds.lowThreshold) {
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
      if (topScore > thresholds.highThreshold) {
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

