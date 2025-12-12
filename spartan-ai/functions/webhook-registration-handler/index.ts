import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import 'source-map-support/register';

const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Webhook registration handler invoked', JSON.stringify(event, null, 2));

  try {
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

    const request = JSON.parse(event.body);
    const { webhookUrl } = request;

    if (!webhookUrl) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'webhookUrl is required' }),
      };
    }

    // Validate HTTPS URL
    try {
      const url = new URL(webhookUrl);
      if (url.protocol !== 'https:') {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ error: 'webhookUrl must use HTTPS' }),
        };
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid webhookUrl format' }),
      };
    }

    // Get accountID from API key or request header
    const accountID = event.requestContext.identity?.accountId || event.headers['x-account-id'];

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

    // Generate webhook ID
    const webhookId = uuidv4();

    // Store webhook subscription
    await dbService.createWebhookSubscription(accountID, webhookId, webhookUrl);

    return {
      statusCode: 201,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookId,
        webhookUrl,
        accountID,
        enabled: true,
        createdAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Webhook registration handler error:', error);
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

