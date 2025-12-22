output "website_bucket_id" {
  description = "ID of the website S3 bucket"
  value       = aws_s3_bucket.website.id
}

output "website_bucket_arn" {
  description = "ARN of the website S3 bucket"
  value       = aws_s3_bucket.website.arn
}

output "website_bucket_website_endpoint" {
  description = "Website endpoint of the S3 bucket"
  value       = aws_s3_bucket_website_configuration.website.website_endpoint
}

output "redirect_bucket_id" {
  description = "ID of the redirect S3 bucket"
  value       = aws_s3_bucket.redirect.id
}

output "redirect_bucket_arn" {
  description = "ARN of the redirect S3 bucket"
  value       = aws_s3_bucket.redirect.arn
}

output "website_bucket_regional_domain_name" {
  description = "Regional domain name of the website S3 bucket"
  value       = aws_s3_bucket.website.bucket_regional_domain_name
}

output "redirect_bucket_regional_domain_name" {
  description = "Regional domain name of the redirect S3 bucket"
  value       = aws_s3_bucket.redirect.bucket_regional_domain_name
}

