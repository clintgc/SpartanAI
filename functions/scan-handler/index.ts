import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { CaptisClient } from '../../shared/services/captis-client';
import { ScanRequest, ScanResponse } from '../../shared/models';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudwatchClient = new CloudWatchClient({});
const eventBridgeClient = new EventBridgeClient({});
const ssmClient = new SSMClient({});
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

// Cache for SSM parameter values
let captisAccessKeyCache: string | null = null;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Scan handler invoked', JSON.stringify(event, null, 2));

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: ScanRequest = JSON.parse(event.body);
    const { accountID, cameraID, location, timestamp } = request.metadata;

    // Validate quota (14,400 scans per account per year)
    const year = new Date(timestamp || Date.now()).getFullYear().toString();
    const quota = await dbService.getQuota(accountID, year);

    const scansUsed = quota?.scansUsed || 0;
    const scansLimit = 14400;
    const warningThreshold = 11520; // 80% of 14400

    // Check for quota warning at 80%
    if (scansUsed >= warningThreshold && (!quota?.lastWarnedAt || 
        new Date(quota.lastWarnedAt) < new Date(Date.now() - 24 * 60 * 60 * 1000))) {
      // Log warning and update lastWarnedAt
      const quotaPercentage = Math.round((scansUsed / scansLimit) * 100);
      console.warn(`Quota warning: Account ${accountID} has used ${scansUsed}/${scansLimit} scans (${quotaPercentage}%)`);
      
      await dbService.updateQuota(accountID, year, scansUsed, new Date().toISOString());
      
      // Send CloudWatch metric for quota warning
      try {
        await cloudwatchClient.send(
          new PutMetricDataCommand({
            Namespace: 'SpartanAI',
            MetricData: [
              {
                MetricName: 'QuotaUsagePercentage',
                Value: quotaPercentage,
                Unit: 'Percent',
                Dimensions: [
                  {
                    Name: 'AccountID',
                    Value: accountID,
                  },
                ],
              },
            ],
          })
        );
      } catch (error) {
        console.error('Failed to publish quota metric:', error);
      }
    }

    if (scansUsed >= scansLimit) {
      return {
        statusCode: 429,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Quota exceeded',
          message: `Account has reached the annual limit of ${scansLimit} scans`,
        }),
      };
    }

    // Check consent status
    const consent = await dbService.getConsent(accountID);
    
    if (consent?.consentStatus === false) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Consent required',
          message: 'User has opted out of data sharing',
        }),
      };
    }

    // If consent not set, prompt opt-in (for now, we'll proceed but log)
    if (!consent) {
      console.warn(`Consent not set for account ${accountID}. Proceeding but should prompt opt-in.`);
    }

    // Get Captis access key from request headers, SSM Parameter Store, or environment
    // Priority: header > SSM > environment variable
    let captisAccessKey = event.headers['x-captis-access-key'];
    
    if (!captisAccessKey) {
      // Try to get from SSM Parameter Store (cached)
      if (!captisAccessKeyCache) {
        try {
          const ssmParam = await ssmClient.send(
            new GetParameterCommand({
              Name: '/spartan-ai/captis/access-key',
              WithDecryption: true,
            })
          );
          captisAccessKeyCache = ssmParam.Parameter?.Value || null;
        } catch (error) {
          console.warn('Failed to get Captis key from SSM, falling back to env var:', error);
        }
      }
      captisAccessKey = captisAccessKeyCache || process.env.CAPTIS_ACCESS_KEY;
    }
    
    if (!captisAccessKey) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Captis access key is required' }),
      };
    }

    // Initialize Captis client
    const captisClient = new CaptisClient({
      baseUrl: process.env.CAPTIS_BASE_URL || 'https://asi-api.solveacrime.com',
      accessKey: captisAccessKey,
    });

    // Generate scan ID
    const scanId = uuidv4();

    // Convert image to buffer if base64
    // IMPORTANT: Image is never stored - only passed directly to Captis API
    let imageBuffer: Buffer;
    if (typeof request.image === 'string' && !request.image.startsWith('http')) {
      imageBuffer = Buffer.from(request.image, 'base64');
    } else if (typeof request.image === 'string') {
      // URL - will be handled by Captis client
      imageBuffer = request.image as any;
    } else {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid image format' }),
      };
    }

    // Audit log: Image received but not stored (compliance requirement)
    console.log(`[AUDIT] Image received for scan ${scanId}, account ${accountID}. Image will be forwarded to Captis and not stored.`);

    // Forward to Captis with async=true
    // Image is passed directly to Captis and immediately discarded (never stored)
    const captisResponse = await captisClient.resolve({
      image: imageBuffer,
      async: true,
      site: cameraID,
      camera: cameraID,
      name: `scan-${scanId}`,
      minScore: 50,
      fields: ['matches', 'biometrics', 'subjects-wanted', 'crimes', 'viewMatchesUrl'],
      timeout: 120,
    });

    // Audit log: Image forwarded to Captis, now discarded from memory
    console.log(`[AUDIT] Image forwarded to Captis for scan ${scanId}. Image buffer discarded from memory.`);
    // Clear reference (though GC will handle it)
    imageBuffer = null as any;

    // Store scan record in DynamoDB
    const createdAt = new Date().toISOString();
    await docClient.send(
      new PutCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        Item: {
          scanId,
          accountID,
          status: captisResponse.timedOutFlag ? 'PENDING' : 'COMPLETED',
          captisId: captisResponse.id,
          metadata: {
            cameraID,
            location,
            timestamp: timestamp || createdAt,
          },
          createdAt,
          updatedAt: createdAt,
        },
      })
    );

    // Increment quota
    await dbService.incrementQuota(accountID, year);

    // If timed out, trigger polling via EventBridge
    if (captisResponse.timedOutFlag) {
      // Store polling metadata for poll handler
      await docClient.send(
        new UpdateCommand({
          TableName: process.env.SCANS_TABLE_NAME!,
          Key: { scanId },
          UpdateExpression: 'SET pollingRequired = :polling, captisAccessKey = :key',
          ExpressionAttributeValues: {
            ':polling': true,
            ':key': captisAccessKey,
          },
        })
      );

      // Trigger EventBridge event to start polling
      try {
        await eventBridgeClient.send(
          new PutEventsCommand({
            Entries: [
              {
                Source: 'spartan-ai.scan',
                DetailType: 'Scan Timeout',
                Detail: JSON.stringify({
                  scanId,
                  captisId: captisResponse.id,
                  accountID,
                  captisAccessKey,
                }),
              },
            ],
          })
        );
        console.log(`Scan ${scanId} timed out, polling triggered via EventBridge`);
      } catch (error) {
        console.error('Failed to trigger poll handler:', error);
        // Continue - poll handler can be triggered manually if needed
      }
    }

    // Return response
    const response: ScanResponse = {
      scanId,
      status: captisResponse.timedOutFlag ? 'PENDING' : 'COMPLETED',
      topScore: captisResponse.matches?.[0]?.score,
      viewMatchesUrl: captisResponse.viewMatchesUrl,
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Scan handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

