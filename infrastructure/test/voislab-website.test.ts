import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as VoislabWebsite from '../lib/voislab-website-stack';

describe('VoisLab Website Infrastructure', () => {
  let app: cdk.App;
  let stack: VoislabWebsite.VoislabWebsiteStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VoislabWebsite.VoislabWebsiteStack(app, 'TestStack', {
      environment: 'test',
    });
    template = Template.fromStack(stack);
  });

  describe('S3 Buckets', () => {
    test('creates exactly 3 S3 buckets', () => {
      template.resourceCountIs('AWS::S3::Bucket', 3);
    });

    test('upload bucket has correct configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteIncompleteMultipartUploads',
              Status: 'Enabled',
              AbortIncompleteMultipartUpload: {
                DaysAfterInitiation: 7,
              },
            }),
            Match.objectLike({
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
              NoncurrentVersionExpiration: {
                NoncurrentDays: 30,
              },
            }),
          ]),
        },
      });
    });

    test('website bucket has correct configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        WebsiteConfiguration: {
          IndexDocument: 'index.html',
          ErrorDocument: 'error.html',
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('media bucket has correct configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
        CorsConfiguration: {
          CorsRules: [
            {
              AllowedMethods: ['GET', 'HEAD'],
              AllowedOrigins: ['*'],
              AllowedHeaders: ['*'],
              MaxAge: 3600,
            },
          ],
        },
        LifecycleConfiguration: {
          Rules: [
            {
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
              NoncurrentVersionExpiration: {
                NoncurrentDays: 90,
              },
            },
          ],
        },
      });
    });

    test('buckets have correct removal policy for test environment', () => {
      // All buckets should have DELETE removal policy for test environment
      const buckets = template.findResources('AWS::S3::Bucket');
      Object.values(buckets).forEach((bucket: any) => {
        expect(bucket.DeletionPolicy).toBe('Delete');
      });
    });
  });

  describe('DynamoDB Table', () => {
    test('creates audio metadata table with correct configuration', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'voislab-audio-metadata-test',
        AttributeDefinitions: [
          {
            AttributeName: 'id',
            AttributeType: 'S',
          },
          {
            AttributeName: 'createdDate',
            AttributeType: 'S',
          },
          {
            AttributeName: 'status',
            AttributeType: 'S',
          },
          {
            AttributeName: 'genre',
            AttributeType: 'S',
          },
        ],
        KeySchema: [
          {
            AttributeName: 'id',
            KeyType: 'HASH',
          },
          {
            AttributeName: 'createdDate',
            KeyType: 'RANGE',
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('creates global secondary indexes', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        GlobalSecondaryIndexes: [
          {
            IndexName: 'StatusIndex',
            KeySchema: [
              {
                AttributeName: 'status',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'createdDate',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
          {
            IndexName: 'GenreIndex',
            KeySchema: [
              {
                AttributeName: 'genre',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'createdDate',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ],
      });
    });

    test('point-in-time recovery is disabled for test environment', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
      });
    });
  });

  describe('Lambda Function', () => {
    test('creates audio processor function with correct configuration', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'voislab-audio-processor-test',
        Runtime: 'python3.11',
        Handler: 'index.handler',
        Timeout: 300,
        MemorySize: 512,
        Environment: {
          Variables: {
            METADATA_TABLE_NAME: Match.anyValue(),
            MEDIA_BUCKET_NAME: Match.anyValue(),
            UPLOAD_BUCKET_NAME: Match.anyValue(),
          },
        },
      });
    });

    test('lambda function has correct IAM role permissions', () => {
      // Check that Lambda execution role is created
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            },
          ],
        },
        ManagedPolicyArns: [
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
              ],
            ],
          },
        ],
      });
    });

    test('lambda has S3 read permissions on upload bucket', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
              Effect: 'Allow',
              Resource: Match.anyValue(),
            }),
          ]),
        },
      });
    });

    test('lambda has S3 read/write permissions on media bucket', () => {
      // Check that there are separate policies for read and write permissions
      const policies = template.findResources('AWS::IAM::Policy');
      const policyStatements = Object.values(policies).flatMap((policy: any) => 
        policy.Properties.PolicyDocument.Statement
      );
      
      // Check for write permissions
      const hasWritePermissions = policyStatements.some((statement: any) => 
        Array.isArray(statement.Action) && 
        statement.Action.some((action: string) => action.includes('s3:PutObject') || action.includes('s3:DeleteObject'))
      );
      
      expect(hasWritePermissions).toBe(true);
    });

    test('lambda has DynamoDB write permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['dynamodb:BatchWriteItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem']),
              Effect: 'Allow',
              Resource: Match.anyValue(),
            }),
          ]),
        },
      });
    });
  });

  describe('S3 Event Notifications', () => {
    test('creates S3 event notifications for audio file types', () => {
      // Check for Lambda permissions to be invoked by S3
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 's3.amazonaws.com',
        SourceAccount: { Ref: 'AWS::AccountId' },
      });

      // Check that S3 bucket notification custom resource is created with multiple configurations
      template.hasResourceProperties('Custom::S3BucketNotifications', {
        NotificationConfiguration: {
          LambdaFunctionConfigurations: Match.arrayWith([
            // Check for .mp3 files
            Match.objectLike({
              Events: ['s3:ObjectCreated:*'],
              Filter: {
                Key: {
                  FilterRules: Match.arrayWith([
                    { Name: 'prefix', Value: 'audio/' },
                  ]),
                },
              },
            }),
          ]),
        },
      });
    });
  });

  describe('CloudFront Distribution', () => {
    test('creates CloudFront distribution with correct configuration', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultRootObject: 'index.html',
          Enabled: true,
          HttpVersion: 'http2',
          IPV6Enabled: true,
          PriceClass: 'PriceClass_100',
          DefaultCacheBehavior: {
            AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
            CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
            Compress: true,
            ViewerProtocolPolicy: 'redirect-to-https',
          },
          CacheBehaviors: [
            {
              PathPattern: '/media/*',
              AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
              CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
              Compress: true,
              ViewerProtocolPolicy: 'redirect-to-https',
            },
          ],
          CustomErrorResponses: [
            {
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            },
          ],
        },
      });
    });

    test('creates Origin Access Identity', () => {
      template.hasResourceProperties('AWS::CloudFront::CloudFrontOriginAccessIdentity', {
        CloudFrontOriginAccessIdentityConfig: {
          Comment: 'OAI for VoisLab Website test',
        },
      });
    });

    test('S3 bucket policies allow CloudFront access', () => {
      // Check that bucket policies are created for CloudFront access
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 's3:GetObject',
              Effect: 'Allow',
              Principal: {
                CanonicalUser: Match.anyValue(), // OAI principal
              },
              Resource: Match.anyValue(),
            },
          ],
        },
      });
    });
  });

  describe('Security Configuration', () => {
    test('all S3 buckets block public access', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      Object.values(buckets).forEach((bucket: any) => {
        expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        });
      });
    });

    test('S3 buckets have versioning enabled', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      Object.values(buckets).forEach((bucket: any) => {
        expect(bucket.Properties.VersioningConfiguration.Status).toBe('Enabled');
      });
    });

    test('IAM roles follow least privilege principle', () => {
      // Check that Lambda role only has necessary permissions
      const policies = template.findResources('AWS::IAM::Policy');
      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties.PolicyDocument.Statement;
        statements.forEach((statement: any) => {
          // Ensure no wildcard permissions on sensitive actions
          if (Array.isArray(statement.Action)) {
            expect(statement.Action).not.toContain('*');
            expect(statement.Action).not.toContain('s3:*');
            expect(statement.Action).not.toContain('dynamodb:*');
          }
        });
      });
    });

    test('CloudFront enforces HTTPS', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: 'redirect-to-https',
          },
          CacheBehaviors: Match.arrayWith([
            Match.objectLike({
              ViewerProtocolPolicy: 'redirect-to-https',
            }),
          ]),
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    test('creates all required stack outputs', () => {
      template.hasOutput('UploadBucketName', {
        Description: 'Name of the S3 bucket for audio file uploads',
      });

      template.hasOutput('WebsiteBucketName', {
        Description: 'Name of the S3 bucket for website hosting',
      });

      template.hasOutput('MediaBucketName', {
        Description: 'Name of the S3 bucket for processed media storage',
      });

      template.hasOutput('AudioMetadataTableName', {
        Description: 'Name of the DynamoDB table for audio metadata',
      });

      template.hasOutput('AudioProcessorFunctionName', {
        Description: 'Name of the Lambda function for audio processing',
      });

      template.hasOutput('DistributionId', {
        Description: 'CloudFront Distribution ID',
      });

      template.hasOutput('DistributionDomainName', {
        Description: 'CloudFront Distribution Domain Name',
      });
    });
  });
});

