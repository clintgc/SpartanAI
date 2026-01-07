terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Origin Access Control for S3 bucket
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${var.domain_name}-s3-oac"
  description                       = "OAC for ${var.domain_name} S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Function to rewrite /optout and /optin to their index.html files
resource "aws_cloudfront_function" "url_rewrite" {
  name    = "${replace(var.domain_name, ".", "-")}-url-rewrite"
  runtime = "cloudfront-js-1.0"
  comment = "Rewrite /optout and /optin to their index.html files for ${var.domain_name}"
  publish = true
  code    = <<-EOF
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Rewrite /optout and /optin to their index.html files
    if (uri === '/optout' || uri === '/optout/') {
        request.uri = '/optout/index.html';
    } else if (uri === '/optin' || uri === '/optin/') {
        request.uri = '/optin/index.html';
    }
    
    return request;
}
EOF
}

# CloudFront distribution for www subdomain
resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CloudFront distribution for ${var.domain_name}"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # Use only North America and Europe

  aliases = ["www.${var.domain_name}"]

  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3-www.${var.domain_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-www.${var.domain_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true

    # Associate CloudFront function to rewrite /optout paths
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.url_rewrite.arn
    }
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

  tags = var.tags
}

# CloudFront Function for root domain redirect
resource "aws_cloudfront_function" "redirect_to_www" {
  name    = "${replace(var.domain_name, ".", "-")}-redirect-to-www"
  runtime = "cloudfront-js-1.0"
  comment = "Redirect ${var.domain_name} to www.${var.domain_name}"
  publish = true
  code    = <<-EOF
function handler(event) {
    var request = event.request;
    var querystring = '';
    if (request.querystring && Object.keys(request.querystring).length > 0) {
        var qs = [];
        for (var key in request.querystring) {
            var value = request.querystring[key];
            if (value && value.value !== undefined) {
                qs.push(key + '=' + encodeURIComponent(value.value));
            } else if (value) {
                qs.push(key + '=' + encodeURIComponent(value));
            }
        }
        if (qs.length > 0) {
            querystring = '?' + qs.join('&');
        }
    }
    var response = {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
            'location': { value: 'https://www.${var.domain_name}' + request.uri + querystring }
        }
    };
    return response;
}
EOF
}

# CloudFront distribution for root domain (redirect)
resource "aws_cloudfront_distribution" "redirect" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "CloudFront distribution for ${var.domain_name} root redirect"

  aliases = [var.domain_name]

  # Use a dummy origin (we'll never actually hit it due to the function)
  origin {
    domain_name              = var.redirect_bucket_regional_domain_name
    origin_id                = "S3-${var.domain_name}-redirect"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.domain_name}-redirect"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Use CachingDisabled policy since we're just redirecting
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.redirect_to_www.arn
    }
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

