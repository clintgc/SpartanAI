import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaFunctions } from './lambda-functions';
import { ApiGateway } from './api-gateway';
import { DynamoDbTables } from './dynamodb-tables';

export interface CloudWatchDashboardProps {
  lambdaFunctions: LambdaFunctions;
  apiGateway: ApiGateway;
  tables: DynamoDbTables;
}

export class CloudWatchDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: CloudWatchDashboardProps) {
    super(scope, id);

    const tablePrefix = 'spartan-ai';

    // Create comprehensive operational dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'OperationalDashboard', {
      dashboardName: 'SpartanAI-Operational',
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // ============================================================================
    // WIDGET 1: Lambda Function Metrics
    // ============================================================================
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [
          props.lambdaFunctions.scanHandler.metricInvocations({ label: 'Scan Handler' }),
          props.lambdaFunctions.pollHandler.metricInvocations({ label: 'Poll Handler' }),
          props.lambdaFunctions.alertHandler.metricInvocations({ label: 'Alert Handler' }),
          props.lambdaFunctions.emailAggregator.metricInvocations({ label: 'Email Aggregator' }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          props.lambdaFunctions.scanHandler.metricErrors({ label: 'Scan Handler' }),
          props.lambdaFunctions.pollHandler.metricErrors({ label: 'Poll Handler' }),
          props.lambdaFunctions.alertHandler.metricErrors({ label: 'Alert Handler' }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (p99)',
        left: [
          props.lambdaFunctions.scanHandler.metricDuration({ label: 'Scan Handler', statistic: 'p99' }),
          props.lambdaFunctions.pollHandler.metricDuration({ label: 'Poll Handler', statistic: 'p99' }),
          props.lambdaFunctions.alertHandler.metricDuration({ label: 'Alert Handler', statistic: 'p99' }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Throttles',
        left: [
          props.lambdaFunctions.scanHandler.metricThrottles({ label: 'Scan Handler' }),
          props.lambdaFunctions.pollHandler.metricThrottles({ label: 'Poll Handler' }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // ============================================================================
    // WIDGET 2: API Gateway Metrics
    // ============================================================================
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          props.apiGateway.restApi.metricCount({ label: 'Total Requests', statistic: 'Sum' }),
          props.apiGateway.restApi.metricCount({ label: '4xx Errors', statistic: 'Sum', dimensionsMap: { ApiName: props.apiGateway.restApi.restApiName } }),
          props.apiGateway.restApi.metricCount({ label: '5xx Errors', statistic: 'Sum', dimensionsMap: { ApiName: props.apiGateway.restApi.restApiName } }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [
          props.apiGateway.restApi.metricLatency({ label: 'p50', statistic: 'p50' }),
          props.apiGateway.restApi.metricLatency({ label: 'p95', statistic: 'p95' }),
          props.apiGateway.restApi.metricLatency({ label: 'p99', statistic: 'p99' }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // ============================================================================
    // WIDGET 3: DynamoDB Metrics
    // ============================================================================
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        left: [
          props.tables.scansTable.metricConsumedReadCapacityUnits({ label: 'Scans Table Reads' }),
          props.tables.scansTable.metricConsumedWriteCapacityUnits({ label: 'Scans Table Writes' }),
          props.tables.quotasTable.metricConsumedReadCapacityUnits({ label: 'Quotas Table Reads' }),
          props.tables.quotasTable.metricConsumedWriteCapacityUnits({ label: 'Quotas Table Writes' }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Throttles',
        left: [
          props.tables.scansTable.metricUserErrors({ label: 'Scans Table Errors' }),
          props.tables.quotasTable.metricUserErrors({ label: 'Quotas Table Errors' }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ReadThrottleEvents',
            dimensionsMap: { TableName: props.tables.scansTable.tableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Scans Table Read Throttles',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'WriteThrottleEvents',
            dimensionsMap: { TableName: props.tables.scansTable.tableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Scans Table Write Throttles',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // ============================================================================
    // WIDGET 4: Business Metrics (Custom Metrics)
    // ============================================================================
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Scans Per Hour',
        left: [
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'ScansPerHour',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
            label: 'Scans/Hour',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Quota Usage',
        left: [
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'QuotaUsage',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Average Quota Usage %',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Match Score Distribution',
        left: [
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'MatchScore',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Average Match Score',
          }),
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'HighThreatMatches',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'High Threat Matches (>89%)',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // ============================================================================
    // WIDGET 5: Alert & Notification Metrics
    // ============================================================================
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SNS Message Delivery',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfMessagesPublished',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Messages Published',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfNotificationsDelivered',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Notifications Delivered',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfNotificationsFailed',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Notifications Failed',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Alert Delivery Rates',
        left: [
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'TwilioSuccessRate',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Twilio SMS Success Rate',
          }),
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'FCMSuccessRate',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'FCM Push Success Rate',
          }),
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'WebhookDeliveryRate',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Webhook Delivery Rate',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // ============================================================================
    // WIDGET 6: External API Health
    // ============================================================================
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Captis API Health',
        left: [
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'CaptisRequestCount',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Captis Requests',
          }),
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'CaptisErrorRate',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Captis Error Rate',
          }),
          new cloudwatch.Metric({
            namespace: 'SpartanAI',
            metricName: 'CaptisLatency',
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
            label: 'Captis Latency (p99)',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // Output dashboard URL
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${cdk.Aws.REGION}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Operational Dashboard URL',
      exportName: 'SpartanAI-Operational-Dashboard-Url',
    });
  }
}

