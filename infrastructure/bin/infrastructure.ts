#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VoislabWebsiteStack } from '../lib/voislab-website-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';

// Get optional configuration from context
const domainName = app.node.tryGetContext('domainName');
const hostedZoneId = app.node.tryGetContext('hostedZoneId');
const githubRepository = app.node.tryGetContext('githubRepository');

// Get GitHub access token from environment variable for security
const githubAccessToken = process.env.GITHUB_ACCESS_TOKEN;

new VoislabWebsiteStack(app, `VoislabWebsite-${environment}`, {
  environment,
  domainName,
  hostedZoneId,
  githubRepository,
  githubAccessToken,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});