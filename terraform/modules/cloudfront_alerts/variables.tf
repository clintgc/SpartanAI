variable "domain_name" {
  description = "The domain name for the website"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the alerts S3 bucket"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for CloudFront (must be in us-east-1). Leave empty to use CloudFront default certificate (no custom domain)."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

