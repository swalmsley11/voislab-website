import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface VoislabWebsiteStackProps extends cdk.StackProps {
    environment: string;
    domainName?: string;
    hostedZoneId?: string;
    githubRepository?: string;
    githubAccessToken?: string;
}
export declare class VoislabWebsiteStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: VoislabWebsiteStackProps);
}
