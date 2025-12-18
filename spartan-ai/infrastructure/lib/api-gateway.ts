import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaFunctions } from './lambda-functions';
import { DynamoDbTables } from './dynamodb-tables';

export interface ApiGatewayProps {
  lambdaFunctions: LambdaFunctions;
  tables: DynamoDbTables;
}

export class ApiGateway extends Construct {
  public readonly restApi: apigateway.RestApi;
  public readonly apiKey: apigateway.ApiKey;
  public readonly usagePlan: apigateway.UsagePlan;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    // Create REST API
    this.restApi = new apigateway.RestApi(this, 'SpartanAiApi', {
      restApiName: 'Spartan AI Security Service API',
      description: 'API for Spartan AI Security Service - Phase 1 (Phase 2 placeholders in stack)',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });

    // Create API Key
    this.apiKey = new apigateway.ApiKey(this, 'ApiKey', {
      apiKeyName: 'spartan-ai-api-key',
      description: 'API key for Spartan AI Security Service',
    });

    // Create Usage Plan with rate limiting
    this.usagePlan = this.restApi.addUsagePlan('UsagePlan', {
      name: 'spartan-ai-usage-plan',
      description: 'Usage plan for Spartan AI API',
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    // Associate API key with usage plan
    this.usagePlan.addApiKey(this.apiKey);

    // Associate usage plan with API stage
    this.usagePlan.addApiStage({
      stage: this.restApi.deploymentStage,
    });

    // Create /api/v1 base path
    const api = this.restApi.root.addResource('api').addResource('v1');

    // ============================================================================
    // API MODELS - OpenAPI 3.0 Request/Response Schemas
    // ============================================================================

    // Scan Request Model
    const scanRequestModel = this.restApi.addModel('ScanRequestModel', {
      contentType: 'application/json',
      modelName: 'ScanRequest',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['image', 'metadata'],
        properties: {
          image: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Base64-encoded image or image URL',
          },
          metadata: {
            type: apigateway.JsonSchemaType.OBJECT,
            required: ['cameraID', 'accountID', 'location', 'timestamp'],
            properties: {
              cameraID: {
                type: apigateway.JsonSchemaType.STRING,
                description: 'Camera identifier',
              },
              accountID: {
                type: apigateway.JsonSchemaType.STRING,
                description: 'Account identifier',
              },
              location: {
                type: apigateway.JsonSchemaType.OBJECT,
                required: ['lat', 'lon'],
                properties: {
                  lat: {
                    type: apigateway.JsonSchemaType.NUMBER,
                    description: 'Latitude coordinate',
                  },
                  lon: {
                    type: apigateway.JsonSchemaType.NUMBER,
                    description: 'Longitude coordinate',
                  },
                },
              },
              timestamp: {
                type: apigateway.JsonSchemaType.STRING,
                format: 'date-time',
                description: 'ISO 8601 timestamp',
              },
            },
          },
        },
      },
    });

