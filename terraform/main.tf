terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Using local backend for now (can switch to S3 later)
  # backend "s3" {
  #   bucket = "spartan-ai-terraform-state"
  #   key    = "website/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = var.tags
  }
}

# S3 Module
module "s3" {
  source = "./modules/s3"

  domain_name = var.domain_name
  tags        = var.tags
}

# CloudFront Module
module "cloudfront" {
  source = "./modules/cloudfront"

  domain_name                        = var.domain_name
  s3_bucket_regional_domain_name     = module.s3.website_bucket_regional_domain_name
  redirect_bucket_regional_domain_name = module.s3.redirect_bucket_regional_domain_name
  acm_certificate_arn               = var.acm_certificate_arn
  tags                               = var.tags

  depends_on = [module.s3]
}

# Route 53 Module
module "route53" {
  source = "./modules/route53"

  domain_name                                  = var.domain_name
  cloudfront_distribution_domain_name         = module.cloudfront.website_distribution_domain_name
  cloudfront_distribution_hosted_zone_id      = module.cloudfront.website_distribution_hosted_zone_id
  redirect_cloudfront_distribution_domain_name = module.cloudfront.redirect_distribution_domain_name
  redirect_cloudfront_distribution_hosted_zone_id = module.cloudfront.redirect_distribution_hosted_zone_id
  tags                                        = var.tags

  depends_on = [module.cloudfront]
}

# S3 bucket policy for CloudFront OAC access (www bucket)
resource "aws_s3_bucket_policy" "website_oac" {
  bucket = module.s3.website_bucket_id

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
        Resource = "${module.s3.website_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cloudfront.website_distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.cloudfront]
}

# S3 bucket policy for CloudFront OAC access (redirect bucket)
resource "aws_s3_bucket_policy" "redirect_oac" {
  bucket = module.s3.redirect_bucket_id

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
        Resource = "${module.s3.redirect_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cloudfront.redirect_distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.cloudfront]
}

# ============================================================================
# ALERTS SUBDOMAIN - Static hosting for alert landing pages
# ============================================================================

# Alerts S3 Module
module "s3_alerts" {
  source = "./modules/s3_alerts"

  domain_name = var.domain_name
  tags        = var.tags
}

# Alerts CloudFront Module
# Uses separate certificate ARN for alerts subdomain
# If acm_certificate_arn_alerts is empty, will use CloudFront default certificate
module "cloudfront_alerts" {
  source = "./modules/cloudfront_alerts"

  domain_name                    = var.domain_name
  s3_bucket_regional_domain_name = module.s3_alerts.alerts_bucket_regional_domain_name
  acm_certificate_arn            = var.acm_certificate_arn_alerts != "" ? var.acm_certificate_arn_alerts : ""
  tags                           = var.tags

  depends_on = [module.s3_alerts]
}

# Alerts Route53 Records
resource "aws_route53_record" "alerts" {
  zone_id = module.route53.hosted_zone_id
  name    = "alerts.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront_alerts.alerts_distribution_domain_name
    zone_id                = module.cloudfront_alerts.alerts_distribution_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.cloudfront_alerts]
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

  depends_on = [module.cloudfront_alerts]
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

