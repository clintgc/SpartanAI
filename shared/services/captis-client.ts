import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { CaptisResolveResponse } from '../models';

export interface CaptisClientConfig {
  baseUrl: string;
  accessKey: string;
  timeout?: number;
}

export interface CaptisResolveOptions {
  image: Buffer | string; // Buffer for binary, string for URL
  async?: boolean;
  site?: string;
  camera?: string;
  name?: string;
  minScore?: number;
  minScoreLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  maxMatches?: number;
  minFaceSize?: number;
  timeout?: number;
  fields?: string[];
}

export class CaptisClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private accessKey: string;
  private defaultTimeout: number;
  private redirectCount: number = 0;
  private readonly MAX_REDIRECTS: number = 5;

  constructor(config: CaptisClientConfig) {
    this.baseUrl = config.baseUrl || 'https://asi-api.solveacrime.com';
    this.accessKey = config.accessKey;
    this.defaultTimeout = config.timeout || 120000; // 120 seconds

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Configure axios-retry for automatic retry logic with exponential backoff
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Retry on network errors, idempotent request errors, and 5xx server errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status !== undefined && error.response.status >= 500) ||
          error.response?.status === 429 // Rate limit
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.log(`[CaptisClient] Retry attempt ${retryCount} for ${requestConfig.url}: ${error.message}`);
      },
    });
  }

  /**
   * Resolve image with Captis ASI API
   */
  async resolve(options: CaptisResolveOptions): Promise<CaptisResolveResponse> {
    const {
      image,
      async = true,
      site,
      camera,
      name,
      minScore = 50,
      minScoreLevel,
      maxMatches = 20,
      minFaceSize,
      timeout = 120,
      fields = ['matches', 'biometrics', 'subjects-wanted', 'crimes', 'viewMatchesUrl'],
    } = options;

    const params = new URLSearchParams({
      accessKey: this.accessKey,
      async: async.toString(),
      minScore: minScore.toString(),
      maxMatches: maxMatches.toString(),
      timeout: timeout.toString(),
      fields: fields.join(','),
    });

    if (site) params.append('site', site);
    if (camera) params.append('camera', camera);
    if (name) params.append('name', name);
    if (minScoreLevel) params.append('minScoreLevel', minScoreLevel);
    if (minFaceSize) params.append('minFaceSize', minFaceSize.toString());

    try {
      // Determine if image is URL or binary
      let imageData: Buffer;
      let contentType: string;

      if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
        // Fetch image from URL
        const response = await axios.get(image, { responseType: 'arraybuffer' });
        imageData = Buffer.from(response.data);
        contentType = response.headers['content-type'] || 'image/jpeg';
      } else if (typeof image === 'string') {
        // Base64 encoded image
        imageData = Buffer.from(image, 'base64');
        contentType = 'image/jpeg'; // Default, could be determined from base64 prefix
      } else {
        // Buffer
        imageData = image;
        contentType = 'image/jpeg';
      }

      const response = await this.client.post<CaptisResolveResponse>(
        `/pub/asi/v4/resolve?${params.toString()}`,
        imageData,
        {
          headers: {
            'Content-Type': contentType,
          },
          maxRedirects: 5,
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Handle 307 redirect with redirect limit to prevent infinite loops
        if (axiosError.response?.status === 307) {
          if (this.redirectCount >= this.MAX_REDIRECTS) {
            throw new Error(`Maximum redirect limit (${this.MAX_REDIRECTS}) exceeded`);
          }
          const location = axiosError.response.headers.location;
          if (location) {
            // Update base URL and retry
            this.redirectCount++;
            this.baseUrl = new URL(location, this.baseUrl).origin;
            this.client.defaults.baseURL = this.baseUrl;
            return this.resolve(options);
          }
        }

        // Handle 503 - retry with exponential backoff
        if (axiosError.response?.status === 503) {
          throw new Error('Captis service temporarily unavailable (503). Retry recommended.');
        }

        // Handle other errors
        if (axiosError.response) {
          throw new Error(
            `Captis API error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`
          );
        }
      }

      throw error;
    }
  }

  /**
   * Poll for scan results (used when async=true and timedOutFlag=true)
   */
  async pollScan(scanId: string): Promise<CaptisResolveResponse> {
    try {
      const params = new URLSearchParams({
        accessKey: this.accessKey,
      });

      const response = await this.client.get<CaptisResolveResponse>(
        `/pub/asi/v4/scan/${scanId}?${params.toString()}`
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Handle 307 redirect with redirect limit
        if (axiosError.response?.status === 307) {
          if (this.redirectCount >= this.MAX_REDIRECTS) {
            throw new Error(`Maximum redirect limit (${this.MAX_REDIRECTS}) exceeded`);
          }
          const location = axiosError.response.headers.location;
          if (location) {
            this.redirectCount++;
            this.baseUrl = new URL(location, this.baseUrl).origin;
            this.client.defaults.baseURL = this.baseUrl;
            return this.pollScan(scanId);
          }
        }

        if (axiosError.response) {
          throw new Error(
            `Captis poll error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`
          );
        }
      }

      throw error;
    }
  }

  /**
   * Poll with exponential backoff until completion or timeout
   */
  async pollUntilComplete(
    scanId: string,
    maxDuration: number = 120000,
    initialDelay: number = 5000
  ): Promise<CaptisResolveResponse> {
    const startTime = Date.now();
    let delay = initialDelay;
    let lastError: Error | null = null;

    while (Date.now() - startTime < maxDuration) {
      try {
        const result = await this.pollScan(scanId);

        // Check if still processing
        if (result.timedOutFlag === true || result.status === 'PENDING') {
          // Wait before next poll
          await this.sleep(delay);
          // Exponential backoff: increase delay up to 30 seconds
          delay = Math.min(delay * 1.5, 30000);
          continue;
        }

        // Completed or failed
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // For 503 errors, retry with backoff
        if (lastError.message.includes('503')) {
          await this.sleep(delay);
          delay = Math.min(delay * 1.5, 30000);
          continue;
        }

        // For other errors, throw immediately
        throw lastError;
      }
    }

    // Timeout reached
    throw new Error(`Polling timeout after ${maxDuration}ms. Last error: ${lastError?.message || 'Unknown'}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

