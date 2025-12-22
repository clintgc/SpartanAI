output "website_distribution_id" {
  description = "ID of the CloudFront distribution for www"
  value       = aws_cloudfront_distribution.website.id
}

output "website_distribution_arn" {
  description = "ARN of the CloudFront distribution for www"
  value       = aws_cloudfront_distribution.website.arn
}

output "website_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for www"
  value       = aws_cloudfront_distribution.website.domain_name
}

output "redirect_distribution_id" {
  description = "ID of the CloudFront distribution for root domain"
  value       = aws_cloudfront_distribution.redirect.id
}

output "redirect_distribution_arn" {
  description = "ARN of the CloudFront distribution for root domain"
  value       = aws_cloudfront_distribution.redirect.arn
}

output "redirect_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for root domain"
  value       = aws_cloudfront_distribution.redirect.domain_name
}

output "website_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the CloudFront distribution for www"
  value       = aws_cloudfront_distribution.website.hosted_zone_id
}

output "redirect_distribution_hosted_zone_id" {
  description = "Hosted zone ID of the CloudFront distribution for root domain"
  value       = aws_cloudfront_distribution.redirect.hosted_zone_id
}

