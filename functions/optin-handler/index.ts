import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// E.164 US phone number regex: +1 followed by exactly 10 digits
const E164_US_PHONE_REGEX = /^\+1[0-9]{10}$/;

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Validate E.164 US phone number format
 */
function validatePhoneNumber(phoneNumber: string): boolean {
  return E164_US_PHONE_REGEX.test(phoneNumber);
}

/**
 * Generate a unique accountID from phone number
 * Uses phone number as base with UUID suffix for uniqueness
 */
function generateAccountID(phoneNumber: string): string {
  // Remove +1 and use phone number as base
  const phoneDigits = phoneNumber.replace(/\D/g, '').substring(1); // Remove +1, keep 10 digits
  // Generate accountID: phone-XXXXXXXXXX-uuid
  return `phone-${phoneDigits}-${uuidv4().substring(0, 8)}`;
}

/**
 * Check if phone number exists in account-profiles and return opt-in info
 * Returns {exists: boolean, optInTimestamp?: string, accountID?: string}
 */
async function checkPhoneNumberOptIn(phoneNumber: string): Promise<{
  exists: boolean;
  optInTimestamp?: string;
  accountID?: string;
}> {
  const accountProfilesTable = process.env.ACCOUNT_PROFILES_TABLE || 'spartan-ai-account-profiles';
  
  if (!accountProfilesTable) {
    throw new Error('ACCOUNT_PROFILES_TABLE environment variable is not set');
  }

  try {
    // Scan account-profiles for phoneNumber
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: accountProfilesTable,
        FilterExpression: 'phoneNumber = :phoneNumber',
        ExpressionAttributeValues: {
          ':phoneNumber': phoneNumber,
        },
        Limit: 1, // Only need first match
      })
    );

    if (scanResult.Items && scanResult.Items.length > 0) {
      const account = scanResult.Items[0];
      return {
        exists: true,
        optInTimestamp: account.optInTimestamp || account.consentedAt || account.createdAt,
        accountID: account.accountID,
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('Error checking account-profiles:', error);
    throw error;
  }
}

/**
 * Opt in a phone number
 * If exists: Update optInTimestamp to now
 * If new: Create account profile with phoneNumber + optInTimestamp
 * Optionally: Add placeholder device token
 */
