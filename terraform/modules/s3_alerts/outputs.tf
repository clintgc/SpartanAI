output "alerts_bucket_id" {
  description = "ID of the alerts S3 bucket"
  value       = aws_s3_bucket.alerts.id
}

output "alerts_bucket_arn" {
  description = "ARN of the alerts S3 bucket"
  value       = aws_s3_bucket.alerts.arn
}

output "alerts_bucket_regional_domain_name" {
  description = "Regional domain name of the alerts S3 bucket"
  value       = aws_s3_bucket.alerts.bucket_regional_domain_name
}

