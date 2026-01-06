import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoDbTables } from './dynamodb-tables';
import { SnsTopics } from './sns-topics';
import * as path from 'path';

export interface LambdaFunctionsProps {
  tables: DynamoDbTables;
  snsTopics: SnsTopics;
}

export class LambdaFunctions extends Construct {
  public readonly scanHandler: lambda.Function;
  public readonly pollHandler: lambda.Function;
  public readonly alertHandler: lambda.Function;
  public readonly emailAggregator: lambda.Function;
  public readonly webhookDispatcher: lambda.Function;
  public readonly scanDetailHandler: lambda.Function;
  public readonly scanListHandler: lambda.Function;
  public readonly consentHandler: lambda.Function;
  public readonly webhookRegistrationHandler: lambda.Function;
  public readonly gdprDeletionHandler: lambda.Function;
  public readonly thresholdHandler: lambda.Function;
  public readonly demoRequestHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
    super(scope, id);

    // Shared Lambda configuration
    const defaultLambdaProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['aws-sdk'],
      },
      environment: {
        SCANS_TABLE_NAME: props.tables.scansTable.tableName,
        QUOTAS_TABLE_NAME: props.tables.quotasTable.tableName,
        THREAT_LOCATIONS_TABLE_NAME: props.tables.threatLocationsTable.tableName,
        CONSENT_TABLE_NAME: props.tables.consentTable.tableName,
        WEBHOOK_SUBSCRIPTIONS_TABLE_NAME: props.tables.webhookSubscriptionsTable.tableName,
        DEVICE_TOKENS_TABLE_NAME: props.tables.deviceTokensTable.tableName,
        ACCOUNT_PROFILES_TABLE_NAME: props.tables.accountProfilesTable.tableName,
        HIGH_THREAT_TOPIC_ARN: props.snsTopics.highThreatTopic.topicArn,
        MEDIUM_THREAT_TOPIC_ARN: props.snsTopics.mediumThreatTopic.topicArn,
        WEBHOOK_TOPIC_ARN: props.snsTopics.webhookTopic.topicArn,
        CONSENT_UPDATE_TOPIC_ARN: props.snsTopics.consentUpdateTopic.topicArn,
        TABLE_PREFIX: 'spartan-ai',
      },
    };

    const rootFunctionsPath = path.join(__dirname, '../../../functions');

    // Scan Handler Lambda
    this.scanHandler = new lambdaNodejs.NodejsFunction(this, 'ScanHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-scan-handler',
      entry: path.join(rootFunctionsPath, 'scan-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(5), // Fast response requirement
      environment: {
        ...defaultLambdaProps.environment,
        CAPTIS_BASE_URL: 'https://asi-api.solveacrime.com',
      },
    });

    // Grant EventBridge PutEvents permission to scan handler
    this.scanHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: ['*'],
      })
    );

    // Poll Handler Lambda
    this.pollHandler = new lambdaNodejs.NodejsFunction(this, 'PollHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-poll-handler',
      entry: path.join(rootFunctionsPath, 'poll-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(120), // Max polling duration
      environment: {
        ...defaultLambdaProps.environment,
        CAPTIS_BASE_URL: 'https://asi-api.solveacrime.com',
      },
    });

    // Alert Handler Lambda
    // Note: SSM parameters must be referenced at runtime, not deployment time
    // Lambda will read from SSM Parameter Store using the parameter paths
    this.alertHandler = new lambdaNodejs.NodejsFunction(this, 'AlertHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-alert-handler',
      entry: path.join(rootFunctionsPath, 'alert-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...defaultLambdaProps.environment,
        // Store SSM parameter paths - Lambda will read values at runtime
        TWILIO_ACCOUNT_SID_PARAM: '/spartan-ai/twilio/account-sid',
        TWILIO_AUTH_TOKEN_PARAM: '/spartan-ai/twilio/auth-token',
        TWILIO_PHONE_NUMBER_PARAM: '/spartan-ai/twilio/phone-number',
        FCM_SERVER_KEY_PARAM: '/spartan-ai/fcm/server-key',
      },
    });

    // Grant read permissions for SSM parameters
    this.alertHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/spartan-ai/twilio/*`,
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/spartan-ai/fcm/*`,
        ],
      })
    );

    // Email Aggregator Lambda (weekly cron)
    this.emailAggregator = new lambdaNodejs.NodejsFunction(this, 'EmailAggregator', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-email-aggregator',
      entry: path.join(rootFunctionsPath, 'email-aggregator/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      environment: {
        ...defaultLambdaProps.environment,
        SENDGRID_API_KEY: '${ssm:/spartan-ai/sendgrid/api-key}',
      },
    });

    // Webhook Dispatcher Lambda
    this.webhookDispatcher = new lambdaNodejs.NodejsFunction(this, 'WebhookDispatcher', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-webhook-dispatcher',
      entry: path.join(rootFunctionsPath, 'webhook-dispatcher/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
    });

    // Scan Detail Handler Lambda
    this.scanDetailHandler = new lambdaNodejs.NodejsFunction(this, 'ScanDetailHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-scan-detail-handler',
      entry: path.join(rootFunctionsPath, 'scan-detail-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(5),
    });

    // Scan List Handler Lambda
    this.scanListHandler = new lambdaNodejs.NodejsFunction(this, 'ScanListHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-scan-list-handler',
      entry: path.join(rootFunctionsPath, 'scan-list-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(5),
    });

    // Consent Handler Lambda
    this.consentHandler = new lambdaNodejs.NodejsFunction(this, 'ConsentHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-consent-handler',
      entry: path.join(rootFunctionsPath, 'consent-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(5),
    });

    // Webhook Registration Handler Lambda
    this.webhookRegistrationHandler = new lambdaNodejs.NodejsFunction(this, 'WebhookRegistrationHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-webhook-registration-handler',
      entry: path.join(rootFunctionsPath, 'webhook-registration-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(5),
    });

    // GDPR Deletion Handler Lambda
    this.gdprDeletionHandler = new lambdaNodejs.NodejsFunction(this, 'GdprDeletionHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-gdpr-deletion-handler',
      entry: path.join(rootFunctionsPath, 'gdpr-deletion-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5), // May take time to delete all data
    });

    // Threshold Handler Lambda
    this.thresholdHandler = new lambdaNodejs.NodejsFunction(this, 'ThresholdHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-threshold-handler',
      entry: path.join(rootFunctionsPath, 'threshold-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(5),
      environment: {
        ...defaultLambdaProps.environment,
        GLOBAL_THRESHOLDS_SSM_PATH: '/spartan-ai/threat-thresholds/global',
      },
    });

    // Demo Request Handler Lambda
    this.demoRequestHandler = new lambdaNodejs.NodejsFunction(this, 'DemoRequestHandler', {
      ...defaultLambdaProps,
      functionName: 'spartan-ai-demo-request-handler',
      entry: path.join(rootFunctionsPath, 'demo-request-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      environment: {
        SENDER_EMAIL: 'noreply@spartan.tech',
      },
    });

    // Grant SES permissions to send emails
    this.demoRequestHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'], // SES permissions are typically account-level
      })
    );

    // Grant permissions to DynamoDB tables
    props.tables.scansTable.grantReadWriteData(this.scanHandler);
    props.tables.scansTable.grantReadWriteData(this.pollHandler);
    props.tables.scansTable.grantReadData(this.scanDetailHandler);
    props.tables.scansTable.grantReadData(this.scanListHandler);

    props.tables.quotasTable.grantReadWriteData(this.scanHandler);

    props.tables.threatLocationsTable.grantReadWriteData(this.pollHandler);
    props.tables.threatLocationsTable.grantReadWriteData(this.alertHandler);

    props.tables.consentTable.grantReadWriteData(this.scanHandler);
    props.tables.consentTable.grantReadWriteData(this.consentHandler);

    props.tables.webhookSubscriptionsTable.grantReadData(this.webhookDispatcher);
    props.tables.webhookSubscriptionsTable.grantReadWriteData(this.webhookRegistrationHandler);

    props.tables.deviceTokensTable.grantReadData(this.alertHandler);

    props.tables.accountProfilesTable.grantReadData(this.emailAggregator);
    props.tables.accountProfilesTable.grantReadWriteData(this.thresholdHandler);

    // Grant poll handler permissions for thresholds
    props.tables.accountProfilesTable.grantReadData(this.pollHandler);

    // Grant GDPR deletion handler permissions
    props.tables.scansTable.grantReadWriteData(this.gdprDeletionHandler);
    props.tables.quotasTable.grantReadWriteData(this.gdprDeletionHandler);
    props.tables.threatLocationsTable.grantReadWriteData(this.gdprDeletionHandler);
    props.tables.consentTable.grantReadWriteData(this.gdprDeletionHandler);
    props.tables.webhookSubscriptionsTable.grantReadWriteData(this.gdprDeletionHandler);
    props.tables.deviceTokensTable.grantReadWriteData(this.gdprDeletionHandler);
    props.tables.accountProfilesTable.grantReadWriteData(this.gdprDeletionHandler);

    // Grant SNS publish permissions
    props.snsTopics.highThreatTopic.grantPublish(this.pollHandler);
    props.snsTopics.mediumThreatTopic.grantPublish(this.pollHandler);
    props.snsTopics.webhookTopic.grantPublish(this.pollHandler);

    // Subscribe alert handler to SNS topics
    props.snsTopics.highThreatTopic.addSubscription(
      new snsSubs.LambdaSubscription(this.alertHandler, {
        deadLetterQueue: props.snsTopics.highThreatDlq,
      })
    );

    props.snsTopics.mediumThreatTopic.addSubscription(
      new snsSubs.LambdaSubscription(this.alertHandler, {
        deadLetterQueue: props.snsTopics.mediumThreatDlq,
      })
    );

    props.snsTopics.webhookTopic.addSubscription(
      new snsSubs.LambdaSubscription(this.webhookDispatcher, {
        deadLetterQueue: props.snsTopics.webhookDlq,
      })
    );

    // EventBridge rule for weekly email aggregation (every Monday at 9 AM UTC)
    const weeklyEmailRule = new events.Rule(this, 'WeeklyEmailRule', {
      schedule: events.Schedule.cron({ weekDay: 'MON', hour: '9', minute: '0' }),
      description: 'Trigger weekly email aggregation for low-threat matches',
    });

    weeklyEmailRule.addTarget(new targets.LambdaFunction(this.emailAggregator));

    // EventBridge rule to trigger poll handler for scans that need polling
    // This is triggered when a scan needs polling (timed out or no immediate results)
    const pollScanRule = new events.Rule(this, 'PollScanRule', {
      eventPattern: {
        source: ['spartan-ai.scan'],
        detailType: ['PollScan', 'Scan Timeout'], // Support both event types
      },
      description: 'Trigger poll handler for Captis scans that need polling',
    });

    pollScanRule.addTarget(new targets.LambdaFunction(this.pollHandler));

    // Grant SSM parameter read permissions
    const ssmPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/spartan-ai/*`,
      ],
    });

    this.scanHandler.addToRolePolicy(ssmPolicy);
    this.pollHandler.addToRolePolicy(ssmPolicy);
    this.alertHandler.addToRolePolicy(ssmPolicy);
    this.emailAggregator.addToRolePolicy(ssmPolicy);
    this.consentHandler.addToRolePolicy(ssmPolicy);
    this.thresholdHandler.addToRolePolicy(ssmPolicy);

    // Grant SNS publish permission for consent handler
    props.snsTopics.consentUpdateTopic.grantPublish(this.consentHandler);

    // ============================================================================
    // PHASE 2 PLACEHOLDERS - ADDITIONAL LAMBDA FUNCTIONS (2027 Roadmap)
    // ============================================================================
    //
    // TODO: Face Index Handler Lambda
    // Purpose: Index faces into Rekognition collection when new verified subjects are added
    // Trigger: EventBridge event from Verified DB table updates
    // Permissions: Rekognition (IndexFaces), DynamoDB (Query, GetItem), S3 (GetObject)
    // Location: functions/face-index-handler/index.ts
    //
    // TODO: Migration Handler Lambda
    // Purpose: Migrate high-confidence Captis matches to Verified DB
    // Trigger: EventBridge scheduled rule (daily at 2 AM) or manual invocation
    // Permissions: DynamoDB (Query, PutItem), Rekognition (IndexFaces), S3 (PutObject)
    // Location: functions/migration-handler/index.ts
    //
    // TODO: Rekognition Search Handler Lambda
    // Purpose: Search Verified DB using Rekognition face recognition
    // Trigger: API Gateway endpoint or EventBridge
    // Permissions: Rekognition (DetectFaces, SearchFacesByImage), DynamoDB (Query)
    // Location: functions/rekognition-search-handler/index.ts
    //
    // TODO: Update scan-handler to support Rekognition mode
    // - Add environment variable: SCAN_MODE = 'rekognition' | 'captis' | 'hybrid'
    // - Add Rekognition permissions to scan-handler role
    // - Integrate Rekognition client for face detection and search
    // - Maintain backward compatibility with Captis API
    //
    // ============================================================================
  }
}

