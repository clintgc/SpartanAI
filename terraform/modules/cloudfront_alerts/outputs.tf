output "alerts_distribution_id" {
  description = "ID of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.id
}

output "alerts_distribution_arn" {
  description = "ARN of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.arn
}

output "alerts_distribution_domain_name" {
  description = "Domain name of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.domain_name
}

output "alerts_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the alerts CloudFront distribution"
  value       = aws_cloudfront_distribution.alerts.hosted_zone_id
}

