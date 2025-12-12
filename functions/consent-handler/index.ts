import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import 'source-map-support/register';

const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Consent handler invoked', JSON.stringify(event, null, 2));

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
    const { consent } = request;

    if (typeof consent !== 'boolean') {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'consent must be a boolean value' }),
      };
    }

    // Get accountID from API key or request header
    // In production, this should come from API key mapping or auth token
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

    // Update consent status
    await dbService.updateConsent(accountID, consent);

    // Trigger in-app hooks for integrators via SNS
    // Integrators can subscribe to this topic to receive consent updates
    if (process.env.CONSENT_UPDATE_TOPIC_ARN) {
      try {
        const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
        const snsClient = new SNSClient({});
        await snsClient.send(
          new PublishCommand({
            TopicArn: process.env.CONSENT_UPDATE_TOPIC_ARN,
            Message: JSON.stringify({
              accountID,
              consentStatus: consent,
              updatedAt: new Date().toISOString(),
            }),
          })
        );
      } catch (error) {
        console.error('Failed to publish consent update:', error);
        // Continue - consent update is still saved
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountID,
        consentStatus: consent,
        updatedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Consent handler error:', error);
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

