# Load Testing with Artillery

## Overview

This directory contains load testing configuration for the Spartan AI Security Service using Artillery. The tests simulate 100 concurrent users making `/scan` requests to validate system performance, latency, error rates, and throttling behavior.

## Prerequisites

```bash
# Install Artillery globally
npm install -g artillery

# Install dependencies
cd tests
npm install
```

## Configuration

### Environment Variables

Set the following environment variables or update `artillery.yml`:

```bash
export API_GATEWAY_URL="https://your-api-gateway-url.execute-api.region.amazonaws.com/v1"
export API_KEY="your-api-key-here"
```

### Test Configuration

The `artillery.yml` file is configured with:

- **Warm-up Phase**: 30 seconds, ramping from 10 to 100 concurrent users
- **Sustained Load**: 5 minutes at 100 concurrent users
- **Spike Test**: 1 minute at 150 concurrent users
- **Cool-down**: 30 seconds, ramping down to 0

### Test Scenarios

1. **Scan Request Load Test** (100% weight)
   - POST `/api/v1/scan` with random base64 images
   - Validates response time < 5s
   - Captures `scanId` for follow-up requests
   - Optional polling of scan results

2. **List Scans Endpoint** (10% weight)
   - GET `/api/v1/scans` with account filtering
   - Validates pagination and response times

## Running Tests

### Local Execution

```bash
# Run tests with default configuration
npm run test:load

# Run tests and generate HTML report
npm run test:load:report

# Run with custom script
./run-load-tests.sh [API_GATEWAY_URL] [API_KEY]
```

### CI/CD Integration

Load tests are automatically run via GitHub Actions:

- **Manual Trigger**: Use workflow_dispatch with custom API Gateway URL and API Key
- **Scheduled**: Daily at 2 AM UTC
- **On Push**: When load test files are modified

To trigger manually:
1. Go to Actions → Load Testing → Run workflow
2. Enter API Gateway URL and API Key
3. Click "Run workflow"

## Expected Results

### Performance Thresholds

- **Mean Response Time**: < 5 seconds
- **P95 Response Time**: < 8 seconds
- **P99 Response Time**: < 10 seconds
- **Error Rate**: < 1%
- **Throughput**: 100+ requests/second
- **Concurrent Users**: 100 sustained, 150 spike

### Metrics Tracked

- Total requests and responses
- HTTP errors (4xx, 5xx)
- Response time percentiles (mean, p50, p95, p99)
- Request rate and throughput
- Error rate by endpoint
- Throttling events (429 status codes)

## Test Reports

After running tests, reports are generated:

- **JSON Report**: `tests/load/report.json` - Machine-readable metrics
- **HTML Report**: `tests/load/report.html` - Visual dashboard with charts

### Viewing Reports

```bash
# Generate HTML report from JSON
artillery report tests/load/report.json --output tests/load/report.html

# Open in browser
open tests/load/report.html
```

## CI/CD Integration

### GitHub Actions Workflow

The `.github/workflows/load-test.yml` workflow:

1. Runs on schedule (daily), manual trigger, or when test files change
2. Installs dependencies and Artillery
3. Executes load tests with environment variables
4. Generates and uploads test reports as artifacts
5. Parses results and displays metrics in GitHub Actions summary
6. Fails the workflow if thresholds are exceeded

### Secrets Configuration

Add the following secrets to your GitHub repository:

- `API_GATEWAY_URL`: Your API Gateway endpoint URL
- `API_KEY`: Your API Gateway API key

Go to: Settings → Secrets and variables → Actions → New repository secret

### Workflow Output

The workflow provides:
- Summary table with key metrics
- Pass/fail status for each threshold
- Artifacts with JSON and HTML reports
- Failure notifications if thresholds exceeded

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify API Gateway URL is correct
   - Check API key is valid
   - Ensure API Gateway is deployed and accessible

2. **High Error Rates**
   - Check API Gateway rate limits
   - Verify Lambda concurrency limits
   - Review DynamoDB throttling metrics

3. **High Latency**
   - Check Lambda cold starts
   - Review DynamoDB read/write capacity
   - Monitor API Gateway latency metrics

4. **Throttling (429 Errors)**
   - Increase API Gateway rate limits
   - Adjust Lambda reserved concurrency
   - Scale DynamoDB capacity

## Customization

### Adjusting Load Parameters

Edit `artillery.yml` to modify:

- `arrivalRate`: Requests per second
- `duration`: Test duration in seconds
- `rampTo`: Target concurrent users
- `think`: Think time between requests

### Adding Test Scenarios

Add new scenarios to `artillery.yml`:

```yaml
scenarios:
  - name: "Custom scenario"
    weight: 50
    flow:
      - get:
          url: "/api/v1/custom-endpoint"
          expect:
            - statusCode: 200
```

## Post-Deployment Testing

After deploying infrastructure changes:

```bash
# Run load tests
./run-load-tests.sh $API_GATEWAY_URL $API_KEY

# Review report
open tests/load/report.html

# Check for threshold violations
# Mean response time should be < 5s
# Error rate should be < 1%
# P95 response time should be < 8s
```

## Best Practices

1. **Run tests in staging first** before production
2. **Monitor CloudWatch metrics** during load tests
3. **Start with lower load** and gradually increase
4. **Run tests during off-peak hours** to avoid impacting users
5. **Review reports** and adjust thresholds as needed
6. **Document baseline metrics** for comparison

