# Load Testing with Artillery

## Prerequisites

```bash
npm install -g artillery
npm install @faker-js/faker
```

## Configuration

1. Update `artillery.yml` with your API Gateway URL and API key
2. Adjust load parameters as needed

## Running Tests

```bash
artillery run artillery.yml
```

## Expected Results

- **Latency**: <5s for 95th percentile
- **Error Rate**: <1%
- **Throughput**: 100+ requests/second
- **Scale**: Validates 10k+ account capacity

## Post-Deployment Testing

Run after each deployment to validate performance:

```bash
./run-load-tests.sh
```

