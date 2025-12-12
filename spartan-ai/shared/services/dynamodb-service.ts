import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand as DocQueryCommand,
  ScanCommand as DocScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  QuotaRecord,
  ConsentRecord,
  ThreatLocation,
  WebhookSubscription,
} from '../models';

export class DynamoDbService {
  private docClient: DynamoDBDocumentClient;
  private tablePrefix: string;

  constructor(tablePrefix: string = 'spartan-ai') {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tablePrefix = tablePrefix;
  }

  // Quota operations
  async getQuota(accountID: string, year: string): Promise<QuotaRecord | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: `${this.tablePrefix}-quotas`,
        Key: { accountID, year },
      })
    );
    return result.Item as QuotaRecord | null;
  }

  async updateQuota(
    accountID: string,
    year: string,
    scansUsed: number,
    lastWarnedAt?: string
  ): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: `${this.tablePrefix}-quotas`,
        Key: { accountID, year },
        UpdateExpression: 'SET scansUsed = :scansUsed, scansLimit = :limit' + (lastWarnedAt ? ', lastWarnedAt = :warned' : ''),
        ExpressionAttributeValues: {
          ':scansUsed': scansUsed,
          ':limit': 14400,
          ...(lastWarnedAt && { ':warned': lastWarnedAt }),
        },
      })
    );
  }

  async incrementQuota(accountID: string, year: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: `${this.tablePrefix}-quotas`,
        Key: { accountID, year },
        UpdateExpression: 'ADD scansUsed :inc SET scansLimit = :limit',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':limit': 14400,
        },
      })
    );
  }

  // Consent operations
  async getConsent(accountID: string): Promise<ConsentRecord | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: `${this.tablePrefix}-consent`,
        Key: { accountID },
      })
    );
    return result.Item as ConsentRecord | null;
  }

  async updateConsent(accountID: string, consentStatus: boolean): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: `${this.tablePrefix}-consent`,
        Item: {
          accountID,
          consentStatus,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  // Threat location operations
  async updateThreatLocation(
    subjectId: string,
    accountID: string,
    location: { lat: number; lon: number }
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Get existing record to append location
    const existing = await this.docClient.send(
      new GetCommand({
        TableName: `${this.tablePrefix}-threat-locations`,
        Key: { subjectId },
      })
    );

    const existingLocations = existing.Item?.locations || [];
    const newLocation = { ...location, timestamp };
    
    await this.docClient.send(
      new UpdateCommand({
        TableName: `${this.tablePrefix}-threat-locations`,
        Key: { subjectId },
        UpdateExpression: 'SET accountID = :accountID, lastSeenAt = :lastSeen, locations = :locations',
        ExpressionAttributeValues: {
          ':accountID': accountID,
          ':lastSeen': timestamp,
          ':locations': [...existingLocations, newLocation],
        },
      })
    );
  }

  async getThreatLocationsByAccount(accountID: string): Promise<ThreatLocation[]> {
    const result = await this.docClient.send(
      new DocQueryCommand({
        TableName: `${this.tablePrefix}-threat-locations`,
        IndexName: 'accountID-index',
        KeyConditionExpression: 'accountID = :accountID',
        ExpressionAttributeValues: {
          ':accountID': accountID,
        },
      })
    );
    return (result.Items || []) as ThreatLocation[];
  }

  // Webhook subscription operations
  async createWebhookSubscription(
    accountID: string,
    webhookId: string,
    webhookUrl: string
  ): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: `${this.tablePrefix}-webhook-subscriptions`,
        Item: {
          accountID,
          webhookId,
          webhookUrl,
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      })
    );
  }

  async getWebhookSubscriptions(accountID: string): Promise<WebhookSubscription[]> {
    const result = await this.docClient.send(
      new DocQueryCommand({
        TableName: `${this.tablePrefix}-webhook-subscriptions`,
        KeyConditionExpression: 'accountID = :accountID',
        ExpressionAttributeValues: {
          ':accountID': accountID,
        },
      })
    );
    return (result.Items || []) as WebhookSubscription[];
  }

  async updateWebhookSubscription(
    accountID: string,
    webhookId: string,
    enabled: boolean
  ): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: `${this.tablePrefix}-webhook-subscriptions`,
        Key: { accountID, webhookId },
        UpdateExpression: 'SET enabled = :enabled',
        ExpressionAttributeValues: {
          ':enabled': enabled,
        },
      })
    );
  }
}

