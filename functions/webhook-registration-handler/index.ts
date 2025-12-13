import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import 'source-map-support/register';

const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

/**
 * Validates webhook URL format and protocol
 */
function validateWebhookUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);
    
    // Must use HTTPS
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'webhookUrl must use HTTPS protocol' };
    }
    
    // Must have a valid hostname
    if (!url.hostname || url.hostname.length === 0) {
      return { valid: false, error: 'webhookUrl must have a valid hostname' };
    }
    
    // Reject localhost and private IPs (security)
    // RFC 1918 private IP ranges:
    // - 10.0.0.0/8 (10.0.0.0 to 10.255.255.255)
    // - 172.16.0.0/12 (172.16.0.0 to 172.31.255.255) - NOT all 172.x.x.x
    // - 192.168.0.0/16 (192.168.0.0 to 192.168.255.255)
    // - 127.0.0.0/8 (127.0.0.0 to 127.255.255.255)
    if (url.hostname === 'localhost' || 
        url.hostname.startsWith('127.') || 
        url.hostname.startsWith('192.168.') ||
        url.hostname.startsWith('10.')) {
      return { valid: false, error: 'webhookUrl cannot point to localhost or private IP addresses' };
    }
    
    // Validate 172.16.0.0/12 range specifically (not all 172.x.x.x)
    // Check if hostname is an IP address in the 172.x.x.x range
    if (url.hostname.startsWith('172.')) {
      // Parse IP address to check if it's in the private range 172.16.0.0/12
      const ipParts = url.hostname.split('.');
      if (ipParts.length === 4) {
        const secondOctet = parseInt(ipParts[1], 10);
        // Only block if second octet is between 16 and 31 (inclusive)
        // This covers 172.16.0.0 to 172.31.255.255
        if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
          return { valid: false, error: 'webhookUrl cannot point to private IP addresses (172.16.0.0/12)' };
        }
        // Allow 172.0.0.0-172.15.255.255 and 172.32.0.0-172.255.255.255 (public IPs)
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid webhookUrl format. Must be a valid URL.' };
  }
}

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

    let request;
    try {
      request = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    const { webhookUrl, accountID: requestAccountID } = request;

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'webhookUrl is required and must be a string' }),
      };
    }

    // Validate webhook URL format and security
    const urlValidation = validateWebhookUrl(webhookUrl);
    if (!urlValidation.valid) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: urlValidation.error }),
      };
    }

    // Get accountID from authenticated header (preferred), API key context, or request body (fallback)
    // Security: Trust authenticated sources first to prevent accountID spoofing
    const accountID = event.headers['x-account-id'] || 
                      event.requestContext.identity?.accountId ||
                      requestAccountID;

    if (!accountID || typeof accountID !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'accountID is required. Provide it in the request body or x-account-id header.' 
        }),
      };
    }

    // Check for existing webhook subscriptions to prevent duplicates (optional)
    const existingSubscriptions = await dbService.getWebhookSubscriptions(accountID);
    const duplicateUrl = existingSubscriptions.find(
      sub => sub.webhookUrl === webhookUrl && sub.enabled
    );
    
    if (duplicateUrl) {
      return {
        statusCode: 409,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'A webhook with this URL already exists for this account',
          existingWebhookId: duplicateUrl.webhookId,
        }),
      };
    }

    // Generate webhook ID
    const webhookId = uuidv4();

    // Store webhook subscription
    await dbService.createWebhookSubscription(accountID, webhookId, webhookUrl);

    console.log(`Webhook registered: ${webhookId} for account ${accountID} -> ${webhookUrl}`);

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

