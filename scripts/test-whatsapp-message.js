#!/usr/bin/env node
/**
 * Test script to send a WhatsApp message using Twilio
 * Usage: node test-whatsapp-message.js
 */

const twilio = require('twilio');

// Get credentials from SSM or environment
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'YOUR_TWILIO_ACCOUNT_SID_HERE';
const authToken = process.env.TWILIO_AUTH_TOKEN || process.argv[2];
const fromNumber = process.env.TWILIO_FROM_NUMBER || 'whatsapp:+14155238886';
const toNumber = process.env.TWILIO_TO_NUMBER || 'whatsapp:+18017358534';

if (!authToken) {
  console.error('❌ Error: TWILIO_AUTH_TOKEN required');
  console.error('Usage: TWILIO_AUTH_TOKEN=your_token node test-whatsapp-message.js');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

async function sendWhatsAppMessage() {
  try {
    console.log('📱 Sending WhatsApp test message...');
    console.log(`   From: ${fromNumber}`);
    console.log(`   To: ${toNumber}`);
    console.log('');

    const message = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      body: 'Hello! This is a test WhatsApp message from Spartan AI alert system. 🚨',
    });

    console.log('✅ Message sent successfully!');
    console.log(`   Message SID: ${message.sid}`);
    console.log(`   Status: ${message.status}`);
    console.log(`   To: ${message.to}`);
    console.log('');
    console.log('📱 Check your WhatsApp for the message!');
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:');
    console.error(`   ${error.message}`);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    if (error.moreInfo) {
      console.error(`   More Info: ${error.moreInfo}`);
    }
    process.exit(1);
  }
}

sendWhatsAppMessage();

