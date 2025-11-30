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
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface VoislabWebsiteStackProps extends cdk.StackProps {
  environment: string;
}

export class VoislabWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: VoislabWebsiteStackProps) {
    super(scope, id, props);

    const { environment } = props;

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

    // Note: Website hosting is handled by AWS Amplify separately

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
    // Note: CLOUDFRONT_DOMAIN will be added after distribution is created
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
        'CLOUDFRONT_DOMAIN': '', // Will be updated after distribution is created
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

    // Lambda function for metadata enrichment
    const metadataEnricherFunction = new lambda.Function(this, 'MetadataEnricherFunction', {
      functionName: `voislab-metadata-enricher-${environment}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/metadata-enricher/metadata-enricher.zip'),
      environment: {
        'METADATA_TABLE_NAME': audioMetadataTable.tableName,
        'MEDIA_BUCKET_NAME': mediaBucket.bucketName,
        'ENVIRONMENT': environment,
        'CLOUDFRONT_DOMAIN': '', // Will be updated after distribution is created
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      reservedConcurrentExecutions: environment === 'prod' ? 10 : 2,
    });

    // Grant metadata enricher permissions
    mediaBucket.grantReadWrite(metadataEnricherFunction);
    audioMetadataTable.grantReadWriteData(metadataEnricherFunction);

    // Update audio processor to include metadata enricher function name
    audioProcessorFunction.addEnvironment('METADATA_ENRICHER_FUNCTION', metadataEnricherFunction.functionName);

    // Grant audio processor permission to invoke metadata enricher
    metadataEnricherFunction.grantInvoke(audioProcessorFunction);

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

    // CloudFront is used only for media content delivery

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

    // Update Lambda environment variable with CloudFront domain
    audioProcessorFunction.addEnvironment('CLOUDFRONT_DOMAIN', mediaDistribution.distributionDomainName);
    metadataEnricherFunction.addEnvironment('CLOUDFRONT_DOMAIN', mediaDistribution.distributionDomainName);
    
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

    // Public API Lambda for frontend access (no auth required)
    const publicApiFunction = new lambda.Function(this, 'PublicApiFunction', {
      functionName: `voislab-public-api-${environment}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/public-api'),
      environment: {
        'METADATA_TABLE_NAME': audioMetadataTable.tableName,
        'CLOUDFRONT_DOMAIN': mediaDistribution.distributionDomainName,
        'ENVIRONMENT': environment,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // Grant read-only access to DynamoDB
    audioMetadataTable.grantReadData(publicApiFunction);

    // Create Function URL for public access
    const publicApiFunctionUrl = publicApiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Store API URL in SSM for frontend
    new ssm.StringParameter(this, 'PublicApiUrl', {
      parameterName: `/voislab/${environment}/public-api-url`,
      stringValue: publicApiFunctionUrl.url,
      description: 'Public API URL for frontend access',
    });

    // Note: Frontend hosting is handled by AWS Amplify separately
    // This CDK stack only manages backend infrastructure

    // Outputs
    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: uploadBucket.bucketName,
      description: 'Name of the S3 bucket for audio file uploads',
    });

    // Website hosting outputs removed - handled by Amplify

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

    new cdk.CfnOutput(this, 'MetadataEnricherFunctionName', {
      value: metadataEnricherFunction.functionName,
      description: 'Name of the Lambda function for metadata enrichment',
    });

    new cdk.CfnOutput(this, 'MediaDistributionId', {
      value: mediaDistribution.distributionId,
      description: 'Media CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'MediaDistributionDomainName', {
      value: mediaDistribution.distributionDomainName,
      description: 'Media CloudFront Distribution Domain Name',
    });

    new cdk.CfnOutput(this, 'PublicApiFunctionUrl', {
      value: publicApiFunctionUrl.url,
      description: 'Public API URL for frontend access (no auth required)',
      exportName: `voislab-public-api-url-${environment}`,
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

    // CloudWatch Monitoring and Alerting
    // TODO: Re-enable monitoring setup after fixing deprecated API usage
    // this.setupMonitoringAndAlerting(...);
  }

  /**
   * Setup comprehensive CloudWatch monitoring and alerting
   */
  private setupMonitoringAndAlerting(
    environment: string,
    audioProcessorFunction: lambda.Function,
    formatConverterFunction: lambda.Function,
    pipelineTesterFunction: lambda.Function,
    uatRunnerFunction: lambda.Function,
    contentPromoterFunction?: lambda.Function,
    promotionOrchestratorFunction?: lambda.Function,
    uploadBucket?: s3.Bucket,
    mediaBucket?: s3.Bucket,
    audioMetadataTable?: dynamodb.Table,
    mediaDistribution?: cloudfront.Distribution,
    notificationTopic?: sns.Topic
  ): void {
    
    // Create CloudWatch Log Groups with retention
    const logGroups = [
      audioProcessorFunction,
      formatConverterFunction,
      pipelineTesterFunction,
      uatRunnerFunction,
      contentPromoterFunction,
      promotionOrchestratorFunction,
    ].filter(Boolean).map(fn => {
      return new logs.LogGroup(this, `${fn!.functionName}LogGroup`, {
        logGroupName: `/aws/lambda/${fn!.functionName}`,
        retention: environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
        removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });
    });

    // Lambda Function Monitoring
    const lambdaFunctions = [
      { name: 'AudioProcessor', fn: audioProcessorFunction },
      { name: 'FormatConverter', fn: formatConverterFunction },
      { name: 'PipelineTester', fn: pipelineTesterFunction },
      { name: 'UATRunner', fn: uatRunnerFunction },
    ];

    if (contentPromoterFunction) {
      lambdaFunctions.push({ name: 'ContentPromoter', fn: contentPromoterFunction });
    }

    if (promotionOrchestratorFunction) {
      lambdaFunctions.push({ name: 'PromotionOrchestrator', fn: promotionOrchestratorFunction });
    }

    // Create alarms for each Lambda function
    lambdaFunctions.forEach(({ name, fn }) => {
      // Error rate alarm
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `voislab-${environment}-${name.toLowerCase()}-errors`,
        alarmDescription: `High error rate for ${name} function`,
        metric: fn.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: environment === 'prod' ? 5 : 10,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Duration alarm
      const durationAlarm = new cloudwatch.Alarm(this, `${name}DurationAlarm`, {
        alarmName: `voislab-${environment}-${name.toLowerCase()}-duration`,
        alarmDescription: `High duration for ${name} function`,
        metric: fn.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: fn.timeout ? fn.timeout.toMilliseconds() * 0.8 : 30000, // 80% of timeout
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Throttle alarm
      const throttleAlarm = new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
        alarmName: `voislab-${environment}-${name.toLowerCase()}-throttles`,
        alarmDescription: `Throttling detected for ${name} function`,
        metric: fn.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Add alarms to SNS topic if available
      if (notificationTopic) {
        errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
        durationAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
        throttleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
      }
    });

    // DynamoDB Monitoring
    if (audioMetadataTable) {
      // Throttle alarm (combined read/write)
      const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
        alarmName: `voislab-${environment}-dynamodb-throttles`,
        alarmDescription: 'DynamoDB throttling detected',
        metric: audioMetadataTable.metricThrottledRequests({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // System errors alarm
      const dynamoSystemErrorsAlarm = new cloudwatch.Alarm(this, 'DynamoSystemErrorsAlarm', {
        alarmName: `voislab-${environment}-dynamodb-system-errors`,
        alarmDescription: 'DynamoDB system errors detected',
        metric: audioMetadataTable.metricSystemErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (notificationTopic) {
        dynamoThrottleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
        dynamoSystemErrorsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
      }
    }

    // S3 Monitoring
    if (uploadBucket && mediaBucket) {
      // S3 4xx errors alarm
      const s3ClientErrorsAlarm = new cloudwatch.Alarm(this, 'S3ClientErrorsAlarm', {
        alarmName: `voislab-${environment}-s3-client-errors`,
        alarmDescription: 'High S3 4xx error rate detected',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: '4xxErrors',
          dimensionsMap: {
            BucketName: mediaBucket.bucketName,
          },
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 10,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // S3 5xx errors alarm
      const s3ServerErrorsAlarm = new cloudwatch.Alarm(this, 'S3ServerErrorsAlarm', {
        alarmName: `voislab-${environment}-s3-server-errors`,
        alarmDescription: 'S3 5xx errors detected',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: '5xxErrors',
          dimensionsMap: {
            BucketName: mediaBucket.bucketName,
          },
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (notificationTopic) {
        s3ClientErrorsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
        s3ServerErrorsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
      }
    }

    // CloudFront Monitoring
    if (mediaDistribution) {
      // CloudFront 4xx error rate alarm
      const cloudFrontClientErrorsAlarm = new cloudwatch.Alarm(this, 'CloudFrontClientErrorsAlarm', {
        alarmName: `voislab-${environment}-cloudfront-client-errors`,
        alarmDescription: 'High CloudFront 4xx error rate detected',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: '4xxErrorRate',
          dimensionsMap: {
            DistributionId: mediaDistribution.distributionId,
          },
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 5, // 5% error rate
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // CloudFront 5xx error rate alarm
      const cloudFrontServerErrorsAlarm = new cloudwatch.Alarm(this, 'CloudFrontServerErrorsAlarm', {
        alarmName: `voislab-${environment}-cloudfront-server-errors`,
        alarmDescription: 'CloudFront 5xx errors detected',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: '5xxErrorRate',
          dimensionsMap: {
            DistributionId: mediaDistribution.distributionId,
          },
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 1, // 1% error rate
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // CloudFront cache hit rate alarm (low cache hit rate)
      const cloudFrontCacheHitRateAlarm = new cloudwatch.Alarm(this, 'CloudFrontCacheHitRateAlarm', {
        alarmName: `voislab-${environment}-cloudfront-low-cache-hit-rate`,
        alarmDescription: 'Low CloudFront cache hit rate detected',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: 'CacheHitRate',
          dimensionsMap: {
            DistributionId: mediaDistribution.distributionId,
          },
          period: cdk.Duration.minutes(15),
          statistic: 'Average',
        }),
        threshold: 80, // 80% cache hit rate
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (notificationTopic) {
        cloudFrontClientErrorsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
        cloudFrontServerErrorsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
        cloudFrontCacheHitRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(notificationTopic));
      }
    }

    // Custom Metrics Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'VoisLabDashboard', {
      dashboardName: `voislab-${environment}-dashboard`,
    });

    // Lambda metrics widget
    const lambdaMetricsWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Metrics',
      left: lambdaFunctions.map(({ fn }) => fn.metricInvocations()),
      right: lambdaFunctions.map(({ fn }) => fn.metricErrors()),
      width: 12,
      height: 6,
    });

    // Lambda duration widget
    const lambdaDurationWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Duration',
      left: lambdaFunctions.map(({ fn }) => fn.metricDuration()),
      width: 12,
      height: 6,
    });

    dashboard.addWidgets(lambdaMetricsWidget, lambdaDurationWidget);

    // DynamoDB metrics widget
    if (audioMetadataTable) {
      const dynamoWidget = new cloudwatch.GraphWidget({
        title: 'DynamoDB Metrics',
        left: [
          audioMetadataTable.metricConsumedReadCapacityUnits(),
          audioMetadataTable.metricConsumedWriteCapacityUnits(),
        ],
        right: [
          audioMetadataTable.metricThrottledRequests(),
        ],
        width: 12,
        height: 6,
      });

      dashboard.addWidgets(dynamoWidget);
    }

    // CloudFront metrics widget
    if (mediaDistribution) {
      const cloudFrontWidget = new cloudwatch.GraphWidget({
        title: 'CloudFront Metrics',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: 'Requests',
            dimensionsMap: {
              DistributionId: mediaDistribution.distributionId,
            },
            statistic: 'Sum',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: '4xxErrorRate',
            dimensionsMap: {
              DistributionId: mediaDistribution.distributionId,
            },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: '5xxErrorRate',
            dimensionsMap: {
              DistributionId: mediaDistribution.distributionId,
            },
            statistic: 'Average',
          }),
        ],
        width: 12,
        height: 6,
      });

      dashboard.addWidgets(cloudFrontWidget);
    }

    // Store monitoring configuration in SSM
    new ssm.StringParameter(this, 'MonitoringConfig', {
      parameterName: `/voislab/${environment}/monitoring-config`,
      stringValue: JSON.stringify({
        dashboardUrl: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
        logGroups: logGroups.map(lg => lg.logGroupName),
        notificationTopicArn: notificationTopic?.topicArn,
        environment,
      }),
      description: 'CloudWatch monitoring configuration for VoisLab',
    });

    // Output monitoring information
    new cdk.CfnOutput(this, 'MonitoringDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL for monitoring',
    });

    if (notificationTopic) {
      new cdk.CfnOutput(this, 'AlertingTopicArn', {
        value: notificationTopic.topicArn,
        description: 'SNS Topic ARN for alerts and notifications',
      });
    }
  }
}