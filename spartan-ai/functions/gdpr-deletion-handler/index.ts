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
    await docClient.send(
      new DeleteCommand({
        TableName: process.env.CONSENT_TABLE_NAME!,
        Key: { accountID },
      })
    );

    // Delete quota records (all years)
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
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.QUOTAS_TABLE_NAME!,
          Key: { accountID, year: item.year },
        })
      );
    }

    // Delete webhook subscriptions
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
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.WEBHOOK_SUBSCRIPTIONS_TABLE_NAME!,
          Key: { accountID, webhookId: item.webhookId },
        })
      );
    }

    // Delete scans (via GSI)
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
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.SCANS_TABLE_NAME!,
          Key: { scanId: item.scanId },
        })
      );
    }

    // Delete threat locations (via GSI)
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
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.THREAT_LOCATIONS_TABLE_NAME!,
          Key: { subjectId: item.subjectId },
        })
      );
    }

    console.log(`[AUDIT] GDPR deletion completed for account ${accountID}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Data deletion completed',
        accountID,
        deletedAt: new Date().toISOString(),
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

