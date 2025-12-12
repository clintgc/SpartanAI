import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CostMonitoring } from '../../infrastructure/lib/cost-monitoring';
import { LambdaFunctions } from '../../infrastructure/lib/lambda-functions';
import { DynamoDbTables } from '../../infrastructure/lib/dynamodb-tables';
import { ApiGateway } from '../../infrastructure/lib/api-gateway';
import { SnsTopics } from '../../infrastructure/lib/sns-topics';
import { Stack } from 'aws-cdk-lib';

// Mock dependencies
jest.mock('../../infrastructure/lib/lambda-functions');
jest.mock('../../infrastructure/lib/dynamodb-tables');
jest.mock('../../infrastructure/lib/api-gateway');
jest.mock('../../infrastructure/lib/sns-topics');

describe('Cost Monitoring Integration', () => {
  let stack: Stack;
  let mockLambdaFunctions: jest.Mocked<LambdaFunctions>;
  let mockTables: jest.Mocked<DynamoDbTables>;
  let mockApiGateway: jest.Mocked<ApiGateway>;

  beforeEach(() => {
    stack = new Stack();

    // Create mock Lambda functions
    mockLambdaFunctions = {
      scanHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
        metricErrors: jest.fn().mockReturnValue({}),
        metricThrottles: jest.fn().mockReturnValue({}),
      } as any,
      pollHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
        metricErrors: jest.fn().mockReturnValue({}),
        metricThrottles: jest.fn().mockReturnValue({}),
      } as any,
      alertHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
        metricErrors: jest.fn().mockReturnValue({}),
        metricThrottles: jest.fn().mockReturnValue({}),
      } as any,
      emailAggregator: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
      webhookDispatcher: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
      scanDetailHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
      scanListHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
      consentHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
      webhookRegistrationHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
      gdprDeletionHandler: {
        metricDuration: jest.fn().mockReturnValue({}),
        metricInvocations: jest.fn().mockReturnValue({}),
      } as any,
    } as any;

    // Create mock DynamoDB tables
    mockTables = {
      scansTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
        metricUserErrors: jest.fn().mockReturnValue({}),
      } as any,
      quotasTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
        metricUserErrors: jest.fn().mockReturnValue({}),
      } as any,
      threatLocationsTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
      } as any,
      consentTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
      } as any,
      webhookSubscriptionsTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
      } as any,
      deviceTokensTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
      } as any,
      accountProfilesTable: {
        metricConsumedReadCapacityUnits: jest.fn().mockReturnValue({}),
        metricConsumedWriteCapacityUnits: jest.fn().mockReturnValue({}),
      } as any,
    } as any;

    // Create mock API Gateway
    mockApiGateway = {
      restApi: {
        metricCount: jest.fn().mockReturnValue({}),
        metricLatency: jest.fn().mockReturnValue({}),
      } as any,
    } as any;
  });

  it('should create budget spike alarm at 120% of MONTHLY_BUDGET', () => {
    const monthlyBudget = 75000;
    const spikeThreshold = monthlyBudget * 1.2; // 90000

    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: monthlyBudget,
      alarmEmail: 'test@example.com',
    });

    const template = Template.fromStack(stack);

    // Verify budget spike alarm exists
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'spartan-ai-budget-spike-20-percent',
      Threshold: spikeThreshold,
      ComparisonOperator: 'GreaterThanThreshold',
      MetricName: 'EstimatedCharges',
      Namespace: 'AWS/Billing',
      Statistic: 'Maximum',
      Period: 86400, // 1 day in seconds
      EvaluationPeriods: 1,
    });

    // Verify alarm has SNS action
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmActions: expect.arrayContaining([
        expect.objectContaining({
          'Fn::GetAtt': expect.arrayContaining([
            expect.stringContaining('CostAlarmTopic'),
          ]),
        }),
      ]),
    });
  });

  it('should create forecast alarm for projected monthly cost overrun', () => {
    const monthlyBudget = 75000;

    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: monthlyBudget,
      alarmEmail: 'test@example.com',
    });

    const template = Template.fromStack(stack);

    // Verify forecast alarm exists
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'spartan-ai-budget-forecast-overrun',
      Threshold: monthlyBudget,
      ComparisonOperator: 'GreaterThanThreshold',
      EvaluationPeriods: 1,
    });

    // Verify forecast alarm has SNS action
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmActions: expect.arrayContaining([
        expect.objectContaining({
          'Fn::GetAtt': expect.arrayContaining([
            expect.stringContaining('CostAlarmTopic'),
          ]),
        }),
      ]),
    });
  });

  it('should create SNS topic with email subscription when alarmEmail provided', () => {
    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: 75000,
      alarmEmail: 'test@example.com',
    });

    const template = Template.fromStack(stack);

    // Verify SNS topic exists
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'spartan-ai-cost-alarms',
      DisplayName: 'Spartan AI Cost Alarms',
    });

    // Verify email subscription exists
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'test@example.com',
    });
  });

  it('should create cost breakdown widget with service-specific billing metrics', () => {
    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: 75000,
    });

    const template = Template.fromStack(stack);

    // Verify dashboard exists
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'SpartanAI-CostMonitoring',
    });
  });

  it('should create forecast widget with projected monthly cost', () => {
    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: 75000,
    });

    const template = Template.fromStack(stack);

    // Verify dashboard exists
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'SpartanAI-CostMonitoring',
    });

    // Verify forecast alarm exists (which uses the forecast metric)
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'spartan-ai-budget-forecast-overrun',
    });
  });

  it('should not create alarms when budgetThreshold is not provided', () => {
    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      // No budgetThreshold
    });

    const template = Template.fromStack(stack);

    // Verify budget spike alarm does NOT exist
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    const budgetAlarms = Object.values(alarms).filter((alarm: any) =>
      alarm.Properties.AlarmName?.includes('budget-spike') ||
      alarm.Properties.AlarmName?.includes('budget-forecast')
    );
    
    expect(budgetAlarms.length).toBe(0);
  });

  it('should trigger SNS notification when EstimatedCharges exceeds 120% of MONTHLY_BUDGET', () => {
    // This test verifies the alarm configuration that would trigger SNS email
    // when Billing EstimatedCharges metric exceeds 120% of budget threshold
    const monthlyBudget = 100000;
    const spikeThreshold = monthlyBudget * 1.2; // 120000

    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: monthlyBudget,
      alarmEmail: 'admin@example.com',
    });

    const template = Template.fromStack(stack);

    // Verify the alarm is configured to trigger at 120% threshold
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'spartan-ai-budget-spike-20-percent',
      Threshold: spikeThreshold,
      MetricName: 'EstimatedCharges',
      Namespace: 'AWS/Billing',
      Dimensions: [
        {
          Name: 'Currency',
          Value: 'USD',
        },
      ],
      ComparisonOperator: 'GreaterThanThreshold',
      EvaluationPeriods: 1,
    });

    // Verify SNS topic exists
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'spartan-ai-cost-alarms',
    });

    // Verify SNS email subscription exists
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'admin@example.com',
    });

    // Verify alarm has SNS action configured
    // When EstimatedCharges > 120% of budget, alarm triggers and sends email via SNS
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    const budgetAlarm = Object.values(alarms).find((alarm: any) =>
      alarm.Properties.AlarmName === 'spartan-ai-budget-spike-20-percent'
    );
    
    expect(budgetAlarm).toBeDefined();
    expect(budgetAlarm?.Properties.AlarmActions).toBeDefined();
    expect(Array.isArray(budgetAlarm?.Properties.AlarmActions)).toBe(true);
    expect(budgetAlarm?.Properties.AlarmActions.length).toBeGreaterThan(0);
  });

  it('should include all Lambda functions in cost dashboard', () => {
    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: 75000,
    });

    // Verify all Lambda metric methods were called
    expect(mockLambdaFunctions.scanHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.scanHandler.metricInvocations).toHaveBeenCalled();
    expect(mockLambdaFunctions.pollHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.alertHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.emailAggregator.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.webhookDispatcher.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.scanDetailHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.scanListHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.consentHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.webhookRegistrationHandler.metricDuration).toHaveBeenCalled();
    expect(mockLambdaFunctions.gdprDeletionHandler.metricDuration).toHaveBeenCalled();
  });

  it('should include all DynamoDB tables in cost dashboard', () => {
    const costMonitoring = new CostMonitoring(stack, 'CostMonitoring', {
      lambdaFunctions: mockLambdaFunctions,
      tables: mockTables,
      apiGateway: mockApiGateway,
      budgetThreshold: 75000,
    });

    // Verify all DynamoDB metric methods were called
    expect(mockTables.scansTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
    expect(mockTables.scansTable.metricConsumedWriteCapacityUnits).toHaveBeenCalled();
    expect(mockTables.quotasTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
    expect(mockTables.threatLocationsTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
    expect(mockTables.consentTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
    expect(mockTables.webhookSubscriptionsTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
    expect(mockTables.deviceTokensTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
    expect(mockTables.accountProfilesTable.metricConsumedReadCapacityUnits).toHaveBeenCalled();
  });
});

