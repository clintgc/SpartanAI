variable "domain_name" {
  description = "The domain name for the website"
  type        = string
}

variable "cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for www"
  type        = string
}

variable "cloudfront_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the CloudFront distribution for www"
  type        = string
}

variable "redirect_cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for root domain"
  type        = string
}

variable "redirect_cloudfront_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the CloudFront distribution for root domain"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

