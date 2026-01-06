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
  mediaUrl?: string; // Optional media URL for WhatsApp images
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
   * Send SMS or WhatsApp message
   * Phone number must be in E.164 format (e.g., +1234567890)
   * Supports WhatsApp if phone number is prefixed with "whatsapp:"
   */
  async sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
    try {
      // Check if using WhatsApp format
      const useWhatsApp = this.phoneNumber.startsWith('whatsapp:') || options.to.startsWith('whatsapp:');
      
      // Normalize phone numbers
      let fromNumber = this.phoneNumber;
      let toNumber = options.to;
      
      if (useWhatsApp) {
        // Ensure WhatsApp prefix
        if (!fromNumber.startsWith('whatsapp:')) {
          fromNumber = `whatsapp:${fromNumber}`;
        }
        if (!toNumber.startsWith('whatsapp:')) {
          // Validate E.164 format before adding WhatsApp prefix
          const cleanNumber = toNumber.replace(/^whatsapp:/, '');
          if (!this.isE164Format(cleanNumber)) {
            throw new Error(`Invalid phone number format. Expected E.164 format, got: ${cleanNumber}`);
          }
          toNumber = `whatsapp:${cleanNumber}`;
        }
      } else {
        // Validate E.164 format for SMS
        if (!this.isE164Format(options.to)) {
          throw new Error(`Invalid phone number format. Expected E.164 format, got: ${options.to}`);
        }
      }

      const messageOptions: any = {
        body: options.body,
        to: toNumber,
        from: fromNumber,
      };

      // Add media URL for WhatsApp if provided
      if (useWhatsApp && options.mediaUrl) {
        messageOptions.mediaUrl = [options.mediaUrl];
      }

      const message = await this.client.messages.create(messageOptions);

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

