import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaFunctions } from './lambda-functions';
import { DynamoDbTables } from './dynamodb-tables';
import { ApiGateway } from './api-gateway';

export interface CostMonitoringProps {
  lambdaFunctions: LambdaFunctions;
  tables: DynamoDbTables;
  apiGateway: ApiGateway;
  budgetThreshold?: number; // Monthly budget in USD
  alarmEmail?: string; // Email for budget alarm notifications
}

export class CostMonitoring extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly budgetAlarm?: cloudwatch.Alarm;
  public readonly forecastAlarm?: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: CostMonitoringProps) {
    super(scope, id);

    // Create SNS topic for cost alarms
    const costAlarmTopic = new sns.Topic(this, 'CostAlarmTopic', {
      topicName: 'spartan-ai-cost-alarms',
      displayName: 'Spartan AI Cost Alarms',
    });

    if (props.alarmEmail) {
      costAlarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alarmEmail)
      );
    }

    const alarmAction = new cloudwatchActions.SnsAction(costAlarmTopic);

    // Create comprehensive cost dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: 'SpartanAI-CostMonitoring',
    });

    // ===== LAMBDA METRICS =====
    
    // Lambda Duration Widget (all functions)
    const lambdaDurationWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Duration (ms)',
      left: [
        props.lambdaFunctions.scanHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.pollHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.alertHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.emailAggregator.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.webhookDispatcher.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.scanDetailHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.scanListHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.consentHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.webhookRegistrationHandler.metricDuration({ statistic: 'Average' }),
        props.lambdaFunctions.gdprDeletionHandler.metricDuration({ statistic: 'Average' }),
      ],
      leftYAxis: {
        label: 'Duration (ms)',
      },
      period: cdk.Duration.hours(1),
    });

    // Lambda Requests Widget (all functions)
    const lambdaRequestsWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Invocations (Requests)',
      left: [
        props.lambdaFunctions.scanHandler.metricInvocations(),
        props.lambdaFunctions.pollHandler.metricInvocations(),
        props.lambdaFunctions.alertHandler.metricInvocations(),
        props.lambdaFunctions.emailAggregator.metricInvocations(),
        props.lambdaFunctions.webhookDispatcher.metricInvocations(),
        props.lambdaFunctions.scanDetailHandler.metricInvocations(),
        props.lambdaFunctions.scanListHandler.metricInvocations(),
        props.lambdaFunctions.consentHandler.metricInvocations(),
        props.lambdaFunctions.webhookRegistrationHandler.metricInvocations(),
        props.lambdaFunctions.gdprDeletionHandler.metricInvocations(),
      ],
      leftYAxis: {
        label: 'Invocations',
      },
      period: cdk.Duration.hours(1),
    });

    // Lambda Errors Widget
    const lambdaErrorsWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Errors',
      left: [
        props.lambdaFunctions.scanHandler.metricErrors(),
        props.lambdaFunctions.pollHandler.metricErrors(),
        props.lambdaFunctions.alertHandler.metricErrors(),
      ],
      leftYAxis: {
        label: 'Errors',
      },
      period: cdk.Duration.hours(1),
    });

    // Lambda Throttles Widget
    const lambdaThrottlesWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Throttles',
      left: [
        props.lambdaFunctions.scanHandler.metricThrottles(),
        props.lambdaFunctions.pollHandler.metricThrottles(),
        props.lambdaFunctions.alertHandler.metricThrottles(),
      ],
      leftYAxis: {
        label: 'Throttles',
      },
      period: cdk.Duration.hours(1),
    });

    // ===== DYNAMODB METRICS =====

    // DynamoDB Read Capacity Units (all tables)
    const dynamoDbReadWidget = new cloudwatch.GraphWidget({
      title: 'DynamoDB Read Capacity Units',
      left: [
        props.tables.scansTable.metricConsumedReadCapacityUnits(),
        props.tables.quotasTable.metricConsumedReadCapacityUnits(),
        props.tables.threatLocationsTable.metricConsumedReadCapacityUnits(),
        props.tables.consentTable.metricConsumedReadCapacityUnits(),
        props.tables.webhookSubscriptionsTable.metricConsumedReadCapacityUnits(),
        props.tables.deviceTokensTable.metricConsumedReadCapacityUnits(),
        props.tables.accountProfilesTable.metricConsumedReadCapacityUnits(),
      ],
      leftYAxis: {
        label: 'Read Capacity Units',
      },
      period: cdk.Duration.hours(1),
    });

    // DynamoDB Write Capacity Units (all tables)
    const dynamoDbWriteWidget = new cloudwatch.GraphWidget({
      title: 'DynamoDB Write Capacity Units',
      left: [
        props.tables.scansTable.metricConsumedWriteCapacityUnits(),
        props.tables.quotasTable.metricConsumedWriteCapacityUnits(),
        props.tables.threatLocationsTable.metricConsumedWriteCapacityUnits(),
        props.tables.consentTable.metricConsumedWriteCapacityUnits(),
        props.tables.webhookSubscriptionsTable.metricConsumedWriteCapacityUnits(),
        props.tables.deviceTokensTable.metricConsumedWriteCapacityUnits(),
        props.tables.accountProfilesTable.metricConsumedWriteCapacityUnits(),
      ],
      leftYAxis: {
        label: 'Write Capacity Units',
      },
      period: cdk.Duration.hours(1),
    });

    // DynamoDB Throttles Widget
    const dynamoDbThrottlesWidget = new cloudwatch.GraphWidget({
      title: 'DynamoDB Throttles',
      left: [
        props.tables.scansTable.metricUserErrors({ statistic: 'Sum' }),
        props.tables.quotasTable.metricUserErrors({ statistic: 'Sum' }),
      ],
      leftYAxis: {
        label: 'Throttles',
      },
      period: cdk.Duration.hours(1),
    });

    // ===== API GATEWAY METRICS =====

    const apiGatewayRequestsWidget = new cloudwatch.GraphWidget({
      title: 'API Gateway Requests',
      left: [
        props.apiGateway.restApi.metricCount(),
      ],
      leftYAxis: {
        label: 'Requests',
      },
      period: cdk.Duration.hours(1),
    });

    const apiGatewayLatencyWidget = new cloudwatch.GraphWidget({
      title: 'API Gateway Latency (ms)',
      left: [
        props.apiGateway.restApi.metricLatency({ statistic: 'p99' }),
        props.apiGateway.restApi.metricLatency({ statistic: 'p95' }),
        props.apiGateway.restApi.metricLatency({ statistic: 'Average' }),
      ],
      leftYAxis: {
        label: 'Latency (ms)',
      },
      period: cdk.Duration.hours(1),
    });

    // ===== COST BREAKDOWN WIDGET (PIE CHART) =====

    // Create estimated cost metrics for each service using Billing metrics
    // Note: Billing metrics with ServiceName dimension show costs per service
    const lambdaCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      statistic: 'Maximum',
      period: cdk.Duration.days(1),
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: 'AWSLambda',
      },
      region: 'us-east-1',
      label: 'Lambda',
    });

    const dynamoDbCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      statistic: 'Maximum',
      period: cdk.Duration.days(1),
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: 'AmazonDynamoDB',
      },
      region: 'us-east-1',
      label: 'DynamoDB',
    });

    const apiGatewayCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      statistic: 'Maximum',
      period: cdk.Duration.days(1),
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: 'AmazonApiGateway',
      },
      region: 'us-east-1',
      label: 'API Gateway',
    });

    // Cost breakdown pie chart widget
    // Using GraphWidget with service-specific Billing metrics
    // This widget displays cost breakdown by service (Lambda/DynamoDB/API Gateway)
    // and can be converted to pie chart view in CloudWatch console
    const costBreakdownPieChartWidget = new cloudwatch.GraphWidget({
      title: 'Cost Breakdown by Service (Pie Chart)',
      left: [
        lambdaCostMetric,
        dynamoDbCostMetric,
        apiGatewayCostMetric,
      ],
      leftYAxis: {
        label: 'Cost (USD)',
      },
      period: cdk.Duration.days(1),
      stacked: false, // Individual metrics for pie chart visualization
    });

    // Note: To view as pie chart in CloudWatch console:
    // 1. Open the dashboard in CloudWatch
    // 2. Click on the widget
    // 3. Click "Edit" → "Visualization type" → Select "Pie chart"
    // The widget uses Billing metrics with ServiceName dimension for accurate cost breakdown

    // ===== COST ESTIMATION WIDGET =====

    // Estimated monthly cost widget (based on usage patterns)
    // Note: This is a simplified estimation - actual costs depend on many factors
    const estimatedCostWidget = new cloudwatch.GraphWidget({
      title: 'Cost Estimation (Monthly Projection)',
      left: [
        // Sum of all Lambda invocations for cost estimation
        new cloudwatch.MathExpression({
          expression: 'SUM([scanHandler, pollHandler, alertHandler, emailAggregator, webhookDispatcher, scanDetailHandler, scanListHandler, consentHandler, webhookRegistrationHandler, gdprDeletionHandler])',
          usingMetrics: {
            scanHandler: props.lambdaFunctions.scanHandler.metricInvocations(),
            pollHandler: props.lambdaFunctions.pollHandler.metricInvocations(),
            alertHandler: props.lambdaFunctions.alertHandler.metricInvocations(),
            emailAggregator: props.lambdaFunctions.emailAggregator.metricInvocations(),
            webhookDispatcher: props.lambdaFunctions.webhookDispatcher.metricInvocations(),
            scanDetailHandler: props.lambdaFunctions.scanDetailHandler.metricInvocations(),
            scanListHandler: props.lambdaFunctions.scanListHandler.metricInvocations(),
            consentHandler: props.lambdaFunctions.consentHandler.metricInvocations(),
            webhookRegistrationHandler: props.lambdaFunctions.webhookRegistrationHandler.metricInvocations(),
            gdprDeletionHandler: props.lambdaFunctions.gdprDeletionHandler.metricInvocations(),
          },
          period: cdk.Duration.days(1),
          label: 'Total Lambda Invocations (daily)',
        }),
      ],
      leftYAxis: {
        label: 'Invocations',
      },
      period: cdk.Duration.days(1),
    });

    // Add all widgets to dashboard
    this.dashboard.addWidgets(
      // Row 1: Lambda metrics
      lambdaDurationWidget,
      lambdaRequestsWidget,
      lambdaErrorsWidget,
      lambdaThrottlesWidget,
      // Row 2: DynamoDB metrics
      dynamoDbReadWidget,
      dynamoDbWriteWidget,
      dynamoDbThrottlesWidget,
      // Row 3: API Gateway and Cost Breakdown Pie Chart
      apiGatewayRequestsWidget,
      apiGatewayLatencyWidget,
      costBreakdownPieChartWidget, // Pie chart widget for cost breakdown by service
      estimatedCostWidget
    );

    // ===== BUDGET SPIKE ALARM =====
    
    if (props.budgetThreshold) {
      // Calculate 20% spike threshold
      const spikeThreshold = props.budgetThreshold * 1.2;

      // Create budget alarm using AWS Billing metric
      // IMPORTANT: Billing metrics are only available in us-east-1 region
      // If your stack is in a different region, this alarm will be created in us-east-1
      // but will monitor costs for your entire AWS account
      this.budgetAlarm = new cloudwatch.Alarm(this, 'BudgetSpikeAlarm', {
        alarmName: 'spartan-ai-budget-spike-20-percent',
        alarmDescription: `Alert when monthly cost exceeds 20% of budget threshold (${spikeThreshold.toFixed(2)} USD). Budget: ${props.budgetThreshold.toFixed(2)} USD`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Billing',
          metricName: 'EstimatedCharges',
          statistic: 'Maximum',
          period: cdk.Duration.days(1),
          dimensionsMap: {
            Currency: 'USD',
          },
          // Billing metrics only available in us-east-1
          region: 'us-east-1',
        }),
        threshold: spikeThreshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Add SNS action for notifications
      this.budgetAlarm.addAlarmAction(alarmAction);
      this.budgetAlarm.addOkAction(alarmAction);

      // Also create a warning alarm at 80% of budget (early warning)
      const warningThreshold = props.budgetThreshold * 0.8;
      const budgetWarningAlarm = new cloudwatch.Alarm(this, 'BudgetWarningAlarm', {
        alarmName: 'spartan-ai-budget-warning-80-percent',
        alarmDescription: `Warning when monthly cost reaches 80% of budget threshold (${warningThreshold.toFixed(2)} USD). Budget: ${props.budgetThreshold.toFixed(2)} USD`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Billing',
          metricName: 'EstimatedCharges',
          statistic: 'Maximum',
          period: cdk.Duration.days(1),
          dimensionsMap: {
            Currency: 'USD',
          },
          region: 'us-east-1',
        }),
        threshold: warningThreshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      budgetWarningAlarm.addAlarmAction(alarmAction);
      budgetWarningAlarm.addOkAction(alarmAction);

      // ===== FORECAST-BASED ALARM =====

      // Create forecast metric: Project monthly spend based on current daily average
      // Formula: (Current daily cost) * 30 days
      const dailyCostMetric = new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        statistic: 'Average',
        period: cdk.Duration.days(1),
        dimensionsMap: {
          Currency: 'USD',
        },
        region: 'us-east-1',
      });

      // Projected monthly cost: daily average * 30 days
      const projectedMonthlyCost = new cloudwatch.MathExpression({
        expression: 'dailyCost * 30',
        usingMetrics: {
          dailyCost: dailyCostMetric,
        },
        period: cdk.Duration.days(1),
        label: 'Projected Monthly Cost (USD)',
      });

      // Forecast alarm: Alert when projected monthly cost exceeds 100% of budget
      this.forecastAlarm = new cloudwatch.Alarm(this, 'BudgetForecastAlarm', {
        alarmName: 'spartan-ai-budget-forecast-overrun',
        alarmDescription: `Alert when projected monthly cost exceeds budget threshold (${props.budgetThreshold.toFixed(2)} USD). Budget: ${props.budgetThreshold.toFixed(2)} USD`,
        metric: projectedMonthlyCost,
        threshold: props.budgetThreshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Add SNS action for forecast alarm
      this.forecastAlarm.addAlarmAction(alarmAction);
      this.forecastAlarm.addOkAction(alarmAction);

      // Add forecast widget to dashboard
      // Shows projected monthly cost based on current daily average
      // Note: Budget threshold line can be added manually in CloudWatch console
      const forecastWidget = new cloudwatch.GraphWidget({
        title: `Projected Monthly Cost vs Budget (${props.budgetThreshold.toFixed(2)} USD)`,
        left: [
          projectedMonthlyCost,
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            statistic: 'Maximum',
            period: cdk.Duration.days(1),
            dimensionsMap: {
              Currency: 'USD',
            },
            region: 'us-east-1',
            label: 'Current Monthly Cost',
          }),
        ],
        leftYAxis: {
          label: 'Cost (USD)',
          min: 0,
        },
        period: cdk.Duration.days(1),
      });

      // Add forecast widget to dashboard
      this.dashboard.addWidgets(forecastWidget);
    }

    // Output dashboard URL
    new cdk.CfnOutput(this, 'CostDashboardUrl', {
      value: `https://${cdk.Aws.REGION}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Cost Dashboard URL',
    });
  }
}

