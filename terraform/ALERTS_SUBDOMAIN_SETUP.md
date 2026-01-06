# Alerts Subdomain Setup Guide

This guide extends the existing Terraform infrastructure to add static hosting for `alerts.spartan.tech`.

## Overview

The alerts subdomain will serve a single `alert.html` file that handles all `/scan/{scanId}` paths. The JavaScript in the HTML extracts the scanId from the URL pathname, so we can serve the same file for all paths.

## Implementation

### 1. Update main.tf

Add the alerts subdomain module instances after the existing modules:

```terraform
# Alerts S3 Module (new)
module "s3_alerts" {
  source = "./modules/s3_alerts"

  domain_name = var.domain_name
  tags        = var.tags
}

# Alerts CloudFront Module (new)
module "cloudfront_alerts" {
  source = "./modules/cloudfront_alerts"

  domain_name                    = var.domain_name
  s3_bucket_regional_domain_name = module.s3_alerts.alerts_bucket_regional_domain_name
  acm_certificate_arn            = var.acm_certificate_arn
  tags                           = var.tags

  depends_on = [module.s3_alerts]
}

# Alerts Route53 Record (add to route53 module or create here)
# Add to existing route53 module or create separate resource
resource "aws_route53_record" "alerts" {
  zone_id = module.route53.hosted_zone_id
  name    = "alerts.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront_alerts.alerts_distribution_domain_name
    zone_id                = module.cloudfront_alerts.alerts_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "alerts_ipv6" {
  zone_id = module.route53.hosted_zone_id
  name    = "alerts.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = module.cloudfront_alerts.alerts_distribution_domain_name
    zone_id                = module.cloudfront_alerts.alerts_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

# S3 bucket policy for CloudFront OAC access (alerts bucket)
resource "aws_s3_bucket_policy" "alerts_oac" {
  bucket = module.s3_alerts.alerts_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${module.s3_alerts.alerts_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cloudfront_alerts.alerts_distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.cloudfront_alerts]
}
```

### 2. Create modules/s3_alerts/

**modules/s3_alerts/main.tf:**
```terraform
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# S3 bucket for alerts subdomain
resource "aws_s3_bucket" "alerts" {
  bucket = "alerts.${var.domain_name}"

  tags = var.tags
}

# Block public access - use OAC instead
resource "aws_s3_bucket_public_access_block" "alerts" {
  bucket = aws_s3_bucket.alerts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable static website hosting
resource "aws_s3_bucket_website_configuration" "alerts" {
  bucket = aws_s3_bucket.alerts.id

  index_document {
    suffix = "scan/index.html"
  }

  error_document {
    key = "scan/index.html"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "alerts" {
  bucket = aws_s3_bucket.alerts.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "alerts" {
  bucket = aws_s3_bucket.alerts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

**modules/s3_alerts/variables.tf:**
```terraform
variable "domain_name" {
  description = "The domain name for the website"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
```

**modules/s3_alerts/outputs.tf:**
```terraform
output "alerts_bucket_id" {
  description = "ID of the alerts S3 bucket"
  value       = aws_s3_bucket.alerts.id
}

output "alerts_bucket_arn" {
  description = "ARN of the alerts S3 bucket"
  value       = aws_s3_bucket.alerts.arn
}

output "alerts_bucket_regional_domain_name" {
  description = "Regional domain name of the alerts S3 bucket"
  value       = aws_s3_bucket.alerts.bucket_regional_domain_name
}
```

### 3. Create modules/cloudfront_alerts/

**modules/cloudfront_alerts/main.tf:**
```terraform
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Origin Access Control for alerts S3 bucket
resource "aws_cloudfront_origin_access_control" "alerts_oac" {
  name                              = "alerts-${var.domain_name}-s3-oac"
  description                       = "OAC for alerts.${var.domain_name} S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Function to rewrite /scan/{scanId} paths to /scan/index.html
resource "aws_cloudfront_function" "alerts_rewrite" {
  name    = "alerts-${replace(var.domain_name, ".", "-")}-rewrite"
  runtime = "cloudfront-js-1.0"
  comment = "Rewrite /scan/{scanId} paths to /scan/index.html for alerts.${var.domain_name}"
  publish = true
  code    = <<-EOF
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // If path starts with /scan/, rewrite to /scan/index.html
    // This allows /scan/{any-scan-id} to serve the same HTML file
    if (uri.startsWith('/scan/') && uri !== '/scan/index.html') {
        request.uri = '/scan/index.html';
    }
    
    return request;
}
EOF
}

# CloudFront distribution for alerts subdomain
resource "aws_cloudfront_distribution" "alerts" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CloudFront distribution for alerts.${var.domain_name}"
  default_root_object = "scan/index.html"
  price_class         = "PriceClass_100" # Use only North America and Europe

  aliases = ["alerts.${var.domain_name}"]

  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3-alerts.${var.domain_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.alerts_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-alerts.${var.domain_name}"

    # Use managed cache policy (no query strings forwarded)
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled (for now, can use optimized later)

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Associate CloudFront function to rewrite paths
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.alerts_rewrite.arn
    }
  }

  # Custom error responses to serve scan/index.html for 404s
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/scan/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/scan/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = var.tags
}
```

**modules/cloudfront_alerts/variables.tf:**
```terraform
variable "domain_name" {
  description = "The domain name for the website"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the alerts S3 bucket"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for CloudFront (must be in us-east-1)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
```

**modules/cloudfront_alerts/outputs.tf:**
```terraform
output "alerts_distribution_id" {
  description = "ID of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.id
}

output "alerts_distribution_arn" {
  description = "ARN of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.arn
}

output "alerts_distribution_domain_name" {
  description = "Domain name of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.domain_name
}

output "alerts_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.hosted_zone_id
}
```

### 4. Update route53 module outputs

**modules/route53/outputs.tf** (add if not exists):
```terraform
output "hosted_zone_id" {
  description = "ID of the Route53 hosted zone"
  value       = aws_route53_zone.main.zone_id
}
```

### 5. Update main outputs

**outputs.tf** (add):
```terraform
output "alerts_s3_bucket_name" {
  description = "Name of the alerts S3 bucket"
  value       = module.s3_alerts.alerts_bucket_id
}

