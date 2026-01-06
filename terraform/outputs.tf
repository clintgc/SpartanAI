output "s3_website_bucket_name" {
  description = "Name of the S3 bucket for website hosting"
  value       = module.s3.website_bucket_id
}

output "s3_redirect_bucket_name" {
  description = "Name of the S3 bucket for root domain redirect"
  value       = module.s3.redirect_bucket_id
}

output "cloudfront_website_distribution_id" {
  description = "ID of the CloudFront distribution for www"
  value       = module.cloudfront.website_distribution_id
}

output "cloudfront_website_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for www"
  value       = module.cloudfront.website_distribution_domain_name
}

output "cloudfront_redirect_distribution_id" {
  description = "ID of the CloudFront distribution for root domain"
  value       = module.cloudfront.redirect_distribution_id
}

output "route53_hosted_zone_id" {
  description = "ID of the Route 53 hosted zone"
  value       = module.route53.hosted_zone_id
}

output "route53_name_servers" {
  description = "Name servers for the hosted zone - UPDATE THESE IN GODADDY"
  value       = module.route53.name_servers
}

output "website_url" {
  description = "URL of the website"
  value       = "https://www.${var.domain_name}"
}

output "root_domain_url" {
  description = "URL of the root domain (redirects to www)"
  value       = "https://${var.domain_name}"
}

# Alerts subdomain outputs
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

