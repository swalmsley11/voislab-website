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
                    'VOISLAB_ACCOUNT_ID': this.account,
                    'VOISLAB_REGION': this.region,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pc2xhYi13ZWJzaXRlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidm9pc2xhYi13ZWJzaXRlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsd0RBQXdEO0FBQ3hELHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxxREFBcUQ7QUFDckQsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELG1EQUFtRDtBQUNuRCxtREFBbUQ7QUFDbkQseUVBQXlFO0FBQ3pFLDJDQUEyQztBQVUzQyxNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBK0I7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTdGLG1DQUFtQztRQUNuQyxNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RCxVQUFVLEVBQUUsa0JBQWtCLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQzNELGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsU0FBUyxFQUFFLElBQUk7WUFDZixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGtDQUFrQztvQkFDdEMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2lCQUMxRDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUs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QyxlQUFlLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUU7Z0JBQ1AsdUJBQXVCO2FBQ3hCO1lBQ0QsU0FBUyxFQUFFLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUM7U0FDdkQsQ0FBQyxDQUNILENBQUM7UUFFRixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxZQUFZO1lBQ3JDLFdBQVcsRUFBRSw2Q0FBNkM7U0FDM0QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdnhCRCxrREF1eEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHMzbiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtbm90aWZpY2F0aW9ucyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYW1wbGlmeSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYW1wbGlmeSc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIGNlcnRpZmljYXRlbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcblxuZXhwb3J0IGludGVyZmFjZSBWb2lzbGFiV2Vic2l0ZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGRvbWFpbk5hbWU/OiBzdHJpbmc7XG4gIGhvc3RlZFpvbmVJZD86IHN0cmluZztcbiAgZ2l0aHViUmVwb3NpdG9yeT86IHN0cmluZztcbiAgZ2l0aHViQWNjZXNzVG9rZW4/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBWb2lzbGFiV2Vic2l0ZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFZvaXNsYWJXZWJzaXRlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgZG9tYWluTmFtZSwgaG9zdGVkWm9uZUlkLCBnaXRodWJSZXBvc2l0b3J5LCBnaXRodWJBY2Nlc3NUb2tlbiB9ID0gcHJvcHM7XG5cbiAgICAvLyBTMyBidWNrZXQgZm9yIGF1ZGlvIGZpbGUgdXBsb2Fkc1xuICAgIGNvbnN0IHVwbG9hZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1VwbG9hZEJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2b2lzbGFiLXVwbG9hZC0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlSW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZHMnLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmVyc2lvbnMnLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciB3ZWJzaXRlIGhvc3RpbmdcbiAgICBjb25zdCB3ZWJzaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnV2Vic2l0ZUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2b2lzbGFiLXdlYnNpdGUtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiAnaW5kZXguaHRtbCcsXG4gICAgICB3ZWJzaXRlRXJyb3JEb2N1bWVudDogJ2Vycm9yLmh0bWwnLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBTMyBidWNrZXQgZm9yIHByb2Nlc3NlZCBtZWRpYSBzdG9yYWdlXG4gICAgY29uc3QgbWVkaWFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdNZWRpYUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2b2lzbGFiLW1lZGlhLSR7ZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmVyc2lvbnMnLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgdGFibGUgZm9yIGF1ZGlvIHRyYWNrIG1ldGFkYXRhXG4gICAgY29uc3QgYXVkaW9NZXRhZGF0YVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdBdWRpb01ldGFkYXRhVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGB2b2lzbGFiLWF1ZGlvLW1ldGFkYXRhLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnaWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVkRGF0ZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4IGZvciBxdWVyeWluZyBieSBzdGF0dXNcbiAgICBhdWRpb01ldGFkYXRhVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnU3RhdHVzSW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdzdGF0dXMnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVkRGF0ZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdsb2JhbCBTZWNvbmRhcnkgSW5kZXggZm9yIHF1ZXJ5aW5nIGJ5IGdlbnJlXG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ0dlbnJlSW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdnZW5yZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWREYXRlJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBhdWRpbyBwcm9jZXNzaW5nXG4gICAgY29uc3QgYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0F1ZGlvUHJvY2Vzc29yRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGB2b2lzbGFiLWF1ZGlvLXByb2Nlc3Nvci0ke2Vudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2F1ZGlvLXByb2Nlc3NvcicpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgJ01FVEFEQVRBX1RBQkxFX05BTUUnOiBhdWRpb01ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICAnTUVESUFfQlVDS0VUX05BTUUnOiBtZWRpYUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAnVVBMT0FEX0JVQ0tFVF9OQU1FJzogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICdFTlZJUk9OTUVOVCc6IGVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAgOiAyLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgTGFtYmRhIHBlcm1pc3Npb25zIHRvIGFjY2VzcyBTMyBidWNrZXRzXG4gICAgdXBsb2FkQnVja2V0LmdyYW50UmVhZChhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uKTtcbiAgICBtZWRpYUJ1Y2tldC5ncmFudFJlYWRXcml0ZShhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uKTtcbiAgICBcbiAgICAvLyBHcmFudCBMYW1iZGEgcGVybWlzc2lvbnMgdG8gd3JpdGUgdG8gRHluYW1vREJcbiAgICBhdWRpb01ldGFkYXRhVGFibGUuZ3JhbnRXcml0ZURhdGEoYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbik7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGZvcm1hdCBjb252ZXJzaW9uXG4gICAgY29uc3QgZm9ybWF0Q29udmVydGVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGb3JtYXRDb252ZXJ0ZXJGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHZvaXNsYWItZm9ybWF0LWNvbnZlcnRlci0ke2Vudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2Zvcm1hdC1jb252ZXJ0ZXInKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICdNRVRBREFUQV9UQUJMRV9OQU1FJzogYXVkaW9NZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgJ01FRElBX0JVQ0tFVF9OQU1FJzogbWVkaWFCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgJ0VOVklST05NRU5UJzogZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjA0OCxcbiAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyA1IDogMSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IGZvcm1hdCBjb252ZXJ0ZXIgcGVybWlzc2lvbnNcbiAgICBtZWRpYUJ1Y2tldC5ncmFudFJlYWRXcml0ZShmb3JtYXRDb252ZXJ0ZXJGdW5jdGlvbik7XG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShmb3JtYXRDb252ZXJ0ZXJGdW5jdGlvbik7XG5cbiAgICAvLyBTTlMgdG9waWMgZm9yIG5vdGlmaWNhdGlvbnNcbiAgICBjb25zdCBub3RpZmljYXRpb25Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ05vdGlmaWNhdGlvblRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgdm9pc2xhYi1ub3RpZmljYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGRpc3BsYXlOYW1lOiBgVm9pc0xhYiBOb3RpZmljYXRpb25zICgke2Vudmlyb25tZW50LnRvVXBwZXJDYXNlKCl9KWAsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgcXVldWUgZm9yIGNvbnRlbnQgcHJvbW90aW9uIHdvcmtmbG93XG4gICAgY29uc3QgcHJvbW90aW9uUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdQcm9tb3Rpb25RdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYHZvaXNsYWItcHJvbW90aW9uLXF1ZXVlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgY29udGVudCBwcm9tb3Rpb24gKG9ubHkgaW4gREVWIGVudmlyb25tZW50KVxuICAgIGxldCBjb250ZW50UHJvbW90ZXJGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uIHwgdW5kZWZpbmVkO1xuICAgIFxuICAgIGlmIChlbnZpcm9ubWVudCA9PT0gJ2RldicpIHtcbiAgICAgIGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ29udGVudFByb21vdGVyRnVuY3Rpb24nLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYHZvaXNsYWItY29udGVudC1wcm9tb3Rlci0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2NvbnRlbnQtcHJvbW90ZXInKSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAnREVWX01FVEFEQVRBX1RBQkxFX05BTUUnOiBhdWRpb01ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgICdQUk9EX01FVEFEQVRBX1RBQkxFX05BTUUnOiBgdm9pc2xhYi1hdWRpby1tZXRhZGF0YS1wcm9kYCwgLy8gV2lsbCBiZSBjcmVhdGVkIGluIFBST0Qgc3RhY2tcbiAgICAgICAgICAnREVWX01FRElBX0JVQ0tFVF9OQU1FJzogbWVkaWFCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICAnUFJPRF9NRURJQV9CVUNLRVRfTkFNRSc6IGB2b2lzbGFiLW1lZGlhLXByb2QtJHt0aGlzLmFjY291bnR9YCwgLy8gV2lsbCBiZSBjcmVhdGVkIGluIFBST0Qgc3RhY2tcbiAgICAgICAgICAnTk9USUZJQ0FUSU9OX1RPUElDX0FSTic6IG5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgICAgICdFTlZJUk9OTUVOVCc6IGVudmlyb25tZW50LFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDIsXG4gICAgICB9KTtcblxuICAgICAgLy8gR3JhbnQgY29udGVudCBwcm9tb3RlciBwZXJtaXNzaW9uc1xuICAgICAgYXVkaW9NZXRhZGF0YVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShjb250ZW50UHJvbW90ZXJGdW5jdGlvbik7XG4gICAgICBtZWRpYUJ1Y2tldC5ncmFudFJlYWQoY29udGVudFByb21vdGVyRnVuY3Rpb24pO1xuICAgICAgbm90aWZpY2F0aW9uVG9waWMuZ3JhbnRQdWJsaXNoKGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR3JhbnQgY3Jvc3MtYWNjb3VudCBwZXJtaXNzaW9ucyBmb3IgUFJPRCByZXNvdXJjZXMgKHdpbGwgYmUgY29uZmlndXJlZCBtYW51YWxseSlcbiAgICAgIGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICdzMzpQdXRPYmplY3RBY2wnLFxuICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6dm9pc2xhYi1tZWRpYS1wcm9kLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICAgICAgICBgYXJuOmF3czpzMzo6OnZvaXNsYWItbWVkaWEtcHJvZC0ke3RoaXMuYWNjb3VudH0vKmAsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAgIGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvdm9pc2xhYi1hdWRpby1tZXRhZGF0YS1wcm9kYCxcbiAgICAgICAgICBdLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBMYW1iZGEgbGF5ZXIgZm9yIHRlc3QgdXRpbGl0aWVzXG4gICAgY29uc3QgdGVzdFV0aWxzTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAnVGVzdFV0aWxzTGF5ZXInLCB7XG4gICAgICBsYXllclZlcnNpb25OYW1lOiBgdm9pc2xhYi10ZXN0LXV0aWxzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL3Rlc3QtdXRpbHMnKSxcbiAgICAgIGNvbXBhdGlibGVSdW50aW1lczogW2xhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVzdCB1dGlsaXRpZXMgZm9yIFZvaXNMYWIgYXVkaW8gcHJvY2Vzc2luZyBwaXBlbGluZScsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHBpcGVsaW5lIHRlc3RpbmdcbiAgICBjb25zdCBwaXBlbGluZVRlc3RlckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUGlwZWxpbmVUZXN0ZXJGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHZvaXNsYWItcGlwZWxpbmUtdGVzdGVyLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvcGlwZWxpbmUtdGVzdGVyJyksXG4gICAgICBsYXllcnM6IFt0ZXN0VXRpbHNMYXllcl0sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAnRU5WSVJPTk1FTlQnOiBlbnZpcm9ubWVudCxcbiAgICAgICAgJ05PVElGSUNBVElPTl9UT1BJQ19BUk4nOiBub3RpZmljYXRpb25Ub3BpYy50b3BpY0FybixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogMSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBpcGVsaW5lIHRlc3RlciBwZXJtaXNzaW9uc1xuICAgIHVwbG9hZEJ1Y2tldC5ncmFudFJlYWRXcml0ZShwaXBlbGluZVRlc3RlckZ1bmN0aW9uKTtcbiAgICBtZWRpYUJ1Y2tldC5ncmFudFJlYWRXcml0ZShwaXBlbGluZVRlc3RlckZ1bmN0aW9uKTtcbiAgICBhdWRpb01ldGFkYXRhVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHBpcGVsaW5lVGVzdGVyRnVuY3Rpb24pO1xuICAgIG5vdGlmaWNhdGlvblRvcGljLmdyYW50UHVibGlzaChwaXBlbGluZVRlc3RlckZ1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IExhbWJkYSBpbnZva2UgcGVybWlzc2lvbnMgZm9yIHRlc3Rpbmcgb3RoZXIgZnVuY3Rpb25zXG4gICAgcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdsYW1iZGE6SW52b2tlRnVuY3Rpb24nLFxuICAgICAgICAgICdsYW1iZGE6R2V0RnVuY3Rpb24nLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgICAgIGZvcm1hdENvbnZlcnRlckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgYWRkaXRpb25hbCBwZXJtaXNzaW9ucyBmb3IgaW5mcmFzdHJ1Y3R1cmUgY2hlY2tzXG4gICAgcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpHZXRCdWNrZXRQdWJsaWNBY2Nlc3NCbG9jaycsXG4gICAgICAgICAgJ3MzOkhlYWRCdWNrZXQnLFxuICAgICAgICAgICdkeW5hbW9kYjpEZXNjcmliZVRhYmxlJyxcbiAgICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVDb250aW51b3VzQmFja3VwcycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBQcm9tb3Rpb24gb3JjaGVzdHJhdG9yIChvbmx5IGluIERFViBlbnZpcm9ubWVudClcbiAgICBsZXQgcHJvbW90aW9uT3JjaGVzdHJhdG9yRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbiB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdkZXYnICYmIGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uKSB7XG4gICAgICBwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Byb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uJywge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGB2b2lzbGFiLXByb21vdGlvbi1vcmNoZXN0cmF0b3ItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9wcm9tb3Rpb24tb3JjaGVzdHJhdG9yJyksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgJ0VOVklST05NRU5UJzogZW52aXJvbm1lbnQsXG4gICAgICAgICAgJ0RFVl9NRVRBREFUQV9UQUJMRV9OQU1FJzogYXVkaW9NZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICAnQ09OVEVOVF9QUk9NT1RFUl9GVU5DVElPTl9OQU1FJzogY29udGVudFByb21vdGVyRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICAgICdQSVBFTElORV9URVNURVJfRlVOQ1RJT05fTkFNRSc6IHBpcGVsaW5lVGVzdGVyRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICAgICdOT1RJRklDQVRJT05fVE9QSUNfQVJOJzogbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICAgICAgJ1ZPSVNMQUJfQUNDT1VOVF9JRCc6IHRoaXMuYWNjb3VudCxcbiAgICAgICAgICAnVk9JU0xBQl9SRUdJT04nOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDEsXG4gICAgICB9KTtcblxuICAgICAgLy8gR3JhbnQgb3JjaGVzdHJhdG9yIHBlcm1pc3Npb25zXG4gICAgICBhdWRpb01ldGFkYXRhVGFibGUuZ3JhbnRSZWFkRGF0YShwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbik7XG4gICAgICBub3RpZmljYXRpb25Ub3BpYy5ncmFudFB1Ymxpc2gocHJvbW90aW9uT3JjaGVzdHJhdG9yRnVuY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHcmFudCBMYW1iZGEgaW52b2tlIHBlcm1pc3Npb25zXG4gICAgICBwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ2xhbWJkYTpJbnZva2VGdW5jdGlvbicsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgICAgICAgcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgICAgICBdLFxuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgICAgLy8gR3JhbnQgRXZlbnRCcmlkZ2UgcGVybWlzc2lvbnMgZm9yIHNjaGVkdWxpbmdcbiAgICAgIHByb21vdGlvbk9yY2hlc3RyYXRvckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnZXZlbnRzOlB1dFJ1bGUnLFxuICAgICAgICAgICAgJ2V2ZW50czpQdXRUYXJnZXRzJyxcbiAgICAgICAgICAgICdldmVudHM6RGVsZXRlUnVsZScsXG4gICAgICAgICAgICAnZXZlbnRzOlJlbW92ZVRhcmdldHMnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpldmVudHM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnJ1bGUvdm9pc2xhYi1wcm9tb3Rpb24tKmAsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGUgZm9yIHNjaGVkdWxlZCBiYXRjaCBwcm9tb3Rpb25zXG4gICAgICBjb25zdCBwcm9tb3Rpb25TY2hlZHVsZVJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ1Byb21vdGlvblNjaGVkdWxlUnVsZScsIHtcbiAgICAgICAgcnVsZU5hbWU6IGB2b2lzbGFiLXByb21vdGlvbi1zY2hlZHVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU2NoZWR1bGVkIGJhdGNoIGNvbnRlbnQgcHJvbW90aW9uIGZyb20gREVWIHRvIFBST0QnLFxuICAgICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgIG1pbnV0ZTogJzAnLFxuICAgICAgICAgIGhvdXI6ICcqLzYnLCAvLyBFdmVyeSA2IGhvdXJzXG4gICAgICAgICAgZGF5OiAnKicsXG4gICAgICAgICAgbW9udGg6ICcqJyxcbiAgICAgICAgICB5ZWFyOiAnKicsXG4gICAgICAgIH0pLFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFkZCBvcmNoZXN0cmF0b3IgYXMgdGFyZ2V0XG4gICAgICBwcm9tb3Rpb25TY2hlZHVsZVJ1bGUuYWRkVGFyZ2V0KFxuICAgICAgICBuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbiwge1xuICAgICAgICAgIGV2ZW50OiBldmVudHMuUnVsZVRhcmdldElucHV0LmZyb21PYmplY3Qoe1xuICAgICAgICAgICAgYWN0aW9uOiAnYmF0Y2hfcHJvbW90aW9uJyxcbiAgICAgICAgICAgIG1heFByb21vdGlvbnM6IDEwLFxuICAgICAgICAgICAgc2NoZWR1bGVkQnk6ICdjcm9uJyxcbiAgICAgICAgICAgIHNjaGVkdWxlZEF0OiBldmVudHMuU2NoZWR1bGUuY3Jvbih7XG4gICAgICAgICAgICAgIG1pbnV0ZTogJzAnLFxuICAgICAgICAgICAgICBob3VyOiAnKi82JyxcbiAgICAgICAgICAgIH0pLmV4cHJlc3Npb25TdHJpbmcsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICAvLyBFdmVudEJyaWRnZSBydWxlIGZvciBtYW51YWwgcHJvbW90aW9uIHRyaWdnZXJzXG4gICAgICBjb25zdCBtYW51YWxQcm9tb3Rpb25SdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdNYW51YWxQcm9tb3Rpb25SdWxlJywge1xuICAgICAgICBydWxlTmFtZTogYHZvaXNsYWItbWFudWFsLXByb21vdGlvbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTWFudWFsIGNvbnRlbnQgcHJvbW90aW9uIHRyaWdnZXInLFxuICAgICAgICBldmVudFBhdHRlcm46IHtcbiAgICAgICAgICBzb3VyY2U6IFsndm9pc2xhYi5jb250ZW50J10sXG4gICAgICAgICAgZGV0YWlsVHlwZTogWydNYW51YWwgUHJvbW90aW9uIFJlcXVlc3QnXSxcbiAgICAgICAgfSxcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICBtYW51YWxQcm9tb3Rpb25SdWxlLmFkZFRhcmdldChcbiAgICAgICAgbmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24ocHJvbW90aW9uT3JjaGVzdHJhdG9yRnVuY3Rpb24pXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEFkZCBTMyBldmVudCBub3RpZmljYXRpb24gdG8gdHJpZ2dlciBMYW1iZGFcbiAgICB1cGxvYWRCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBwcmVmaXg6ICdhdWRpby8nLFxuICAgICAgICBzdWZmaXg6ICcubXAzJyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdXBsb2FkQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbihhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgcHJlZml4OiAnYXVkaW8vJyxcbiAgICAgICAgc3VmZml4OiAnLndhdicsXG4gICAgICB9XG4gICAgKTtcblxuICAgIHVwbG9hZEJ1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIHByZWZpeDogJ2F1ZGlvLycsXG4gICAgICAgIHN1ZmZpeDogJy5mbGFjJyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdXBsb2FkQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbihhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgcHJlZml4OiAnYXVkaW8vJyxcbiAgICAgICAgc3VmZml4OiAnLm00YScsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIENsb3VkRnJvbnQgT3JpZ2luIEFjY2VzcyBJZGVudGl0eVxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ09BSScsIHtcbiAgICAgIGNvbW1lbnQ6IGBPQUkgZm9yIFZvaXNMYWIgV2Vic2l0ZSAke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDbG91ZEZyb250IGFjY2VzcyB0byB0aGUgd2Vic2l0ZSBidWNrZXRcbiAgICB3ZWJzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW3dlYnNpdGVCdWNrZXQuYXJuRm9yT2JqZWN0cygnKicpXSxcbiAgICAgICAgcHJpbmNpcGFsczogW29yaWdpbkFjY2Vzc0lkZW50aXR5LmdyYW50UHJpbmNpcGFsXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IENsb3VkRnJvbnQgYWNjZXNzIHRvIHRoZSBtZWRpYSBidWNrZXRcbiAgICBtZWRpYUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFttZWRpYUJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgICBwcmluY2lwYWxzOiBbb3JpZ2luQWNjZXNzSWRlbnRpdHkuZ3JhbnRQcmluY2lwYWxdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gZm9yIG1lZGlhIGNvbnRlbnRcbiAgICBjb25zdCBtZWRpYURpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnTWVkaWFEaXN0cmlidXRpb24nLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihtZWRpYUJ1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICB9KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRURfRk9SX1VOQ09NUFJFU1NFRF9PQkpFQ1RTLFxuICAgICAgfSxcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgICBjb21tZW50OiBgVm9pc0xhYiBNZWRpYSBDRE4gLSAke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBjb25maWd1cmF0aW9uIGluIFNTTSBQYXJhbWV0ZXIgU3RvcmUgZm9yIGZyb250ZW5kIGFjY2Vzc1xuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdNZWRpYURpc3RyaWJ1dGlvbkRvbWFpbicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvdm9pc2xhYi8ke2Vudmlyb25tZW50fS9tZWRpYS1kaXN0cmlidXRpb24tZG9tYWluYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBtZWRpYURpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBkb21haW4gZm9yIG1lZGlhIGNvbnRlbnQnLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ01lZGlhQnVja2V0Q29uZmlnJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC92b2lzbGFiLyR7ZW52aXJvbm1lbnR9L21lZGlhLWJ1Y2tldC1uYW1lYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBtZWRpYUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3IgbWVkaWEgY29udGVudCcsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnTWV0YWRhdGFUYWJsZUNvbmZpZycsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvdm9pc2xhYi8ke2Vudmlyb25tZW50fS9tZXRhZGF0YS10YWJsZS1uYW1lYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBhdWRpb01ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBhdWRpbyBtZXRhZGF0YScsXG4gICAgfSk7XG5cbiAgICAvLyBBbXBsaWZ5IEFwcCBmb3IgZnJvbnRlbmQgaG9zdGluZyB1c2luZyBMMSBjb25zdHJ1Y3RzXG4gICAgbGV0IGFtcGxpZnlBcHA6IGFtcGxpZnkuQ2ZuQXBwIHwgdW5kZWZpbmVkO1xuICAgIGxldCBjZXJ0aWZpY2F0ZTogY2VydGlmaWNhdGVtYW5hZ2VyLkNlcnRpZmljYXRlIHwgdW5kZWZpbmVkO1xuICAgIGxldCBob3N0ZWRab25lOiByb3V0ZTUzLklIb3N0ZWRab25lIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKGdpdGh1YlJlcG9zaXRvcnkgJiYgZ2l0aHViQWNjZXNzVG9rZW4pIHtcbiAgICAgIC8vIENyZWF0ZSBBbXBsaWZ5IHNlcnZpY2Ugcm9sZSBmaXJzdFxuICAgICAgY29uc3QgYW1wbGlmeVNlcnZpY2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBbXBsaWZ5U2VydmljZVJvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhbXBsaWZ5LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTZXJ2aWNlIHJvbGUgZm9yIEFtcGxpZnkgYXBwIHRvIGFjY2VzcyBBV1MgcmVzb3VyY2VzJyxcbiAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzLUFtcGxpZnknKSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBHcmFudCBhZGRpdGlvbmFsIHBlcm1pc3Npb25zIGZvciBTU00gUGFyYW1ldGVyIFN0b3JlIGFjY2Vzc1xuICAgICAgYW1wbGlmeVNlcnZpY2VSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVyJyxcbiAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVycycsXG4gICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnNCeVBhdGgnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpzc206JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci92b2lzbGFiLyR7ZW52aXJvbm1lbnR9LypgLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICAvLyBDcmVhdGUgQW1wbGlmeSBhcHAgd2l0aCBHaXRIdWIgaW50ZWdyYXRpb24gdXNpbmcgTDEgY29uc3RydWN0c1xuICAgICAgYW1wbGlmeUFwcCA9IG5ldyBhbXBsaWZ5LkNmbkFwcCh0aGlzLCAnQW1wbGlmeUFwcCcsIHtcbiAgICAgICAgbmFtZTogYHZvaXNsYWItd2Vic2l0ZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHJlcG9zaXRvcnk6IGBodHRwczovL2dpdGh1Yi5jb20vJHtnaXRodWJSZXBvc2l0b3J5fWAsXG4gICAgICAgIGFjY2Vzc1Rva2VuOiBnaXRodWJBY2Nlc3NUb2tlbixcbiAgICAgICAgYnVpbGRTcGVjOiBgdmVyc2lvbjogMVxuYXBwbGljYXRpb25zOlxuICAtIGZyb250ZW5kOlxuICAgICAgcGhhc2VzOlxuICAgICAgICBwcmVCdWlsZDpcbiAgICAgICAgICBjb21tYW5kczpcbiAgICAgICAgICAgIC0gbnBtIGNpXG4gICAgICAgIGJ1aWxkOlxuICAgICAgICAgIGNvbW1hbmRzOlxuICAgICAgICAgICAgLSBucG0gcnVuIGJ1aWxkXG4gICAgICBhcnRpZmFjdHM6XG4gICAgICAgIGJhc2VEaXJlY3Rvcnk6IGRpc3RcbiAgICAgICAgZmlsZXM6XG4gICAgICAgICAgLSAnKiovKidcbiAgICAgIGNhY2hlOlxuICAgICAgICBwYXRoczpcbiAgICAgICAgICAtIG5vZGVfbW9kdWxlcy8qKi8qXG4gICAgYXBwUm9vdDogLmAsXG4gICAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ1ZJVEVfQVdTX1JFR0lPTicsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5yZWdpb24sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnVklURV9FTlZJUk9OTUVOVCcsXG4gICAgICAgICAgICB2YWx1ZTogZW52aXJvbm1lbnQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnVklURV9NRURJQV9ESVNUUklCVVRJT05fRE9NQUlOJyxcbiAgICAgICAgICAgIHZhbHVlOiBtZWRpYURpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ1ZJVEVfTUVUQURBVEFfVEFCTEVfTkFNRScsXG4gICAgICAgICAgICB2YWx1ZTogYXVkaW9NZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdWSVRFX01FRElBX0JVQ0tFVF9OQU1FJyxcbiAgICAgICAgICAgIHZhbHVlOiBtZWRpYUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGN1c3RvbVJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc291cmNlOiAnLzwqPicsXG4gICAgICAgICAgICB0YXJnZXQ6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgICBzdGF0dXM6ICcyMDAnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGlhbVNlcnZpY2VSb2xlOiBhbXBsaWZ5U2VydmljZVJvbGUucm9sZUFybixcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcmVhdGUgYnJhbmNoIGZvciB0aGUgZW52aXJvbm1lbnRcbiAgICAgIGNvbnN0IGJyYW5jaE5hbWUgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ21haW4nIDogJ2RldmVsb3AnO1xuICAgICAgY29uc3QgYnJhbmNoID0gbmV3IGFtcGxpZnkuQ2ZuQnJhbmNoKHRoaXMsICdBbXBsaWZ5QnJhbmNoJywge1xuICAgICAgICBhcHBJZDogYW1wbGlmeUFwcC5hdHRyQXBwSWQsXG4gICAgICAgIGJyYW5jaE5hbWUsXG4gICAgICAgIGVuYWJsZUF1dG9CdWlsZDogdHJ1ZSxcbiAgICAgICAgZW5hYmxlUHVsbFJlcXVlc3RQcmV2aWV3OiBlbnZpcm9ubWVudCA9PT0gJ2RldicsXG4gICAgICAgIHN0YWdlOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ1BST0RVQ1RJT04nIDogJ0RFVkVMT1BNRU5UJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEb21haW4gY29uZmlndXJhdGlvbiBmb3IgcHJvZHVjdGlvblxuICAgICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZCcgJiYgZG9tYWluTmFtZSAmJiBob3N0ZWRab25lSWQpIHtcbiAgICAgICAgLy8gSW1wb3J0IGV4aXN0aW5nIGhvc3RlZCB6b25lXG4gICAgICAgIGhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICAgIGhvc3RlZFpvbmVJZCxcbiAgICAgICAgICB6b25lTmFtZTogZG9tYWluTmFtZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIFNTTCBjZXJ0aWZpY2F0ZVxuICAgICAgICBjZXJ0aWZpY2F0ZSA9IG5ldyBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGUodGhpcywgJ0NlcnRpZmljYXRlJywge1xuICAgICAgICAgIGRvbWFpbk5hbWUsXG4gICAgICAgICAgc3ViamVjdEFsdGVybmF0aXZlTmFtZXM6IFtgd3d3LiR7ZG9tYWluTmFtZX1gXSxcbiAgICAgICAgICB2YWxpZGF0aW9uOiBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGVWYWxpZGF0aW9uLmZyb21EbnMoaG9zdGVkWm9uZSksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCBjdXN0b20gZG9tYWluIHRvIEFtcGxpZnkgYXBwXG4gICAgICAgIGNvbnN0IGRvbWFpbiA9IG5ldyBhbXBsaWZ5LkNmbkRvbWFpbih0aGlzLCAnQW1wbGlmeURvbWFpbicsIHtcbiAgICAgICAgICBhcHBJZDogYW1wbGlmeUFwcC5hdHRyQXBwSWQsXG4gICAgICAgICAgZG9tYWluTmFtZSxcbiAgICAgICAgICBzdWJEb21haW5TZXR0aW5nczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBicmFuY2hOYW1lLFxuICAgICAgICAgICAgICBwcmVmaXg6ICcnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgYnJhbmNoTmFtZSxcbiAgICAgICAgICAgICAgcHJlZml4OiAnd3d3JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gT3V0cHV0IGRvbWFpbiBpbmZvcm1hdGlvblxuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2Vic2l0ZVVSTCcsIHtcbiAgICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkb21haW5OYW1lfWAsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIHdlYnNpdGUgVVJMJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NlcnRpZmljYXRlQXJuJywge1xuICAgICAgICAgIHZhbHVlOiBjZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFybixcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NTTCBjZXJ0aWZpY2F0ZSBBUk4nLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZvciBkZXYgZW52aXJvbm1lbnQsIHVzZSBBbXBsaWZ5IGRlZmF1bHQgZG9tYWluXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlVVJMJywge1xuICAgICAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2JyYW5jaE5hbWV9LiR7YW1wbGlmeUFwcC5hdHRyRGVmYXVsdERvbWFpbn1gLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgJHtlbnZpcm9ubWVudC50b1VwcGVyQ2FzZSgpfSB3ZWJzaXRlIFVSTGAsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQW1wbGlmeUFwcElkJywge1xuICAgICAgICB2YWx1ZTogYW1wbGlmeUFwcC5hdHRyQXBwSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQW1wbGlmeSBBcHAgSUQnLFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbXBsaWZ5QnJhbmNoTmFtZScsIHtcbiAgICAgICAgdmFsdWU6IGJyYW5jaE5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQW1wbGlmeSBicmFuY2ggbmFtZScsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRmFsbGJhY2sgdG8gUzMgKyBDbG91ZEZyb250IGZvciB3ZWJzaXRlIGhvc3RpbmcgaWYgQW1wbGlmeSBpcyBub3QgY29uZmlndXJlZFxuICAgICAgY29uc3Qgd2Vic2l0ZURpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnV2Vic2l0ZURpc3RyaWJ1dGlvbicsIHtcbiAgICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbih3ZWJzaXRlQnVja2V0LCB7XG4gICAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgICBlcnJvclJlc3BvbnNlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfMTAwLFxuICAgICAgICBjb21tZW50OiBgVm9pc0xhYiBXZWJzaXRlIC0gJHtlbnZpcm9ubWVudH1gLFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlVVJMJywge1xuICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHt3ZWJzaXRlRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICAgICAgZGVzY3JpcHRpb246IGAke2Vudmlyb25tZW50LnRvVXBwZXJDYXNlKCl9IHdlYnNpdGUgVVJMIChDbG91ZEZyb250KWAsXG4gICAgICB9KTtcblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVEaXN0cmlidXRpb25JZCcsIHtcbiAgICAgICAgdmFsdWU6IHdlYnNpdGVEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnV2Vic2l0ZSBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBJRCcsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VwbG9hZEJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3IgYXVkaW8gZmlsZSB1cGxvYWRzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB3ZWJzaXRlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3Igd2Vic2l0ZSBob3N0aW5nJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZWRpYUJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogbWVkaWFCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciBwcm9jZXNzZWQgbWVkaWEgc3RvcmFnZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXVkaW9NZXRhZGF0YVRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBhdWRpb01ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiB0YWJsZSBmb3IgYXVkaW8gbWV0YWRhdGEnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0F1ZGlvUHJvY2Vzc29yRnVuY3Rpb25OYW1lJywge1xuICAgICAgdmFsdWU6IGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBMYW1iZGEgZnVuY3Rpb24gZm9yIGF1ZGlvIHByb2Nlc3NpbmcnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01lZGlhRGlzdHJpYnV0aW9uSWQnLCB7XG4gICAgICB2YWx1ZTogbWVkaWFEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ01lZGlhIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZWRpYURpc3RyaWJ1dGlvbkRvbWFpbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogbWVkaWFEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTWVkaWEgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gRG9tYWluIE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Zvcm1hdENvbnZlcnRlckZ1bmN0aW9uTmFtZScsIHtcbiAgICAgIHZhbHVlOiBmb3JtYXRDb252ZXJ0ZXJGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIExhbWJkYSBmdW5jdGlvbiBmb3IgZm9ybWF0IGNvbnZlcnNpb24nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ05vdGlmaWNhdGlvblRvcGljQXJuJywge1xuICAgICAgdmFsdWU6IG5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIFNOUyB0b3BpYyBmb3Igbm90aWZpY2F0aW9ucycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvbW90aW9uUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogcHJvbW90aW9uUXVldWUucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VSTCBvZiB0aGUgU1FTIHF1ZXVlIGZvciBjb250ZW50IHByb21vdGlvbicsXG4gICAgfSk7XG5cbiAgICBpZiAoY29udGVudFByb21vdGVyRnVuY3Rpb24pIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb250ZW50UHJvbW90ZXJGdW5jdGlvbk5hbWUnLCB7XG4gICAgICAgIHZhbHVlOiBjb250ZW50UHJvbW90ZXJGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBjb250ZW50IHByb21vdGlvbicsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUGlwZWxpbmVUZXN0ZXJGdW5jdGlvbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIExhbWJkYSBmdW5jdGlvbiBmb3IgcGlwZWxpbmUgdGVzdGluZycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGVzdFV0aWxzTGF5ZXJBcm4nLCB7XG4gICAgICB2YWx1ZTogdGVzdFV0aWxzTGF5ZXIubGF5ZXJWZXJzaW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIHRlc3QgdXRpbGl0aWVzIExhbWJkYSBsYXllcicsXG4gICAgfSk7XG5cbiAgICBpZiAocHJvbW90aW9uT3JjaGVzdHJhdG9yRnVuY3Rpb24pIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbk5hbWUnLCB7XG4gICAgICAgIHZhbHVlOiBwcm9tb3Rpb25PcmNoZXN0cmF0b3JGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBwcm9tb3Rpb24gb3JjaGVzdHJhdGlvbicsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBVQVQgUnVubmVyIExhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IHVhdFJ1bm5lckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVUFUUnVubmVyRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGB2b2lzbGFiLXVhdC1ydW5uZXItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS91YXQtcnVubmVyJyksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAnRU5WSVJPTk1FTlQnOiBlbnZpcm9ubWVudCxcbiAgICAgICAgJ1VQTE9BRF9CVUNLRVRfTkFNRSc6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAnTUVESUFfQlVDS0VUX05BTUUnOiBtZWRpYUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAnTUVUQURBVEFfVEFCTEVfTkFNRSc6IGF1ZGlvTWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICdBVURJT19QUk9DRVNTT1JfRlVOQ1RJT05fTkFNRSc6IGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICAnRk9STUFUX0NPTlZFUlRFUl9GVU5DVElPTl9OQU1FJzogZm9ybWF0Q29udmVydGVyRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICAnQ09OVEVOVF9QUk9NT1RFUl9GVU5DVElPTl9OQU1FJzogY29udGVudFByb21vdGVyRnVuY3Rpb24/LmZ1bmN0aW9uTmFtZSB8fCAnJyxcbiAgICAgICAgJ1BJUEVMSU5FX1RFU1RFUl9GVU5DVElPTl9OQU1FJzogcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgICdOT1RJRklDQVRJT05fVE9QSUNfQVJOJzogbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDEsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBVQVQgcnVubmVyIGNvbXByZWhlbnNpdmUgcGVybWlzc2lvbnNcbiAgICB1cGxvYWRCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodWF0UnVubmVyRnVuY3Rpb24pO1xuICAgIG1lZGlhQnVja2V0LmdyYW50UmVhZFdyaXRlKHVhdFJ1bm5lckZ1bmN0aW9uKTtcbiAgICBhdWRpb01ldGFkYXRhVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHVhdFJ1bm5lckZ1bmN0aW9uKTtcbiAgICBub3RpZmljYXRpb25Ub3BpYy5ncmFudFB1Ymxpc2godWF0UnVubmVyRnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgTGFtYmRhIGludm9rZSBwZXJtaXNzaW9ucyBmb3IgYWxsIGZ1bmN0aW9uc1xuICAgIGNvbnN0IGZ1bmN0aW9uc1RvSW52b2tlID0gW1xuICAgICAgYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbixcbiAgICAgIGZvcm1hdENvbnZlcnRlckZ1bmN0aW9uLFxuICAgICAgcGlwZWxpbmVUZXN0ZXJGdW5jdGlvbixcbiAgICBdO1xuXG4gICAgaWYgKGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uKSB7XG4gICAgICBmdW5jdGlvbnNUb0ludm9rZS5wdXNoKGNvbnRlbnRQcm9tb3RlckZ1bmN0aW9uKTtcbiAgICB9XG5cbiAgICB1YXRSdW5uZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdsYW1iZGE6SW52b2tlRnVuY3Rpb24nLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IGZ1bmN0aW9uc1RvSW52b2tlLm1hcChmbiA9PiBmbi5mdW5jdGlvbkFybiksXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVUFUUnVubmVyRnVuY3Rpb25OYW1lJywge1xuICAgICAgdmFsdWU6IHVhdFJ1bm5lckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBVQVQgdGVzdGluZycsXG4gICAgfSk7XG4gIH1cbn0iXX0=