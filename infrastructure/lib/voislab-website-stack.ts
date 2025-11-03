import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface VoislabWebsiteStackProps extends cdk.StackProps {
  environment: string;
  domainName?: string;
  hostedZoneId?: string;
  githubRepository?: string;
  githubAccessToken?: string;
}

export class VoislabWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: VoislabWebsiteStackProps) {
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
    let contentPromoterFunction: lambda.Function | undefined;
    
    if (environment === 'dev') {
      contentPromoterFunction = new lambda.Function(this, 'ContentPromoterFunction', {
        functionName: `voislab-content-promoter-${environment}`,
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: 'index.handler',
        code: lambda.Code.fromAsset('lambda/content-promoter'),
        environment: {
          'DEV_METADATA_TABLE_NAME': audioMetadataTable.tableName,
          'PROD_METADATA_TABLE_NAME': `voislab-audio-metadata-prod`, // Will be created in PROD stack
          'DEV_MEDIA_BUCKET_NAME': mediaBucket.bucketName,
          'PROD_MEDIA_BUCKET_NAME': `voislab-media-prod-${this.account}`, // Will be created in PROD stack
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
      contentPromoterFunction.addToRolePolicy(
        new iam.PolicyStatement({
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
        })
      );

      contentPromoterFunction.addToRolePolicy(
        new iam.PolicyStatement({
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
        })
      );
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
    pipelineTesterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'lambda:InvokeFunction',
          'lambda:GetFunction',
        ],
        resources: [
          audioProcessorFunction.functionArn,
          formatConverterFunction.functionArn,
        ],
      })
    );

    // Grant additional permissions for infrastructure checks
    pipelineTesterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetBucketPublicAccessBlock',
          's3:HeadBucket',
          'dynamodb:DescribeTable',
          'dynamodb:DescribeContinuousBackups',
        ],
        resources: ['*'],
      })
    );

    // Promotion orchestrator (only in DEV environment)
    let promotionOrchestratorFunction: lambda.Function | undefined;
    
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
      promotionOrchestratorFunction.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:InvokeFunction',
          ],
          resources: [
            contentPromoterFunction.functionArn,
            pipelineTesterFunction.functionArn,
          ],
        })
      );

      // Grant EventBridge permissions for scheduling
      promotionOrchestratorFunction.addToRolePolicy(
        new iam.PolicyStatement({
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
        })
      );

      // EventBridge rule for scheduled batch promotions
      const promotionScheduleRule = new events.Rule(this, 'PromotionScheduleRule', {
        ruleName: `voislab-promotion-schedule-${environment}`,
        description: 'Scheduled batch content promotion from DEV to PROD',
        schedule: events.Schedule.cron({
          minute: '0',
          hour: '*/6', // Every 6 hours
          day: '*',
          month: '*',
          year: '*',
        }),
        enabled: true,
      });

      // Add orchestrator as target
      promotionScheduleRule.addTarget(
        new targets.LambdaFunction(promotionOrchestratorFunction, {
          event: events.RuleTargetInput.fromObject({
            action: 'batch_promotion',
            maxPromotions: 10,
            scheduledBy: 'cron',
            scheduledAt: events.Schedule.cron({
              minute: '0',
              hour: '*/6',
            }).expressionString,
          }),
        })
      );

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

      manualPromotionRule.addTarget(
        new targets.LambdaFunction(promotionOrchestratorFunction)
      );
    }

    // Add S3 event notification to trigger Lambda
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(audioProcessorFunction),
      {
        prefix: 'audio/',
        suffix: '.mp3',
      }
    );

    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(audioProcessorFunction),
      {
        prefix: 'audio/',
        suffix: '.wav',
      }
    );

    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(audioProcessorFunction),
      {
        prefix: 'audio/',
        suffix: '.flac',
      }
    );

    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(audioProcessorFunction),
      {
        prefix: 'audio/',
        suffix: '.m4a',
      }
    );

    // CloudFront Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for VoisLab Website ${environment}`,
    });

    // Grant CloudFront access to the website bucket
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [websiteBucket.arnForObjects('*')],
        principals: [originAccessIdentity.grantPrincipal],
      })
    );

    // Grant CloudFront access to the media bucket
    mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [mediaBucket.arnForObjects('*')],
        principals: [originAccessIdentity.grantPrincipal],
      })
    );

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
    let amplifyApp: amplify.CfnApp | undefined;
    let certificate: certificatemanager.Certificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

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
      amplifyServiceRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
          ],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/voislab/${environment}/*`,
          ],
        })
      );

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
      } else {
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
    } else {
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

    uatRunnerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'lambda:InvokeFunction',
        ],
        resources: functionsToInvoke.map(fn => fn.functionArn),
      })
    );

    new cdk.CfnOutput(this, 'UATRunnerFunctionName', {
      value: uatRunnerFunction.functionName,
      description: 'Name of the Lambda function for UAT testing',
    });
  }
}