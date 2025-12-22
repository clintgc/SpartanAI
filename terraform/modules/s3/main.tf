terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# S3 bucket for www subdomain (main hosting bucket)
resource "aws_s3_bucket" "website" {
  bucket = "www.${var.domain_name}"

  tags = var.tags
}

# S3 bucket for root domain (redirect bucket)
resource "aws_s3_bucket" "redirect" {
  bucket = var.domain_name

  tags = var.tags
}

# Block public access settings for www bucket (needed for static website hosting)
resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Block public access settings for redirect bucket
resource "aws_s3_bucket_public_access_block" "redirect" {
  bucket = aws_s3_bucket.redirect.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Enable static website hosting for www bucket
resource "aws_s3_bucket_website_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# Configure redirect bucket to redirect to www
resource "aws_s3_bucket_website_configuration" "redirect" {
  bucket = aws_s3_bucket.redirect.id

  redirect_all_requests_to {
    host_name = "www.${var.domain_name}"
    protocol  = "https"
  }
}

# Note: S3 bucket policies for CloudFront OAC are managed in main.tf
# after CloudFront distributions are created (to get the ARNs)

# Enable versioning on website bucket (optional but recommended)
resource "aws_s3_bucket_versioning" "website" {
  bucket = aws_s3_bucket.website.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for website bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Server-side encryption for redirect bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "redirect" {
  bucket = aws_s3_bucket.redirect.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

