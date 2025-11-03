"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const assertions_1 = require("aws-cdk-lib/assertions");
const VoislabWebsite = require("../lib/voislab-website-stack");
test('S3 Buckets Created', () => {
    const app = new cdk.App();
    const stack = new VoislabWebsite.VoislabWebsiteStack(app, 'MyTestStack', {
        environment: 'test',
    });
    const template = assertions_1.Template.fromStack(stack);
    // Verify S3 buckets are created
    template.hasResourceProperties('AWS::S3::Bucket', {
        WebsiteConfiguration: {
            IndexDocument: 'index.html',
            ErrorDocument: 'error.html',
        },
    });
    template.resourceCountIs('AWS::S3::Bucket', 2);
});
test('CloudFront Distribution Created', () => {
    const app = new cdk.App();
    const stack = new VoislabWebsite.VoislabWebsiteStack(app, 'MyTestStack', {
        environment: 'test',
    });
    const template = assertions_1.Template.fromStack(stack);
    // Verify CloudFront distribution is created
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
            DefaultRootObject: 'index.html',
        },
    });
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pc2xhYi13ZWJzaXRlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2lzbGFiLXdlYnNpdGUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG1DQUFtQztBQUNuQyx1REFBa0Q7QUFDbEQsK0RBQStEO0FBRS9ELElBQUksQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDOUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtRQUN2RSxXQUFXLEVBQUUsTUFBTTtLQUNwQixDQUFDLENBQUM7SUFFSCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUzQyxnQ0FBZ0M7SUFDaEMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1FBQ2hELG9CQUFvQixFQUFFO1lBQ3BCLGFBQWEsRUFBRSxZQUFZO1lBQzNCLGFBQWEsRUFBRSxZQUFZO1NBQzVCO0tBQ0YsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNqRCxDQUFDLENBQUMsQ0FBQztBQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7SUFDM0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtRQUN2RSxXQUFXLEVBQUUsTUFBTTtLQUNwQixDQUFDLENBQUM7SUFFSCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUzQyw0Q0FBNEM7SUFDNUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLCtCQUErQixFQUFFO1FBQzlELGtCQUFrQixFQUFFO1lBQ2xCLGlCQUFpQixFQUFFLFlBQVk7U0FDaEM7S0FDRixDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZUFBZSxDQUFDLCtCQUErQixFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQy9ELENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgKiBhcyBWb2lzbGFiV2Vic2l0ZSBmcm9tICcuLi9saWIvdm9pc2xhYi13ZWJzaXRlLXN0YWNrJztcblxudGVzdCgnUzMgQnVja2V0cyBDcmVhdGVkJywgKCkgPT4ge1xuICBjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICBjb25zdCBzdGFjayA9IG5ldyBWb2lzbGFiV2Vic2l0ZS5Wb2lzbGFiV2Vic2l0ZVN0YWNrKGFwcCwgJ015VGVzdFN0YWNrJywge1xuICAgIGVudmlyb25tZW50OiAndGVzdCcsXG4gIH0pO1xuXG4gIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAvLyBWZXJpZnkgUzMgYnVja2V0cyBhcmUgY3JlYXRlZFxuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICBXZWJzaXRlQ29uZmlndXJhdGlvbjoge1xuICAgICAgSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgRXJyb3JEb2N1bWVudDogJ2Vycm9yLmh0bWwnLFxuICAgIH0sXG4gIH0pO1xuXG4gIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMik7XG59KTtcblxudGVzdCgnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gQ3JlYXRlZCcsICgpID0+IHtcbiAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgY29uc3Qgc3RhY2sgPSBuZXcgVm9pc2xhYldlYnNpdGUuVm9pc2xhYldlYnNpdGVTdGFjayhhcHAsICdNeVRlc3RTdGFjaycsIHtcbiAgICBlbnZpcm9ubWVudDogJ3Rlc3QnLFxuICB9KTtcblxuICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cbiAgLy8gVmVyaWZ5IENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGlzIGNyZWF0ZWRcbiAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICBEaXN0cmlidXRpb25Db25maWc6IHtcbiAgICAgIERlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgfSxcbiAgfSk7XG5cbiAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIDEpO1xufSk7Il19