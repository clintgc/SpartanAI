import { APIGatewayClient, GetExportCommand } from '@aws-sdk/client-api-gateway';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from 'aws-lambda';

const apiGatewayClient = new APIGatewayClient({});
const s3Client = new S3Client({});

export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const restApiId = event.ResourceProperties.RestApiId;
    const bucketName = event.ResourceProperties.BucketName;
    const apiUrl = event.ResourceProperties.ApiUrl;

    if (event.RequestType === 'Delete') {
      return {
        Status: 'SUCCESS',
        PhysicalResourceId: event.PhysicalResourceId || 'openapi-export',
      };
    }

    // Export OpenAPI 3.0 spec from API Gateway
    const exportCommand = new GetExportCommand({
      restApiId: restApiId,
      stageName: 'v1',
      exportType: 'oas30',
      accepts: 'application/json',
    });

    const response = await apiGatewayClient.send(exportCommand);

    // Read the stream
    const chunks: Uint8Array[] = [];
    if (response.body) {
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
    }
    const buffer = Buffer.concat(chunks);
    let openapiSpec = JSON.parse(buffer.toString('utf-8'));

    // Update info section
    openapiSpec.info = {
      title: 'Spartan AI Security Service API',
      version: '1.0.0',
      description: 'API for threat detection using Captis integration',
    };

    // Add/update servers
    openapiSpec.servers = [
      {
        url: apiUrl,
        description: 'Production server',
      },
    ];

    const specJson = JSON.stringify(openapiSpec, null, 2);

    // Generate versioned filenames with deploy timestamp (YYYYMMDD format)
    const deployDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const versionedOpenApiKey = `api-docs/openapi-${deployDate}.json`;
    const versionedSwaggerKey = `api-docs/swagger-${deployDate}.json`;

    // Upload versioned files
    const putVersionedOpenApiCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: versionedOpenApiKey,
      Body: specJson,
      ContentType: 'application/json',
    });
    await s3Client.send(putVersionedOpenApiCommand);

    const putVersionedSwaggerCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: versionedSwaggerKey,
      Body: specJson,
      ContentType: 'application/json',
    });
    await s3Client.send(putVersionedSwaggerCommand);

    // Also save as latest versions (openapi.json and swagger.json) for easy access
    const putOpenApiCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: 'api-docs/openapi.json',
      Body: specJson,
      ContentType: 'application/json',
    });
    await s3Client.send(putOpenApiCommand);

    const putSwaggerCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: 'api-docs/swagger.json',
      Body: specJson,
      ContentType: 'application/json',
    });
    await s3Client.send(putSwaggerCommand);

    console.log(`OpenAPI spec exported successfully. Versioned files: ${versionedOpenApiKey}, ${versionedSwaggerKey}`);

    return {
      Status: 'SUCCESS',
      PhysicalResourceId: `openapi-export-${restApiId}`,
      Data: {
        OpenApiSpec: specJson,
        VersionedOpenApiKey: versionedOpenApiKey,
        VersionedSwaggerKey: versionedSwaggerKey,
        DeployDate: deployDate,
      },
    };
  } catch (error) {
    console.error('Error exporting OpenAPI spec:', error);
    return {
      Status: 'FAILED',
      PhysicalResourceId: event.PhysicalResourceId || 'openapi-export',
      Reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

