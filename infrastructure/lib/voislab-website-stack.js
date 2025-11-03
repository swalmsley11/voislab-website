"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoislabWebsiteStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const s3n = require("aws-cdk-lib/aws-s3-notifications");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const sns = require("aws-cdk-lib/aws-sns");
const sqs = require("aws-cdk-lib/aws-sqs");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const amplify = require("aws-cdk-lib/aws-amplify");
const route53 = require("aws-cdk-lib/aws-route53");
const certificatemanager = require("aws-cdk-lib/aws-certificatemanager");
const ssm = require("aws-cdk-lib/aws-ssm");
class VoislabWebsiteStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, domainName, hostedZoneId, githubRepository, githubAccessToken } = props;
        // S3 bucket for audio file uploads
        const uploadBucket = new s3.Bucket(this, 'UploadBucket', {
            bucketName: `voislab-upload-${environment}-${this.account}`,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            lifecycleRules: [
                {
                    id: 'DeleteIncompleteMultipartUploads',
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
                },
                {
                    id: 'DeleteOldVersions',
                    noncurrentVersionExpiration: cdk.Duration.days(30),
                },
            ],
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // S3 bucket for website hosting
        const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
            bucketName: `voislab-website-${environment}-${this.account}`,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'error.html',
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // S3 bucket for processed media storage
        const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
            bucketName: `voislab-media-${environment}-${this.account}`,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                    maxAge: 3600,
                },
            ],
            lifecycleRules: [
                {
                    id: 'DeleteOldVersions',
                    noncurrentVersionExpiration: cdk.Duration.days(90),
                },
            ],
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // DynamoDB table for audio track metadata
        const audioMetadataTable = new dynamodb.Table(this, 'AudioMetadataTable', {
            tableName: `voislab-audio-metadata-${environment}`,
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'createdDate',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: environment === 'prod',
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // Global Secondary Index for querying by status
        audioMetadataTable.addGlobalSecondaryIndex({
            indexName: 'StatusIndex',
            partitionKey: {
                name: 'status',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'createdDate',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Global Secondary Index for querying by genre
        audioMetadataTable.addGlobalSecondaryIndex({
            indexName: 'GenreIndex',
            partitionKey: {
                name: 'genre',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'createdDate',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Lambda function for audio processing
        const audioProcessorFunction = new lambda.Function(this, 'AudioProcessorFunction', {
            functionName: `voislab-audio-processor-${environment}`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/audio-processor'),
            environment: {
                'METADATA_TABLE_NAME': audioMetadataTable.tableName,
                'MEDIA_BUCKET_NAME': mediaBucket.bucketName,
                'UPLOAD_BUCKET_NAME': uploadBucket.bucketName,
                'ENVIRONMENT': environment,
            },
            timeout: cdk.Duration.minutes(10),
            memorySize: 1024,
            reservedConcurrentExecutions: environment === 'prod' ? 10 : 2,
        });
        // Grant Lambda permissions to access S3 buckets
        uploadBucket.grantRead(audioProcessorFunction);
        mediaBucket.grantReadWrite(audioProcessorFunction);
        // Grant Lambda permissions to write to DynamoDB
        audioMetadataTable.grantWriteData(audioProcessorFunction);
        // Lambda function for format conversion
        const formatConverterFunction = new lambda.Function(this, 'FormatConverterFunction', {
            functionName: `voislab-format-converter-${environment}`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/format-converter'),
            environment: {
                'METADATA_TABLE_NAME': audioMetadataTable.tableName,
                'MEDIA_BUCKET_NAME': mediaBucket.bucketName,
                'ENVIRONMENT': environment,
            },
            timeout: cdk.Duration.minutes(15),
            memorySize: 2048,
            reservedConcurrentExecutions: environment === 'prod' ? 5 : 1,
        });
        // Grant format converter permissions
        mediaBucket.grantReadWrite(formatConverterFunction);
        audioMetadataTable.grantReadWriteData(formatConverterFunction);
        // SNS topic for notifications
        const notificationTopic = new sns.Topic(this, 'NotificationTopic', {
            topicName: `voislab-notifications-${environment}`,
            displayName: `VoisLab Notifications (${environment.toUpperCase()})`,
        });
        // SQS queue for content promotion workflow
        const promotionQueue = new sqs.Queue(this, 'PromotionQueue', {
            queueName: `voislab-promotion-queue-${environment}`,
            visibilityTimeout: cdk.Duration.minutes(15),
            retentionPeriod: cdk.Duration.days(14),
        });
        // Lambda function for content promotion (only in DEV environment)
        let contentPromoterFunction;
        if (environment === 'dev') {
            contentPromoterFunction = new lambda.Function(this, 'ContentPromoterFunction', {
                functionName: `voislab-content-promoter-${environment}`,
                runtime: lambda.Runtime.PYTHON_3_11,
                handler: 'index.handler',
                code: lambda.Code.fromAsset('lambda/content-promoter'),
                environment: {
                    'DEV_METADATA_TABLE_NAME': audioMetadataTable.tableName,
                    'PROD_METADATA_TABLE_NAME': `voislab-audio-metadata-prod`,
                    'DEV_MEDIA_BUCKET_NAME': mediaBucket.bucketName,
                    'PROD_MEDIA_BUCKET_NAME': `voislab-media-prod-${this.account}`,
                    'NOTIFICATION_TOPIC_ARN': notificationTopic.topicArn,
                    'ENVIRONMENT': environment,
                },
                timeout: cdk.Duration.minutes(15),
                memorySize: 1024,
                reservedConcurrentExecutions: 2,
            });
            // Grant content promoter permissions
            audioMetadataTable.grantReadWriteData(contentPromoterFunction);
            mediaBucket.grantRead(contentPromoterFunction);
            notificationTopic.grantPublish(contentPromoterFunction);
            // Grant cross-account permissions for PROD resources (will be configured manually)
            contentPromoterFunction.addToRolePolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    's3:PutObject',
                    's3:PutObjectAcl',
                    's3:GetObject',
                    's3:ListBucket',
                ],
                resources: [
                    `arn:aws:s3:::voislab-media-prod-${this.account}`,
                    `arn:aws:s3:::voislab-media-prod-${this.account}/*`,
                ],
            }));
            contentPromoterFunction.addToRolePolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'dynamodb:PutItem',
                    'dynamodb:UpdateItem',
                    'dynamodb:GetItem',
                    'dynamodb:Query',
                ],
                resources: [
                    `arn:aws:dynamodb:${this.region}:${this.account}:table/voislab-audio-metadata-prod`,
                ],
            }));
        }
        // Lambda layer for test utilities
        const testUtilsLayer = new lambda.LayerVersion(this, 'TestUtilsLayer', {
            layerVersionName: `voislab-test-utils-${environment}`,
            code: lambda.Code.fromAsset('lambda/test-utils'),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
            description: 'Test utilities for VoisLab audio processing pipeline',
        });
        // Lambda function for pipeline testing
        const pipelineTesterFunction = new lambda.Function(this, 'PipelineTesterFunction', {
            functionName: `voislab-pipeline-tester-${environment}`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/pipeline-tester'),
            layers: [testUtilsLayer],
            environment: {
                'ENVIRONMENT': environment,
                'NOTIFICATION_TOPIC_ARN': notificationTopic.topicArn,
            },
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            reservedConcurrentExecutions: 1,
        });
        // Grant pipeline tester permissions
        uploadBucket.grantReadWrite(pipelineTesterFunction);
        mediaBucket.grantReadWrite(pipelineTesterFunction);
        audioMetadataTable.grantReadWriteData(pipelineTesterFunction);
        notificationTopic.grantPublish(pipelineTesterFunction);
        // Grant Lambda invoke permissions for testing other functions
        pipelineTesterFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'lambda:InvokeFunction',
                'lambda:GetFunction',
            ],
            resources: [
                audioProcessorFunction.functionArn,
                formatConverterFunction.functionArn,
            ],
        }));
        // Grant additional permissions for infrastructure checks
        pipelineTesterFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:GetBucketPublicAccessBlock',
                's3:HeadBucket',
                'dynamodb:DescribeTable',
                'dynamodb:DescribeContinuousBackups',
            ],
            resources: ['*'],
        }));
        // Promotion orchestrator (only in DEV environment)
        let promotionOrchestratorFunction;
        if (environment === 'dev' && contentPromoterFunction) {
            promotionOrchestratorFunction = new lambda.Function(this, 'PromotionOrchestratorFunction', {
                functionName: `voislab-promotion-orchestrator-${environment}`,
                runtime: lambda.Runtime.PYTHON_3_11,
                handler: 'index.handler',
                code: lambda.Code.fromAsset('lambda/promotion-orchestrator'),
                environment: {
                    'ENVIRONMENT': environment,
                    'DEV_METADATA_TABLE_NAME': audioMetadataTable.tableName,
                    'CONTENT_PROMOTER_FUNCTION_NAME': contentPromoterFunction.functionName,
                    'PIPELINE_TESTER_FUNCTION_NAME': pipelineTesterFunction.functionName,
                    'NOTIFICATION_TOPIC_ARN': notificationTopic.topicArn,
                    'AWS_ACCOUNT_ID': this.account,
                    'AWS_REGION': this.region,
                },
                timeout: cdk.Duration.minutes(15),
                memorySize: 512,
                reservedConcurrentExecutions: 1,
            });
            // Grant orchestrator permissions
            audioMetadataTable.grantReadData(promotionOrchestratorFunction);
            notificationTopic.grantPublish(promotionOrchestratorFunction);
            // Grant Lambda invoke permissions
            promotionOrchestratorFunction.addToRolePolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'lambda:InvokeFunction',
                ],
                resources: [
                    contentPromoterFunction.functionArn,
                    pipelineTesterFunction.functionArn,
                ],
            }));
            // Grant EventBridge permissions for scheduling
            promotionOrchestratorFunction.addToRolePolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'events:PutRule',
                    'events:PutTargets',
                    'events:DeleteRule',
                    'events:RemoveTargets',
                ],
                resources: [
                    `arn:aws:events:${this.region}:${this.account}:rule/voislab-promotion-*`,
                ],
            }));
            // EventBridge rule for scheduled batch promotions
            const promotionScheduleRule = new events.Rule(this, 'PromotionScheduleRule', {
                ruleName: `voislab-promotion-schedule-${environment}`,
                description: 'Scheduled batch content promotion from DEV to PROD',
                schedule: events.Schedule.cron({
                    minute: '0',
                    hour: '*/6',
                    day: '*',
                    month: '*',
                    year: '*',
                }),
                enabled: true,
            });
            // Add orchestrator as target
            promotionScheduleRule.addTarget(new targets.LambdaFunction(promotionOrchestratorFunction, {
                event: events.RuleTargetInput.fromObject({
                    action: 'batch_promotion',
                    maxPromotions: 10,
                    scheduledBy: 'cron',
                    scheduledAt: events.Schedule.cron({
                        minute: '0',
                        hour: '*/6',
                    }).expressionString,
                }),
            }));
            // EventBridge rule for manual promotion triggers
            const manualPromotionRule = new events.Rule(this, 'ManualPromotionRule', {
                ruleName: `voislab-manual-promotion-${environment}`,
                description: 'Manual content promotion trigger',
                eventPattern: {
                    source: ['voislab.content'],
                    detailType: ['Manual Promotion Request'],
                },
                enabled: true,
            });
            manualPromotionRule.addTarget(new targets.LambdaFunction(promotionOrchestratorFunction));
        }
        // Add S3 event notification to trigger Lambda
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.mp3',
        });
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.wav',
        });
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.flac',
        });
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.m4a',
        });
        // CloudFront Origin Access Identity
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
            comment: `OAI for VoisLab Website ${environment}`,
        });
        // Grant CloudFront access to the website bucket
        websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [websiteBucket.arnForObjects('*')],
            principals: [originAccessIdentity.grantPrincipal],
        }));
        // Grant CloudFront access to the media bucket
        mediaBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [mediaBucket.arnForObjects('*')],
            principals: [originAccessIdentity.grantPrincipal],
        }));
        // CloudFront distribution for media content
        const mediaDistribution = new cloudfront.Distribution(this, 'MediaDistribution', {
            defaultBehavior: {
                origin: new origins.S3Origin(mediaBucket, {
                    originAccessIdentity,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS,
            },
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            comment: `VoisLab Media CDN - ${environment}`,
        });
        // Store configuration in SSM Parameter Store for frontend access
        new ssm.StringParameter(this, 'MediaDistributionDomain', {
            parameterName: `/voislab/${environment}/media-distribution-domain`,
            stringValue: mediaDistribution.distributionDomainName,
            description: 'CloudFront distribution domain for media content',
        });
        new ssm.StringParameter(this, 'MediaBucketConfig', {
            parameterName: `/voislab/${environment}/media-bucket-name`,
            stringValue: mediaBucket.bucketName,
            description: 'S3 bucket name for media content',
        });
        new ssm.StringParameter(this, 'MetadataTableConfig', {
            parameterName: `/voislab/${environment}/metadata-table-name`,
            stringValue: audioMetadataTable.tableName,
            description: 'DynamoDB table name for audio metadata',
        });
        // Amplify App for frontend hosting using L1 constructs
        let amplifyApp;
        let certificate;
        let hostedZone;
        if (githubRepository && githubAccessToken) {
            // Create Amplify service role first
            const amplifyServiceRole = new iam.Role(this, 'AmplifyServiceRole', {
                assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
                description: 'Service role for Amplify app to access AWS resources',
                managedPolicies: [
                    iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify'),
                ],
            });
            // Grant additional permissions for SSM Parameter Store access
            amplifyServiceRole.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'ssm:GetParameter',
                    'ssm:GetParameters',
                    'ssm:GetParametersByPath',
                ],
                resources: [
                    `arn:aws:ssm:${this.region}:${this.account}:parameter/voislab/${environment}/*`,
                ],
            }));
            // Create Amplify app with GitHub integration using L1 constructs
            amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
                name: `voislab-website-${environment}`,
                repository: `https://github.com/${githubRepository}`,
                accessToken: githubAccessToken,
                buildSpec: `version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
    appRoot: .`,
                environmentVariables: [
                    {
                        name: 'VITE_AWS_REGION',
                        value: this.region,
                    },
                    {
                        name: 'VITE_ENVIRONMENT',
                        value: environment,
                    },
                    {
                        name: 'VITE_MEDIA_DISTRIBUTION_DOMAIN',
                        value: mediaDistribution.distributionDomainName,
                    },
                    {
                        name: 'VITE_METADATA_TABLE_NAME',
                        value: audioMetadataTable.tableName,
                    },
                    {
                        name: 'VITE_MEDIA_BUCKET_NAME',
                        value: mediaBucket.bucketName,
                    },
                ],
                customRules: [
                    {
                        source: '/<*>',
                        target: '/index.html',
                        status: '200',
                    },
                ],
                iamServiceRole: amplifyServiceRole.roleArn,
            });
            // Create branch for the environment
            const branchName = environment === 'prod' ? 'main' : 'develop';
            const branch = new amplify.CfnBranch(this, 'AmplifyBranch', {
                appId: amplifyApp.attrAppId,
                branchName,
                enableAutoBuild: true,
                enablePullRequestPreview: environment === 'dev',
                stage: environment === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT',
            });
            // Domain configuration for production
            if (environment === 'prod' && domainName && hostedZoneId) {
                // Import existing hosted zone
                hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
                    hostedZoneId,
                    zoneName: domainName,
                });
                // Create SSL certificate
                certificate = new certificatemanager.Certificate(this, 'Certificate', {
                    domainName,
                    subjectAlternativeNames: [`www.${domainName}`],
                    validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
                });
                // Add custom domain to Amplify app
                const domain = new amplify.CfnDomain(this, 'AmplifyDomain', {
                    appId: amplifyApp.attrAppId,
                    domainName,
                    subDomainSettings: [
                        {
                            branchName,
                            prefix: '',
                        },
                        {
                            branchName,
                            prefix: 'www',
                        },
                    ],
                });
                // Output domain information
                new cdk.CfnOutput(this, 'WebsiteURL', {
                    value: `https://${domainName}`,
                    description: 'Production website URL',
                });
                new cdk.CfnOutput(this, 'CertificateArn', {
                    value: certificate.certificateArn,
                    description: 'SSL certificate ARN',
                });
            }
            else {
                // For dev environment, use Amplify default domain
                new cdk.CfnOutput(this, 'WebsiteURL', {
                    value: `https://${branchName}.${amplifyApp.attrDefaultDomain}`,
                    description: `${environment.toUpperCase()} website URL`,
                });
            }
            new cdk.CfnOutput(this, 'AmplifyAppId', {
                value: amplifyApp.attrAppId,
                description: 'Amplify App ID',
            });
            new cdk.CfnOutput(this, 'AmplifyBranchName', {
                value: branchName,
                description: 'Amplify branch name',
            });
        }
        else {
            // Fallback to S3 + CloudFront for website hosting if Amplify is not configured
            const websiteDistribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
                defaultBehavior: {
                    origin: new origins.S3Origin(websiteBucket, {
                        originAccessIdentity,
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                    compress: true,
                },
                defaultRootObject: 'index.html',
                errorResponses: [
                    {
                        httpStatus: 404,
                        responseHttpStatus: 200,
                        responsePagePath: '/index.html',
                    },
                ],
                priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
                comment: `VoisLab Website - ${environment}`,
            });
            new cdk.CfnOutput(this, 'WebsiteURL', {
                value: `https://${websiteDistribution.distributionDomainName}`,
                description: `${environment.toUpperCase()} website URL (CloudFront)`,
            });
            new cdk.CfnOutput(this, 'WebsiteDistributionId', {
                value: websiteDistribution.distributionId,
                description: 'Website CloudFront Distribution ID',
            });
        }
        // Outputs
        new cdk.CfnOutput(this, 'UploadBucketName', {
            value: uploadBucket.bucketName,
            description: 'Name of the S3 bucket for audio file uploads',
        });
        new cdk.CfnOutput(this, 'WebsiteBucketName', {
            value: websiteBucket.bucketName,
            description: 'Name of the S3 bucket for website hosting',
        });
        new cdk.CfnOutput(this, 'MediaBucketName', {
            value: mediaBucket.bucketName,
            description: 'Name of the S3 bucket for processed media storage',
        });
        new cdk.CfnOutput(this, 'AudioMetadataTableName', {
            value: audioMetadataTable.tableName,
            description: 'Name of the DynamoDB table for audio metadata',
        });
        new cdk.CfnOutput(this, 'AudioProcessorFunctionName', {
            value: audioProcessorFunction.functionName,
            description: 'Name of the Lambda function for audio processing',
        });
        new cdk.CfnOutput(this, 'MediaDistributionId', {
            value: mediaDistribution.distributionId,
            description: 'Media CloudFront Distribution ID',
        });
        new cdk.CfnOutput(this, 'MediaDistributionDomainName', {
            value: mediaDistribution.distributionDomainName,
            description: 'Media CloudFront Distribution Domain Name',
        });
        new cdk.CfnOutput(this, 'FormatConverterFunctionName', {
            value: formatConverterFunction.functionName,
            description: 'Name of the Lambda function for format conversion',
        });
        new cdk.CfnOutput(this, 'NotificationTopicArn', {
            value: notificationTopic.topicArn,
            description: 'ARN of the SNS topic for notifications',
        });
        new cdk.CfnOutput(this, 'PromotionQueueUrl', {
            value: promotionQueue.queueUrl,
            description: 'URL of the SQS queue for content promotion',
        });
        if (contentPromoterFunction) {
            new cdk.CfnOutput(this, 'ContentPromoterFunctionName', {
                value: contentPromoterFunction.functionName,
                description: 'Name of the Lambda function for content promotion',
            });
        }
        new cdk.CfnOutput(this, 'PipelineTesterFunctionName', {
            value: pipelineTesterFunction.functionName,
            description: 'Name of the Lambda function for pipeline testing',
        });
        new cdk.CfnOutput(this, 'TestUtilsLayerArn', {
            value: testUtilsLayer.layerVersionArn,
            description: 'ARN of the test utilities Lambda layer',
        });
        if (promotionOrchestratorFunction) {
            new cdk.CfnOutput(this, 'PromotionOrchestratorFunctionName', {
                value: promotionOrchestratorFunction.functionName,
                description: 'Name of the Lambda function for promotion orchestration',
            });
        }
        // UAT Runner Lambda function
        const uatRunnerFunction = new lambda.Function(this, 'UATRunnerFunction', {
            functionName: `voislab-uat-runner-${environment}`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/uat-runner'),
            environment: {
                'ENVIRONMENT': environment,
                'UPLOAD_BUCKET_NAME': uploadBucket.bucketName,
                'MEDIA_BUCKET_NAME': mediaBucket.bucketName,
                'METADATA_TABLE_NAME': audioMetadataTable.tableName,
                'AUDIO_PROCESSOR_FUNCTION_NAME': audioProcessorFunction.functionName,
                'FORMAT_CONVERTER_FUNCTION_NAME': formatConverterFunction.functionName,
                'CONTENT_PROMOTER_FUNCTION_NAME': contentPromoterFunction?.functionName || '',
                'PIPELINE_TESTER_FUNCTION_NAME': pipelineTesterFunction.functionName,
                'NOTIFICATION_TOPIC_ARN': notificationTopic.topicArn,
            },
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            reservedConcurrentExecutions: 1,
        });
        // Grant UAT runner comprehensive permissions
        uploadBucket.grantReadWrite(uatRunnerFunction);
        mediaBucket.grantReadWrite(uatRunnerFunction);
        audioMetadataTable.grantReadWriteData(uatRunnerFunction);
        notificationTopic.grantPublish(uatRunnerFunction);
        // Grant Lambda invoke permissions for all functions
        const functionsToInvoke = [
            audioProcessorFunction,
            formatConverterFunction,
            pipelineTesterFunction,
        ];
        if (contentPromoterFunction) {
            functionsToInvoke.push(contentPromoterFunction);
        }
        uatRunnerFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'lambda:InvokeFunction',
            ],
            resources: functionsToInvoke.map(fn => fn.functionArn),
        }));
        new cdk.CfnOutput(this, 'UATRunnerFunctionName', {
            value: uatRunnerFunction.functionName,
            description: 'Name of the Lambda function for UAT testing',
        });
    }
}
exports.VoislabWebsiteStack = VoislabWebsiteStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pc2xhYi13ZWJzaXRlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidm9pc2xhYi13ZWJzaXRlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsd0RBQXdEO0FBQ3hELHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxxREFBcUQ7QUFDckQsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELG1EQUFtRDtBQUNuRCxtREFBbUQ7QUFDbkQseUVBQXlFO0FBQ3pFLDJDQUEyQztBQVUzQyxNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBK0I7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTdGLG1DQUFtQztRQUNuQyxNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RCxVQUFVLEVBQUUsa0JBQWtCLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQzNELGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsU0FBUyxFQUFFLElBQUk7WUFDZixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGtDQUFrQztvQkFDdEMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2lCQUMxRDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUs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ZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLHVCQUF1QjthQUN4QjtZQUNELFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDO1NBQ3ZELENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMvQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsWUFBWTtZQUNyQyxXQUFXLEVBQUUsNkNBQTZDO1NBQzNELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZ4QkQsa0RBdXhCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzM24gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLW5vdGlmaWNhdGlvbnMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGFtcGxpZnkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFtcGxpZnknO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBjZXJ0aWZpY2F0ZW1hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm9pc2xhYldlYnNpdGVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBkb21haW5OYW1lPzogc3RyaW5nO1xuICBob3N0ZWRab25lSWQ/OiBzdHJpbmc7XG4gIGdpdGh1YlJlcG9zaXRvcnk/OiBzdHJpbmc7XG4gIGdpdGh1YkFjY2Vzc1Rva2VuPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVm9pc2xhYldlYnNpdGVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWb2lzbGFiV2Vic2l0ZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGRvbWFpbk5hbWUsIGhvc3RlZFpvbmVJZCwgZ2l0aHViUmVwb3NpdG9yeSwgZ2l0aHViQWNjZXNzVG9rZW4gfSA9IHByb3BzO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBhdWRpbyBmaWxlIHVwbG9hZHNcbiAgICBjb25zdCB1cGxvYWRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdVcGxvYWRCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9pc2xhYi11cGxvYWQtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZUluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRzJyxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3Igd2Vic2l0ZSBob3N0aW5nXG4gICAgY29uc3Qgd2Vic2l0ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYnNpdGVCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9pc2xhYi13ZWJzaXRlLSR7ZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6ICdlcnJvci5odG1sJyxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBwcm9jZXNzZWQgbWVkaWEgc3RvcmFnZVxuICAgIGNvbnN0IG1lZGlhQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnTWVkaWFCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9pc2xhYi1tZWRpYS0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLkhFQURdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBhdWRpbyB0cmFjayBtZXRhZGF0YVxuICAgIGNvbnN0IGF1ZGlvTWV0YWRhdGFUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQXVkaW9NZXRhZGF0YVRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgdm9pc2xhYi1hdWRpby1tZXRhZGF0YS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gR2xvYmFsIFNlY29uZGFyeSBJbmRleCBmb3IgcXVlcnlpbmcgYnkgc3RhdHVzXG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ1N0YXR1c0luZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnc3RhdHVzJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4IGZvciBxdWVyeWluZyBieSBnZW5yZVxuICAgIGF1ZGlvTWV0YWRhdGFUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdHZW5yZUluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnZ2VucmUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVkRGF0ZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgYXVkaW8gcHJvY2Vzc2luZ1xuICAgIGNvbnN0IGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdWRpb1Byb2Nlc3NvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgdm9pc2xhYi1hdWRpby1wcm9jZXNzb3ItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9hdWRpby1wcm9jZXNzb3InKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICdNRVRBREFUQV9UQUJMRV9OQU1FJzogYXVkaW9NZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgJ01FRElBX0JVQ0tFVF9OQU1FJzogbWVkaWFCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgJ1VQTE9BRF9CVUNLRVRfTkFNRSc6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAnRU5WSVJPTk1FTlQnOiBlbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDEwIDogMixcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IExhbWJkYSBwZXJtaXNzaW9ucyB0byBhY2Nlc3MgUzMgYnVja2V0c1xuICAgIHVwbG9hZEJ1Y2tldC5ncmFudFJlYWQoYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbik7XG4gICAgbWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbik7XG4gICAgXG4gICAgLy8gR3JhbnQgTGFtYmRhIHBlcm1pc3Npb25zIHRvIHdyaXRlIHRvIER5bmFtb0RCXG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmdyYW50V3JpdGVEYXRhKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBmb3JtYXQgY29udmVyc2lvblxuICAgIGNvbnN0IGZvcm1hdENvbnZlcnRlckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRm9ybWF0Q29udmVydGVyRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGB2b2lzbGFiLWZvcm1hdC1jb252ZXJ0ZXItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9mb3JtYXQtY29udmVydGVyJyksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAnTUVUQURBVEFfVEFCTEVfTkFNRSc6IGF1ZGlvTWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICdNRURJQV9CVUNLRVRfTkFNRSc6IG1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICdFTlZJUk9OTUVOVCc6IGVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDIwNDgsXG4gICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gNSA6IDEsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBmb3JtYXQgY29udmVydGVyIHBlcm1pc3Npb25zXG4gICAgbWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoZm9ybWF0Q29udmVydGVyRnVuY3Rpb24pO1xuICAgIGF1ZGlvTWV0YWRhdGFUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZm9ybWF0Q29udmVydGVyRnVuY3Rpb24pO1xuXG4gICAgLy8gU05TIHRvcGljIGZvciBub3RpZmljYXRpb25zXG4gICAgY29uc3Qgbm90aWZpY2F0aW9uVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdOb3RpZmljYXRpb25Ub3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYHZvaXNsYWItbm90aWZpY2F0aW9ucy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkaXNwbGF5TmFtZTogYFZvaXNMYWIgTm90aWZpY2F0aW9ucyAoJHtlbnZpcm9ubWVudC50b1VwcGVyQ2FzZSgpfSlgLFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIHF1ZXVlIGZvciBjb250ZW50IHByb21vdGlvbiB3b3JrZmxvd1xuICAgIGNvbnN0IHByb21vdGlvblF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnUHJvbW90aW9uUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGB2b2lzbGFiLXByb21vdGlvbi1xdWV1ZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGNvbnRlbnQgcHJvbW90aW9uIChvbmx5IGluIERFViBlbnZpcm9ubWVudClcbiAgICBsZXQgY29udGVudFByb21vdGVyRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbiB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdkZXYnKSB7XG4gICAgICBjb250ZW50UHJvbW90ZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvbnRlbnRQcm9tb3RlckZ1bmN0aW9uJywge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGB2b2lzbGFiLWNvbnRlbnQtcHJvbW90ZXItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9jb250ZW50LXByb21vdGVyJyksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgJ0RFVl9NRVRBREFUQV9UQUJMRV9OQU1FJzogYXVkaW9NZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICAnUFJPRF9NRVRBREFUQV9UQUJMRV9OQU1FJzogYHZvaXNsYWItYXVkaW8tbWV0YWRhdGEtcHJvZGAsIC8vIFdpbGwgYmUgY3JlYXRlZCBpbiBQUk9EIHN0YWNrXG4gICAgICAgICAgJ0RFVl9NRURJQV9CVUNLRVRfTkFNRSc6IG1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgJ1BST0RfTUVESUFfQlVDS0VUX05BTUUnOiBgdm9pc2xhYi1tZWRpYS1wcm9kLSR7dGhpcy5hY2NvdW50fWAsIC8vIFdpbGwgYmUgY3JlYXRlZCBpbiBQUk9EIHN0YWNrXG4gICAgICAgICAgJ05PVElGSUNBVElPTl9UT1BJQ19BUk4nOiBub3RpZmljYXRpb25Ub3BpYy50b3BpY0FybixcbiAgICAgICAgICAnRU5WSVJPTk1FTlQnOiBlbnZpcm9ubWVudCxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiAyLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEdyYW50IGNvbnRlbnQgcHJvbW90ZXIgcGVybWlzc2lvbnNcbiAgICAgIGF1ZGlvTWV0YWRhdGFUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY29udGVudFByb21vdGVyRnVuY3Rpb24pO1xuICAgICAgbWVkaWFCdWNrZXQuZ3JhbnRSZWFkKGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uKTtcbiAgICAgIG5vdGlmaWNhdGlvblRvcGljLmdyYW50UHVibGlzaChjb250ZW50UHJvbW90ZXJGdW5jdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdyYW50IGNyb3NzLWFjY291bnQgcGVybWlzc2lvbnMgZm9yIFBST0QgcmVzb3VyY2VzICh3aWxsIGJlIGNvbmZpZ3VyZWQgbWFudWFsbHkpXG4gICAgICBjb250ZW50UHJvbW90ZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAnczM6UHV0T2JqZWN0QWNsJyxcbiAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpzMzo6OnZvaXNsYWItbWVkaWEtcHJvZC0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgICAgICAgYGFybjphd3M6czM6Ojp2b2lzbGFiLW1lZGlhLXByb2QtJHt0aGlzLmFjY291bnR9LypgLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICBjb250ZW50UHJvbW90ZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL3ZvaXNsYWItYXVkaW8tbWV0YWRhdGEtcHJvZGAsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gTGFtYmRhIGxheWVyIGZvciB0ZXN0IHV0aWxpdGllc1xuICAgIGNvbnN0IHRlc3RVdGlsc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1Rlc3RVdGlsc0xheWVyJywge1xuICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogYHZvaXNsYWItdGVzdC11dGlscy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS90ZXN0LXV0aWxzJyksXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMV0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1Rlc3QgdXRpbGl0aWVzIGZvciBWb2lzTGFiIGF1ZGlvIHByb2Nlc3NpbmcgcGlwZWxpbmUnLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBwaXBlbGluZSB0ZXN0aW5nXG4gICAgY29uc3QgcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpcGVsaW5lVGVzdGVyRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGB2b2lzbGFiLXBpcGVsaW5lLXRlc3Rlci0ke2Vudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL3BpcGVsaW5lLXRlc3RlcicpLFxuICAgICAgbGF5ZXJzOiBbdGVzdFV0aWxzTGF5ZXJdLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgJ0VOVklST05NRU5UJzogZW52aXJvbm1lbnQsXG4gICAgICAgICdOT1RJRklDQVRJT05fVE9QSUNfQVJOJzogbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDEsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwaXBlbGluZSB0ZXN0ZXIgcGVybWlzc2lvbnNcbiAgICB1cGxvYWRCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGlwZWxpbmVUZXN0ZXJGdW5jdGlvbik7XG4gICAgbWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGlwZWxpbmVUZXN0ZXJGdW5jdGlvbik7XG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwaXBlbGluZVRlc3RlckZ1bmN0aW9uKTtcbiAgICBub3RpZmljYXRpb25Ub3BpYy5ncmFudFB1Ymxpc2gocGlwZWxpbmVUZXN0ZXJGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBMYW1iZGEgaW52b2tlIHBlcm1pc3Npb25zIGZvciB0ZXN0aW5nIG90aGVyIGZ1bmN0aW9uc1xuICAgIHBpcGVsaW5lVGVzdGVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcbiAgICAgICAgICAnbGFtYmRhOkdldEZ1bmN0aW9uJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgICAgICBmb3JtYXRDb252ZXJ0ZXJGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IGFkZGl0aW9uYWwgcGVybWlzc2lvbnMgZm9yIGluZnJhc3RydWN0dXJlIGNoZWNrc1xuICAgIHBpcGVsaW5lVGVzdGVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0QnVja2V0UHVibGljQWNjZXNzQmxvY2snLFxuICAgICAgICAgICdzMzpIZWFkQnVja2V0JyxcbiAgICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVUYWJsZScsXG4gICAgICAgICAgJ2R5bmFtb2RiOkRlc2NyaWJlQ29udGludW91c0JhY2t1cHMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gUHJvbW90aW9uIG9yY2hlc3RyYXRvciAob25seSBpbiBERVYgZW52aXJvbm1lbnQpXG4gICAgbGV0IHByb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb24gfCB1bmRlZmluZWQ7XG4gICAgXG4gICAgaWYgKGVudmlyb25tZW50ID09PSAnZGV2JyAmJiBjb250ZW50UHJvbW90ZXJGdW5jdGlvbikge1xuICAgICAgcHJvbW90aW9uT3JjaGVzdHJhdG9yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbicsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgdm9pc2xhYi1wcm9tb3Rpb24tb3JjaGVzdHJhdG9yLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvcHJvbW90aW9uLW9yY2hlc3RyYXRvcicpLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICdFTlZJUk9OTUVOVCc6IGVudmlyb25tZW50LFxuICAgICAgICAgICdERVZfTUVUQURBVEFfVEFCTEVfTkFNRSc6IGF1ZGlvTWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgJ0NPTlRFTlRfUFJPTU9URVJfRlVOQ1RJT05fTkFNRSc6IGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAnUElQRUxJTkVfVEVTVEVSX0ZVTkNUSU9OX05BTUUnOiBwaXBlbGluZVRlc3RlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAnTk9USUZJQ0FUSU9OX1RPUElDX0FSTic6IG5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgICAgICdBV1NfQUNDT1VOVF9JRCc6IHRoaXMuYWNjb3VudCxcbiAgICAgICAgICAnQVdTX1JFR0lPTic6IHRoaXMucmVnaW9uLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogMSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBHcmFudCBvcmNoZXN0cmF0b3IgcGVybWlzc2lvbnNcbiAgICAgIGF1ZGlvTWV0YWRhdGFUYWJsZS5ncmFudFJlYWREYXRhKHByb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uKTtcbiAgICAgIG5vdGlmaWNhdGlvblRvcGljLmdyYW50UHVibGlzaChwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdyYW50IExhbWJkYSBpbnZva2UgcGVybWlzc2lvbnNcbiAgICAgIHByb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgY29udGVudFByb21vdGVyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICAgICAgICBwaXBlbGluZVRlc3RlckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICAvLyBHcmFudCBFdmVudEJyaWRnZSBwZXJtaXNzaW9ucyBmb3Igc2NoZWR1bGluZ1xuICAgICAgcHJvbW90aW9uT3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICdldmVudHM6UHV0UnVsZScsXG4gICAgICAgICAgICAnZXZlbnRzOlB1dFRhcmdldHMnLFxuICAgICAgICAgICAgJ2V2ZW50czpEZWxldGVSdWxlJyxcbiAgICAgICAgICAgICdldmVudHM6UmVtb3ZlVGFyZ2V0cycsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIGBhcm46YXdzOmV2ZW50czoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cnVsZS92b2lzbGFiLXByb21vdGlvbi0qYCxcbiAgICAgICAgICBdLFxuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgICAgLy8gRXZlbnRCcmlkZ2UgcnVsZSBmb3Igc2NoZWR1bGVkIGJhdGNoIHByb21vdGlvbnNcbiAgICAgIGNvbnN0IHByb21vdGlvblNjaGVkdWxlUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnUHJvbW90aW9uU2NoZWR1bGVSdWxlJywge1xuICAgICAgICBydWxlTmFtZTogYHZvaXNsYWItcHJvbW90aW9uLXNjaGVkdWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTY2hlZHVsZWQgYmF0Y2ggY29udGVudCBwcm9tb3Rpb24gZnJvbSBERVYgdG8gUFJPRCcsXG4gICAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7XG4gICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgaG91cjogJyovNicsIC8vIEV2ZXJ5IDYgaG91cnNcbiAgICAgICAgICBkYXk6ICcqJyxcbiAgICAgICAgICBtb250aDogJyonLFxuICAgICAgICAgIHllYXI6ICcqJyxcbiAgICAgICAgfSksXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgLy8gQWRkIG9yY2hlc3RyYXRvciBhcyB0YXJnZXRcbiAgICAgIHByb21vdGlvblNjaGVkdWxlUnVsZS5hZGRUYXJnZXQoXG4gICAgICAgIG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHByb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uLCB7XG4gICAgICAgICAgZXZlbnQ6IGV2ZW50cy5SdWxlVGFyZ2V0SW5wdXQuZnJvbU9iamVjdCh7XG4gICAgICAgICAgICBhY3Rpb246ICdiYXRjaF9wcm9tb3Rpb24nLFxuICAgICAgICAgICAgbWF4UHJvbW90aW9uczogMTAsXG4gICAgICAgICAgICBzY2hlZHVsZWRCeTogJ2Nyb24nLFxuICAgICAgICAgICAgc2NoZWR1bGVkQXQ6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgICAgIGhvdXI6ICcqLzYnLFxuICAgICAgICAgICAgfSkuZXhwcmVzc2lvblN0cmluZyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGUgZm9yIG1hbnVhbCBwcm9tb3Rpb24gdHJpZ2dlcnNcbiAgICAgIGNvbnN0IG1hbnVhbFByb21vdGlvblJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ01hbnVhbFByb21vdGlvblJ1bGUnLCB7XG4gICAgICAgIHJ1bGVOYW1lOiBgdm9pc2xhYi1tYW51YWwtcHJvbW90aW9uLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNYW51YWwgY29udGVudCBwcm9tb3Rpb24gdHJpZ2dlcicsXG4gICAgICAgIGV2ZW50UGF0dGVybjoge1xuICAgICAgICAgIHNvdXJjZTogWyd2b2lzbGFiLmNvbnRlbnQnXSxcbiAgICAgICAgICBkZXRhaWxUeXBlOiBbJ01hbnVhbCBQcm9tb3Rpb24gUmVxdWVzdCddLFxuICAgICAgICB9LFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIG1hbnVhbFByb21vdGlvblJ1bGUuYWRkVGFyZ2V0KFxuICAgICAgICBuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbilcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQWRkIFMzIGV2ZW50IG5vdGlmaWNhdGlvbiB0byB0cmlnZ2VyIExhbWJkYVxuICAgIHVwbG9hZEJ1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIHByZWZpeDogJ2F1ZGlvLycsXG4gICAgICAgIHN1ZmZpeDogJy5tcDMnLFxuICAgICAgfVxuICAgICk7XG5cbiAgICB1cGxvYWRCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBwcmVmaXg6ICdhdWRpby8nLFxuICAgICAgICBzdWZmaXg6ICcud2F2JyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdXBsb2FkQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbihhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgcHJlZml4OiAnYXVkaW8vJyxcbiAgICAgICAgc3VmZml4OiAnLmZsYWMnLFxuICAgICAgfVxuICAgICk7XG5cbiAgICB1cGxvYWRCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBwcmVmaXg6ICdhdWRpby8nLFxuICAgICAgICBzdWZmaXg6ICcubTRhJyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBPcmlnaW4gQWNjZXNzIElkZW50aXR5XG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzSWRlbnRpdHkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnT0FJJywge1xuICAgICAgY29tbWVudDogYE9BSSBmb3IgVm9pc0xhYiBXZWJzaXRlICR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENsb3VkRnJvbnQgYWNjZXNzIHRvIHRoZSB3ZWJzaXRlIGJ1Y2tldFxuICAgIHdlYnNpdGVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbd2Vic2l0ZUJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgICBwcmluY2lwYWxzOiBbb3JpZ2luQWNjZXNzSWRlbnRpdHkuZ3JhbnRQcmluY2lwYWxdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRGcm9udCBhY2Nlc3MgdG8gdGhlIG1lZGlhIGJ1Y2tldFxuICAgIG1lZGlhQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW21lZGlhQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgICAgIHByaW5jaXBhbHM6IFtvcmlnaW5BY2Nlc3NJZGVudGl0eS5ncmFudFByaW5jaXBhbF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBmb3IgbWVkaWEgY29udGVudFxuICAgIGNvbnN0IG1lZGlhRGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdNZWRpYURpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlMzT3JpZ2luKG1lZGlhQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHksXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRF9GT1JfVU5DT01QUkVTU0VEX09CSkVDVFMsXG4gICAgICB9LFxuICAgICAgcHJpY2VDbGFzczogY2xvdWRmcm9udC5QcmljZUNsYXNzLlBSSUNFX0NMQVNTXzEwMCxcbiAgICAgIGNvbW1lbnQ6IGBWb2lzTGFiIE1lZGlhIENETiAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIGNvbmZpZ3VyYXRpb24gaW4gU1NNIFBhcmFtZXRlciBTdG9yZSBmb3IgZnJvbnRlbmQgYWNjZXNzXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ01lZGlhRGlzdHJpYnV0aW9uRG9tYWluJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC92b2lzbGFiLyR7ZW52aXJvbm1lbnR9L21lZGlhLWRpc3RyaWJ1dGlvbi1kb21haW5gLFxuICAgICAgc3RyaW5nVmFsdWU6IG1lZGlhRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGRvbWFpbiBmb3IgbWVkaWEgY29udGVudCcsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnTWVkaWFCdWNrZXRDb25maWcnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ZvaXNsYWIvJHtlbnZpcm9ubWVudH0vbWVkaWEtYnVja2V0LW5hbWVgLFxuICAgICAgc3RyaW5nVmFsdWU6IG1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBuYW1lIGZvciBtZWRpYSBjb250ZW50JyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdNZXRhZGF0YVRhYmxlQ29uZmlnJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC92b2lzbGFiLyR7ZW52aXJvbm1lbnR9L21ldGFkYXRhLXRhYmxlLW5hbWVgLFxuICAgICAgc3RyaW5nVmFsdWU6IGF1ZGlvTWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGF1ZGlvIG1ldGFkYXRhJyxcbiAgICB9KTtcblxuICAgIC8vIEFtcGxpZnkgQXBwIGZvciBmcm9udGVuZCBob3N0aW5nIHVzaW5nIEwxIGNvbnN0cnVjdHNcbiAgICBsZXQgYW1wbGlmeUFwcDogYW1wbGlmeS5DZm5BcHAgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGNlcnRpZmljYXRlOiBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGUgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGhvc3RlZFpvbmU6IHJvdXRlNTMuSUhvc3RlZFpvbmUgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoZ2l0aHViUmVwb3NpdG9yeSAmJiBnaXRodWJBY2Nlc3NUb2tlbikge1xuICAgICAgLy8gQ3JlYXRlIEFtcGxpZnkgc2VydmljZSByb2xlIGZpcnN0XG4gICAgICBjb25zdCBhbXBsaWZ5U2VydmljZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FtcGxpZnlTZXJ2aWNlUm9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2FtcGxpZnkuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1NlcnZpY2Ugcm9sZSBmb3IgQW1wbGlmeSBhcHAgdG8gYWNjZXNzIEFXUyByZXNvdXJjZXMnLFxuICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FkbWluaXN0cmF0b3JBY2Nlc3MtQW1wbGlmeScpLFxuICAgICAgICBdLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEdyYW50IGFkZGl0aW9uYWwgcGVybWlzc2lvbnMgZm9yIFNTTSBQYXJhbWV0ZXIgU3RvcmUgYWNjZXNzXG4gICAgICBhbXBsaWZ5U2VydmljZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzJyxcbiAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVyc0J5UGF0aCcsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIGBhcm46YXdzOnNzbToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cGFyYW1ldGVyL3ZvaXNsYWIvJHtlbnZpcm9ubWVudH0vKmAsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAgIC8vIENyZWF0ZSBBbXBsaWZ5IGFwcCB3aXRoIEdpdEh1YiBpbnRlZ3JhdGlvbiB1c2luZyBMMSBjb25zdHJ1Y3RzXG4gICAgICBhbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQ2ZuQXBwKHRoaXMsICdBbXBsaWZ5QXBwJywge1xuICAgICAgICBuYW1lOiBgdm9pc2xhYi13ZWJzaXRlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcmVwb3NpdG9yeTogYGh0dHBzOi8vZ2l0aHViLmNvbS8ke2dpdGh1YlJlcG9zaXRvcnl9YCxcbiAgICAgICAgYWNjZXNzVG9rZW46IGdpdGh1YkFjY2Vzc1Rva2VuLFxuICAgICAgICBidWlsZFNwZWM6IGB2ZXJzaW9uOiAxXG5hcHBsaWNhdGlvbnM6XG4gIC0gZnJvbnRlbmQ6XG4gICAgICBwaGFzZXM6XG4gICAgICAgIHByZUJ1aWxkOlxuICAgICAgICAgIGNvbW1hbmRzOlxuICAgICAgICAgICAgLSBucG0gY2lcbiAgICAgICAgYnVpbGQ6XG4gICAgICAgICAgY29tbWFuZHM6XG4gICAgICAgICAgICAtIG5wbSBydW4gYnVpbGRcbiAgICAgIGFydGlmYWN0czpcbiAgICAgICAgYmFzZURpcmVjdG9yeTogZGlzdFxuICAgICAgICBmaWxlczpcbiAgICAgICAgICAtICcqKi8qJ1xuICAgICAgY2FjaGU6XG4gICAgICAgIHBhdGhzOlxuICAgICAgICAgIC0gbm9kZV9tb2R1bGVzLyoqLypcbiAgICBhcHBSb290OiAuYCxcbiAgICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnVklURV9BV1NfUkVHSU9OJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdWSVRFX0VOVklST05NRU5UJyxcbiAgICAgICAgICAgIHZhbHVlOiBlbnZpcm9ubWVudCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdWSVRFX01FRElBX0RJU1RSSUJVVElPTl9ET01BSU4nLFxuICAgICAgICAgICAgdmFsdWU6IG1lZGlhRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnVklURV9NRVRBREFUQV9UQUJMRV9OQU1FJyxcbiAgICAgICAgICAgIHZhbHVlOiBhdWRpb01ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ1ZJVEVfTUVESUFfQlVDS0VUX05BTUUnLFxuICAgICAgICAgICAgdmFsdWU6IG1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgY3VzdG9tUnVsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzb3VyY2U6ICcvPCo+JyxcbiAgICAgICAgICAgIHRhcmdldDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICAgIHN0YXR1czogJzIwMCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgaWFtU2VydmljZVJvbGU6IGFtcGxpZnlTZXJ2aWNlUm9sZS5yb2xlQXJuLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIENyZWF0ZSBicmFuY2ggZm9yIHRoZSBlbnZpcm9ubWVudFxuICAgICAgY29uc3QgYnJhbmNoTmFtZSA9IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnbWFpbicgOiAnZGV2ZWxvcCc7XG4gICAgICBjb25zdCBicmFuY2ggPSBuZXcgYW1wbGlmeS5DZm5CcmFuY2godGhpcywgJ0FtcGxpZnlCcmFuY2gnLCB7XG4gICAgICAgIGFwcElkOiBhbXBsaWZ5QXBwLmF0dHJBcHBJZCxcbiAgICAgICAgYnJhbmNoTmFtZSxcbiAgICAgICAgZW5hYmxlQXV0b0J1aWxkOiB0cnVlLFxuICAgICAgICBlbmFibGVQdWxsUmVxdWVzdFByZXZpZXc6IGVudmlyb25tZW50ID09PSAnZGV2JyxcbiAgICAgICAgc3RhZ2U6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnUFJPRFVDVElPTicgOiAnREVWRUxPUE1FTlQnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIERvbWFpbiBjb25maWd1cmF0aW9uIGZvciBwcm9kdWN0aW9uXG4gICAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kJyAmJiBkb21haW5OYW1lICYmIGhvc3RlZFpvbmVJZCkge1xuICAgICAgICAvLyBJbXBvcnQgZXhpc3RpbmcgaG9zdGVkIHpvbmVcbiAgICAgICAgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgICAgaG9zdGVkWm9uZUlkLFxuICAgICAgICAgIHpvbmVOYW1lOiBkb21haW5OYW1lLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDcmVhdGUgU1NMIGNlcnRpZmljYXRlXG4gICAgICAgIGNlcnRpZmljYXRlID0gbmV3IGNlcnRpZmljYXRlbWFuYWdlci5DZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XG4gICAgICAgICAgZG9tYWluTmFtZSxcbiAgICAgICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczogW2B3d3cuJHtkb21haW5OYW1lfWBdLFxuICAgICAgICAgIHZhbGlkYXRpb246IGNlcnRpZmljYXRlbWFuYWdlci5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyhob3N0ZWRab25lKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWRkIGN1c3RvbSBkb21haW4gdG8gQW1wbGlmeSBhcHBcbiAgICAgICAgY29uc3QgZG9tYWluID0gbmV3IGFtcGxpZnkuQ2ZuRG9tYWluKHRoaXMsICdBbXBsaWZ5RG9tYWluJywge1xuICAgICAgICAgIGFwcElkOiBhbXBsaWZ5QXBwLmF0dHJBcHBJZCxcbiAgICAgICAgICBkb21haW5OYW1lLFxuICAgICAgICAgIHN1YkRvbWFpblNldHRpbmdzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGJyYW5jaE5hbWUsXG4gICAgICAgICAgICAgIHByZWZpeDogJycsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBicmFuY2hOYW1lLFxuICAgICAgICAgICAgICBwcmVmaXg6ICd3d3cnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBPdXRwdXQgZG9tYWluIGluZm9ybWF0aW9uXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlVVJMJywge1xuICAgICAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9YCxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gd2Vic2l0ZSBVUkwnLFxuICAgICAgICB9KTtcblxuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2VydGlmaWNhdGVBcm4nLCB7XG4gICAgICAgICAgdmFsdWU6IGNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU1NMIGNlcnRpZmljYXRlIEFSTicsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRm9yIGRldiBlbnZpcm9ubWVudCwgdXNlIEFtcGxpZnkgZGVmYXVsdCBkb21haW5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVVUkwnLCB7XG4gICAgICAgICAgdmFsdWU6IGBodHRwczovLyR7YnJhbmNoTmFtZX0uJHthbXBsaWZ5QXBwLmF0dHJEZWZhdWx0RG9tYWlufWAsXG4gICAgICAgICAgZGVzY3JpcHRpb246IGAke2Vudmlyb25tZW50LnRvVXBwZXJDYXNlKCl9IHdlYnNpdGUgVVJMYCxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbXBsaWZ5QXBwSWQnLCB7XG4gICAgICAgIHZhbHVlOiBhbXBsaWZ5QXBwLmF0dHJBcHBJZCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBbXBsaWZ5IEFwcCBJRCcsXG4gICAgICB9KTtcblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FtcGxpZnlCcmFuY2hOYW1lJywge1xuICAgICAgICB2YWx1ZTogYnJhbmNoTmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBbXBsaWZ5IGJyYW5jaCBuYW1lJyxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGYWxsYmFjayB0byBTMyArIENsb3VkRnJvbnQgZm9yIHdlYnNpdGUgaG9zdGluZyBpZiBBbXBsaWZ5IGlzIG5vdCBjb25maWd1cmVkXG4gICAgICBjb25zdCB3ZWJzaXRlRGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdXZWJzaXRlRGlzdHJpYnV0aW9uJywge1xuICAgICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlMzT3JpZ2luKHdlYnNpdGVCdWNrZXQsIHtcbiAgICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaHR0cFN0YXR1czogNDA0LFxuICAgICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgICAgIGNvbW1lbnQ6IGBWb2lzTGFiIFdlYnNpdGUgLSAke2Vudmlyb25tZW50fWAsXG4gICAgICB9KTtcblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVVUkwnLCB7XG4gICAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3dlYnNpdGVEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgICAgICBkZXNjcmlwdGlvbjogYCR7ZW52aXJvbm1lbnQudG9VcHBlckNhc2UoKX0gd2Vic2l0ZSBVUkwgKENsb3VkRnJvbnQpYCxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2Vic2l0ZURpc3RyaWJ1dGlvbklkJywge1xuICAgICAgICB2YWx1ZTogd2Vic2l0ZURpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdXZWJzaXRlIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXBsb2FkQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB1cGxvYWRCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciBhdWRpbyBmaWxlIHVwbG9hZHMnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHdlYnNpdGVCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciB3ZWJzaXRlIGhvc3RpbmcnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01lZGlhQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiBtZWRpYUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBTMyBidWNrZXQgZm9yIHByb2Nlc3NlZCBtZWRpYSBzdG9yYWdlJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdWRpb01ldGFkYXRhVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGF1ZGlvTWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIHRhYmxlIGZvciBhdWRpbyBtZXRhZGF0YScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXVkaW9Qcm9jZXNzb3JGdW5jdGlvbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIExhbWJkYSBmdW5jdGlvbiBmb3IgYXVkaW8gcHJvY2Vzc2luZycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWVkaWFEaXN0cmlidXRpb25JZCcsIHtcbiAgICAgIHZhbHVlOiBtZWRpYURpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTWVkaWEgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01lZGlhRGlzdHJpYnV0aW9uRG9tYWluTmFtZScsIHtcbiAgICAgIHZhbHVlOiBtZWRpYURpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdNZWRpYSBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBEb21haW4gTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRm9ybWF0Q29udmVydGVyRnVuY3Rpb25OYW1lJywge1xuICAgICAgdmFsdWU6IGZvcm1hdENvbnZlcnRlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBmb3JtYXQgY29udmVyc2lvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTm90aWZpY2F0aW9uVG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgU05TIHRvcGljIGZvciBub3RpZmljYXRpb25zJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9tb3Rpb25RdWV1ZVVybCcsIHtcbiAgICAgIHZhbHVlOiBwcm9tb3Rpb25RdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIG9mIHRoZSBTUVMgcXVldWUgZm9yIGNvbnRlbnQgcHJvbW90aW9uJyxcbiAgICB9KTtcblxuICAgIGlmIChjb250ZW50UHJvbW90ZXJGdW5jdGlvbikge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvbnRlbnRQcm9tb3RlckZ1bmN0aW9uTmFtZScsIHtcbiAgICAgICAgdmFsdWU6IGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBMYW1iZGEgZnVuY3Rpb24gZm9yIGNvbnRlbnQgcHJvbW90aW9uJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaXBlbGluZVRlc3RlckZ1bmN0aW9uTmFtZScsIHtcbiAgICAgIHZhbHVlOiBwaXBlbGluZVRlc3RlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBwaXBlbGluZSB0ZXN0aW5nJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZXN0VXRpbHNMYXllckFybicsIHtcbiAgICAgIHZhbHVlOiB0ZXN0VXRpbHNMYXllci5sYXllclZlcnNpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgdGVzdCB1dGlsaXRpZXMgTGFtYmRhIGxheWVyJyxcbiAgICB9KTtcblxuICAgIGlmIChwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbikge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uTmFtZScsIHtcbiAgICAgICAgdmFsdWU6IHByb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBMYW1iZGEgZnVuY3Rpb24gZm9yIHByb21vdGlvbiBvcmNoZXN0cmF0aW9uJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFVBVCBSdW5uZXIgTGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgdWF0UnVubmVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVQVRSdW5uZXJGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHZvaXNsYWItdWF0LXJ1bm5lci0ke2Vudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL3VhdC1ydW5uZXInKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICdFTlZJUk9OTUVOVCc6IGVudmlyb25tZW50LFxuICAgICAgICAnVVBMT0FEX0JVQ0tFVF9OQU1FJzogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICdNRURJQV9CVUNLRVRfTkFNRSc6IG1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICdNRVRBREFUQV9UQUJMRV9OQU1FJzogYXVkaW9NZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgJ0FVRElPX1BST0NFU1NPUl9GVU5DVElPTl9OQU1FJzogYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgICdGT1JNQVRfQ09OVkVSVEVSX0ZVTkNUSU9OX05BTUUnOiBmb3JtYXRDb252ZXJ0ZXJGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgICdDT05URU5UX1BST01PVEVSX0ZVTkNUSU9OX05BTUUnOiBjb250ZW50UHJvbW90ZXJGdW5jdGlvbj8uZnVuY3Rpb25OYW1lIHx8ICcnLFxuICAgICAgICAnUElQRUxJTkVfVEVTVEVSX0ZVTkNUSU9OX05BTUUnOiBwaXBlbGluZVRlc3RlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgJ05PVElGSUNBVElPTl9UT1BJQ19BUk4nOiBub3RpZmljYXRpb25Ub3BpYy50b3BpY0FybixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogMSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFVBVCBydW5uZXIgY29tcHJlaGVuc2l2ZSBwZXJtaXNzaW9uc1xuICAgIHVwbG9hZEJ1Y2tldC5ncmFudFJlYWRXcml0ZSh1YXRSdW5uZXJGdW5jdGlvbik7XG4gICAgbWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodWF0UnVubmVyRnVuY3Rpb24pO1xuICAgIGF1ZGlvTWV0YWRhdGFUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodWF0UnVubmVyRnVuY3Rpb24pO1xuICAgIG5vdGlmaWNhdGlvblRvcGljLmdyYW50UHVibGlzaCh1YXRSdW5uZXJGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBMYW1iZGEgaW52b2tlIHBlcm1pc3Npb25zIGZvciBhbGwgZnVuY3Rpb25zXG4gICAgY29uc3QgZnVuY3Rpb25zVG9JbnZva2UgPSBbXG4gICAgICBhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uLFxuICAgICAgZm9ybWF0Q29udmVydGVyRnVuY3Rpb24sXG4gICAgICBwaXBlbGluZVRlc3RlckZ1bmN0aW9uLFxuICAgIF07XG5cbiAgICBpZiAoY29udGVudFByb21vdGVyRnVuY3Rpb24pIHtcbiAgICAgIGZ1bmN0aW9uc1RvSW52b2tlLnB1c2goY29udGVudFByb21vdGVyRnVuY3Rpb24pO1xuICAgIH1cblxuICAgIHVhdFJ1bm5lckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2xhbWJkYTpJbnZva2VGdW5jdGlvbicsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogZnVuY3Rpb25zVG9JbnZva2UubWFwKGZuID0+IGZuLmZ1bmN0aW9uQXJuKSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVQVRSdW5uZXJGdW5jdGlvbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogdWF0UnVubmVyRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBMYW1iZGEgZnVuY3Rpb24gZm9yIFVBVCB0ZXN0aW5nJyxcbiAgICB9KTtcbiAgfVxufSJdfQ==