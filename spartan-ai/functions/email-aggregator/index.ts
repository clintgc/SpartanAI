import { EventBridgeEvent } from 'aws-lambda';
import sgMail from '@sendgrid/mail';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDbService } from '../../shared/services/dynamodb-service';
import { v4 as uuidv4 } from 'uuid';
import 'source-map-support/register';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const dbService = new DynamoDbService(process.env.TABLE_PREFIX || 'spartan-ai');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

interface LowThreatMatch {
  scanId: string;
  topScore: number;
  subjectId: string;
  biometricHash?: string; // Hash of biometric data for deduplication
  viewMatchesUrl: string;
  timestamp: string;
  matchName?: string; // Subject name from match
}

interface DedupKey {
  subjectId: string;
  biometricHash?: string;
}

/**
 * Generate hash from biometric data for deduplication
 */
function generateBiometricHash(biometrics: any[]): string | undefined {
  if (!biometrics || biometrics.length === 0) {
    return undefined;
  }
  
  // Create a hash from biometric features (age, gender, position)
  const features = biometrics
    .map(bio => `${bio.age || 0}-${bio.femaleScore || 0}-${bio.x}-${bio.y}`)
    .sort()
    .join('|');
  
  // Simple hash (in production, use crypto.createHash)
  return Buffer.from(features).toString('base64').substring(0, 32);
}

/**
 * Create deduplication key from match data
 */
function createDedupKey(item: any): DedupKey {
  const subjectId = item.matches?.[0]?.subject?.id || item.subjectId || 'unknown';
  const biometricHash = generateBiometricHash(item.biometrics);
  return { subjectId, biometricHash };
}

export const handler = async (event: EventBridgeEvent<'ScheduledEvent', {}>): Promise<void> => {
  console.log('Email aggregator invoked', JSON.stringify(event, null, 2));

  try {
    // Calculate date range (past week)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all unique accountIDs that have scans from the past week
    // Scan the table to find all accounts with low-threat matches
    // In production, consider maintaining a separate accounts index for better performance
    const allScansResult = await docClient.send(
      new ScanCommand({
        TableName: process.env.SCANS_TABLE_NAME!,
        FilterExpression: 'topScore BETWEEN :minScore AND :maxScore AND createdAt >= :weekAgo',
        ExpressionAttributeValues: {
          ':minScore': 50,
          ':maxScore': 74,
          ':weekAgo': weekAgo.toISOString(),
        },
        ProjectionExpression: 'accountID',
      })
    );

    // Get unique accountIDs
    const accountIDs = Array.from(
      new Set((allScansResult.Items || []).map(item => item.accountID).filter(Boolean))
    );

    if (accountIDs.length === 0) {
      console.log('No accounts with low-threat matches found');
      return;
    }

    console.log(`Found ${accountIDs.length} account(s) with low-threat matches`);

    // Group by accountID and deduplicate by subjectId/biometrics
    const accountMatches = new Map<string, Map<string, LowThreatMatch>>();

    for (const accountID of accountIDs) {
      // Query scans for this account
      const result = await docClient.send(
        new QueryCommand({
          TableName: process.env.SCANS_TABLE_NAME!,
          IndexName: 'accountID-index',
          KeyConditionExpression: 'accountID = :accountID AND createdAt >= :weekAgo',
          FilterExpression: 'topScore BETWEEN :minScore AND :maxScore',
          ExpressionAttributeValues: {
            ':accountID': accountID,
            ':minScore': 50,
            ':maxScore': 74,
            ':weekAgo': weekAgo.toISOString(),
          },
        })
      );

      if (!accountMatches.has(accountID)) {
        accountMatches.set(accountID, new Map());
      }

      const matches = accountMatches.get(accountID)!;

      for (const item of result.Items || []) {
        // Create deduplication key from subjectId and biometrics
        const dedupKey = createDedupKey(item);
        const keyString = `${dedupKey.subjectId}-${dedupKey.biometricHash || 'no-bio'}`;
        
        const matchName = item.matches?.[0]?.subject?.name || 'Unknown Subject';
        const subjectId = dedupKey.subjectId;

        // Deduplicate: keep highest score match for each subjectId/biometric combination
        if (!matches.has(keyString) || matches.get(keyString)!.topScore < item.topScore) {
          matches.set(keyString, {
            scanId: item.scanId,
            topScore: item.topScore,
            subjectId,
            biometricHash: dedupKey.biometricHash,
            viewMatchesUrl: item.viewMatchesUrl || '',
            timestamp: item.createdAt || item.timestamp,
            matchName,
          });
        }
      }

      console.log(`Account ${accountID}: Found ${result.Items?.length || 0} matches, deduplicated to ${matches.size}`);
    }

    // Send aggregated emails
    for (const [accountID, matches] of accountMatches.entries()) {
      if (matches.size === 0) continue;

      const matchList = Array.from(matches.values());
      
      // Fetch account profile for user information
      const accountProfile = await dbService.getAccountProfile(accountID);
      
      if (!accountProfile || !accountProfile.email) {
        console.warn(`No email found for account ${accountID}, skipping email`);
        continue;
      }

      // Generate unsubscribe token if not exists
      let unsubscribeToken = accountProfile.unsubscribeToken;
      if (!unsubscribeToken) {
        unsubscribeToken = uuidv4();
        await dbService.updateAccountProfile({
          ...accountProfile,
          unsubscribeToken,
        });
      }

      // Generate personalized email HTML
      const emailHtml = generateEmailHtml(matchList, accountProfile, unsubscribeToken);

      try {
        await sgMail.send({
          to: accountProfile.email,
          from: process.env.SENDGRID_FROM_EMAIL || 'alerts@spartan-ai.com',
          subject: `Weekly Threat Summary - ${matchList.length} Potential Match${matchList.length > 1 ? 'es' : ''}`,
          html: emailHtml,
        });

        console.log(`Aggregated email sent to ${accountProfile.email} for account ${accountID} (${matchList.length} deduplicated matches)`);
      } catch (error) {
        console.error(`Failed to send email to ${accountProfile.email}:`, error);
      }
    }
  } catch (error) {
    console.error('Email aggregator error:', error);
    throw error;
  }
};

