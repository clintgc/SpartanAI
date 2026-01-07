import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
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
 * Check if phone number exists in the system (without opting out)
 * Returns true if phone number is found in account-profiles or device-tokens
 */
async function checkPhoneNumberExists(phoneNumber: string): Promise<boolean> {
  const tableName = process.env.DEVICE_TOKENS_TABLE;
  const accountProfilesTable = process.env.ACCOUNT_PROFILES_TABLE || 'spartan-ai-account-profiles';
  
  if (!tableName) {
    throw new Error('DEVICE_TOKENS_TABLE environment variable is not set');
  }

  // Strategy 1: Check device-tokens table for phoneNumber attribute
  try {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'phoneNumber = :phoneNumber',
        ExpressionAttributeValues: {
          ':phoneNumber': phoneNumber,
        },
        Limit: 1, // Only need to know if it exists
      })
    );

    if (scanResult.Items && scanResult.Items.length > 0) {
      return true;
    }
  } catch (error) {
    // If phoneNumber attribute doesn't exist, continue to Strategy 2
    console.log('phoneNumber attribute not found in device-tokens, trying account-profiles lookup');
  }

  // Strategy 2: Check account-profiles table
  try {
    const accountScanResult = await docClient.send(
      new ScanCommand({
        TableName: accountProfilesTable,
        FilterExpression: 'phoneNumber = :phoneNumber',
        ExpressionAttributeValues: {
          ':phoneNumber': phoneNumber,
        },
        Limit: 1, // Only need to know if it exists
      })
    );

    if (accountScanResult.Items && accountScanResult.Items.length > 0) {
      return true;
    }
  } catch (error) {
    console.error('Error checking account-profiles:', error);
  }

  return false;
}

/**
 * Find and delete device tokens by phone number
 * Strategy:
 * 1. First, try to scan device-tokens table if phoneNumber is stored as an attribute
 * 2. If not found, query account-profiles by phoneNumber to get accountID(s)
 * 3. Delete all device tokens for matching accountID(s)
 */
async function removeDeviceTokensByPhoneNumber(phoneNumber: string): Promise<boolean> {
  const tableName = process.env.DEVICE_TOKENS_TABLE;
  const accountProfilesTable = process.env.ACCOUNT_PROFILES_TABLE || 'spartan-ai-account-profiles';
  
  if (!tableName) {
    throw new Error('DEVICE_TOKENS_TABLE environment variable is not set');
  }

  let removed = false;
  const accountIDs: string[] = [];

  // Strategy 1: Try scanning device-tokens table for phoneNumber attribute (if it exists)
  try {
    console.log(`Scanning device-tokens table for phoneNumber: ${phoneNumber}`);
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'phoneNumber = :phoneNumber',
        ExpressionAttributeValues: {
          ':phoneNumber': phoneNumber,
        },
      })
    );

    if (scanResult.Items && scanResult.Items.length > 0) {
      console.log(`Found ${scanResult.Items.length} device token(s) with phoneNumber attribute`);
      
      // Delete all matching device tokens
      for (const item of scanResult.Items) {
        if (item.accountID && item.deviceToken) {
          try {
            await docClient.send(
              new DeleteCommand({
                TableName: tableName,
                Key: {
                  accountID: item.accountID,
                  deviceToken: item.deviceToken,
                },
              })
            );
            console.log(`Deleted device token: ${item.deviceToken} for account: ${item.accountID}`);
            removed = true;
          } catch (error) {
            console.error(`Error deleting device token ${item.deviceToken}:`, error);
          }
        }
      }
      
      return removed;
    }
  } catch (error) {
    // If phoneNumber attribute doesn't exist, continue to Strategy 2
    console.log('phoneNumber attribute not found in device-tokens, trying account-profiles lookup');
  }

  // Strategy 2: Find account(s) by phoneNumber in account-profiles table
  try {
    console.log(`Querying account-profiles table for phoneNumber: ${phoneNumber}`);
    
    // Scan account-profiles for phoneNumber (no GSI, so we scan)
    const accountScanResult = await docClient.send(
      new ScanCommand({
        TableName: accountProfilesTable,
        FilterExpression: 'phoneNumber = :phoneNumber',
        ExpressionAttributeValues: {
          ':phoneNumber': phoneNumber,
        },
      })
    );

    if (accountScanResult.Items && accountScanResult.Items.length > 0) {
      console.log(`Found ${accountScanResult.Items.length} account(s) with phoneNumber: ${phoneNumber}`);
      
      // Collect accountIDs
      for (const account of accountScanResult.Items) {
        if (account.accountID) {
          accountIDs.push(account.accountID);
        }
      }
    } else {
      console.log(`No accounts found with phoneNumber: ${phoneNumber}`);
      return false;
    }
  } catch (error) {
    console.error('Error querying account-profiles:', error);
    // Continue - might still have device tokens to delete
  }

  // Strategy 3: Delete all device tokens for found accountIDs
  if (accountIDs.length > 0) {
    console.log(`Deleting device tokens for ${accountIDs.length} account(s)`);
    
    for (const accountID of accountIDs) {
      try {
        // Query all device tokens for this account
        const tokensResult = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'accountID = :accountID',
            ExpressionAttributeValues: {
              ':accountID': accountID,
            },
          })
        );

        if (tokensResult.Items && tokensResult.Items.length > 0) {
          console.log(`Found ${tokensResult.Items.length} device token(s) for account: ${accountID}`);
          
          // Delete all device tokens for this account
          for (const token of tokensResult.Items) {
            if (token.deviceToken) {
              try {
                await docClient.send(
                  new DeleteCommand({
                    TableName: tableName,
                    Key: {
                      accountID: accountID,
                      deviceToken: token.deviceToken,
                    },
                  })
                );
                console.log(`Deleted device token: ${token.deviceToken} for account: ${accountID}`);
                removed = true;
              } catch (error) {
                console.error(`Error deleting device token ${token.deviceToken}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error querying device tokens for account ${accountID}:`, error);
      }
    }
  }

  return removed;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Opt-out handler invoked', JSON.stringify(event, null, 2));

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
    if (!process.env.DEVICE_TOKENS_TABLE) {
      console.error('DEVICE_TOKENS_TABLE environment variable is not set');
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
      // Just check if phone number exists, don't opt out
      const exists = await checkPhoneNumberExists(phoneNumber);
      
      console.log(`Phone number check for ${phoneNumber}. Exists: ${exists}`);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          exists,
          phoneNumber,
          message: exists 
            ? 'Phone number is registered in our system' 
            : 'Phone number is not in our system',
        }),
      };
    }

    // Remove device tokens by phone number
    const removed = await removeDeviceTokensByPhoneNumber(phoneNumber);

    console.log(`Opt-out completed for ${phoneNumber}. Removed: ${removed}`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        removed,
        phoneNumber,
        message: removed 
          ? 'Successfully opted out' 
          : 'Phone not found – no alerts will be sent',
      }),
    };
  } catch (error) {
    console.error('Opt-out handler error:', error);
    
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

