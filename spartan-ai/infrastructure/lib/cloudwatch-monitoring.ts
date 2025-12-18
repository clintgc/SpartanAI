import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaFunctions } from './lambda-functions';

export interface CloudWatchMonitoringProps {
  lambdaFunctions: LambdaFunctions;
  alarmEmail?: string;
}

export class CloudWatchMonitoring extends Construct {
  public readonly alarms: cloudwatch.Alarm[] = [];

  constructor(scope: Construct, id: string, props: CloudWatchMonitoringProps) {
    super(scope, id);

    // SNS topic for alarm notifications
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'spartan-ai-alarms',
      displayName: 'Spartan AI CloudWatch Alarms',
    });

    if (props.alarmEmail) {
      alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alarmEmail)
      );
    }

    const alarmAction = new cloudwatchActions.SnsAction(alarmTopic);

    // Captis API error rate alarm (>1% in 5 min window)
    const captisErrorAlarm = new cloudwatch.Alarm(this, 'CaptisErrorRateAlarm', {
      alarmName: 'spartan-ai-captis-error-rate',
      alarmDescription: 'Captis API 4xx/5xx error rate exceeds 1%',
      metric: new cloudwatch.Metric({
        namespace: 'SpartanAI',
        metricName: 'CaptisErrorRate',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.01, // 1%
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    captisErrorAlarm.addAlarmAction(alarmAction);
    this.alarms.push(captisErrorAlarm);

    // Twilio delivery failure rate alarm (>0.5% in 5 min window)
    const twilioFailureAlarm = new cloudwatch.Alarm(this, 'TwilioFailureRateAlarm', {
      alarmName: 'spartan-ai-twilio-failure-rate',
      alarmDescription: 'Twilio SMS delivery failure rate exceeds 0.5%',
      metric: new cloudwatch.Metric({
        namespace: 'SpartanAI',
        metricName: 'TwilioFailureRate',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.005, // 0.5%
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    twilioFailureAlarm.addAlarmAction(alarmAction);
    this.alarms.push(twilioFailureAlarm);

    // Lambda error alarms
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'spartan-ai-lambda-errors',
      alarmDescription: 'Lambda function errors detected',
      metric: props.lambdaFunctions.scanHandler.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    lambdaErrorAlarm.addAlarmAction(alarmAction);
    this.alarms.push(lambdaErrorAlarm);

    // API Gateway latency alarm (>5s p99)
    // Note: This would be configured in API Gateway monitoring

    // DynamoDB throttles alarm
    // Note: This would be configured per table

    // Cost monitoring dashboard (created separately)
  }
}

