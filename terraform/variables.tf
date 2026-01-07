variable "domain_name" {
  description = "The domain name for the website (e.g., spartan.tech)"
  type        = string
  default     = "spartan.tech"
}

variable "region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g., staging, production)"
  type        = string
  default     = "staging"
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for main site CloudFront (www.spartan.tech and spartan.tech) - must be in us-east-1"
  type        = string
  default     = ""
}

variable "acm_certificate_arn_alerts" {
  description = "ARN of the ACM certificate for alerts CloudFront (alerts.spartan.tech) - must be in us-east-1"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "SpartanAI"
    Environment = "staging"
    ManagedBy   = "Terraform"
  }
}

