import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * GDPR data deletion endpoint
 * Deletes all data associated with an accountID
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('GDPR deletion handler invoked', JSON.stringify(event, null, 2));

  // Track deletion results for partial success handling
  const deletionResults = {
    consent: false,
    quotas: 0,
    webhooks: 0,
    scans: 0,
    threatLocations: 0,
    errors: [] as string[],
  };

  try {
    const accountID = event.pathParameters?.accountID || event.queryStringParameters?.accountID;

    if (!accountID) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'accountID is required' }),
      };
    }

    // Delete consent record
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.CONSENT_TABLE_NAME!,
          Key: { accountID },
        })
      );
      deletionResults.consent = true;
    } catch (error) {
      deletionResults.errors.push(`Consent deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Delete quota records (all years)
    try {
      const quotaResult = await docClient.send(
        new QueryCommand({
          TableName: process.env.QUOTAS_TABLE_NAME!,
          KeyConditionExpression: 'accountID = :accountID',
          ExpressionAttributeValues: {
            ':accountID': accountID,
          },
        })
      );

      for (const item of quotaResult.Items || []) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: process.env.QUOTAS_TABLE_NAME!,
              Key: { accountID, year: item.year },
            })
          );
          deletionResults.quotas++;
        } catch (error) {
          deletionResults.errors.push(`Quota deletion failed for year ${item.year}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      deletionResults.errors.push(`Quota query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Delete webhook subscriptions
    try {
      const webhookResult = await docClient.send(
        new QueryCommand({
          TableName: process.env.WEBHOOK_SUBSCRIPTIONS_TABLE_NAME!,
          KeyConditionExpression: 'accountID = :accountID',
          ExpressionAttributeValues: {
            ':accountID': accountID,
          },
        })
      );

      for (const item of webhookResult.Items || []) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: process.env.WEBHOOK_SUBSCRIPTIONS_TABLE_NAME!,
              Key: { accountID, webhookId: item.webhookId },
            })
          );
          deletionResults.webhooks++;
        } catch (error) {
          deletionResults.errors.push(`Webhook deletion failed for ${item.webhookId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      deletionResults.errors.push(`Webhook query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Delete scans (via GSI)
    try {
      const scansResult = await docClient.send(
        new QueryCommand({
          TableName: process.env.SCANS_TABLE_NAME!,
          IndexName: 'accountID-index',
          KeyConditionExpression: 'accountID = :accountID',
          ExpressionAttributeValues: {
            ':accountID': accountID,
          },
        })
      );

      for (const item of scansResult.Items || []) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: process.env.SCANS_TABLE_NAME!,
              Key: { scanId: item.scanId },
            })
          );
          deletionResults.scans++;
        } catch (error) {
          deletionResults.errors.push(`Scan deletion failed for ${item.scanId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      deletionResults.errors.push(`Scans query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Delete threat locations (via GSI)
    try {
      const threatLocationsResult = await docClient.send(
        new QueryCommand({
          TableName: process.env.THREAT_LOCATIONS_TABLE_NAME!,
          IndexName: 'accountID-index',
          KeyConditionExpression: 'accountID = :accountID',
          ExpressionAttributeValues: {
            ':accountID': accountID,
          },
        })
      );

      for (const item of threatLocationsResult.Items || []) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: process.env.THREAT_LOCATIONS_TABLE_NAME!,
              Key: { subjectId: item.subjectId },
            })
          );
          deletionResults.threatLocations++;
        } catch (error) {
          deletionResults.errors.push(`Threat location deletion failed for ${item.subjectId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      deletionResults.errors.push(`Threat locations query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`[AUDIT] GDPR deletion completed for account ${accountID}`, deletionResults);

    // Return 207 Multi-Status if there were errors, 200 if all succeeded
    const statusCode = deletionResults.errors.length > 0 ? 207 : 200;

    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: deletionResults.errors.length > 0 ? 'Data deletion completed with errors' : 'Data deletion completed',
        accountID,
        deletedAt: new Date().toISOString(),
        results: deletionResults,
      }),
    };
  } catch (error) {
    console.error('GDPR deletion handler error:', error);
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

