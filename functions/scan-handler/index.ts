import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { CaptisClient } from '../../shared/services/captis-client';
import { ThresholdService } from '../../shared/services/threshold-service';
import { ScanRequest, ScanResponse } from '../../shared/models';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ScanRequestSchema, safeValidateRequest, formatValidationError } from '../../shared/utils/validation';
import { ZodError } from 'zod';
import axios, { AxiosError } from 'axios';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudwatchClient = new CloudWatchClient({});
const eventBridgeClient = new EventBridgeClient({});
const ssmClient = new SSMClient({});
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');
const thresholdService = new ThresholdService(dbService);

// Cache for SSM parameter values
let captisAccessKeyCache: string | null = null;

// Constants
const SCANS_LIMIT = 14400; // Annual quota per account
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const INITIAL_RESPONSE_TIMEOUT = 5000; // 5 seconds for initial response
const MAX_POLL_ATTEMPTS = 24; // Max 24 attempts for 120s total (5s initial, up to 10s)
const INITIAL_POLL_DELAY = 5000; // 5 seconds
const MAX_POLL_DELAY = 10000; // 10 seconds max delay

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Captis-Access-Key,X-Account-ID',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Structured logging helper
 */
function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'scan-handler',
    ...data,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Error logging with stack trace
 */
function logError(error: unknown, context?: Record<string, any>) {
  const errorData: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'scan-handler',
    ...context,
  };

  if (error instanceof Error) {
    errorData.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else {
    errorData.error = {
      message: String(error),
    };
  }

  console.error(JSON.stringify(errorData));
}

/**
 * Timeout wrapper for function execution
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Handle Captis API errors and map to appropriate HTTP status codes
 */
