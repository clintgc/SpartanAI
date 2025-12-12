#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SpartanAiStack } from '../lib/spartan-ai-stack';

const app = new cdk.App();

new SpartanAiStack(app, 'SpartanAiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Spartan AI Security Service - Phase 1',
});

