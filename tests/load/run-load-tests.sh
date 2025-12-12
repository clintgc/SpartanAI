#!/bin/bash
# Load testing script for Spartan AI
# Usage: ./run-load-tests.sh [API_GATEWAY_URL] [API_KEY]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get API Gateway URL and API Key from environment or arguments
API_GATEWAY_URL=${1:-${API_GATEWAY_URL:-"https://YOUR_API_GATEWAY_URL"}}
API_KEY=${2:-${API_KEY:-"YOUR_API_KEY"}}

echo -e "${YELLOW}Starting load tests...${NC}"
echo -e "API Gateway URL: ${API_GATEWAY_URL}"
echo -e "API Key: ${API_KEY:0:10}...${NC}"
echo ""

# Check if Artillery is installed
if ! command -v artillery &> /dev/null; then
    echo -e "${RED}Error: Artillery is not installed${NC}"
    echo "Install it with: npm install -g artillery"
    exit 1
fi

# Run load tests
echo -e "${GREEN}Running Artillery load tests...${NC}"
export API_GATEWAY_URL=$API_GATEWAY_URL
export API_KEY=$API_KEY

# Run tests and generate report
artillery run --output tests/load/report.json tests/load/artillery.yml

# Generate HTML report
if [ -f "tests/load/report.json" ]; then
    echo -e "${GREEN}Generating HTML report...${NC}"
    artillery report tests/load/report.json --output tests/load/report.html
    
    echo -e "${GREEN}Load test completed!${NC}"
    echo -e "Report saved to: tests/load/report.html"
    
    # Check for errors in the report
    ERROR_COUNT=$(jq -r '.aggregate.counters["http.errors"] // 0' tests/load/report.json 2>/dev/null || echo "0")
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${RED}Warning: $ERROR_COUNT errors detected${NC}"
        exit 1
    else
        echo -e "${GREEN}No errors detected${NC}"
        exit 0
    fi
else
    echo -e "${RED}Error: Report file not generated${NC}"
    exit 1
fi

