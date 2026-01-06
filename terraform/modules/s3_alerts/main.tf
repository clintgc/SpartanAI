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
# Note: S3 index document must be a filename, not a path
# CloudFront function will handle /scan/{scanId} routing
resource "aws_s3_bucket_website_configuration" "alerts" {
  bucket = aws_s3_bucket.alerts.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
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

