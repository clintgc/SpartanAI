import { EventBridgeEvent } from 'aws-lambda';
import sgMail from '@sendgrid/mail';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

interface LowThreatMatch {
  scanId: string;
  topScore: number;
  subjectId: string;
  viewMatchesUrl: string;
  timestamp: string;
}

export const handler = async (event: EventBridgeEvent<'ScheduledEvent', {}>): Promise<void> => {
  console.log('Email aggregator invoked', JSON.stringify(event, null, 2));

  try {
    // Calculate date range (past week)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Query scans table for low-threat matches (50-74%) from past week
    // This is a simplified version - in production, you'd use GSI with score range
    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        IndexName: 'accountID-index',
        KeyConditionExpression: 'accountID = :accountID',
        FilterExpression: 'topScore BETWEEN :minScore AND :maxScore AND createdAt >= :weekAgo',
        ExpressionAttributeValues: {
          ':minScore': 50,
          ':maxScore': 74,
          ':weekAgo': weekAgo.toISOString(),
        },
      })
    );

    // Group by accountID and deduplicate by subjectId
    const accountMatches = new Map<string, Map<string, LowThreatMatch>>();

    for (const item of result.Items || []) {
      const accountID = item.accountID;
      if (!accountMatches.has(accountID)) {
        accountMatches.set(accountID, new Map());
      }

      const matches = accountMatches.get(accountID)!;
      const subjectId = item.subjectId || 'unknown';

      // Deduplicate by subjectId (keep highest score)
      if (!matches.has(subjectId) || matches.get(subjectId)!.topScore < item.topScore) {
        matches.set(subjectId, {
          scanId: item.scanId,
          topScore: item.topScore,
          subjectId,
          viewMatchesUrl: item.viewMatchesUrl || '',
          timestamp: item.createdAt,
        });
      }
    }

    // Send aggregated emails
    for (const [accountID, matches] of accountMatches.entries()) {
      if (matches.size === 0) continue;

      const matchList = Array.from(matches.values());
      
      // Get user email from account profile (in production)
      const userEmail = process.env.USER_EMAIL || ''; // Should be fetched from account profile

      if (!userEmail) {
        console.warn(`No email found for account ${accountID}`);
        continue;
      }

      // Generate email HTML
      const emailHtml = generateEmailHtml(matchList);

      try {
        await sgMail.send({
          to: userEmail,
          from: process.env.SENDGRID_FROM_EMAIL || 'alerts@spartan-ai.com',
          subject: `Weekly Threat Summary - ${matchList.length} Potential Matches`,
          html: emailHtml,
        });

        console.log(`Aggregated email sent to ${userEmail} for account ${accountID}`);
      } catch (error) {
        console.error(`Failed to send email to ${userEmail}:`, error);
      }
    }
  } catch (error) {
    console.error('Email aggregator error:', error);
    throw error;
  }
};

function generateEmailHtml(matches: LowThreatMatch[]): string {
  const matchRows = matches
    .map(
      (match) => `
    <tr>
      <td>${match.topScore}%</td>
      <td><a href="${match.viewMatchesUrl}">View Details</a></td>
      <td>${new Date(match.timestamp).toLocaleDateString()}</td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>Weekly Threat Summary</h2>
        <p>You have ${matches.length} potential threat matches from the past week:</p>
        <table>
          <thead>
            <tr>
              <th>Match Score</th>
              <th>View Details</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${matchRows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

