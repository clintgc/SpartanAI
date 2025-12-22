import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import 'source-map-support/register';

// AWS_REGION is automatically set by Lambda runtime
const sesClient = new SESClient({});
const RECIPIENT_EMAIL = 'sales@spartan.tech';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@spartan.tech';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};

interface DemoRequest {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Demo request handler invoked', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestData: DemoRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestData.firstName || !requestData.lastName || !requestData.company || !requestData.email) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required fields: firstName, lastName, company, email' }),
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(requestData.email)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid email format' }),
      };
    }

    // Format email content
    const emailSubject = `New Demo Request from ${requestData.firstName} ${requestData.lastName}`;
    const emailBody = `
New Demo Request Received

Contact Information:
- Name: ${requestData.firstName} ${requestData.lastName}
- Company: ${requestData.company}
- Email: ${requestData.email}
${requestData.phone ? `- Phone: ${requestData.phone}` : ''}

Submitted: ${new Date().toISOString()}
    `.trim();

    // Send email via SES
    const sendEmailCommand = new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: {
        ToAddresses: [RECIPIENT_EMAIL],
      },
      Message: {
        Subject: {
          Data: emailSubject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: emailBody,
            Charset: 'UTF-8',
          },
          Html: {
            Data: `
              <html>
                <body>
                  <h2>New Demo Request Received</h2>
                  <p><strong>Name:</strong> ${requestData.firstName} ${requestData.lastName}</p>
                  <p><strong>Company:</strong> ${requestData.company}</p>
                  <p><strong>Email:</strong> <a href="mailto:${requestData.email}">${requestData.email}</a></p>
                  ${requestData.phone ? `<p><strong>Phone:</strong> ${requestData.phone}</p>` : ''}
                  <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
                </body>
              </html>
            `,
            Charset: 'UTF-8',
          },
        },
      },
    });

    await sesClient.send(sendEmailCommand);

    console.log(`Demo request email sent successfully for ${requestData.email}`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Demo request submitted successfully',
        success: true,
      }),
    };
  } catch (error) {
    console.error('Error processing demo request:', error);

    // Don't expose internal errors to client
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to submit demo request. Please try again later.',
      }),
    };
  }
};

