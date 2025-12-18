import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { ThresholdService } from '../../shared/services/threshold-service';
import { ThreatThresholdConfig } from '../../shared/models';
import 'source-map-support/register';

const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');
const thresholdService = new ThresholdService(dbService);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Account-ID',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Content-Type': 'application/json',
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Threshold handler invoked', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // Get accountID from header or request context
    const accountID = event.headers['x-account-id'] || 
                      event.requestContext?.identity?.accountId ||
                      event.requestContext?.authorizer?.accountId;

    if (!accountID) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          error: 'accountID is required',
          message: 'Provide accountID via x-account-id header or request context',
        }),
      };
    }

    if (event.httpMethod === 'GET') {
      // Get current thresholds for account
      const thresholds = await thresholdService.getThresholds(accountID, 'captis');
      
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          accountID,
          thresholds,
          source: 'user' | 'service' | 'global', // Would need to track this in service
        }),
      };
    }

    if (event.httpMethod === 'PUT') {
      // Update user thresholds
      if (!event.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ 
            error: 'Request body is required',
            message: 'Provide thresholds in request body',
          }),
        };
      }

      const request = JSON.parse(event.body);
      const { highThreshold, mediumThreshold, lowThreshold } = request;

      // Validate required fields
      if (
        typeof highThreshold !== 'number' ||
        typeof mediumThreshold !== 'number' ||
        typeof lowThreshold !== 'number'
      ) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ 
            error: 'Invalid threshold values',
            message: 'highThreshold, mediumThreshold, and lowThreshold must be numbers',
          }),
        };
      }

      // Validate range (0-100)
      if (
        highThreshold < 0 || highThreshold > 100 ||
        mediumThreshold < 0 || mediumThreshold > 100 ||
        lowThreshold < 0 || lowThreshold > 100
      ) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ 
            error: 'Invalid threshold range',
            message: 'All thresholds must be between 0 and 100',
          }),
        };
      }

      // Validate order: high > medium > low
      if (highThreshold <= mediumThreshold || mediumThreshold <= lowThreshold) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ 
            error: 'Invalid threshold order',
            message: 'highThreshold must be > mediumThreshold > lowThreshold',
          }),
        };
      }

      const thresholds: ThreatThresholdConfig = {
        highThreshold,
        mediumThreshold,
        lowThreshold,
        updatedAt: new Date().toISOString(),
        updatedBy: 'user',
      };

      await thresholdService.updateUserThresholds(accountID, thresholds);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          accountID,
          thresholds,
          message: 'Thresholds updated successfully',
        }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ 
        error: 'Method not allowed',
        message: `Method ${event.httpMethod} not supported. Use GET or PUT.`,
      }),
    };
  } catch (error) {
    console.error('Threshold handler error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ 
            error: 'Account not found',
            message: error.message,
          }),
        };
      }
      
      if (error.message.includes('Invalid threshold')) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ 
            error: 'Invalid threshold values',
            message: error.message,
          }),
        };
      }
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'An error occurred while processing the request',
      }),
    };
  }
};

