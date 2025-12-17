#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
// Note: infrastructure code currently lives under spartan-ai/infrastructure/lib
// to avoid duplication; import directly from that path.
import { SpartanAiStack } from '../../spartan-ai/infrastructure/lib/spartan-ai-stack';

const app = new cdk.App();

new SpartanAiStack(app, 'SpartanAiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  stackName: process.env.STACK_NAME || 'Thermopylae-Stage',
  description: 'Spartan AI Security Service - Phase 1',
});

