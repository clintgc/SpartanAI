import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface SsmParametersProps {
  captisAccessKey?: string;
}

export class SsmParameters extends Construct {
  public readonly captisAccessKeyParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props?: SsmParametersProps) {
    super(scope, id);

    // Create SSM Parameter for Captis Access Key
    // Note: In production, this should be per-account, not global
    this.captisAccessKeyParameter = new ssm.StringParameter(this, 'CaptisAccessKey', {
      parameterName: '/spartan-ai/captis/access-key',
      description: 'Captis API access key for ASI endpoint',
      stringValue: props?.captisAccessKey || 'REPLACE_WITH_ACTUAL_KEY',
      // Using standard String to avoid restricted enum issues; set to SecureString with KMS if needed later.
      type: ssm.ParameterType.STRING,
    });

    // Output the parameter name for reference
    new cdk.CfnOutput(this, 'CaptisAccessKeyParameterName', {
      value: this.captisAccessKeyParameter.parameterName,
      description: 'SSM Parameter name for Captis access key',
    });
  }
}