output "alerts_cloudfront_distribution_id" {
  description = "ID of the alerts CloudFront distribution"
  value       = module.cloudfront_alerts.alerts_distribution_id
}

output "alerts_cloudfront_url" {
  description = "URL of the alerts CloudFront distribution"
  value       = "https://${module.cloudfront_alerts.alerts_distribution_domain_name}"
}

output "alerts_final_url" {
  description = "Final URL for alerts subdomain"
  value       = "https://alerts.${var.domain_name}"
}
```

## Deployment Steps

### 1. Apply Terraform

```bash
cd terraform
terraform init
terraform plan  # Review changes
terraform apply
```

### 2. Upload alert.html

Create the directory structure and upload:

```bash
# Create local directory structure
mkdir -p alert-page/scan

# Copy alert.html to scan/index.html
cp ../www/alert.html alert-page/scan/index.html

# Upload to S3
aws s3 sync alert-page/ s3://$(terraform output -raw alerts_s3_bucket_name)/ --delete

# Or directly:
aws s3 cp ../www/alert.html s3://$(terraform output -raw alerts_s3_bucket_name)/scan/index.html --content-type "text/html"
```

### 3. Invalidate CloudFront Cache

```bash
# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw alerts_cloudfront_distribution_id) \
  --paths "/scan/*" "/*"
```

### 4. Verify DNS Propagation

```bash
# Check DNS record
dig alerts.spartan.tech

# Or test the URL
curl -I https://alerts.spartan.tech/scan/test-scan-id
```

## Testing

1. **Test the URL directly:**
   ```bash
   curl https://alerts.spartan.tech/scan/test-scan-id-123
   ```

2. **Test with a real scan ID:**
   - Trigger a high-threat scan
   - Check WhatsApp message for the alert URL
   - Click the link and verify the page loads

3. **Verify API integration:**
   - Open browser console on the alert page
   - Verify it fetches from the public API endpoint
   - Check that scan data displays correctly

## Notes

- The CloudFront function rewrites `/scan/{scanId}` to `/scan/index.html` so all paths serve the same file
- The JavaScript in alert.html extracts the scanId from `window.location.pathname`
- Error responses (404/403) also serve `/scan/index.html` for robustness
- OAC (Origin Access Control) is used instead of public bucket access for security
- The bucket blocks all public access - only CloudFront can access it

## Cost Considerations

- S3 storage: Minimal (single HTML file)
- CloudFront: Pay-per-use data transfer
- Route53: $0.50/month per hosted zone (already exists)
- CloudFront Function: Free tier covers typical usage

