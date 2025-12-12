import { APIGatewayClient, GetExportCommand } from '@aws-sdk/client-api-gateway';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
      description: 'API for threat detection using Captis integration. Provides endpoints for image scanning, consent management, and scan retrieval.',
      contact: {
        name: 'Spartan AI Support',
      },
    };

    // Add/update servers
    openapiSpec.servers = [
      {
        url: apiUrl,
        description: 'Production server',
      },
    ];

    // Enhance OpenAPI spec with security schemes
    if (!openapiSpec.components) {
      openapiSpec.components = {};
    }
    if (!openapiSpec.components.securitySchemes) {
      openapiSpec.components.securitySchemes = {};
    }
    openapiSpec.components.securitySchemes['ApiKeyAuth'] = {
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
      description: 'API Key for authentication',
    };

    // Add security requirement to all paths
    if (openapiSpec.paths) {
      Object.keys(openapiSpec.paths).forEach((path) => {
        Object.keys(openapiSpec.paths[path]).forEach((method) => {
          if (method !== 'parameters' && openapiSpec.paths[path][method]) {
            if (!openapiSpec.paths[path][method].security) {
              openapiSpec.paths[path][method].security = [{ ApiKeyAuth: [] }];
            }
          }
        });
      });
    }

    // Enhance error responses with proper descriptions
    const enhanceErrorResponses = (pathObj: any) => {
      if (!pathObj) return;
      Object.keys(pathObj).forEach((method) => {
        if (method === 'parameters') return;
        const methodObj = pathObj[method];
        if (methodObj.responses) {
          // Add descriptions to error responses
          if (methodObj.responses['400']) {
            methodObj.responses['400'].description = methodObj.responses['400'].description || 'Bad Request - Invalid input parameters';
          }
          if (methodObj.responses['403']) {
            methodObj.responses['403'].description = methodObj.responses['403'].description || 'Forbidden - Consent required or access denied';
          }
          if (methodObj.responses['404']) {
            methodObj.responses['404'].description = methodObj.responses['404'].description || 'Not Found - Resource not found';
          }
          if (methodObj.responses['429']) {
            methodObj.responses['429'].description = methodObj.responses['429'].description || 'Too Many Requests - Quota exceeded or rate limit reached';
          }
          if (methodObj.responses['500']) {
            methodObj.responses['500'].description = methodObj.responses['500'].description || 'Internal Server Error - Server error occurred';
          }
        }
      });
    };

    // Enhance all paths
    if (openapiSpec.paths) {
      Object.keys(openapiSpec.paths).forEach((path) => {
        enhanceErrorResponses(openapiSpec.paths[path]);
      });
    }

    const specJson = JSON.stringify(openapiSpec, null, 2);

    // Generate versioned filenames with deploy timestamp (YYYYMMDD format)
    const deployDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const versionedOpenApiKey = `api-docs/openapi-${deployDate}.json`;
    const versionedSwaggerKey = `api-docs/swagger-${deployDate}.json`;

    // ============================================================================
    // VERSION RETENTION - Keep last 5 versions, cleanup older files
    // ============================================================================
    const MAX_VERSIONS_TO_KEEP = 5;
    
    try {
      // List all versioned OpenAPI files (openapi-YYYYMMDD.json pattern)
      const listOpenApiVersions = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'api-docs/openapi-',
      });
      const openApiListResponse = await s3Client.send(listOpenApiVersions);
      
      // List all versioned Swagger files (swagger-YYYYMMDD.json pattern)
      const listSwaggerVersions = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'api-docs/swagger-',
      });
      const swaggerListResponse = await s3Client.send(listSwaggerVersions);

      // Extract and sort versioned files by date (newest first)
      const extractVersions = (contents: any[] = []) => {
        return contents
          .filter((obj) => obj.Key && /-\d{8}\.json$/.test(obj.Key))
          .map((obj) => ({
            key: obj.Key!,
            date: obj.Key!.match(/-(\d{8})\.json$/)?.[1] || '',
            lastModified: obj.LastModified || new Date(0),
          }))
          .sort((a, b) => {
            // Sort by date string (descending) or lastModified (descending)
            if (a.date && b.date) {
              return b.date.localeCompare(a.date);
            }
            return b.lastModified.getTime() - a.lastModified.getTime();
          });
      };

      const openApiVersions = extractVersions(openApiListResponse.Contents);
      const swaggerVersions = extractVersions(swaggerListResponse.Contents);

      // Delete older versions (keep only the last MAX_VERSIONS_TO_KEEP)
      const deleteOldVersions = async (versions: Array<{ key: string; date: string }>) => {
        if (versions.length >= MAX_VERSIONS_TO_KEEP) {
          const versionsToDelete = versions.slice(MAX_VERSIONS_TO_KEEP);
          for (const version of versionsToDelete) {
            try {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: version.key,
              });
              await s3Client.send(deleteCommand);
              console.log(`Deleted old version: ${version.key}`);
            } catch (error) {
              console.warn(`Failed to delete old version ${version.key}:`, error);
              // Continue with other deletions even if one fails
            }
          }
        }
      };

      // Delete old OpenAPI versions (but not the current one we're about to upload)
      const openApiVersionsToCheck = openApiVersions.filter((v) => v.key !== versionedOpenApiKey);
      await deleteOldVersions(openApiVersionsToCheck);

      // Delete old Swagger versions (but not the current one we're about to upload)
      const swaggerVersionsToCheck = swaggerVersions.filter((v) => v.key !== versionedSwaggerKey);
      await deleteOldVersions(swaggerVersionsToCheck);

      console.log(`Version retention: Keeping last ${MAX_VERSIONS_TO_KEEP} versions, cleaned up older files`);
    } catch (error) {
      console.warn('Error during version cleanup (continuing with upload):', error);
      // Continue with upload even if cleanup fails
    }

    // ============================================================================
    // UPLOAD NEW VERSIONED FILES
    // ============================================================================

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

