output "hosted_zone_id" {
  description = "ID of the Route 53 hosted zone"
  value       = aws_route53_zone.main.zone_id
}

output "name_servers" {
  description = "Name servers for the hosted zone (to update in GoDaddy)"
  value       = aws_route53_zone.main.name_servers
}

output "hosted_zone_arn" {
  description = "ARN of the Route 53 hosted zone"
  value       = aws_route53_zone.main.arn
}