function handleCaptisError(error: unknown): { statusCode: number; message: string } {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;

    // Map Captis 400/401 errors to 403 (Forbidden) for security
    if (status === 400 || status === 401) {
      return {
        statusCode: 403,
        message: 'Invalid Captis credentials or request format',
      };
    }

    // Handle 429 rate limiting
    if (status === 429) {
      return {
        statusCode: 429,
        message: 'Captis API rate limit exceeded. Please try again later.',
      };
    }

    // Handle 5xx errors
    if (status && status >= 500) {
      return {
        statusCode: 503,
        message: 'Captis service temporarily unavailable',
      };
    }

    // Generic error
    return {
      statusCode: 502,
      message: `Captis API error: ${status || 'Unknown'}`,
    };
  }

  // Non-Axios error
  if (error instanceof Error) {
    return {
      statusCode: 500,
      message: error.message,
    };
  }

  return {
    statusCode: 500,
    message: 'Unknown error occurred',
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId || uuidv4();
  log('info', 'Scan handler invoked', { requestId });

  try {
    // Parse and validate request body
    if (!event.body) {
      log('warn', 'Request body missing', { requestId });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          error: 'Bad Request',
          message: 'Request body is required',
        }),
      };
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (parseError) {
      logError(parseError, { requestId, errorType: 'JSON_PARSE_ERROR' });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid JSON in request body',
        }),
      };
    }

    // Validate request with Zod
    const validationResult = safeValidateRequest(ScanRequestSchema, parsedBody);
    if (!validationResult.success) {
      log('warn', 'Request validation failed', { 
        requestId, 
        errors: validationResult.error.errors,
      });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(formatValidationError(validationResult.error)),
      };
    }

    const request = validationResult.data;
    const { accountID, cameraID, location, timestamp } = request.metadata;

    log('info', 'Processing scan request', { requestId, accountID, cameraID });

    // Validate quota (14,400 scans per account per year)
    const year = new Date(timestamp || Date.now()).getFullYear().toString();
    const quota = await dbService.getQuota(accountID, year);

    const scansUsed = quota?.scansUsed || 0;
    const warningThreshold = Math.floor(SCANS_LIMIT * 0.8); // 80% of limit

    // Check for quota warning at 80%
    if (scansUsed >= warningThreshold && (!quota?.lastWarnedAt || 
        new Date(quota.lastWarnedAt) < new Date(Date.now() - 24 * 60 * 60 * 1000))) {
      const quotaPercentage = Math.round((scansUsed / SCANS_LIMIT) * 100);
      log('warn', 'Quota warning threshold reached', { 
        requestId, 
        accountID, 
        scansUsed, 
        quotaPercentage,
      });
      
      await dbService.updateQuota(accountID, year, scansUsed, new Date().toISOString());
      
      // Send CloudWatch metric for quota warning
      try {
        await cloudwatchClient.send(
          new PutMetricDataCommand({
            Namespace: 'SpartanAI',
            MetricData: [
              {
                MetricName: 'QuotaUsagePercentage',
                Value: quotaPercentage,
                Unit: 'Percent',
                Dimensions: [
                  {
                    Name: 'AccountID',
                    Value: accountID,
                  },
                ],
              },
            ],
          })
        );
      } catch (error) {
        logError(error, { requestId, accountID, errorType: 'CLOUDWATCH_METRIC_ERROR' });
      }
    }

    if (scansUsed >= SCANS_LIMIT) {
      log('warn', 'Quota exceeded', { requestId, accountID, scansUsed });
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Quota exceeded',
          message: `Account has reached the annual limit of ${SCANS_LIMIT} scans`,
        }),
      };
    }

    // Check consent status
    const consent = await dbService.getConsent(accountID);
    
    if (consent?.consentStatus === false) {
      log('warn', 'Consent not granted', { requestId, accountID });
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Consent required',
          message: 'User has opted out of data sharing',
        }),
      };
    }

    // If consent not set, log warning but proceed
    if (!consent) {
      log('warn', 'Consent not set', { requestId, accountID });
    }

    // Get Captis access key from request headers, SSM Parameter Store, or environment
    // Priority: header > SSM > environment variable
    let captisAccessKey = event.headers['x-captis-access-key'];
    
    if (!captisAccessKey) {
      // Try to get from SSM Parameter Store (cached)
      if (!captisAccessKeyCache) {
        try {
          const ssmParam = await ssmClient.send(
            new GetParameterCommand({
              Name: '/spartan-ai/captis/access-key',
              WithDecryption: true,
            })
          );
          captisAccessKeyCache = ssmParam.Parameter?.Value || null;
        } catch (error) {
          logError(error, { requestId, errorType: 'SSM_PARAMETER_ERROR' });
        }
      }
      captisAccessKey = captisAccessKeyCache || process.env.CAPTIS_ACCESS_KEY;
    }
    
    if (!captisAccessKey) {
      log('error', 'Captis access key not found', { requestId });
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          error: 'Configuration error',
          message: 'Captis access key is not configured',
        }),
      };
    }

    // Initialize Captis client
    const captisClient = new CaptisClient({
      baseUrl: process.env.CAPTIS_BASE_URL || 'https://asi-api.solveacrime.com',
      accessKey: captisAccessKey,
    });

    // Generate scan ID
    const scanId = uuidv4();
    log('info', 'Scan ID generated', { requestId, scanId });

    // Convert image to buffer if base64
    // IMPORTANT: Image is never stored - only passed directly to Captis API
    let imageBuffer: Buffer | string | null = null;
    
    try {
      if (typeof request.image === 'string' && !request.image.startsWith('http')) {
        // Base64 encoded image - validate size
        const imageSize = Buffer.byteLength(request.image, 'base64');
        if (imageSize > MAX_IMAGE_SIZE) {
          log('warn', 'Image size exceeds limit', { 
            requestId, 
            scanId, 
            imageSize, 
            maxSize: MAX_IMAGE_SIZE,
          });
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
              error: 'Image size exceeds limit',
              message: `Image size (${imageSize} bytes) exceeds maximum allowed size of ${MAX_IMAGE_SIZE} bytes`,
            }),
          };
        }
        imageBuffer = Buffer.from(request.image, 'base64');
        log('info', 'Image buffer created from base64', { 
          requestId, 
          scanId, 
          imageSize,
        });
      } else if (typeof request.image === 'string') {
        // URL - will be handled by Captis client
        imageBuffer = request.image;
        log('info', 'Image URL provided', { requestId, scanId, imageUrl: request.image });
      } else {
        log('warn', 'Invalid image format', { requestId, scanId });
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid image format' }),
        };
      }

      // Audit log: Image received but not stored (compliance requirement)
      log('info', 'Image received for processing', { 
        requestId, 
        scanId, 
        accountID,
        imageType: Buffer.isBuffer(imageBuffer) ? 'base64' : 'url',
      });

      // Forward to Captis with async=true
      // Image is passed directly to Captis and immediately discarded (never stored)
      const captisResponse = await withTimeout(
        captisClient.resolve({
          image: imageBuffer,
          async: true,
          site: cameraID,
          camera: cameraID,
          name: `scan-${scanId}`,
          minScore: 50,
          fields: ['matches', 'biometrics', 'subjects-wanted', 'crimes', 'viewMatchesUrl'],
          timeout: 120,
        }),
        INITIAL_RESPONSE_TIMEOUT,
        'Captis API request timeout'
      ).catch((error) => {
        // Handle Captis-specific errors
        const captisError = handleCaptisError(error);
        logError(error, { 
          requestId, 
          scanId, 
          accountID, 
          errorType: 'CAPTIS_API_ERROR',
          captisStatusCode: captisError.statusCode,
        });
        throw new Error(captisError.message);
      });

      // Audit log: Image forwarded to Captis, now discard immediately
      log('info', 'Image forwarded to Captis', { 
        requestId, 
        scanId, 
        captisId: captisResponse.id,
      });
      
      // Explicitly clear image buffer immediately after forwarding to free memory
      if (Buffer.isBuffer(imageBuffer)) {
        // Overwrite buffer with zeros for security and memory cleanup
        imageBuffer.fill(0);
        imageBuffer = null;
      }
      imageBuffer = null;

      // Store scan record in DynamoDB
      const createdAt = new Date().toISOString();
      
      // Store image URL if provided as URL (not base64, for privacy compliance)
      // Base64 images are not stored - only URLs for display on alert page
      const imageUrl = typeof request.image === 'string' && 
                       (request.image.startsWith('http://') || request.image.startsWith('https://'))
                       ? request.image 
                       : null;
      
      await docClient.send(
        new PutCommand({
          TableName: process.env.SCANS_TABLE_NAME!,
          Item: {
            scanId,
            accountID,
            status: captisResponse.timedOutFlag ? 'PENDING' : 'COMPLETED',
            captisId: captisResponse.id,
            metadata: {
              cameraID,
              location,
              timestamp: timestamp || createdAt,
              ...(imageUrl && { imageUrl }), // Only store if it's a URL
            },
            createdAt,
            updatedAt: createdAt,
          },
        })
      );

      // Increment quota with atomic conditional update to prevent race conditions
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.QUOTAS_TABLE_NAME!,
            Key: { accountID, year },
            UpdateExpression: 'ADD scansUsed :inc SET scansLimit = :limit',
            ConditionExpression: 'scansUsed < :limit', // Prevent quota overrun
            ExpressionAttributeValues: {
              ':inc': 1,
              ':limit': SCANS_LIMIT,
            },
          })
        );
        log('info', 'Quota incremented', { requestId, scanId, accountID, year });
      } catch (error: any) {
        // If condition check fails, quota was exceeded
        if (error.name === 'ConditionalCheckFailedException') {
          log('warn', 'Quota exceeded during increment', { 
            requestId, 
            scanId, 
            accountID,
          });
          return {
            statusCode: 429,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: 'Quota exceeded',
              message: `Account has reached the annual limit of ${SCANS_LIMIT} scans`,
            }),
          };
        }
        throw error;
      }

      // Log full Captis response for debugging
      log('info', 'Captis response received', {
        requestId,
        scanId,
        captisId: captisResponse.id,
        status: captisResponse.status,
        timedOutFlag: captisResponse.timedOutFlag,
        hasMatches: !!captisResponse.matches,
        matchesCount: captisResponse.matches?.length || 0,
        firstMatchScore: captisResponse.matches?.[0]?.score,
        viewMatchesUrl: captisResponse.viewMatchesUrl,
        hasBiometrics: !!captisResponse.biometrics,
        biometricsCount: captisResponse.biometrics?.length || 0,
        hasCrimes: !!captisResponse.crimes,
        crimesCount: captisResponse.crimes?.length || 0,
        fullResponse: JSON.stringify(captisResponse), // Log full response structure
      });

      // Check if we have results immediately or need to poll
      const hasImmediateResults = captisResponse.matches && captisResponse.matches.length > 0 && captisResponse.status === 'COMPLETED' && !captisResponse.timedOutFlag;
      
      log('info', 'Results check', {
        requestId,
        scanId,
        hasImmediateResults,
        status: captisResponse.status,
        timedOutFlag: captisResponse.timedOutFlag,
        matchesLength: captisResponse.matches?.length || 0,
      });
      
      if (hasImmediateResults && captisResponse.matches && captisResponse.matches.length > 0) {
        // Extract results immediately and store in DynamoDB
        const topScore = captisResponse.matches[0].score;
        const thresholds = await thresholdService.getThresholds(accountID, 'captis');
        const matchLevel = topScore > thresholds.highThreshold 
          ? 'HIGH' 
          : topScore > thresholds.mediumThreshold 
            ? 'MEDIUM' 
            : topScore > thresholds.lowThreshold 
              ? 'LOW' 
              : undefined;

        // Update scan record with results
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.SCANS_TABLE_NAME!,
            Key: { scanId },
            UpdateExpression: 'SET topScore = :score, matchLevel = :level, viewMatchesUrl = :url, updatedAt = :updated',
            ExpressionAttributeValues: {
              ':score': topScore,
              ':level': matchLevel || null,
              ':url': captisResponse.viewMatchesUrl || null,
              ':updated': new Date().toISOString(),
            },
          })
        );

        log('info', 'Results extracted immediately from Captis response', { 
          requestId, 
          scanId, 
          topScore,
          matchLevel,
        });
      } else if (captisResponse.timedOutFlag || captisResponse.status !== 'COMPLETED') {
        // If timed out or not completed, trigger polling via EventBridge
        // Store polling metadata for poll handler
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.SCANS_TABLE_NAME!,
            Key: { scanId },
            UpdateExpression: 'SET pollingRequired = :polling, captisAccessKey = :key',
            ExpressionAttributeValues: {
              ':polling': true,
              ':key': captisAccessKey,
            },
          })
        );

        // Trigger EventBridge event to start polling
        try {
          await eventBridgeClient.send(
            new PutEventsCommand({
              Entries: [
                {
                  Source: 'spartan-ai.scan',
                  DetailType: 'PollScan',
                  Detail: JSON.stringify({
                    scanId,
                    captisId: captisResponse.id,
                    accountID,
                    captisAccessKey,
                  }),
                },
              ],
            })
          );
          log('info', 'Polling triggered via EventBridge', { 
            requestId, 
            scanId, 
            captisId: captisResponse.id,
          });
        } catch (error) {
          logError(error, { 
            requestId, 
            scanId, 
            errorType: 'EVENTBRIDGE_ERROR',
          });
          // Continue - poll handler can be triggered manually if needed
        }
      } else {
        // Status is COMPLETED but no matches - wait a bit and poll to see if results appear
        // Captis sometimes returns COMPLETED before matches are ready
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.SCANS_TABLE_NAME!,
            Key: { scanId },
            UpdateExpression: 'SET pollingRequired = :polling, captisAccessKey = :key',
            ExpressionAttributeValues: {
              ':polling': true,
              ':key': captisAccessKey,
            },
          })
        );

        try {
          await eventBridgeClient.send(
            new PutEventsCommand({
              Entries: [
                {
                  Source: 'spartan-ai.scan',
                  DetailType: 'PollScan',
                  Detail: JSON.stringify({
                    scanId,
                    captisId: captisResponse.id,
                    accountID,
                    captisAccessKey,
                  }),
                },
              ],
            })
          );
          log('info', 'Polling triggered to check for delayed results (COMPLETED but no matches)', { 
            requestId, 
            scanId, 
            captisId: captisResponse.id,
          });
        } catch (error) {
          logError(error, { 
            requestId, 
            scanId, 
            errorType: 'EVENTBRIDGE_ERROR',
          });
        }
      }

      // Return response
      const response: ScanResponse = {
        scanId,
        status: captisResponse.timedOutFlag ? 'PENDING' : 'COMPLETED',
        topScore: captisResponse.matches?.[0]?.score,
        viewMatchesUrl: captisResponse.viewMatchesUrl,
      };

      log('info', 'Scan request completed successfully', { 
        requestId, 
        scanId, 
        status: response.status,
        topScore: response.topScore,
      });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(response),
      };
    } finally {
      // Ensure image buffer is cleared even if error occurs
      if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
        imageBuffer.fill(0);
        imageBuffer = null;
      }
    }
  } catch (error) {
    logError(error, { requestId, errorType: 'HANDLER_ERROR' });

    // Handle validation errors
    if (error instanceof ZodError) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(formatValidationError(error)),
      };
    }

    // Handle Captis errors
    if (axios.isAxiosError(error)) {
      const captisError = handleCaptisError(error);
      return {
        statusCode: captisError.statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Captis API Error',
          message: captisError.message,
        }),
      };
    }

    // Generic error
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId, // Include request ID for debugging
      }),
    };
  }
};
