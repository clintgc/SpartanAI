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
    // The file will be uploaded as scan/index.html in S3
    if (uri.startsWith('/scan/') && uri !== '/scan/index.html') {
        request.uri = '/scan/index.html';
    }
    // Root path should also serve scan/index.html
    else if (uri === '/' || uri === '/index.html') {
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
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # Use only North America and Europe

  # Only add aliases if certificate is provided
  aliases = var.acm_certificate_arn != "" ? ["alerts.${var.domain_name}"] : []

  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3-alerts.${var.domain_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.alerts_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-alerts.${var.domain_name}"

    # Use managed cache policy (no query strings forwarded, compress objects)
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled (for dynamic content)

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Associate CloudFront function to rewrite paths
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.alerts_rewrite.arn
    }
  }

  # Custom error responses to serve index.html for 404s
  # CloudFront function will rewrite /scan/{scanId} to /scan/index.html
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Use custom certificate if provided, otherwise use CloudFront default
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method       = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : null
    cloudfront_default_certificate = var.acm_certificate_arn == "" ? true : null
  }

  tags = var.tags
}

