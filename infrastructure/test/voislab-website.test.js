"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const assertions_1 = require("aws-cdk-lib/assertions");
const VoislabWebsite = require("../lib/voislab-website-stack");
describe('VoisLab Website Infrastructure', () => {
    let app;
    let stack;
    let template;
    beforeEach(() => {
        app = new cdk.App();
        stack = new VoislabWebsite.VoislabWebsiteStack(app, 'TestStack', {
            environment: 'test',
        });
        template = assertions_1.Template.fromStack(stack);
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
                    Rules: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Id: 'DeleteIncompleteMultipartUploads',
                            Status: 'Enabled',
                            AbortIncompleteMultipartUpload: {
                                DaysAfterInitiation: 7,
                            },
                        }),
                        assertions_1.Match.objectLike({
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
            Object.values(buckets).forEach((bucket) => {
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
                Timeout: 600,
                MemorySize: 1024,
                Environment: {
                    Variables: {
                        METADATA_TABLE_NAME: assertions_1.Match.anyValue(),
                        MEDIA_BUCKET_NAME: assertions_1.Match.anyValue(),
                        UPLOAD_BUCKET_NAME: assertions_1.Match.anyValue(),
                        ENVIRONMENT: 'test',
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
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
                            Effect: 'Allow',
                            Resource: assertions_1.Match.anyValue(),
                        }),
                    ]),
                },
            });
        });
        test('lambda has S3 read/write permissions on media bucket', () => {
            // Check that there are separate policies for read and write permissions
            const policies = template.findResources('AWS::IAM::Policy');
            const policyStatements = Object.values(policies).flatMap((policy) => policy.Properties.PolicyDocument.Statement);
            // Check for write permissions
            const hasWritePermissions = policyStatements.some((statement) => Array.isArray(statement.Action) &&
                statement.Action.some((action) => action.includes('s3:PutObject') || action.includes('s3:DeleteObject')));
            expect(hasWritePermissions).toBe(true);
        });
        test('lambda has DynamoDB write permissions', () => {
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: assertions_1.Match.arrayWith(['dynamodb:BatchWriteItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem']),
                            Effect: 'Allow',
                            Resource: assertions_1.Match.anyValue(),
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
                    LambdaFunctionConfigurations: assertions_1.Match.arrayWith([
                        // Check for .mp3 files
                        assertions_1.Match.objectLike({
                            Events: ['s3:ObjectCreated:*'],
                            Filter: {
                                Key: {
                                    FilterRules: assertions_1.Match.arrayWith([
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
            // Test media distribution
            template.hasResourceProperties('AWS::CloudFront::Distribution', {
                DistributionConfig: {
                    Comment: 'VoisLab Media CDN - test',
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
                },
            });
            // Test website distribution
            template.hasResourceProperties('AWS::CloudFront::Distribution', {
                DistributionConfig: {
                    Comment: 'VoisLab Website - test',
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
                                CanonicalUser: assertions_1.Match.anyValue(), // OAI principal
                            },
                            Resource: assertions_1.Match.anyValue(),
                        },
                    ],
                },
            });
        });
    });
    describe('Security Configuration', () => {
        test('all S3 buckets block public access', () => {
            const buckets = template.findResources('AWS::S3::Bucket');
            Object.values(buckets).forEach((bucket) => {
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
            Object.values(buckets).forEach((bucket) => {
                expect(bucket.Properties.VersioningConfiguration.Status).toBe('Enabled');
            });
        });
        test('IAM roles follow least privilege principle', () => {
            // Check that Lambda role only has necessary permissions
            const policies = template.findResources('AWS::IAM::Policy');
            Object.values(policies).forEach((policy) => {
                const statements = policy.Properties.PolicyDocument.Statement;
                statements.forEach((statement) => {
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
            // Check that all CloudFront distributions enforce HTTPS
            const distributions = template.findResources('AWS::CloudFront::Distribution');
            Object.values(distributions).forEach((distribution) => {
                expect(distribution.Properties.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https');
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
            template.hasOutput('MediaDistributionId', {
                Description: 'Media CloudFront Distribution ID',
            });
            template.hasOutput('MediaDistributionDomainName', {
                Description: 'Media CloudFront Distribution Domain Name',
            });
            template.hasOutput('WebsiteDistributionId', {
                Description: 'Website CloudFront Distribution ID',
            });
            template.hasOutput('WebsiteURL', {
                Description: 'TEST website URL (CloudFront)',
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
        const prodTemplate = assertions_1.Template.fromStack(prodStack);
        // Check that DynamoDB has point-in-time recovery enabled
        prodTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true,
            },
        });
        // Check that S3 buckets have RETAIN deletion policy
        const buckets = prodTemplate.findResources('AWS::S3::Bucket');
        Object.values(buckets).forEach((bucket) => {
            expect(bucket.DeletionPolicy).toBe('Retain');
        });
    });
    test('development environment allows resource deletion', () => {
        const app = new cdk.App();
        const devStack = new VoislabWebsite.VoislabWebsiteStack(app, 'DevStack', {
            environment: 'dev',
        });
        const devTemplate = assertions_1.Template.fromStack(devStack);
        // Check that DynamoDB does not have point-in-time recovery enabled
        devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: false,
            },
        });
        // Check that S3 buckets have DELETE deletion policy for dev environment
        const buckets = devTemplate.findResources('AWS::S3::Bucket');
        Object.values(buckets).forEach((bucket) => {
            expect(bucket.DeletionPolicy).toBe('Delete');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pc2xhYi13ZWJzaXRlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2lzbGFiLXdlYnNpdGUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG1DQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsK0RBQStEO0FBRS9ELFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7SUFDOUMsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUF5QyxDQUFDO0lBQzlDLElBQUksUUFBa0IsQ0FBQztJQUV2QixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLEtBQUssR0FBRyxJQUFJLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQy9ELFdBQVcsRUFBRSxNQUFNO1NBQ3BCLENBQUMsQ0FBQztRQUNILFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQzFCLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDeEMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDbkQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCw4QkFBOEIsRUFBRTtvQkFDOUIsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHFCQUFxQixFQUFFLElBQUk7aUJBQzVCO2dCQUNELHVCQUF1QixFQUFFO29CQUN2QixNQUFNLEVBQUUsU0FBUztpQkFDbEI7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O1lBQ3hELGdDQUFnQyxFQUFFO2dCQUNoQywwQkFBMEIsRUFBRSxLQUFLO2FBQ2xDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsd0VBQXdFO1FBQ3hFLE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO1lBQzdDLE1BQU0sQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCAqIGFzIFZvaXNsYWJXZWJzaXRlIGZyb20gJy4uL2xpYi92b2lzbGFiLXdlYnNpdGUtc3RhY2snO1xuXG5kZXNjcmliZSgnVm9pc0xhYiBXZWJzaXRlIEluZnJhc3RydWN0dXJlJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IFZvaXNsYWJXZWJzaXRlLlZvaXNsYWJXZWJzaXRlU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBzdGFjayA9IG5ldyBWb2lzbGFiV2Vic2l0ZS5Wb2lzbGFiV2Vic2l0ZVN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgIGVudmlyb25tZW50OiAndGVzdCcsXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICBkZXNjcmliZSgnUzMgQnVja2V0cycsICgpID0+IHtcbiAgICB0ZXN0KCdjcmVhdGVzIGV4YWN0bHkgMyBTMyBidWNrZXRzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAzKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3VwbG9hZCBidWNrZXQgaGFzIGNvcnJlY3QgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIFZlcnNpb25pbmdDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgIH0sXG4gICAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBJZDogJ0RlbGV0ZUluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRzJyxcbiAgICAgICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICAgIEFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZDoge1xuICAgICAgICAgICAgICAgIERheXNBZnRlckluaXRpYXRpb246IDcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBJZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICAgIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIE5vbmN1cnJlbnREYXlzOiAzMCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCd3ZWJzaXRlIGJ1Y2tldCBoYXMgY29ycmVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICAgIFdlYnNpdGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgICAgIEVycm9yRG9jdW1lbnQ6ICdlcnJvci5odG1sJyxcbiAgICAgICAgfSxcbiAgICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBWZXJzaW9uaW5nQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIFN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdtZWRpYSBidWNrZXQgaGFzIGNvcnJlY3QgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIFZlcnNpb25pbmdDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgIH0sXG4gICAgICAgIENvcnNDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQ29yc1J1bGVzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIEFsbG93ZWRNZXRob2RzOiBbJ0dFVCcsICdIRUFEJ10sXG4gICAgICAgICAgICAgIEFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICAgICAgQWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgICAgICBNYXhBZ2U6IDM2MDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSdWxlczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBJZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICAgIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIE5vbmN1cnJlbnREYXlzOiA5MCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnYnVja2V0cyBoYXZlIGNvcnJlY3QgcmVtb3ZhbCBwb2xpY3kgZm9yIHRlc3QgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICAvLyBBbGwgYnVja2V0cyBzaG91bGQgaGF2ZSBERUxFVEUgcmVtb3ZhbCBwb2xpY3kgZm9yIHRlc3QgZW52aXJvbm1lbnRcbiAgICAgIGNvbnN0IGJ1Y2tldHMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlMzOjpCdWNrZXQnKTtcbiAgICAgIE9iamVjdC52YWx1ZXMoYnVja2V0cykuZm9yRWFjaCgoYnVja2V0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGJ1Y2tldC5EZWxldGlvblBvbGljeSkudG9CZSgnRGVsZXRlJyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0R5bmFtb0RCIFRhYmxlJywgKCkgPT4ge1xuICAgIHRlc3QoJ2NyZWF0ZXMgYXVkaW8gbWV0YWRhdGEgdGFibGUgd2l0aCBjb3JyZWN0IGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBUYWJsZU5hbWU6ICd2b2lzbGFiLWF1ZGlvLW1ldGFkYXRhLXRlc3QnLFxuICAgICAgICBBdHRyaWJ1dGVEZWZpbml0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdpZCcsXG4gICAgICAgICAgICBBdHRyaWJ1dGVUeXBlOiAnUycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3N0YXR1cycsXG4gICAgICAgICAgICBBdHRyaWJ1dGVUeXBlOiAnUycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnZ2VucmUnLFxuICAgICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdpZCcsXG4gICAgICAgICAgICBLZXlUeXBlOiAnSEFTSCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICAgICAgS2V5VHlwZTogJ1JBTkdFJyxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBCaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgZ2xvYmFsIHNlY29uZGFyeSBpbmRleGVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgICAgR2xvYmFsU2Vjb25kYXJ5SW5kZXhlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEluZGV4TmFtZTogJ1N0YXR1c0luZGV4JyxcbiAgICAgICAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3N0YXR1cycsXG4gICAgICAgICAgICAgICAgS2V5VHlwZTogJ0hBU0gnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2NyZWF0ZWREYXRlJyxcbiAgICAgICAgICAgICAgICBLZXlUeXBlOiAnUkFOR0UnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFByb2plY3Rpb246IHtcbiAgICAgICAgICAgICAgUHJvamVjdGlvblR5cGU6ICdBTEwnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIEluZGV4TmFtZTogJ0dlbnJlSW5kZXgnLFxuICAgICAgICAgICAgS2V5U2NoZW1hOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnZ2VucmUnLFxuICAgICAgICAgICAgICAgIEtleVR5cGU6ICdIQVNIJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdjcmVhdGVkRGF0ZScsXG4gICAgICAgICAgICAgICAgS2V5VHlwZTogJ1JBTkdFJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBQcm9qZWN0aW9uOiB7XG4gICAgICAgICAgICAgIFByb2plY3Rpb25UeXBlOiAnQUxMJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgncG9pbnQtaW4tdGltZSByZWNvdmVyeSBpcyBkaXNhYmxlZCBmb3IgdGVzdCBlbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdMYW1iZGEgRnVuY3Rpb24nLCAoKSA9PiB7XG4gICAgdGVzdCgnY3JlYXRlcyBhdWRpbyBwcm9jZXNzb3IgZnVuY3Rpb24gd2l0aCBjb3JyZWN0IGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAndm9pc2xhYi1hdWRpby1wcm9jZXNzb3ItdGVzdCcsXG4gICAgICAgIFJ1bnRpbWU6ICdweXRob24zLjExJyxcbiAgICAgICAgSGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBUaW1lb3V0OiA2MDAsXG4gICAgICAgIE1lbW9yeVNpemU6IDEwMjQsXG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiB7XG4gICAgICAgICAgICBNRVRBREFUQV9UQUJMRV9OQU1FOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgTUVESUFfQlVDS0VUX05BTUU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICBVUExPQURfQlVDS0VUX05BTUU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICBFTlZJUk9OTUVOVDogJ3Rlc3QnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2xhbWJkYSBmdW5jdGlvbiBoYXMgY29ycmVjdCBJQU0gcm9sZSBwZXJtaXNzaW9ucycsICgpID0+IHtcbiAgICAgIC8vIENoZWNrIHRoYXQgTGFtYmRhIGV4ZWN1dGlvbiByb2xlIGlzIGNyZWF0ZWRcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBBY3Rpb246ICdzdHM6QXNzdW1lUm9sZScsXG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgICAgU2VydmljZTogJ2xhbWJkYS5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgTWFuYWdlZFBvbGljeUFybnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICAnRm46OkpvaW4nOiBbXG4gICAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgJ2FybjonLFxuICAgICAgICAgICAgICAgIHsgUmVmOiAnQVdTOjpQYXJ0aXRpb24nIH0sXG4gICAgICAgICAgICAgICAgJzppYW06OmF3czpwb2xpY3kvc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2xhbWJkYSBoYXMgUzMgcmVhZCBwZXJtaXNzaW9ucyBvbiB1cGxvYWQgYnVja2V0JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6UG9saWN5Jywge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY3Rpb246IFsnczM6R2V0T2JqZWN0KicsICdzMzpHZXRCdWNrZXQqJywgJ3MzOkxpc3QqJ10sXG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnbGFtYmRhIGhhcyBTMyByZWFkL3dyaXRlIHBlcm1pc3Npb25zIG9uIG1lZGlhIGJ1Y2tldCcsICgpID0+IHtcbiAgICAgIC8vIENoZWNrIHRoYXQgdGhlcmUgYXJlIHNlcGFyYXRlIHBvbGljaWVzIGZvciByZWFkIGFuZCB3cml0ZSBwZXJtaXNzaW9uc1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OklBTTo6UG9saWN5Jyk7XG4gICAgICBjb25zdCBwb2xpY3lTdGF0ZW1lbnRzID0gT2JqZWN0LnZhbHVlcyhwb2xpY2llcykuZmxhdE1hcCgocG9saWN5OiBhbnkpID0+IFxuICAgICAgICBwb2xpY3kuUHJvcGVydGllcy5Qb2xpY3lEb2N1bWVudC5TdGF0ZW1lbnRcbiAgICAgICk7XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGZvciB3cml0ZSBwZXJtaXNzaW9uc1xuICAgICAgY29uc3QgaGFzV3JpdGVQZXJtaXNzaW9ucyA9IHBvbGljeVN0YXRlbWVudHMuc29tZSgoc3RhdGVtZW50OiBhbnkpID0+IFxuICAgICAgICBBcnJheS5pc0FycmF5KHN0YXRlbWVudC5BY3Rpb24pICYmIFxuICAgICAgICBzdGF0ZW1lbnQuQWN0aW9uLnNvbWUoKGFjdGlvbjogc3RyaW5nKSA9PiBhY3Rpb24uaW5jbHVkZXMoJ3MzOlB1dE9iamVjdCcpIHx8IGFjdGlvbi5pbmNsdWRlcygnczM6RGVsZXRlT2JqZWN0JykpXG4gICAgICApO1xuICAgICAgXG4gICAgICBleHBlY3QoaGFzV3JpdGVQZXJtaXNzaW9ucykudG9CZSh0cnVlKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2xhbWJkYSBoYXMgRHluYW1vREIgd3JpdGUgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFsnZHluYW1vZGI6QmF0Y2hXcml0ZUl0ZW0nLCAnZHluYW1vZGI6UHV0SXRlbScsICdkeW5hbW9kYjpVcGRhdGVJdGVtJ10pLFxuICAgICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICAgIFJlc291cmNlOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1MzIEV2ZW50IE5vdGlmaWNhdGlvbnMnLCAoKSA9PiB7XG4gICAgdGVzdCgnY3JlYXRlcyBTMyBldmVudCBub3RpZmljYXRpb25zIGZvciBhdWRpbyBmaWxlIHR5cGVzJywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgZm9yIExhbWJkYSBwZXJtaXNzaW9ucyB0byBiZSBpbnZva2VkIGJ5IFMzXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpQZXJtaXNzaW9uJywge1xuICAgICAgICBBY3Rpb246ICdsYW1iZGE6SW52b2tlRnVuY3Rpb24nLFxuICAgICAgICBQcmluY2lwYWw6ICdzMy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgU291cmNlQWNjb3VudDogeyBSZWY6ICdBV1M6OkFjY291bnRJZCcgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDaGVjayB0aGF0IFMzIGJ1Y2tldCBub3RpZmljYXRpb24gY3VzdG9tIHJlc291cmNlIGlzIGNyZWF0ZWQgd2l0aCBtdWx0aXBsZSBjb25maWd1cmF0aW9uc1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdDdXN0b206OlMzQnVja2V0Tm90aWZpY2F0aW9ucycsIHtcbiAgICAgICAgTm90aWZpY2F0aW9uQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIExhbWJkYUZ1bmN0aW9uQ29uZmlndXJhdGlvbnM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgLm1wMyBmaWxlc1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEV2ZW50czogWydzMzpPYmplY3RDcmVhdGVkOionXSxcbiAgICAgICAgICAgICAgRmlsdGVyOiB7XG4gICAgICAgICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICAgICAgICBGaWx0ZXJSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgICAgICAgeyBOYW1lOiAncHJlZml4JywgVmFsdWU6ICdhdWRpby8nIH0sXG4gICAgICAgICAgICAgICAgICBdKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uJywgKCkgPT4ge1xuICAgIHRlc3QoJ2NyZWF0ZXMgQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gd2l0aCBjb3JyZWN0IGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICAvLyBUZXN0IG1lZGlhIGRpc3RyaWJ1dGlvblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgQ29tbWVudDogJ1ZvaXNMYWIgTWVkaWEgQ0ROIC0gdGVzdCcsXG4gICAgICAgICAgRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBIdHRwVmVyc2lvbjogJ2h0dHAyJyxcbiAgICAgICAgICBJUFY2RW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBQcmljZUNsYXNzOiAnUHJpY2VDbGFzc18xMDAnLFxuICAgICAgICAgIERlZmF1bHRDYWNoZUJlaGF2aW9yOiB7XG4gICAgICAgICAgICBBbGxvd2VkTWV0aG9kczogWydHRVQnLCAnSEVBRCcsICdPUFRJT05TJ10sXG4gICAgICAgICAgICBDYWNoZWRNZXRob2RzOiBbJ0dFVCcsICdIRUFEJywgJ09QVElPTlMnXSxcbiAgICAgICAgICAgIENvbXByZXNzOiB0cnVlLFxuICAgICAgICAgICAgVmlld2VyUHJvdG9jb2xQb2xpY3k6ICdyZWRpcmVjdC10by1odHRwcycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBUZXN0IHdlYnNpdGUgZGlzdHJpYnV0aW9uXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgICBEaXN0cmlidXRpb25Db25maWc6IHtcbiAgICAgICAgICBDb21tZW50OiAnVm9pc0xhYiBXZWJzaXRlIC0gdGVzdCcsXG4gICAgICAgICAgRGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgICAgICBFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIEh0dHBWZXJzaW9uOiAnaHR0cDInLFxuICAgICAgICAgIElQVjZFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIFByaWNlQ2xhc3M6ICdQcmljZUNsYXNzXzEwMCcsXG4gICAgICAgICAgRGVmYXVsdENhY2hlQmVoYXZpb3I6IHtcbiAgICAgICAgICAgIEFsbG93ZWRNZXRob2RzOiBbJ0dFVCcsICdIRUFEJywgJ09QVElPTlMnXSxcbiAgICAgICAgICAgIENhY2hlZE1ldGhvZHM6IFsnR0VUJywgJ0hFQUQnLCAnT1BUSU9OUyddLFxuICAgICAgICAgICAgQ29tcHJlc3M6IHRydWUsXG4gICAgICAgICAgICBWaWV3ZXJQcm90b2NvbFBvbGljeTogJ3JlZGlyZWN0LXRvLWh0dHBzJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIEN1c3RvbUVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIEVycm9yQ29kZTogNDA0LFxuICAgICAgICAgICAgICBSZXNwb25zZUNvZGU6IDIwMCxcbiAgICAgICAgICAgICAgUmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBPcmlnaW4gQWNjZXNzIElkZW50aXR5JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkNsb3VkRnJvbnRPcmlnaW5BY2Nlc3NJZGVudGl0eScsIHtcbiAgICAgICAgQ2xvdWRGcm9udE9yaWdpbkFjY2Vzc0lkZW50aXR5Q29uZmlnOiB7XG4gICAgICAgICAgQ29tbWVudDogJ09BSSBmb3IgVm9pc0xhYiBXZWJzaXRlIHRlc3QnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdTMyBidWNrZXQgcG9saWNpZXMgYWxsb3cgQ2xvdWRGcm9udCBhY2Nlc3MnLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IGJ1Y2tldCBwb2xpY2llcyBhcmUgY3JlYXRlZCBmb3IgQ2xvdWRGcm9udCBhY2Nlc3NcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0UG9saWN5Jywge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBBY3Rpb246ICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICAgIFByaW5jaXBhbDoge1xuICAgICAgICAgICAgICAgIENhbm9uaWNhbFVzZXI6IE1hdGNoLmFueVZhbHVlKCksIC8vIE9BSSBwcmluY2lwYWxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1NlY3VyaXR5IENvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgdGVzdCgnYWxsIFMzIGJ1Y2tldHMgYmxvY2sgcHVibGljIGFjY2VzcycsICgpID0+IHtcbiAgICAgIGNvbnN0IGJ1Y2tldHMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlMzOjpCdWNrZXQnKTtcbiAgICAgIE9iamVjdC52YWx1ZXMoYnVja2V0cykuZm9yRWFjaCgoYnVja2V0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGJ1Y2tldC5Qcm9wZXJ0aWVzLlB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbikudG9FcXVhbCh7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnUzMgYnVja2V0cyBoYXZlIHZlcnNpb25pbmcgZW5hYmxlZCcsICgpID0+IHtcbiAgICAgIGNvbnN0IGJ1Y2tldHMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlMzOjpCdWNrZXQnKTtcbiAgICAgIE9iamVjdC52YWx1ZXMoYnVja2V0cykuZm9yRWFjaCgoYnVja2V0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGJ1Y2tldC5Qcm9wZXJ0aWVzLlZlcnNpb25pbmdDb25maWd1cmF0aW9uLlN0YXR1cykudG9CZSgnRW5hYmxlZCcpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdJQU0gcm9sZXMgZm9sbG93IGxlYXN0IHByaXZpbGVnZSBwcmluY2lwbGUnLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IExhbWJkYSByb2xlIG9ubHkgaGFzIG5lY2Vzc2FyeSBwZXJtaXNzaW9uc1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OklBTTo6UG9saWN5Jyk7XG4gICAgICBPYmplY3QudmFsdWVzKHBvbGljaWVzKS5mb3JFYWNoKChwb2xpY3k6IGFueSkgPT4ge1xuICAgICAgICBjb25zdCBzdGF0ZW1lbnRzID0gcG9saWN5LlByb3BlcnRpZXMuUG9saWN5RG9jdW1lbnQuU3RhdGVtZW50O1xuICAgICAgICBzdGF0ZW1lbnRzLmZvckVhY2goKHN0YXRlbWVudDogYW55KSA9PiB7XG4gICAgICAgICAgLy8gRW5zdXJlIG5vIHdpbGRjYXJkIHBlcm1pc3Npb25zIG9uIHNlbnNpdGl2ZSBhY3Rpb25zXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoc3RhdGVtZW50LkFjdGlvbikpIHtcbiAgICAgICAgICAgIGV4cGVjdChzdGF0ZW1lbnQuQWN0aW9uKS5ub3QudG9Db250YWluKCcqJyk7XG4gICAgICAgICAgICBleHBlY3Qoc3RhdGVtZW50LkFjdGlvbikubm90LnRvQ29udGFpbignczM6KicpO1xuICAgICAgICAgICAgZXhwZWN0KHN0YXRlbWVudC5BY3Rpb24pLm5vdC50b0NvbnRhaW4oJ2R5bmFtb2RiOionKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdDbG91ZEZyb250IGVuZm9yY2VzIEhUVFBTJywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCBhbGwgQ2xvdWRGcm9udCBkaXN0cmlidXRpb25zIGVuZm9yY2UgSFRUUFNcbiAgICAgIGNvbnN0IGRpc3RyaWJ1dGlvbnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicpO1xuICAgICAgT2JqZWN0LnZhbHVlcyhkaXN0cmlidXRpb25zKS5mb3JFYWNoKChkaXN0cmlidXRpb246IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoZGlzdHJpYnV0aW9uLlByb3BlcnRpZXMuRGlzdHJpYnV0aW9uQ29uZmlnLkRlZmF1bHRDYWNoZUJlaGF2aW9yLlZpZXdlclByb3RvY29sUG9saWN5KS50b0JlKCdyZWRpcmVjdC10by1odHRwcycpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTdGFjayBPdXRwdXRzJywgKCkgPT4ge1xuICAgIHRlc3QoJ2NyZWF0ZXMgYWxsIHJlcXVpcmVkIHN0YWNrIG91dHB1dHMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1VwbG9hZEJ1Y2tldE5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciBhdWRpbyBmaWxlIHVwbG9hZHMnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnV2Vic2l0ZUJ1Y2tldE5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciB3ZWJzaXRlIGhvc3RpbmcnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnTWVkaWFCdWNrZXROYW1lJywge1xuICAgICAgICBEZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3IgcHJvY2Vzc2VkIG1lZGlhIHN0b3JhZ2UnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnQXVkaW9NZXRhZGF0YVRhYmxlTmFtZScsIHtcbiAgICAgICAgRGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiB0YWJsZSBmb3IgYXVkaW8gbWV0YWRhdGEnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnQXVkaW9Qcm9jZXNzb3JGdW5jdGlvbk5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBhdWRpbyBwcm9jZXNzaW5nJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ01lZGlhRGlzdHJpYnV0aW9uSWQnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTWVkaWEgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gSUQnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnTWVkaWFEaXN0cmlidXRpb25Eb21haW5OYW1lJywge1xuICAgICAgICBEZXNjcmlwdGlvbjogJ01lZGlhIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIERvbWFpbiBOYW1lJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1dlYnNpdGVEaXN0cmlidXRpb25JZCcsIHtcbiAgICAgICAgRGVzY3JpcHRpb246ICdXZWJzaXRlIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1dlYnNpdGVVUkwnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnVEVTVCB3ZWJzaXRlIFVSTCAoQ2xvdWRGcm9udCknLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKCdFbnZpcm9ubWVudC1zcGVjaWZpYyBDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICB0ZXN0KCdwcm9kdWN0aW9uIGVudmlyb25tZW50IGhhcyByZXRlbnRpb24gcG9saWNpZXMnLCAoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBwcm9kU3RhY2sgPSBuZXcgVm9pc2xhYldlYnNpdGUuVm9pc2xhYldlYnNpdGVTdGFjayhhcHAsICdQcm9kU3RhY2snLCB7XG4gICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgIH0pO1xuICAgIGNvbnN0IHByb2RUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhwcm9kU3RhY2spO1xuXG4gICAgLy8gQ2hlY2sgdGhhdCBEeW5hbW9EQiBoYXMgcG9pbnQtaW4tdGltZSByZWNvdmVyeSBlbmFibGVkXG4gICAgcHJvZFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBQb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayB0aGF0IFMzIGJ1Y2tldHMgaGF2ZSBSRVRBSU4gZGVsZXRpb24gcG9saWN5XG4gICAgY29uc3QgYnVja2V0cyA9IHByb2RUZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlMzOjpCdWNrZXQnKTtcbiAgICBPYmplY3QudmFsdWVzKGJ1Y2tldHMpLmZvckVhY2goKGJ1Y2tldDogYW55KSA9PiB7XG4gICAgICBleHBlY3QoYnVja2V0LkRlbGV0aW9uUG9saWN5KS50b0JlKCdSZXRhaW4nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnQgYWxsb3dzIHJlc291cmNlIGRlbGV0aW9uJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgZGV2U3RhY2sgPSBuZXcgVm9pc2xhYldlYnNpdGUuVm9pc2xhYldlYnNpdGVTdGFjayhhcHAsICdEZXZTdGFjaycsIHtcbiAgICAgIGVudmlyb25tZW50OiAnZGV2JyxcbiAgICB9KTtcbiAgICBjb25zdCBkZXZUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhkZXZTdGFjayk7XG5cbiAgICAvLyBDaGVjayB0aGF0IER5bmFtb0RCIGRvZXMgbm90IGhhdmUgcG9pbnQtaW4tdGltZSByZWNvdmVyeSBlbmFibGVkXG4gICAgZGV2VGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayB0aGF0IFMzIGJ1Y2tldHMgaGF2ZSBERUxFVEUgZGVsZXRpb24gcG9saWN5IGZvciBkZXYgZW52aXJvbm1lbnRcbiAgICBjb25zdCBidWNrZXRzID0gZGV2VGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTMzo6QnVja2V0Jyk7XG4gICAgT2JqZWN0LnZhbHVlcyhidWNrZXRzKS5mb3JFYWNoKChidWNrZXQ6IGFueSkgPT4ge1xuICAgICAgZXhwZWN0KGJ1Y2tldC5EZWxldGlvblBvbGljeSkudG9CZSgnRGVsZXRlJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7Il19