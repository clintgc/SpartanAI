import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Scan detail handler invoked', JSON.stringify(event, null, 2));

  try {
    const scanId = event.pathParameters?.id;

    if (!scanId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Scan ID is required' }),
      };
    }

    // Get authenticated accountID from header, query parameter, or API context
    const authenticatedAccountID = event.headers['x-account-id'] || 
                                    event.queryStringParameters?.accountID ||
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

    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        Key: { scanId },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Scan not found' }),
      };
    }

    // Authorization check: Verify scan belongs to authenticated account
    if (result.Item.accountID !== authenticatedAccountID) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Forbidden', 
          message: 'You do not have access to this scan' 
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Scan detail handler error:', error);
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