    // Scan Response Model
    const scanResponseModel = this.restApi.addModel('ScanResponseModel', {
      contentType: 'application/json',
      modelName: 'ScanResponse',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['scanId', 'status'],
        properties: {
          scanId: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Unique scan identifier',
          },
          status: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ['PENDING', 'COMPLETED', 'FAILED'],
            description: 'Scan processing status',
          },
          topScore: {
            type: apigateway.JsonSchemaType.NUMBER,
            description: 'Highest match score (0-100)',
          },
          viewMatchesUrl: {
            type: apigateway.JsonSchemaType.STRING,
            format: 'uri',
            description: 'URL to view match details',
          },
        },
      },
    });

    // Error Response Model
    const errorResponseModel = this.restApi.addModel('ErrorResponseModel', {
      contentType: 'application/json',
      modelName: 'ErrorResponse',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['error'],
        properties: {
          error: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Error type',
          },
          message: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Error message',
          },
        },
      },
    });

    // Consent Request Model
    const consentRequestModel = this.restApi.addModel('ConsentRequestModel', {
      contentType: 'application/json',
      modelName: 'ConsentRequest',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['consentStatus'],
        properties: {
          consentStatus: {
            type: apigateway.JsonSchemaType.BOOLEAN,
            description: 'Consent status (true = opted in, false = opted out)',
          },
        },
      },
    });

    // Consent Response Model
    const consentResponseModel = this.restApi.addModel('ConsentResponseModel', {
      contentType: 'application/json',
      modelName: 'ConsentResponse',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['accountID', 'consentStatus'],
        properties: {
          accountID: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Account identifier',
          },
          consentStatus: {
            type: apigateway.JsonSchemaType.BOOLEAN,
            description: 'Current consent status',
          },
          updatedAt: {
            type: apigateway.JsonSchemaType.STRING,
            format: 'date-time',
            description: 'Last update timestamp',
          },
        },
      },
    });

    // Scans List Response Model
    const scansListResponseModel = this.restApi.addModel('ScansListResponseModel', {
      contentType: 'application/json',
      modelName: 'ScansListResponse',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['scans'],
        properties: {
          scans: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: {
              type: apigateway.JsonSchemaType.OBJECT,
              properties: {
                scanId: { type: apigateway.JsonSchemaType.STRING },
                accountID: { type: apigateway.JsonSchemaType.STRING },
                status: { type: apigateway.JsonSchemaType.STRING },
                topScore: { type: apigateway.JsonSchemaType.NUMBER },
                createdAt: { type: apigateway.JsonSchemaType.STRING },
              },
            },
          },
          nextToken: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'Pagination token for next page',
          },
        },
      },
    });

    // ============================================================================
    // API ENDPOINTS WITH MODELS
    // ============================================================================

    // POST /api/v1/scan - Image threat lookup
    const scanResource = api.addResource('scan');
    scanResource.addMethod('POST', new apigateway.LambdaIntegration(props.lambdaFunctions.scanHandler), {
      apiKeyRequired: true,
      requestModels: {
        'application/json': scanRequestModel,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': scanResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '202',
          responseModels: {
            'application/json': scanResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '403',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '429',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // GET /api/v1/scan/{id} - Scan details
    const scanIdResource = scanResource.addResource('{id}');
    scanIdResource.addMethod('GET', new apigateway.LambdaIntegration(props.lambdaFunctions.scanDetailHandler), {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.path.id': true,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': scanResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '404',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // GET /api/v1/scans - List scans
    const scansResource = api.addResource('scans');
    scansResource.addMethod('GET', new apigateway.LambdaIntegration(props.lambdaFunctions.scanListHandler), {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.querystring.accountID': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.nextToken': false,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': scansListResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // PUT /api/v1/consent - Update consent status
    const consentResource = api.addResource('consent');
    consentResource.addMethod('PUT', new apigateway.LambdaIntegration(props.lambdaFunctions.consentHandler), {
      apiKeyRequired: true,
      requestModels: {
        'application/json': consentRequestModel,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': consentResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // POST /api/v1/webhooks - Register webhook
    const webhooksResource = api.addResource('webhooks');
    webhooksResource.addMethod('POST', new apigateway.LambdaIntegration(props.lambdaFunctions.webhookRegistrationHandler), {
      apiKeyRequired: true,
      methodResponses: [
        {
          statusCode: '201',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '409',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // DELETE /api/v1/gdpr/{accountID} - GDPR data deletion
    const gdprResource = api.addResource('gdpr').addResource('{accountID}');
    gdprResource.addMethod('DELETE', new apigateway.LambdaIntegration(props.lambdaFunctions.gdprDeletionHandler), {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.path.accountID': true,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // Output API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayEndpoint', {
      value: this.restApi.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: this.apiKey.keyId,
      description: 'API Key ID',
    });

    // ============================================================================
    // PHASE 2 PLACEHOLDERS - ADDITIONAL API ENDPOINTS (2027 Roadmap)
    // ============================================================================
    //
    // TODO: POST /api/v1/verified-subjects - Add verified subject to Verified DB
    // Handler: verified-subject-handler Lambda
    // Purpose: Allow accounts to add verified subjects to their local database
    // Request Body: { subjectId, faceImage, metadata: { name, aliases, crimes } }
    // Response: { subjectId, verificationId, rekognitionFaceId, createdAt }
    //
    // TODO: GET /api/v1/verified-subjects/{subjectId} - Get verified subject details
    // Handler: verified-subject-handler Lambda
    // Purpose: Retrieve verified subject information from Verified DB
    // Query Params: ?accountID=xxx (optional filter)
    //
    // TODO: GET /api/v1/verified-subjects - List verified subjects for account
    // Handler: verified-subject-handler Lambda
    // Purpose: List all verified subjects for an account with pagination
    // Query Params: ?accountID=xxx&limit=50&nextToken=xxx
    //
    // TODO: PUT /api/v1/verified-subjects/{subjectId} - Update verified subject
    // Handler: verified-subject-handler Lambda
    // Purpose: Update verified subject metadata or re-index face
    //
    // TODO: DELETE /api/v1/verified-subjects/{subjectId} - Delete verified subject
    // Handler: verified-subject-handler Lambda
    // Purpose: Remove verified subject from Verified DB and Rekognition collection
    //
    // TODO: POST /api/v1/scan?mode=rekognition - Enhanced scan with Rekognition
    // Handler: scan-handler Lambda (updated for Phase 2)
    // Purpose: Use Rekognition + Verified DB for threat detection
    // Query Params: ?mode=rekognition|captis|hybrid (default: hybrid)
    // - rekognition: Only use Rekognition + Verified DB
    // - captis: Only use Captis API (legacy mode)
    // - hybrid: Try Rekognition first, fallback to Captis
    //
    // TODO: POST /api/v1/migration/start - Start migration job
    // Handler: migration-handler Lambda
    // Purpose: Manually trigger migration from Captis to Verified DB
    // Request Body: { accountID?, batchSize?, dryRun? }
    //
    // TODO: GET /api/v1/migration/status - Get migration status
    // Handler: migration-handler Lambda
    // Purpose: Check status of ongoing or completed migration jobs
    //
    // All Phase 2 endpoints will:
    // - Require API key authentication (same as Phase 1)
    // - Support CORS (same as Phase 1)
    // - Include rate limiting (same as Phase 1)
    // - Maintain backward compatibility with Phase 1 endpoints
    //
    // ============================================================================
  }
}

