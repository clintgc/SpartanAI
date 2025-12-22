variable "domain_name" {
  description = "The domain name for the website"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the S3 bucket (www)"
  type        = string
}

variable "redirect_bucket_regional_domain_name" {
  description = "Regional domain name of the redirect S3 bucket"
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

