import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoDbTables } from './dynamodb-tables';

export interface QuotaWarningProps {
  tables: DynamoDbTables;
  alarmEmail?: string;
}

export class QuotaWarning extends Construct {
  public readonly alarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: QuotaWarningProps) {
    super(scope, id);

    // SNS topic for quota warnings
    const quotaWarningTopic = new sns.Topic(this, 'QuotaWarningTopic', {
      topicName: 'spartan-ai-quota-warnings',
      displayName: 'Spartan AI Quota Warnings',
    });

    if (props.alarmEmail) {
      quotaWarningTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alarmEmail)
      );
    }

    // CloudWatch alarm for quota usage >80% (11,520 scans)
    // Note: This is a custom metric that would be published by the scan handler
    this.alarm = new cloudwatch.Alarm(this, 'QuotaWarningAlarm', {
      alarmName: 'spartan-ai-quota-warning',
      alarmDescription: 'Account quota usage exceeds 80% (11,520 scans/year)',
      metric: new cloudwatch.Metric({
        namespace: 'SpartanAI',
        metricName: 'QuotaUsagePercentage',
        statistic: 'Maximum',
        period: cdk.Duration.hours(1),
        dimensionsMap: {
          AccountID: 'ALL', // Would be filtered per account in production
        },
      }),
      threshold: 80, // 80%
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    this.alarm.addAlarmAction(new cloudwatchActions.SnsAction(quotaWarningTopic));
  }
}

