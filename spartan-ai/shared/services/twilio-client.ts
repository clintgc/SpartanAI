import twilio from 'twilio';
import { Twilio } from 'twilio';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export interface SendSmsOptions {
  to: string; // E.164 format phone number
  body: string;
}

export interface SendSmsResult {
  messageSid: string;
  status: string;
  to: string;
}

export class TwilioClient {
  private client: Twilio;
  private phoneNumber: string;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
  }

  /**
   * Send SMS message
   * Phone number must be in E.164 format (e.g., +1234567890)
   */
  async sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
    try {
      // Validate E.164 format
      if (!this.isE164Format(options.to)) {
        throw new Error(`Invalid phone number format. Expected E.164 format, got: ${options.to}`);
      }

      const message = await this.client.messages.create({
        body: options.body,
        to: options.to,
        from: this.phoneNumber,
      });

      return {
        messageSid: message.sid,
        status: message.status,
        to: message.to,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Twilio SMS error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate E.164 phone number format
   * E.164 format: +[country code][number] (e.g., +1234567890)
   */
  private isE164Format(phoneNumber: string): boolean {
    // E.164 regex: starts with +, followed by 1-15 digits
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Format phone number to E.164 if needed
   * This is a helper - actual formatting should be done at account creation
   */
  formatToE164(phoneNumber: string, defaultCountryCode: string = '+1'): string {
    // Remove all non-digit characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // If already starts with +, return as is
    if (cleaned.startsWith('+')) {
      return cleaned;
    }

    // Add default country code if not present
    return `${defaultCountryCode}${cleaned}`;
  }
}

