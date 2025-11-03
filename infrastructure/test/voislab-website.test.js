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
                Timeout: 300,
                MemorySize: 512,
                Environment: {
                    Variables: {
                        METADATA_TABLE_NAME: assertions_1.Match.anyValue(),
                        MEDIA_BUCKET_NAME: assertions_1.Match.anyValue(),
                        UPLOAD_BUCKET_NAME: assertions_1.Match.anyValue(),
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
            template.hasResourceProperties('AWS::CloudFront::Distribution', {
                DistributionConfig: {
                    DefaultCacheBehavior: {
                        ViewerProtocolPolicy: 'redirect-to-https',
                    },
                    CacheBehaviors: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pc2xhYi13ZWJzaXRlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2lzbGFiLXdlYnNpdGUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG1DQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsK0RBQStEO0FBRS9ELFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7SUFDOUMsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUF5QyxDQUFDO0lBQzlDLElBQUksUUFBa0IsQ0FBQztJQUV2QixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLEtBQUssR0FBRyxJQUFJLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQy9ELFdBQVcsRUFBRSxNQUFNO1NBQ3BCLENBQUMsQ0FBQztRQUNILFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQzFCLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDeEMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDbkQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCw4QkFBOEIsRUFBRTtvQkFDOUIsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHFCQUFxQixFQUFFLElBQUk7aUJBQzVCO2dCQUNELHVCQUF1QixFQUFFO29CQUN2QixNQUFNLEVBQUUsU0FBUztpQkFDbEI7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Q0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBVyxFQUFFLEVBQUU7WUFDN0MsTUFBTSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrREFBa0QsRUFBRSxHQUFHLEVBQUU7UUFDNUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxjQUFjLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRTtZQUN2RSxXQUFXLEVBQUUsS0FBSztTQUNuQixDQUFDLENBQUM7UUFDSCxNQUFNLFdBQVcsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVqRCxtRUFBbUU7UUFDbkUsV0FBVyxDQUFDLHFCQUFxQixDQUFDLHNCQUFzQixFQUFFO1lBQ3hELGdDQUFnQyxFQUFFO2dCQUNoQywwQkFBMEIsRUFBRSxLQUFLO2FBQ2xDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsd0VBQXdFO1FBQ3hFLE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO1lBQzdDLE1BQU0sQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCAqIGFzIFZvaXNsYWJXZWJzaXRlIGZyb20gJy4uL2xpYi92b2lzbGFiLXdlYnNpdGUtc3RhY2snO1xuXG5kZXNjcmliZSgnVm9pc0xhYiBXZWJzaXRlIEluZnJhc3RydWN0dXJlJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IFZvaXNsYWJXZWJzaXRlLlZvaXNsYWJXZWJzaXRlU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBzdGFjayA9IG5ldyBWb2lzbGFiV2Vic2l0ZS5Wb2lzbGFiV2Vic2l0ZVN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgIGVudmlyb25tZW50OiAndGVzdCcsXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICBkZXNjcmliZSgnUzMgQnVja2V0cycsICgpID0+IHtcbiAgICB0ZXN0KCdjcmVhdGVzIGV4YWN0bHkgMyBTMyBidWNrZXRzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAzKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3VwbG9hZCBidWNrZXQgaGFzIGNvcnJlY3QgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIFZlcnNpb25pbmdDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgIH0sXG4gICAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBJZDogJ0RlbGV0ZUluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRzJyxcbiAgICAgICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICAgIEFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZDoge1xuICAgICAgICAgICAgICAgIERheXNBZnRlckluaXRpYXRpb246IDcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBJZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICAgIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIE5vbmN1cnJlbnREYXlzOiAzMCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCd3ZWJzaXRlIGJ1Y2tldCBoYXMgY29ycmVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICAgIFdlYnNpdGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgICAgIEVycm9yRG9jdW1lbnQ6ICdlcnJvci5odG1sJyxcbiAgICAgICAgfSxcbiAgICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBWZXJzaW9uaW5nQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIFN0YXR1czogJ0VuYWJsZWQnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdtZWRpYSBidWNrZXQgaGFzIGNvcnJlY3QgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIFZlcnNpb25pbmdDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgIH0sXG4gICAgICAgIENvcnNDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQ29yc1J1bGVzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIEFsbG93ZWRNZXRob2RzOiBbJ0dFVCcsICdIRUFEJ10sXG4gICAgICAgICAgICAgIEFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICAgICAgQWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgICAgICBNYXhBZ2U6IDM2MDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSdWxlczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBJZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICAgICAgU3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICAgIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIE5vbmN1cnJlbnREYXlzOiA5MCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnYnVja2V0cyBoYXZlIGNvcnJlY3QgcmVtb3ZhbCBwb2xpY3kgZm9yIHRlc3QgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICAvLyBBbGwgYnVja2V0cyBzaG91bGQgaGF2ZSBERUxFVEUgcmVtb3ZhbCBwb2xpY3kgZm9yIHRlc3QgZW52aXJvbm1lbnRcbiAgICAgIGNvbnN0IGJ1Y2tldHMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlMzOjpCdWNrZXQnKTtcbiAgICAgIE9iamVjdC52YWx1ZXMoYnVja2V0cykuZm9yRWFjaCgoYnVja2V0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGJ1Y2tldC5EZWxldGlvblBvbGljeSkudG9CZSgnRGVsZXRlJyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0R5bmFtb0RCIFRhYmxlJywgKCkgPT4ge1xuICAgIHRlc3QoJ2NyZWF0ZXMgYXVkaW8gbWV0YWRhdGEgdGFibGUgd2l0aCBjb3JyZWN0IGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBUYWJsZU5hbWU6ICd2b2lzbGFiLWF1ZGlvLW1ldGFkYXRhLXRlc3QnLFxuICAgICAgICBBdHRyaWJ1dGVEZWZpbml0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdpZCcsXG4gICAgICAgICAgICBBdHRyaWJ1dGVUeXBlOiAnUycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3N0YXR1cycsXG4gICAgICAgICAgICBBdHRyaWJ1dGVUeXBlOiAnUycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnZ2VucmUnLFxuICAgICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdpZCcsXG4gICAgICAgICAgICBLZXlUeXBlOiAnSEFTSCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICAgICAgS2V5VHlwZTogJ1JBTkdFJyxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBCaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgZ2xvYmFsIHNlY29uZGFyeSBpbmRleGVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgICAgR2xvYmFsU2Vjb25kYXJ5SW5kZXhlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEluZGV4TmFtZTogJ1N0YXR1c0luZGV4JyxcbiAgICAgICAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3N0YXR1cycsXG4gICAgICAgICAgICAgICAgS2V5VHlwZTogJ0hBU0gnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2NyZWF0ZWREYXRlJyxcbiAgICAgICAgICAgICAgICBLZXlUeXBlOiAnUkFOR0UnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFByb2plY3Rpb246IHtcbiAgICAgICAgICAgICAgUHJvamVjdGlvblR5cGU6ICdBTEwnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIEluZGV4TmFtZTogJ0dlbnJlSW5kZXgnLFxuICAgICAgICAgICAgS2V5U2NoZW1hOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnZ2VucmUnLFxuICAgICAgICAgICAgICAgIEtleVR5cGU6ICdIQVNIJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdjcmVhdGVkRGF0ZScsXG4gICAgICAgICAgICAgICAgS2V5VHlwZTogJ1JBTkdFJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBQcm9qZWN0aW9uOiB7XG4gICAgICAgICAgICAgIFByb2plY3Rpb25UeXBlOiAnQUxMJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgncG9pbnQtaW4tdGltZSByZWNvdmVyeSBpcyBkaXNhYmxlZCBmb3IgdGVzdCBlbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdMYW1iZGEgRnVuY3Rpb24nLCAoKSA9PiB7XG4gICAgdGVzdCgnY3JlYXRlcyBhdWRpbyBwcm9jZXNzb3IgZnVuY3Rpb24gd2l0aCBjb3JyZWN0IGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAndm9pc2xhYi1hdWRpby1wcm9jZXNzb3ItdGVzdCcsXG4gICAgICAgIFJ1bnRpbWU6ICdweXRob24zLjExJyxcbiAgICAgICAgSGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBUaW1lb3V0OiAzMDAsXG4gICAgICAgIE1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgIE1FVEFEQVRBX1RBQkxFX05BTUU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICBNRURJQV9CVUNLRVRfTkFNRTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICAgIFVQTE9BRF9CVUNLRVRfTkFNRTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdsYW1iZGEgZnVuY3Rpb24gaGFzIGNvcnJlY3QgSUFNIHJvbGUgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IExhbWJkYSBleGVjdXRpb24gcm9sZSBpcyBjcmVhdGVkXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgICBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgQWN0aW9uOiAnc3RzOkFzc3VtZVJvbGUnLFxuICAgICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICAgIFByaW5jaXBhbDoge1xuICAgICAgICAgICAgICAgIFNlcnZpY2U6ICdsYW1iZGEuYW1hem9uYXdzLmNvbScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIE1hbmFnZWRQb2xpY3lBcm5zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgJ0ZuOjpKb2luJzogW1xuICAgICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICdhcm46JyxcbiAgICAgICAgICAgICAgICB7IFJlZjogJ0FXUzo6UGFydGl0aW9uJyB9LFxuICAgICAgICAgICAgICAgICc6aWFtOjphd3M6cG9saWN5L3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdsYW1iZGEgaGFzIFMzIHJlYWQgcGVybWlzc2lvbnMgb24gdXBsb2FkIGJ1Y2tldCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgQWN0aW9uOiBbJ3MzOkdldE9iamVjdConLCAnczM6R2V0QnVja2V0KicsICdzMzpMaXN0KiddLFxuICAgICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICAgIFJlc291cmNlOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2xhbWJkYSBoYXMgUzMgcmVhZC93cml0ZSBwZXJtaXNzaW9ucyBvbiBtZWRpYSBidWNrZXQnLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IHRoZXJlIGFyZSBzZXBhcmF0ZSBwb2xpY2llcyBmb3IgcmVhZCBhbmQgd3JpdGUgcGVybWlzc2lvbnNcbiAgICAgIGNvbnN0IHBvbGljaWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpJQU06OlBvbGljeScpO1xuICAgICAgY29uc3QgcG9saWN5U3RhdGVtZW50cyA9IE9iamVjdC52YWx1ZXMocG9saWNpZXMpLmZsYXRNYXAoKHBvbGljeTogYW55KSA9PiBcbiAgICAgICAgcG9saWN5LlByb3BlcnRpZXMuUG9saWN5RG9jdW1lbnQuU3RhdGVtZW50XG4gICAgICApO1xuICAgICAgXG4gICAgICAvLyBDaGVjayBmb3Igd3JpdGUgcGVybWlzc2lvbnNcbiAgICAgIGNvbnN0IGhhc1dyaXRlUGVybWlzc2lvbnMgPSBwb2xpY3lTdGF0ZW1lbnRzLnNvbWUoKHN0YXRlbWVudDogYW55KSA9PiBcbiAgICAgICAgQXJyYXkuaXNBcnJheShzdGF0ZW1lbnQuQWN0aW9uKSAmJiBcbiAgICAgICAgc3RhdGVtZW50LkFjdGlvbi5zb21lKChhY3Rpb246IHN0cmluZykgPT4gYWN0aW9uLmluY2x1ZGVzKCdzMzpQdXRPYmplY3QnKSB8fCBhY3Rpb24uaW5jbHVkZXMoJ3MzOkRlbGV0ZU9iamVjdCcpKVxuICAgICAgKTtcbiAgICAgIFxuICAgICAgZXhwZWN0KGhhc1dyaXRlUGVybWlzc2lvbnMpLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdsYW1iZGEgaGFzIER5bmFtb0RCIHdyaXRlIHBlcm1pc3Npb25zJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6UG9saWN5Jywge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJywgJ2R5bmFtb2RiOlB1dEl0ZW0nLCAnZHluYW1vZGI6VXBkYXRlSXRlbSddKSxcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBSZXNvdXJjZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTMyBFdmVudCBOb3RpZmljYXRpb25zJywgKCkgPT4ge1xuICAgIHRlc3QoJ2NyZWF0ZXMgUzMgZXZlbnQgbm90aWZpY2F0aW9ucyBmb3IgYXVkaW8gZmlsZSB0eXBlcycsICgpID0+IHtcbiAgICAgIC8vIENoZWNrIGZvciBMYW1iZGEgcGVybWlzc2lvbnMgdG8gYmUgaW52b2tlZCBieSBTM1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6UGVybWlzc2lvbicsIHtcbiAgICAgICAgQWN0aW9uOiAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcbiAgICAgICAgUHJpbmNpcGFsOiAnczMuYW1hem9uYXdzLmNvbScsXG4gICAgICAgIFNvdXJjZUFjY291bnQ6IHsgUmVmOiAnQVdTOjpBY2NvdW50SWQnIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQ2hlY2sgdGhhdCBTMyBidWNrZXQgbm90aWZpY2F0aW9uIGN1c3RvbSByZXNvdXJjZSBpcyBjcmVhdGVkIHdpdGggbXVsdGlwbGUgY29uZmlndXJhdGlvbnNcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQ3VzdG9tOjpTM0J1Y2tldE5vdGlmaWNhdGlvbnMnLCB7XG4gICAgICAgIE5vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBMYW1iZGFGdW5jdGlvbkNvbmZpZ3VyYXRpb25zOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIC5tcDMgZmlsZXNcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBFdmVudHM6IFsnczM6T2JqZWN0Q3JlYXRlZDoqJ10sXG4gICAgICAgICAgICAgIEZpbHRlcjoge1xuICAgICAgICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgICAgICAgRmlsdGVyUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgICAgIHsgTmFtZTogJ3ByZWZpeCcsIFZhbHVlOiAnYXVkaW8vJyB9LFxuICAgICAgICAgICAgICAgICAgXSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdDbG91ZEZyb250IERpc3RyaWJ1dGlvbicsICgpID0+IHtcbiAgICB0ZXN0KCdjcmVhdGVzIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIHdpdGggY29ycmVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgRGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgICAgICBFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIEh0dHBWZXJzaW9uOiAnaHR0cDInLFxuICAgICAgICAgIElQVjZFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIFByaWNlQ2xhc3M6ICdQcmljZUNsYXNzXzEwMCcsXG4gICAgICAgICAgRGVmYXVsdENhY2hlQmVoYXZpb3I6IHtcbiAgICAgICAgICAgIEFsbG93ZWRNZXRob2RzOiBbJ0dFVCcsICdIRUFEJywgJ09QVElPTlMnXSxcbiAgICAgICAgICAgIENhY2hlZE1ldGhvZHM6IFsnR0VUJywgJ0hFQUQnLCAnT1BUSU9OUyddLFxuICAgICAgICAgICAgQ29tcHJlc3M6IHRydWUsXG4gICAgICAgICAgICBWaWV3ZXJQcm90b2NvbFBvbGljeTogJ3JlZGlyZWN0LXRvLWh0dHBzJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIENhY2hlQmVoYXZpb3JzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFBhdGhQYXR0ZXJuOiAnL21lZGlhLyonLFxuICAgICAgICAgICAgICBBbGxvd2VkTWV0aG9kczogWydHRVQnLCAnSEVBRCcsICdPUFRJT05TJ10sXG4gICAgICAgICAgICAgIENhY2hlZE1ldGhvZHM6IFsnR0VUJywgJ0hFQUQnLCAnT1BUSU9OUyddLFxuICAgICAgICAgICAgICBDb21wcmVzczogdHJ1ZSxcbiAgICAgICAgICAgICAgVmlld2VyUHJvdG9jb2xQb2xpY3k6ICdyZWRpcmVjdC10by1odHRwcycsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgQ3VzdG9tRXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgRXJyb3JDb2RlOiA0MDQsXG4gICAgICAgICAgICAgIFJlc3BvbnNlQ29kZTogMjAwLFxuICAgICAgICAgICAgICBSZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIE9yaWdpbiBBY2Nlc3MgSWRlbnRpdHknLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6Q2xvdWRGcm9udE9yaWdpbkFjY2Vzc0lkZW50aXR5Jywge1xuICAgICAgICBDbG91ZEZyb250T3JpZ2luQWNjZXNzSWRlbnRpdHlDb25maWc6IHtcbiAgICAgICAgICBDb21tZW50OiAnT0FJIGZvciBWb2lzTGFiIFdlYnNpdGUgdGVzdCcsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1MzIGJ1Y2tldCBwb2xpY2llcyBhbGxvdyBDbG91ZEZyb250IGFjY2VzcycsICgpID0+IHtcbiAgICAgIC8vIENoZWNrIHRoYXQgYnVja2V0IHBvbGljaWVzIGFyZSBjcmVhdGVkIGZvciBDbG91ZEZyb250IGFjY2Vzc1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXRQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIEFjdGlvbjogJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgICAgQ2Fub25pY2FsVXNlcjogTWF0Y2guYW55VmFsdWUoKSwgLy8gT0FJIHByaW5jaXBhbFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBSZXNvdXJjZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU2VjdXJpdHkgQ29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICB0ZXN0KCdhbGwgUzMgYnVja2V0cyBibG9jayBwdWJsaWMgYWNjZXNzJywgKCkgPT4ge1xuICAgICAgY29uc3QgYnVja2V0cyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6UzM6OkJ1Y2tldCcpO1xuICAgICAgT2JqZWN0LnZhbHVlcyhidWNrZXRzKS5mb3JFYWNoKChidWNrZXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoYnVja2V0LlByb3BlcnRpZXMuUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uKS50b0VxdWFsKHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdTMyBidWNrZXRzIGhhdmUgdmVyc2lvbmluZyBlbmFibGVkJywgKCkgPT4ge1xuICAgICAgY29uc3QgYnVja2V0cyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6UzM6OkJ1Y2tldCcpO1xuICAgICAgT2JqZWN0LnZhbHVlcyhidWNrZXRzKS5mb3JFYWNoKChidWNrZXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoYnVja2V0LlByb3BlcnRpZXMuVmVyc2lvbmluZ0NvbmZpZ3VyYXRpb24uU3RhdHVzKS50b0JlKCdFbmFibGVkJyk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0lBTSByb2xlcyBmb2xsb3cgbGVhc3QgcHJpdmlsZWdlIHByaW5jaXBsZScsICgpID0+IHtcbiAgICAgIC8vIENoZWNrIHRoYXQgTGFtYmRhIHJvbGUgb25seSBoYXMgbmVjZXNzYXJ5IHBlcm1pc3Npb25zXG4gICAgICBjb25zdCBwb2xpY2llcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6SUFNOjpQb2xpY3knKTtcbiAgICAgIE9iamVjdC52YWx1ZXMocG9saWNpZXMpLmZvckVhY2goKHBvbGljeTogYW55KSA9PiB7XG4gICAgICAgIGNvbnN0IHN0YXRlbWVudHMgPSBwb2xpY3kuUHJvcGVydGllcy5Qb2xpY3lEb2N1bWVudC5TdGF0ZW1lbnQ7XG4gICAgICAgIHN0YXRlbWVudHMuZm9yRWFjaCgoc3RhdGVtZW50OiBhbnkpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgbm8gd2lsZGNhcmQgcGVybWlzc2lvbnMgb24gc2Vuc2l0aXZlIGFjdGlvbnNcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzdGF0ZW1lbnQuQWN0aW9uKSkge1xuICAgICAgICAgICAgZXhwZWN0KHN0YXRlbWVudC5BY3Rpb24pLm5vdC50b0NvbnRhaW4oJyonKTtcbiAgICAgICAgICAgIGV4cGVjdChzdGF0ZW1lbnQuQWN0aW9uKS5ub3QudG9Db250YWluKCdzMzoqJyk7XG4gICAgICAgICAgICBleHBlY3Qoc3RhdGVtZW50LkFjdGlvbikubm90LnRvQ29udGFpbignZHluYW1vZGI6KicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0Nsb3VkRnJvbnQgZW5mb3JjZXMgSFRUUFMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgICBEaXN0cmlidXRpb25Db25maWc6IHtcbiAgICAgICAgICBEZWZhdWx0Q2FjaGVCZWhhdmlvcjoge1xuICAgICAgICAgICAgVmlld2VyUHJvdG9jb2xQb2xpY3k6ICdyZWRpcmVjdC10by1odHRwcycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBDYWNoZUJlaGF2aW9yczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBWaWV3ZXJQcm90b2NvbFBvbGljeTogJ3JlZGlyZWN0LXRvLWh0dHBzJyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTdGFjayBPdXRwdXRzJywgKCkgPT4ge1xuICAgIHRlc3QoJ2NyZWF0ZXMgYWxsIHJlcXVpcmVkIHN0YWNrIG91dHB1dHMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1VwbG9hZEJ1Y2tldE5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciBhdWRpbyBmaWxlIHVwbG9hZHMnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnV2Vic2l0ZUJ1Y2tldE5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciB3ZWJzaXRlIGhvc3RpbmcnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnTWVkaWFCdWNrZXROYW1lJywge1xuICAgICAgICBEZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3IgcHJvY2Vzc2VkIG1lZGlhIHN0b3JhZ2UnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnQXVkaW9NZXRhZGF0YVRhYmxlTmFtZScsIHtcbiAgICAgICAgRGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiB0YWJsZSBmb3IgYXVkaW8gbWV0YWRhdGEnLFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnQXVkaW9Qcm9jZXNzb3JGdW5jdGlvbk5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBhdWRpbyBwcm9jZXNzaW5nJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0Rpc3RyaWJ1dGlvbklkJywge1xuICAgICAgICBEZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0Rpc3RyaWJ1dGlvbkRvbWFpbk5hbWUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gRG9tYWluIE5hbWUnLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKCdFbnZpcm9ubWVudC1zcGVjaWZpYyBDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICB0ZXN0KCdwcm9kdWN0aW9uIGVudmlyb25tZW50IGhhcyByZXRlbnRpb24gcG9saWNpZXMnLCAoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBwcm9kU3RhY2sgPSBuZXcgVm9pc2xhYldlYnNpdGUuVm9pc2xhYldlYnNpdGVTdGFjayhhcHAsICdQcm9kU3RhY2snLCB7XG4gICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgIH0pO1xuICAgIGNvbnN0IHByb2RUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhwcm9kU3RhY2spO1xuXG4gICAgLy8gQ2hlY2sgdGhhdCBEeW5hbW9EQiBoYXMgcG9pbnQtaW4tdGltZSByZWNvdmVyeSBlbmFibGVkXG4gICAgcHJvZFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBQb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayB0aGF0IFMzIGJ1Y2tldHMgaGF2ZSBSRVRBSU4gZGVsZXRpb24gcG9saWN5XG4gICAgY29uc3QgYnVja2V0cyA9IHByb2RUZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlMzOjpCdWNrZXQnKTtcbiAgICBPYmplY3QudmFsdWVzKGJ1Y2tldHMpLmZvckVhY2goKGJ1Y2tldDogYW55KSA9PiB7XG4gICAgICBleHBlY3QoYnVja2V0LkRlbGV0aW9uUG9saWN5KS50b0JlKCdSZXRhaW4nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnQgYWxsb3dzIHJlc291cmNlIGRlbGV0aW9uJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgZGV2U3RhY2sgPSBuZXcgVm9pc2xhYldlYnNpdGUuVm9pc2xhYldlYnNpdGVTdGFjayhhcHAsICdEZXZTdGFjaycsIHtcbiAgICAgIGVudmlyb25tZW50OiAnZGV2JyxcbiAgICB9KTtcbiAgICBjb25zdCBkZXZUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhkZXZTdGFjayk7XG5cbiAgICAvLyBDaGVjayB0aGF0IER5bmFtb0RCIGRvZXMgbm90IGhhdmUgcG9pbnQtaW4tdGltZSByZWNvdmVyeSBlbmFibGVkXG4gICAgZGV2VGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayB0aGF0IFMzIGJ1Y2tldHMgaGF2ZSBERUxFVEUgZGVsZXRpb24gcG9saWN5IGZvciBkZXYgZW52aXJvbm1lbnRcbiAgICBjb25zdCBidWNrZXRzID0gZGV2VGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTMzo6QnVja2V0Jyk7XG4gICAgT2JqZWN0LnZhbHVlcyhidWNrZXRzKS5mb3JFYWNoKChidWNrZXQ6IGFueSkgPT4ge1xuICAgICAgZXhwZWN0KGJ1Y2tldC5EZWxldGlvblBvbGljeSkudG9CZSgnRGVsZXRlJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7Il19