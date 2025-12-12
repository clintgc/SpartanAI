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
  DeleteCommand,
  QueryCommand as DocQueryCommand,
  ScanCommand as DocScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  QuotaRecord,
  ConsentRecord,
  ThreatLocation,
  WebhookSubscription,
  DeviceToken,
  AccountProfile,
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

  // Device token operations
  async getDeviceTokens(accountID: string): Promise<DeviceToken[]> {
    const result = await this.docClient.send(
      new DocQueryCommand({
        TableName: `${this.tablePrefix}-device-tokens`,
        KeyConditionExpression: 'accountID = :accountID',
        ExpressionAttributeValues: {
          ':accountID': accountID,
        },
      })
    );
    return (result.Items || []) as DeviceToken[];
  }

  async registerDeviceToken(
    accountID: string,
    deviceToken: string,
    platform?: 'ios' | 'android' | 'web',
    appVersion?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.docClient.send(
      new PutCommand({
        TableName: `${this.tablePrefix}-device-tokens`,
        Item: {
          accountID,
          deviceToken,
          platform,
          appVersion,
          registeredAt: timestamp,
          lastUsedAt: timestamp,
        },
      })
    );
  }

  async updateDeviceTokenLastUsed(accountID: string, deviceToken: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: `${this.tablePrefix}-device-tokens`,
        Key: { accountID, deviceToken },
        UpdateExpression: 'SET lastUsedAt = :lastUsed',
        ExpressionAttributeValues: {
          ':lastUsed': new Date().toISOString(),
        },
      })
    );
  }

  async removeDeviceToken(accountID: string, deviceToken: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: `${this.tablePrefix}-device-tokens`,
        Key: { accountID, deviceToken },
      })
    );
  }

  // Account profile operations
  async getAccountProfile(accountID: string): Promise<AccountProfile | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: `${this.tablePrefix}-account-profiles`,
        Key: { accountID },
      })
    );
    return result.Item as AccountProfile | null;
  }

  async updateAccountProfile(profile: AccountProfile): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.docClient.send(
      new PutCommand({
        TableName: `${this.tablePrefix}-account-profiles`,
        Item: {
          ...profile,
          updatedAt: timestamp,
          createdAt: profile.createdAt || timestamp,
        },
      })
    );
  }
}

