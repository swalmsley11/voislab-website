#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VoislabWebsiteStack } from '../lib/voislab-website-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';

// Note: Frontend hosting is now handled by AWS Amplify separately
// This CDK stack only manages backend infrastructure (DynamoDB, S3, Lambda, CloudWatch)

new VoislabWebsiteStack(app, `VoislabWebsite-${environment}`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});