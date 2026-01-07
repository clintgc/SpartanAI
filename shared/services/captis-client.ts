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

      // The GET /scan/{id} endpoint returns { scan: {...} } structure
      // The scan object contains: id, photo, biometrics, recordList (matches)
      // We need to transform it to match CaptisResolveResponse format
      interface CaptisScanResponse {
        scan: {
          id: string;
          photo?: string;
          biometrics?: any;
          recordList?: Array<{
            match: {
              id: string;
              score: number;
              scoreLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
              subjectId: string;
            };
            subject: {
              id: string;
              name: string;
              nameLine?: string;
              type: string;
              photo?: string;
            };
          }>;
          status?: string;
          viewMatchesUrl?: string;
        };
      }

      const response = await this.client.get<CaptisScanResponse>(
        `/pub/asi/v4/scan/${scanId}?${params.toString()}`
      );

      const scanData = response.data.scan;
      
      // Transform recordList to matches format
      // recordList contains { match: { score, scoreLevel }, subject: { name, type } }
      const matches = scanData.recordList?.map(record => ({
        id: record.match.id || record.subject.id,
        score: record.match.score,
        scoreLevel: record.match.scoreLevel || (record.match.score > 89 ? 'HIGH' : record.match.score > 70 ? 'MEDIUM' : 'LOW'),
        subject: {
          id: record.subject.id,
          name: record.subject.name || record.subject.nameLine || 'Unknown',
          type: record.subject.type,
          photo: record.subject.photo,
        },
      })) || [];

      // Extract crimes from scan data if available
      // Crimes might be in scanData.crimes or scanData.recordList[].crimes
      let crimes: Array<{ description: string; type: string; date: string; status: string }> | undefined;
      if (scanData.recordList && scanData.recordList.length > 0) {
        // Try to get crimes from the top match's record
        const topRecord = scanData.recordList[0];
        const topRecordAny = topRecord as any;
        if (topRecordAny.crimes && Array.isArray(topRecordAny.crimes)) {
          crimes = topRecordAny.crimes.map((crime: any) => ({
            description: crime.description || '',
            type: crime.type || '',
            date: crime.date || '',
            status: crime.status || '',
          }));
        }
      }
      // Also check if crimes are at the scan level
      const scanDataAny = scanData as any;
      if (!crimes && scanDataAny.crimes) {
        crimes = Array.isArray(scanDataAny.crimes) 
          ? scanDataAny.crimes.map((crime: any) => ({
              description: crime.description || '',
              type: crime.type || '',
              date: crime.date || '',
              status: crime.status || '',
            }))
          : typeof scanDataAny.crimes === 'object' && !Array.isArray(scanDataAny.crimes)
          ? [{
              description: scanDataAny.crimes.description || '',
              type: scanDataAny.crimes.type || '',
              date: scanDataAny.crimes.date || '',
              status: scanDataAny.crimes.status || '',
            }]
          : [];
      }
      
      // Return in CaptisResolveResponse format
      return {
        id: scanData.id,
        status: scanData.status || 'COMPLETED',
        matches: matches.length > 0 ? matches : undefined,
        biometrics: scanData.biometrics ? (Array.isArray(scanData.biometrics) ? scanData.biometrics : [scanData.biometrics]) : undefined,
        crimes: crimes && crimes.length > 0 ? crimes : undefined,
        viewMatchesUrl: scanData.viewMatchesUrl,
        timedOutFlag: false,
      } as CaptisResolveResponse;
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
    let lastResult: CaptisResolveResponse | null = null;

    while (Date.now() - startTime < maxDuration) {
      try {
        const result = await this.pollScan(scanId);
        lastResult = result;

        console.log(`[CaptisClient] Poll result: status=${result.status}, matches=${result.matches?.length || 0}, timedOutFlag=${result.timedOutFlag}`);
        
        // Check if we have matches - if yes, return immediately
        if (result.matches && result.matches.length > 0) {
          console.log(`[CaptisClient] Found ${result.matches.length} matches, top score: ${result.matches[0].score}%, returning result.`);
          return result;
        }

        // Check if still processing
        if (result.timedOutFlag === true || result.status === 'PENDING' || result.status === 'PROCESSING') {
          // Wait before next poll
          await this.sleep(delay);
          // Exponential backoff: increase delay up to 30 seconds
          delay = Math.min(delay * 1.5, 30000);
          continue;
        }

        // Status is COMPLETED but no matches - wait and poll again
        // Captis sometimes returns COMPLETED before matches are ready
        if (result.status === 'COMPLETED' && (!result.matches || result.matches.length === 0)) {
          console.log(`[CaptisClient] Status COMPLETED but no matches yet. Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
          // Exponential backoff: increase delay up to 30 seconds
          delay = Math.min(delay * 1.5, 30000);
          continue;
        }

        // Completed with matches or failed
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // For 400 errors, wait and retry - results might appear later
        // Captis can return 400 when polling too early, but results may come later
        // However, if we've retried multiple times and still get 400, the scan might not be pollable
        if (lastError.message.includes('400')) {
          const elapsed = Date.now() - startTime;
          // If we've been trying for more than 30 seconds and still getting 400, 
          // the scan might not support polling - return empty result
          if (elapsed > 30000 && delay >= 10000) {
            console.log(`[CaptisClient] Poll returned 400 after ${elapsed}ms - scan may not support polling. Returning empty result.`);
            return {
              id: scanId,
              status: 'COMPLETED',
              matches: [],
            } as CaptisResolveResponse;
          }
          console.log(`[CaptisClient] Poll returned 400 - waiting ${delay}ms before retry (results may appear later)...`);
          await this.sleep(delay);
          delay = Math.min(delay * 1.5, 30000);
          continue;
        }
        
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

    // Timeout reached - return last result if we have one, otherwise throw
    if (lastResult) {
      console.log(`[CaptisClient] Polling timeout reached. Returning last result (may have no matches).`);
      return lastResult;
    }

    throw new Error(`Polling timeout after ${maxDuration}ms. Last error: ${lastError?.message || 'Unknown'}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