async function optInPhoneNumber(phoneNumber: string): Promise<{
  optedIn: boolean;
  optInTimestamp: string;
  accountID: string;
  existed: boolean;
}> {
  const accountProfilesTable = process.env.ACCOUNT_PROFILES_TABLE || 'spartan-ai-account-profiles';
  const deviceTokensTable = process.env.DEVICE_TOKENS_TABLE;
  
  if (!accountProfilesTable) {
    throw new Error('ACCOUNT_PROFILES_TABLE environment variable is not set');
  }

  const now = new Date().toISOString();
  const optInTimestamp = now;

  // Check if phone number already exists
  const checkResult = await checkPhoneNumberOptIn(phoneNumber);

  if (checkResult.exists && checkResult.accountID) {
    // Account exists - update optInTimestamp
    console.log(`Updating opt-in timestamp for existing account: ${checkResult.accountID}`);
    
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: accountProfilesTable,
          Key: { accountID: checkResult.accountID },
          UpdateExpression: 'SET optInTimestamp = :optInTimestamp, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':optInTimestamp': optInTimestamp,
            ':updatedAt': now,
          },
        })
      );

      console.log(`Updated opt-in timestamp for account: ${checkResult.accountID}`);

      return {
        optedIn: true,
        optInTimestamp,
        accountID: checkResult.accountID,
        existed: true,
      };
    } catch (error) {
      console.error(`Error updating account profile for ${checkResult.accountID}:`, error);
      throw error;
    }
  } else {
    // New account - create account profile
    const accountID = generateAccountID(phoneNumber);
    console.log(`Creating new account profile: ${accountID} for phone: ${phoneNumber}`);

    try {
      await docClient.send(
        new PutCommand({
          TableName: accountProfilesTable,
          Item: {
            accountID,
            phoneNumber,
            optInTimestamp,
            createdAt: now,
            updatedAt: now,
            // Note: email is required in AccountProfile model, but for phone-only opt-in we'll use phone as email placeholder
            // or leave it empty and handle in validation. For now, using phone number as placeholder.
            email: `phone-${phoneNumber}@placeholder.spartan.ai`,
          },
        })
      );

      console.log(`Created new account profile: ${accountID}`);

      // Optionally: Add placeholder device token for SMS/WhatsApp delivery
      // This allows the alert-handler to send messages even without app registration
      if (deviceTokensTable) {
        try {
          const placeholderToken = `sms-${phoneNumber}`;
          await docClient.send(
            new PutCommand({
              TableName: deviceTokensTable,
              Item: {
                accountID,
                deviceToken: placeholderToken,
                platform: 'sms',
                registeredAt: now,
                phoneNumber, // Store phone number in device token for lookup
              },
            })
          );
          console.log(`Added placeholder device token for SMS delivery: ${placeholderToken}`);
        } catch (error) {
          // Non-critical - log but don't fail
          console.warn(`Failed to create placeholder device token (non-critical):`, error);
        }
      }

      return {
        optedIn: true,
        optInTimestamp,
        accountID,
        existed: false,
      };
    } catch (error) {
      console.error(`Error creating account profile:`, error);
      throw error;
    }
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Opt-in handler invoked', JSON.stringify(event, null, 2));

  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // Validate HTTP method
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      };
    }

    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    // Validate phoneNumber
    const { phoneNumber } = requestBody;
    
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'phoneNumber is required and must be a string' }),
      };
    }

    // Validate E.164 format
    if (!validatePhoneNumber(phoneNumber)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          error: 'Invalid phone number format. Must be E.164 US format: +1XXXXXXXXXX' 
        }),
      };
    }

    // Check environment variable
    if (!process.env.ACCOUNT_PROFILES_TABLE) {
      console.error('ACCOUNT_PROFILES_TABLE environment variable is not set');
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // Check if this is a check-only request (via query parameter)
    const checkOnly = event.queryStringParameters?.check === 'true' || 
                      event.queryStringParameters?.checkOnly === 'true';

    if (checkOnly) {
      // Just check if phone number exists and return opt-in info
      const checkResult = await checkPhoneNumberOptIn(phoneNumber);
      
      console.log(`Phone number check for ${phoneNumber}. Exists: ${checkResult.exists}`);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          exists: checkResult.exists,
          phoneNumber,
          optInTimestamp: checkResult.optInTimestamp,
          optInDate: checkResult.optInTimestamp, // Alias for frontend compatibility
          consentedAt: checkResult.optInTimestamp, // Alias for backward compatibility
          createdAt: checkResult.optInTimestamp, // Alias if no optInTimestamp set
          message: checkResult.exists 
            ? 'Phone number is already opted in' 
            : 'Phone number is not currently receiving alerts',
        }),
      };
    }

    // Opt in the phone number
    const optInResult = await optInPhoneNumber(phoneNumber);

    console.log(`Opt-in completed for ${phoneNumber}. Account: ${optInResult.accountID}, Existed: ${optInResult.existed}`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        optedIn: optInResult.optedIn,
        phoneNumber,
        optInTimestamp: optInResult.optInTimestamp,
        optInDate: optInResult.optInTimestamp, // Alias for frontend compatibility
        consentedAt: optInResult.optInTimestamp, // Alias for backward compatibility
        accountID: optInResult.accountID,
        existed: optInResult.existed,
        message: optInResult.existed
          ? 'Successfully reaffirmed opt-in' 
          : 'Successfully opted in! You will receive alerts starting today.',
      }),
    };
  } catch (error) {
    console.error('Opt-in handler error:', error);
    
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

