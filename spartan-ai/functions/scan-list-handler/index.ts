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
    const accountID = event.queryStringParameters?.accountID;
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);
    const nextToken = event.queryStringParameters?.nextToken;

    if (!accountID) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'accountID query parameter is required' }),
      };
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        IndexName: 'accountID-index',
        KeyConditionExpression: 'accountID = :accountID',
        ExpressionAttributeValues: {
          ':accountID': accountID,
        },
        Limit: limit,
        ScanIndexForward: false, // Most recent first
        ...(nextToken && { ExclusiveStartKey: JSON.parse(Buffer.from(nextToken, 'base64').toString()) }),
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

