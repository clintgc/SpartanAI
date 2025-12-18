import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDbService } from './dynamodb-service';
import { ThreatThresholdConfig, AccountProfile } from '../models';

/**
 * Default global thresholds
 */
const DEFAULT_THRESHOLDS: ThreatThresholdConfig = {
  highThreshold: 89,
  mediumThreshold: 75,
  lowThreshold: 50,
};

/**
 * Service for managing threat score thresholds with priority:
 * 1. User-level overrides (from account profile)
 * 2. Service-level defaults (from DynamoDB)
 * 3. Global defaults (from SSM or hardcoded)
 */
export class ThresholdService {
  private ssmClient: SSMClient;
  private dbService: DynamoDbService;
  private globalThresholdsCache: ThreatThresholdConfig | null = null;
  private serviceThresholdsCache: Map<string, ThreatThresholdConfig> = new Map();

  constructor(dbService: DynamoDbService) {
    this.ssmClient = new SSMClient({});
    this.dbService = dbService;
  }

  /**
   * Get thresholds for an account with priority: user > service > global
   * @param accountID - Account ID to get thresholds for
   * @param serviceId - Optional service ID (e.g., 'captis', 'rekognition')
   * @returns ThreatThresholdConfig with the highest priority thresholds
   */
  async getThresholds(
    accountID: string,
    serviceId?: string
  ): Promise<ThreatThresholdConfig> {
    // Priority 1: User-level overrides (from account profile)
    const accountProfile = await this.dbService.getAccountProfile(accountID);
    if (accountProfile?.threatThresholds) {
      console.log(`Using user-level thresholds for account ${accountID}`);
      return accountProfile.threatThresholds;
    }

    // Priority 2: Service-level defaults (from DynamoDB)
    if (serviceId) {
      const serviceThresholds = await this.getServiceThresholds(serviceId);
      if (serviceThresholds) {
        console.log(`Using service-level thresholds for service ${serviceId}`);
        return serviceThresholds;
      }
    }

    // Priority 3: Global defaults (from SSM or hardcoded)
    const globalThresholds = await this.getGlobalThresholds();
    console.log(`Using global thresholds`);
    return globalThresholds;
  }

  /**
   * Get global thresholds from SSM Parameter Store or return defaults
   */
  private async getGlobalThresholds(): Promise<ThreatThresholdConfig> {
    // Return cached value if available
    if (this.globalThresholdsCache) {
      return this.globalThresholdsCache;
    }

    // Try to get from SSM Parameter Store
    const ssmParamPath = process.env.GLOBAL_THRESHOLDS_SSM_PATH || '/spartan-ai/threat-thresholds/global';
    
    try {
      const response = await this.ssmClient.send(
        new GetParameterCommand({
          Name: ssmParamPath,
          WithDecryption: true,
        })
      );

      if (response.Parameter?.Value) {
        const parsed = JSON.parse(response.Parameter.Value) as ThreatThresholdConfig;
        // Validate thresholds
        if (this.validateThresholds(parsed)) {
          this.globalThresholdsCache = parsed;
          return parsed;
        }
      }
    } catch (error) {
      console.warn(`Failed to get global thresholds from SSM (${ssmParamPath}), using defaults:`, error);
    }

    // Fall back to hardcoded defaults
    this.globalThresholdsCache = DEFAULT_THRESHOLDS;
    return DEFAULT_THRESHOLDS;
  }

  /**
   * Get service-level thresholds from DynamoDB
   */
  private async getServiceThresholds(serviceId: string): Promise<ThreatThresholdConfig | null> {
    // Check cache first
    if (this.serviceThresholdsCache.has(serviceId)) {
      return this.serviceThresholdsCache.get(serviceId)!;
    }

    // TODO: Implement service thresholds table lookup
    // For now, return null to fall back to global defaults
    // This can be implemented when we add a service-configs table
    return null;
  }

  /**
   * Update user-level thresholds in account profile
   */
  async updateUserThresholds(
    accountID: string,
    thresholds: ThreatThresholdConfig
  ): Promise<void> {
    if (!this.validateThresholds(thresholds)) {
      throw new Error('Invalid threshold values');
    }

    const accountProfile = await this.dbService.getAccountProfile(accountID);
    if (!accountProfile) {
      throw new Error(`Account profile not found for ${accountID}`);
    }

    const updatedProfile: AccountProfile = {
      ...accountProfile,
      threatThresholds: {
        ...thresholds,
        updatedAt: new Date().toISOString(),
        updatedBy: 'user',
      },
      updatedAt: new Date().toISOString(),
    };

    await this.dbService.updateAccountProfile(updatedProfile);
  }

  /**
   * Validate threshold values
   */
  private validateThresholds(thresholds: ThreatThresholdConfig): boolean {
    const { highThreshold, mediumThreshold, lowThreshold } = thresholds;

    // Check that thresholds are numbers
    if (
      typeof highThreshold !== 'number' ||
      typeof mediumThreshold !== 'number' ||
      typeof lowThreshold !== 'number'
    ) {
      return false;
    }

    // Check that thresholds are in valid range (0-100)
    if (
      highThreshold < 0 || highThreshold > 100 ||
      mediumThreshold < 0 || mediumThreshold > 100 ||
      lowThreshold < 0 || lowThreshold > 100
    ) {
      return false;
    }

    // Check that thresholds are in correct order: high > medium > low
    if (highThreshold <= mediumThreshold || mediumThreshold <= lowThreshold) {
      return false;
    }

    return true;
  }

  /**
   * Clear caches (useful for testing or after updates)
   */
  clearCache(): void {
    this.globalThresholdsCache = null;
    this.serviceThresholdsCache.clear();
  }
}