describe('Environment-specific Configuration', () => {
  test('production environment has retention policies', () => {
    const app = new cdk.App();
    const prodStack = new VoislabWebsite.VoislabWebsiteStack(app, 'ProdStack', {
      environment: 'prod',
    });
    const prodTemplate = Template.fromStack(prodStack);

    // Check that DynamoDB has point-in-time recovery enabled
    prodTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });

    // Check that S3 buckets have RETAIN deletion policy
    const buckets = prodTemplate.findResources('AWS::S3::Bucket');
    Object.values(buckets).forEach((bucket: any) => {
      expect(bucket.DeletionPolicy).toBe('Retain');
    });
  });

  test('development environment allows resource deletion', () => {
    const app = new cdk.App();
    const devStack = new VoislabWebsite.VoislabWebsiteStack(app, 'DevStack', {
      environment: 'dev',
    });
    const devTemplate = Template.fromStack(devStack);

    // Check that DynamoDB does not have point-in-time recovery enabled
    devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: false,
      },
    });

    // Check that S3 buckets have DELETE deletion policy for dev environment
    const buckets = devTemplate.findResources('AWS::S3::Bucket');
    Object.values(buckets).forEach((bucket: any) => {
      expect(bucket.DeletionPolicy).toBe('Delete');
    });
  });
});