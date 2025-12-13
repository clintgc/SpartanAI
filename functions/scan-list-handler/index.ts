import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Scan list handler invoked', JSON.stringify(event, null, 2));

  try {
    // Get authenticated accountID from header or API context
    const authenticatedAccountID = event.headers['x-account-id'] || 
                                    event.requestContext.identity?.accountId;

    if (!authenticatedAccountID) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Unauthorized', message: 'accountID is required' }),
      };
    }

    // Get requested accountID from query parameter
    const requestedAccountID = event.queryStringParameters?.accountID;

    // Authorization check: Verify requested accountID matches authenticated accountID
    if (!requestedAccountID || requestedAccountID !== authenticatedAccountID) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Forbidden', 
          message: 'You can only access scans for your own account' 
        }),
      };
    }

    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);
    const nextToken = event.queryStringParameters?.nextToken;

    // Validate limit range (1-100)
    const validatedLimit = Math.min(Math.max(limit, 1), 100);

    // Parse and validate nextToken
    let exclusiveStartKey: any = undefined;
    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
      } catch (error) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ error: 'Invalid nextToken format' }),
        };
      }
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        IndexName: 'accountID-index',
        KeyConditionExpression: 'accountID = :accountID',
        ExpressionAttributeValues: {
          ':accountID': authenticatedAccountID,
        },
        Limit: validatedLimit,
        ScanIndexForward: false, // Most recent first
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scans: result.Items || [],
        nextToken: result.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
          : undefined,
      }),
    };
  } catch (error) {
    console.error('Scan list handler error:', error);
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

