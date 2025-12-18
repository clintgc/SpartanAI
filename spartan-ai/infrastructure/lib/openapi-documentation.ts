import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { ApiGateway } from './api-gateway';

export interface OpenApiDocumentationProps {
  apiGateway: ApiGateway;
}

export class OpenApiDocumentation extends Construct {
  public readonly documentationBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: OpenApiDocumentationProps) {
    super(scope, id);

    // Create S3 bucket for OpenAPI documentation
    // Security: Bucket is private, accessed only through CloudFront
    this.documentationBucket = new s3.Bucket(this, 'ApiDocumentationBucket', {
      bucketName: `spartan-ai-api-docs-${cdk.Aws.ACCOUNT_ID}`,
      publicReadAccess: false, // Security: Disable public access - use CloudFront instead
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block all public access
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false, // Versioning handled via timestamped filenames
    });

    // Create Lambda function to export OpenAPI spec from API Gateway
    // This automatically exports the OpenAPI 3.0 spec from the deployed API Gateway
    const exportOpenApiLambda = new lambdaNodejs.NodejsFunction(this, 'ExportOpenApiLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      functionName: 'spartan-ai-export-openapi',
      entry: path.join(__dirname, '../../functions/export-openapi-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['aws-sdk'],
      },
    });

    // Grant permissions to Lambda for API Gateway export
    // GetExport requires read access to the REST API
    exportOpenApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'apigateway:GET',
        ],
        resources: [
          `arn:aws:apigateway:${cdk.Aws.REGION}::/restapis/${props.apiGateway.restApi.restApiId}`,
        ],
      })
    );

    exportOpenApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:ListObjects',
          's3:ListObjectsV2',
          's3:DeleteObject',
        ],
        resources: [
          `${this.documentationBucket.bucketArn}/*`,
          `${this.documentationBucket.bucketArn}`,
        ],
      })
    );

    // Create custom resource to trigger OpenAPI export on deploy
    const exportOpenApiProvider = new cr.Provider(this, 'ExportOpenApiProvider', {
      onEventHandler: exportOpenApiLambda,
    });

    const exportResource = new cdk.CustomResource(this, 'ExportOpenApiResource', {
      serviceToken: exportOpenApiProvider.serviceToken,
      properties: {
        RestApiId: props.apiGateway.restApi.restApiId,
        BucketName: this.documentationBucket.bucketName,
        ApiUrl: props.apiGateway.restApi.url,
      },
    });

    // Read Swagger UI HTML content
    const swaggerUiHtml = fs.readFileSync(
      path.join(__dirname, 'swagger-ui.html'),
      'utf-8'
    );

    // Deploy Swagger UI as index.html for website hosting
    // This depends on the export resource to ensure OpenAPI JSON is available
    const swaggerUIDeployment = new s3deploy.BucketDeployment(this, 'DeploySwaggerUI', {
      sources: [
        s3deploy.Source.data('index.html', swaggerUiHtml),
      ],
      destinationBucket: this.documentationBucket,
      destinationKeyPrefix: '',
      prune: false,
    });
    
    // Ensure Swagger UI deploys after OpenAPI export completes
    swaggerUIDeployment.node.addDependency(exportResource);

    // ============================================================================
    // CLOUDFRONT DISTRIBUTION - Secure access to documentation
    // ============================================================================

    // Create CloudFront distribution with S3 origin
    // NOTE: OAC migration deferred - existing distribution uses OAI
    // TODO: Migrate to OAC in separate deployment to avoid OAI/OAC conflict
    this.distribution = new cloudfront.Distribution(this, 'DocsDistribution', {
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(this.documentationBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
      ],
      comment: 'CloudFront distribution for Spartan AI API documentation',
      enabled: true,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe edge locations
    });

    // Grant CloudFront access to S3 bucket via bucket policy
    // Currently using OAI (via S3Origin) - will migrate to OAC in future deployment
    this.documentationBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontOAC',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.documentationBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.distribution.distributionId}`,
          },
        },
      })
    );

    // Ensure CloudFront distribution is created after bucket deployment
    this.distribution.node.addDependency(swaggerUIDeployment);

    // ============================================================================
    // CLOUDFORMATION OUTPUTS - Use CloudFront URLs instead of S3 URLs
    // ============================================================================

    const cloudfrontUrl = `https://${this.distribution.distributionDomainName}`;
    
    new cdk.CfnOutput(this, 'SwaggerUIUrl', {
      value: `${cloudfrontUrl}/index.html`,
      description: 'Swagger UI - Interactive API documentation via CloudFront (main output)',
      exportName: 'SpartanAI-SwaggerUI-Url',
    });

    new cdk.CfnOutput(this, 'ApiDocumentationUrl', {
      value: `${cloudfrontUrl}/api-docs/openapi.json`,
      description: 'OpenAPI 3.0 specification JSON URL via CloudFront (latest version)',
      exportName: 'SpartanAI-OpenAPI-Url',
    });

    new cdk.CfnOutput(this, 'ApiDocsUrl', {
      value: `${cloudfrontUrl}/api-docs/openapi.json`,
      description: 'API Documentation URL - OpenAPI 3.0 JSON via CloudFront (main output)',
      exportName: 'SpartanAI-ApiDocs-Url',
    });

    new cdk.CfnOutput(this, 'SwaggerDocumentationUrl', {
      value: `${cloudfrontUrl}/api-docs/swagger.json`,
      description: 'Swagger JSON specification URL via CloudFront (latest version, alias for OpenAPI)',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for API documentation',
      exportName: 'SpartanAI-Docs-CloudFront-DistributionId',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name for API documentation',
      exportName: 'SpartanAI-Docs-CloudFront-Domain',
    });

    new cdk.CfnOutput(this, 'ApiGatewayExportUrl', {
      value: `${props.apiGateway.restApi.url}?export=oas30`,
      description: 'Direct API Gateway OpenAPI export URL (requires API key)',
    });

    new cdk.CfnOutput(this, 'DocumentationBucketName', {
      value: this.documentationBucket.bucketName,
      description: 'S3 bucket name containing versioned API documentation (private, accessed via CloudFront)',
    });
  }
}

