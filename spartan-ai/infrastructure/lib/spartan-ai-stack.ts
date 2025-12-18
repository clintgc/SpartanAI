import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoDbTables } from './dynamodb-tables';
import { ApiGateway } from './api-gateway';
import { LambdaFunctions } from './lambda-functions';
import { SnsTopics } from './sns-topics';
import { CloudWatchMonitoring } from './cloudwatch-monitoring';
import { CloudWatchDashboard } from './cloudwatch-dashboard';
import { CostMonitoring } from './cost-monitoring';
import { QuotaWarning } from './quota-warning';
import { OpenApiDocumentation } from './openapi-documentation';
import { SsmParameters } from './ssm-parameters';

export class SpartanAiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create SSM Parameters for secrets
    const ssmParams = new SsmParameters(this, 'SsmParameters', {
      captisAccessKey: process.env.CAPTIS_ACCESS_KEY,
    });

    // Create DynamoDB tables
    const tables = new DynamoDbTables(this, 'DynamoDbTables');

    // Create SNS topics
    const snsTopics = new SnsTopics(this, 'SnsTopics');

    // Create Lambda functions
    const lambdaFunctions = new LambdaFunctions(this, 'LambdaFunctions', {
      tables,
      snsTopics,
    });

    // Create API Gateway
    const apiGateway = new ApiGateway(this, 'ApiGateway', {
      lambdaFunctions,
      tables,
    });

    // Create CloudWatch monitoring
    const monitoring = new CloudWatchMonitoring(this, 'CloudWatchMonitoring', {
      lambdaFunctions,
      alarmEmail: process.env.ALARM_EMAIL,
    });

    // Create operational dashboard
    const operationalDashboard = new CloudWatchDashboard(this, 'CloudWatchDashboard', {
      lambdaFunctions,
      apiGateway,
      tables,
    });

    // Create cost monitoring dashboard
    const costMonitoring = new CostMonitoring(this, 'CostMonitoring', {
      lambdaFunctions,
      tables,
      apiGateway,
      budgetThreshold: parseFloat(process.env.MONTHLY_BUDGET || '75000'),
      alarmEmail: process.env.ALARM_EMAIL,
    });

    // Create quota warning system
    const quotaWarning = new QuotaWarning(this, 'QuotaWarning', {
      tables,
      alarmEmail: process.env.ALARM_EMAIL,
    });

    // Create OpenAPI documentation
    const apiDocs = new OpenApiDocumentation(this, 'OpenApiDocumentation', {
      apiGateway,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: apiGateway.restApi.url,
      description: 'API Gateway endpoint URL',
    });

    // ============================================================================
    // PHASE 2 PLACEHOLDERS - 2027 ROADMAP
    // ============================================================================
    // 
    // Phase 2 will introduce AWS Rekognition integration and a Verified Database
    // to replace/enhance the current Captis ASI API integration.
    //
    // Key Changes:
    // 1. AWS Rekognition integration for face detection and comparison
    // 2. Verified Database table for storing verified subject records
    // 3. Migration paths from Captis to Verified DB
    // 4. Enhanced matching algorithms using Rekognition + Verified DB
    //
    // ============================================================================

    // ----------------------------------------------------------------------------
    // AWS REKOGNITION INTEGRATION
    // ----------------------------------------------------------------------------
    // 
    // TODO: Create Rekognition Collection for face recognition
    // const rekognitionCollection = new rekognition.CfnCollection(this, 'RekognitionCollection', {
    //   collectionId: 'spartan-ai-verified-subjects',
    //   // Collection will store face indexes for verified subjects
    // });
    //
    // TODO: Create IAM role for Lambda functions to access Rekognition
    // const rekognitionRole = new iam.Role(this, 'RekognitionLambdaRole', {
    //   assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    //   managedPolicies: [
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRekognitionFullAccess'),
    //   ],
    // });
    //
    // TODO: Add Rekognition permissions to scan-handler Lambda
    // lambdaFunctions.scanHandler.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: [
    //       'rekognition:DetectFaces',
    //       'rekognition:SearchFacesByImage',
    //       'rekognition:IndexFaces',
    //     ],
    //     resources: ['*'],
    //   })
    // );
    //
    // TODO: Create Rekognition service client in shared/services/
    // - File: shared/services/rekognition-client.ts
    // - Methods: detectFaces(), searchFacesByImage(), indexFace()
    // - Integration with Verified Database table
    //
    // TODO: Update scan-handler to use Rekognition for face detection
    // - Replace/enhance Captis API call with Rekognition DetectFaces
    // - Search Verified Database using Rekognition SearchFacesByImage
    // - Fallback to Captis API if Rekognition doesn't find matches
    //
    // TODO: Create Lambda function for indexing faces into Rekognition
    // const faceIndexHandler = new lambda.Function(this, 'FaceIndexHandler', {
    //   runtime: lambda.Runtime.NODEJS_18_X,
    //   handler: 'index.handler',
    //   code: lambda.Code.fromAsset('functions/face-index-handler'),
    //   role: rekognitionRole,
    //   environment: {
    //     REKOGNITION_COLLECTION_ID: rekognitionCollection.collectionId,
    //     VERIFIED_DB_TABLE_NAME: verifiedDbTable.tableName,
    //   },
    // });
    //
    // TODO: Create EventBridge rule to trigger face indexing on Verified DB updates
    // const faceIndexRule = new events.Rule(this, 'FaceIndexRule', {
    //   eventPattern: {
    //     source: ['spartan-ai.verified-db'],
    //     detailType: ['Verified Subject Added'],
    //   },
    // });
    // faceIndexRule.addTarget(new targets.LambdaFunction(faceIndexHandler));

    // ----------------------------------------------------------------------------
    // VERIFIED DATABASE TABLE
    // ----------------------------------------------------------------------------
    //
    // TODO: Create Verified Database DynamoDB table
    // const verifiedDbTable = new dynamodb.Table(this, 'VerifiedDbTable', {
    //   tableName: `${process.env.TABLE_PREFIX || 'spartan-ai'}-verified-db`,
    //   partitionKey: { name: 'subjectId', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'verificationId', type: dynamodb.AttributeType.STRING },
    //   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    //   encryption: dynamodb.TableEncryption.AWS_MANAGED,
    //   pointInTimeRecovery: true,
    //   removalPolicy: cdk.RemovalPolicy.RETAIN,
    //   // GSI: accountID-index (accountID PK, createdAt SK)
    //   // GSI: rekognitionFaceId-index (rekognitionFaceId PK) for face lookups
    // });
    //
    // TODO: Add Global Secondary Index for account-based queries
    // verifiedDbTable.addGlobalSecondaryIndex({
    //   indexName: 'accountID-index',
    //   partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    // });
    //
    // TODO: Add Global Secondary Index for Rekognition face ID lookups
    // verifiedDbTable.addGlobalSecondaryIndex({
    //   indexName: 'rekognitionFaceId-index',
    //   partitionKey: { name: 'rekognitionFaceId', type: dynamodb.AttributeType.STRING },
    // });
    //
    // TODO: Add Verified Database methods to DynamoDbService
    // - File: shared/services/dynamodb-service.ts
    // - Methods:
    //   * addVerifiedSubject(subjectId, accountID, faceImage, metadata)
    //   * getVerifiedSubject(subjectId, verificationId)
    //   * searchVerifiedSubjectsByAccount(accountID)
    //   * searchVerifiedSubjectsByFaceId(rekognitionFaceId)
    //   * updateVerifiedSubject(subjectId, verificationId, updates)
    //   * deleteVerifiedSubject(subjectId, verificationId)
    //
    // TODO: Create Verified Database model interface
    // - File: shared/models/index.ts
    // - Interface: VerifiedSubject
    //   {
    //     subjectId: string;
    //     verificationId: string;
    //     accountID: string;
    //     rekognitionFaceId?: string;
    //     faceImageUrl?: string;
    //     metadata: {
    //       name?: string;
    //       aliases?: string[];
    //       crimes?: string[];
    //       verifiedAt: string;
    //       verifiedBy: string;
    //     };
    //     createdAt: string;
    //     updatedAt: string;
    //   }

    // ----------------------------------------------------------------------------
    // MIGRATION PATHS FROM CAPTIS TO VERIFIED DB
    // ----------------------------------------------------------------------------
    //
    // TODO: Create migration Lambda function for Captis → Verified DB
    // const migrationHandler = new lambda.Function(this, 'MigrationHandler', {
    //   runtime: lambda.Runtime.NODEJS_18_X,
    //   handler: 'index.handler',
    //   code: lambda.Code.fromAsset('functions/migration-handler'),
    //   timeout: cdk.Duration.minutes(15),
    //   memorySize: 1024,
    //   environment: {
    //     CAPTIS_SCANS_TABLE_NAME: tables.scansTable.tableName,
    //     VERIFIED_DB_TABLE_NAME: verifiedDbTable.tableName,
    //     REKOGNITION_COLLECTION_ID: rekognitionCollection.collectionId,
    //   },
    // });
    //
    // TODO: Grant migration handler permissions
    // migrationHandler.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: [
    //       'dynamodb:Query',
    //       'dynamodb:PutItem',
    //       'dynamodb:UpdateItem',
    //       'rekognition:IndexFaces',
    //     ],
    //     resources: ['*'],
    //   })
    // );
    //
    // TODO: Create EventBridge rule for scheduled migration jobs
    // const migrationRule = new events.Rule(this, 'MigrationRule', {
    //   schedule: events.Schedule.cron({ hour: '2', minute: '0' }), // Daily at 2 AM
    //   enabled: false, // Enable when ready to migrate
    // });
    // migrationRule.addTarget(new targets.LambdaFunction(migrationHandler));
    //
    // TODO: Migration strategy:
    // 1. Query Scans table for high-confidence matches (>89%)
    // 2. Extract subject metadata (name, crimes, biometrics)
    // 3. Download face images from Captis (if available)
    // 4. Index faces into Rekognition collection
    // 5. Store verified subject records in Verified DB
    // 6. Maintain backward compatibility with Captis API during transition

    // ----------------------------------------------------------------------------
    // ENHANCED SCAN HANDLER INTEGRATION
    // ----------------------------------------------------------------------------
    //
    // TODO: Update scan-handler to support dual-mode operation
    // - Mode 1: Rekognition + Verified DB (primary for Phase 2)
    // - Mode 2: Captis API (fallback and legacy support)
    // - Environment variable: SCAN_MODE = 'rekognition' | 'captis' | 'hybrid'
    //
    // TODO: Hybrid mode flow:
    // 1. Receive image in scan-handler
    // 2. Use Rekognition DetectFaces to detect faces
    // 3. Use Rekognition SearchFacesByImage to search Verified DB
    // 4. If matches found in Verified DB, return results
    // 5. If no matches, fallback to Captis API
    // 6. Store Captis results for potential future migration
    //
    // TODO: Update API Gateway to support new scan modes
    // - Add query parameter: ?mode=rekognition|captis|hybrid
    // - Update OpenAPI documentation with new parameter
    // - Maintain backward compatibility (default to 'hybrid')

    // ----------------------------------------------------------------------------
    // PHASE 2 MONITORING & METRICS
    // ----------------------------------------------------------------------------
    //
    // TODO: Add CloudWatch metrics for Rekognition usage
    // - Rekognition API calls (DetectFaces, SearchFacesByImage, IndexFaces)
    // - Rekognition error rate
    // - Verified DB query performance
    // - Migration job status and progress
    //
    // TODO: Add cost monitoring for Rekognition
    // - Track Rekognition API costs
    // - Compare Rekognition costs vs Captis API costs
    // - Add to cost breakdown pie chart widget

    // ----------------------------------------------------------------------------
    // PHASE 2 TESTING
    // ----------------------------------------------------------------------------
    //
    // TODO: Create unit tests for Rekognition client
    // - File: tests/unit/rekognition-client.test.ts
    // - Mock AWS Rekognition SDK calls
    // - Test face detection, search, and indexing
    //
    // TODO: Create integration tests for Verified DB
    // - File: tests/integration/verified-db.test.ts
    // - Test CRUD operations
    // - Test GSI queries
    // - Test face indexing workflow
    //
    // TODO: Create migration tests
    // - File: tests/integration/migration.test.ts
    // - Test Captis → Verified DB migration
    // - Test data integrity after migration
    // - Test rollback procedures

    // ============================================================================
    // END PHASE 2 PLACEHOLDERS
    // ============================================================================
  }
}

