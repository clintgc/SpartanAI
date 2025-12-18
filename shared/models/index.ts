// Shared data models for Spartan AI

export interface ScanRequest {
  image: string; // base64 or URL
  metadata: {
    cameraID: string;
    accountID: string;
    location: {
      lat: number;
      lon: number;
    };
    timestamp: string; // ISO8601
  };
}

export interface ScanResponse {
  scanId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  topScore?: number;
  viewMatchesUrl?: string;
}

export interface CaptisResolveResponse {
  id: string;
  status: string;
  matches?: Array<{
    id: string;
    score: number;
    scoreLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    subject: {
      id: string;
      name: string;
      type: string;
      photo?: string;
    };
  }>;
  biometrics?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    quality: number;
    age?: number;
    femaleScore?: number;
  }>;
  crimes?: Array<{
    description: string;
    type: string;
    date: string;
    status: string;
  }>;
  viewMatchesUrl?: string;
  timedOutFlag?: boolean;
}

export interface AlertPayload {
  scanId: string;
  topScore: number;
  matchLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  threatLocation: {
    lat: number;
    lon: number;
  };
  viewMatchesUrl: string;
  accountID: string;
}

export interface QuotaRecord {
  accountID: string;
  year: string;
  scansUsed: number;
  scansLimit: number;
  lastWarnedAt?: string;
}

export interface ConsentRecord {
  accountID: string;
  consentStatus: boolean;
  updatedAt: string;
}

export interface ThreatLocation {
  subjectId: string;
  accountID: string;
  locations: Array<{
    lat: number;
    lon: number;
    timestamp: string;
  }>;
  lastSeenAt: string;
}

export interface WebhookSubscription {
  accountID: string;
  webhookId: string;
  webhookUrl: string;
  enabled: boolean;
  createdAt: string;
}

export interface DeviceToken {
  accountID: string;
  deviceToken: string;
  platform?: 'ios' | 'android' | 'web';
  appVersion?: string;
  registeredAt: string;
  lastUsedAt?: string;
}

export interface AccountProfile {
  accountID: string;
  name?: string;
  email: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
  unsubscribeToken?: string; // For email unsubscribe links
  emailOptOut?: boolean; // GDPR compliance: User has opted out of marketing emails
  emailOptOutAt?: string; // Timestamp when user opted out
  threatThresholds?: ThreatThresholdConfig; // User-level threshold overrides
}

export interface ThreatThresholdConfig {
  highThreshold: number; // Score above which HIGH threat alerts are triggered (default: 89)
  mediumThreshold: number; // Score above which MEDIUM threat alerts are triggered (default: 75)
  lowThreshold: number; // Score above which LOW threat alerts are triggered (default: 50)
  updatedAt?: string; // Timestamp when thresholds were last updated
  updatedBy?: 'user' | 'service' | 'global'; // Who set these thresholds
}

export interface ServiceThresholdConfig {
  serviceId: string; // Service identifier (e.g., 'captis', 'rekognition')
  thresholds: ThreatThresholdConfig;
  createdAt: string;
  updatedAt: string;
}

