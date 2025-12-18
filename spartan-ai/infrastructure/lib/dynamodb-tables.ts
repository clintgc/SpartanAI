import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface DynamoDbTablesProps {
  tablePrefix?: string;
}

export class DynamoDbTables extends Construct {
  public readonly scansTable: dynamodb.Table;
  public readonly quotasTable: dynamodb.Table;
  public readonly threatLocationsTable: dynamodb.Table;
  public readonly consentTable: dynamodb.Table;
  public readonly webhookSubscriptionsTable: dynamodb.Table;
  public readonly deviceTokensTable: dynamodb.Table;
  public readonly accountProfilesTable: dynamodb.Table;

  // KMS key for encryption
  private readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props?: DynamoDbTablesProps) {
    super(scope, id);

    const tablePrefix = props?.tablePrefix || 'spartan-ai';

    // Create KMS key for DynamoDB encryption
    this.encryptionKey = new kms.Key(this, 'DynamoDbEncryptionKey', {
      description: 'KMS key for DynamoDB table encryption',
      enableKeyRotation: true,
    });

    // Scans table: scanId (PK), accountID (GSI)
    this.scansTable = new dynamodb.Table(this, 'ScansTable', {
      tableName: `${tablePrefix}-scans`,
      partitionKey: { name: 'scanId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for accountID queries
    this.scansTable.addGlobalSecondaryIndex({
      indexName: 'accountID-index',
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Quotas table: accountID (PK), year (SK)
    this.quotasTable = new dynamodb.Table(this, 'QuotasTable', {
      tableName: `${tablePrefix}-quotas`,
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'year', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ThreatLocations table: subjectId (PK), accountID (GSI)
    this.threatLocationsTable = new dynamodb.Table(this, 'ThreatLocationsTable', {
      tableName: `${tablePrefix}-threat-locations`,
      partitionKey: { name: 'subjectId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for accountID queries
    this.threatLocationsTable.addGlobalSecondaryIndex({
      indexName: 'accountID-index',
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastSeenAt', type: dynamodb.AttributeType.STRING },
    });

    // Consent table: accountID (PK)
    this.consentTable = new dynamodb.Table(this, 'ConsentTable', {
      tableName: `${tablePrefix}-consent`,
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // WebhookSubscriptions table: accountID (PK), webhookId (SK)
    this.webhookSubscriptionsTable = new dynamodb.Table(this, 'WebhookSubscriptionsTable', {
      tableName: `${tablePrefix}-webhook-subscriptions`,
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'webhookId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // DeviceTokens table: accountID (PK), deviceToken (SK)
    this.deviceTokensTable = new dynamodb.Table(this, 'DeviceTokensTable', {
      tableName: `${tablePrefix}-device-tokens`,
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'deviceToken', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // AccountProfiles table: accountID (PK)
    this.accountProfilesTable = new dynamodb.Table(this, 'AccountProfilesTable', {
      tableName: `${tablePrefix}-account-profiles`,
      partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ============================================================================
    // PHASE 2 PLACEHOLDER: VERIFIED DATABASE TABLE (2027 Roadmap)
    // ============================================================================
    //
    // TODO: Create Verified Database table for storing verified subject records
    // This table will integrate with AWS Rekognition for face recognition and
    // local threat management, replacing/enhancing the current Captis API integration.
    //
    // Table Schema:
    // - Partition Key: subjectId (STRING) - Unique subject identifier
    // - Sort Key: verificationId (STRING) - Unique verification record ID
    // - Attributes:
    //   * accountID (STRING) - Account that verified this subject
    //   * rekognitionFaceId (STRING) - Rekognition face index ID
    //   * faceImageUrl (STRING) - S3 URL to face image (encrypted)
    //   * metadata (MAP) - Subject metadata (name, aliases, crimes, etc.)
    //   * verifiedAt (STRING) - ISO timestamp of verification
    //   * verifiedBy (STRING) - User/system that performed verification
    //   * createdAt (STRING) - ISO timestamp of record creation
    //   * updatedAt (STRING) - ISO timestamp of last update
    //
    // Global Secondary Indexes:
    // 1. accountID-index:
    //    - Partition Key: accountID
    //    - Sort Key: createdAt
    //    - Purpose: Query all verified subjects for an account
    //
    // 2. rekognitionFaceId-index:
    //    - Partition Key: rekognitionFaceId
    //    - Purpose: Lookup subject by Rekognition face ID
    //
    // Example implementation:
    // this.verifiedDbTable = new dynamodb.Table(this, 'VerifiedDbTable', {
    //   tableName: `${tablePrefix}-verified-db`,
    //   partitionKey: { name: 'subjectId', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'verificationId', type: dynamodb.AttributeType.STRING },
    //   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    //   encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
    //   encryptionKey: this.encryptionKey,
    //   pointInTimeRecovery: true,
    //   removalPolicy: cdk.RemovalPolicy.RETAIN,
    // });
    //
    // // Add GSI for account-based queries
    // this.verifiedDbTable.addGlobalSecondaryIndex({
    //   indexName: 'accountID-index',
    //   partitionKey: { name: 'accountID', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    // });
    //
    // // Add GSI for Rekognition face ID lookups
    // this.verifiedDbTable.addGlobalSecondaryIndex({
    //   indexName: 'rekognitionFaceId-index',
    //   partitionKey: { name: 'rekognitionFaceId', type: dynamodb.AttributeType.STRING },
    // });
    //
    // Integration Points:
    // - AWS Rekognition: Face detection, indexing, and search
    // - S3: Store encrypted face images
    // - Lambda: Face indexing handler, migration handler
    // - EventBridge: Trigger face indexing on new verified subjects
    //
    // Migration Strategy:
    // - Migrate high-confidence Captis matches (>89%) to Verified DB
    // - Index faces into Rekognition collection during migration
    // - Maintain backward compatibility with Captis API
    // - Gradual rollout with feature flag (SCAN_MODE env var)
    //
    // ============================================================================
  }
}

