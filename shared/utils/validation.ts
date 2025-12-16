import { z } from 'zod';

/**
 * Validation schemas for API requests using Zod
 * These schemas provide runtime type validation and prevent injection attacks
 */

// Location schema
export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  lon: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
});

// Scan request schema - matches ScanRequest interface
export const ScanRequestSchema = z.object({
  image: z.string().min(1, 'Image is required').refine(
    (val) => {
      // Allow base64 strings or HTTP/HTTPS URLs
      return val.startsWith('http://') || 
             val.startsWith('https://') || 
             val.length > 100; // Base64 strings are typically longer
    },
    { message: 'Image must be a valid base64 string or HTTP/HTTPS URL' }
  ),
  metadata: z.object({
    accountID: z.string().uuid('Invalid accountID format'),
    cameraID: z.string().min(1, 'CameraID is required').max(100, 'CameraID too long'),
    location: LocationSchema,
    timestamp: z.string().datetime('Invalid timestamp format (ISO8601 required)').optional(),
  }),
});

// Consent request schema
export const ConsentRequestSchema = z.object({
  accountID: z.string().uuid('Invalid accountID format'),
  consent: z.boolean(),
  consentType: z.enum(['data_processing', 'marketing', 'analytics']).optional(),
});

// Webhook registration schema
export const WebhookRegistrationSchema = z.object({
  webhookUrl: z.string().url('Invalid webhook URL format'),
  accountID: z.string().uuid('Invalid accountID format').optional(),
  enabled: z.boolean().default(true),
});

// Query parameters schema for scan list
export const ScanListQuerySchema = z.object({
  accountID: z.string().uuid('Invalid accountID format'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  nextToken: z.string().optional(),
});

// Scan ID parameter schema
export const ScanIdParamSchema = z.object({
  id: z.string().uuid('Invalid scan ID format'),
});

/**
 * Helper function to validate and parse request data
 * Throws ZodError with detailed validation messages if validation fails
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Helper function to safely validate request data
 * Returns validation result without throwing
 */
export function safeValidateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod validation errors for API responses
 */
export function formatValidationError(error: z.ZodError): {
  error: string;
  message: string;
  details: Array<{ field: string; message: string }>;
} {
  return {
    error: 'Validation Error',
    message: 'Request validation failed',
    details: error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    })),
  };
}