function generateEmailHtml(
  matches: LowThreatMatch[],
  accountProfile: { name?: string; email: string },
  unsubscribeToken: string
): string {
  const userName = accountProfile.name || 'Valued Customer';
  const baseUrl = process.env.API_BASE_URL || 'https://api.spartan-ai.com';
  const unsubscribeUrl = `${baseUrl}/api/v1/unsubscribe?token=${unsubscribeToken}&email=${encodeURIComponent(accountProfile.email)}`;

  const matchRows = matches
    .map(
      (match) => `
    <tr>
      <td>${match.matchName || 'Unknown Subject'}</td>
      <td>${match.topScore}%</td>
      <td><a href="${match.viewMatchesUrl}" style="color: #0066cc;">View Details</a></td>
      <td>${new Date(match.timestamp).toLocaleDateString()}</td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #1f2937;
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
          }
          .content {
            background-color: #ffffff;
            padding: 20px;
            border: 1px solid #e5e7eb;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 20px 0;
          }
          th, td { 
            border: 1px solid #e5e7eb; 
            padding: 12px; 
            text-align: left; 
          }
          th { 
            background-color: #f9fafb; 
            font-weight: 600;
          }
          .footer {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 0 0 8px 8px;
            border: 1px solid #e5e7eb;
            border-top: none;
            font-size: 12px;
            color: #6b7280;
          }
          .unsubscribe-link {
            color: #6b7280;
            text-decoration: none;
          }
          .unsubscribe-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0;">Spartan AI Security</h1>
        </div>
        <div class="content">
          <div class="greeting">
            <p>Hello ${userName},</p>
          </div>
          <p>You have <strong>${matches.length}</strong> potential threat match${matches.length > 1 ? 'es' : ''} from the past week:</p>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Match Score</th>
                <th>Details</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${matchRows}
            </tbody>
          </table>
          <p style="margin-top: 20px;">
            These matches have been automatically deduplicated to show unique subjects only.
            Click "View Details" to see more information about each match.
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0;">
            This is an automated security alert from Spartan AI.<br>
            <a href="${unsubscribeUrl}" class="unsubscribe-link">Unsubscribe from weekly threat summaries</a>
          </p>
        </div>
      </body>
    </html>
  `;
}

