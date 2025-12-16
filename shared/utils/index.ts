// Shared utility functions

export function generateScanId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function validateE164Phone(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

export function getCurrentYear(): string {
  return new Date().getFullYear().toString();
}

export function calculateQuotaPercentage(used: number, limit: number): number {
  return Math.round((used / limit) * 100);
}

// Export validation utilities
export * from './validation';

