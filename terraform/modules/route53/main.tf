terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Route 53 hosted zone
resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = var.tags
}

# A record for www subdomain pointing to CloudFront
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.cloudfront_distribution_domain_name
    zone_id                = var.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

# AAAA record for www subdomain (IPv6)
resource "aws_route53_record" "www_ipv6" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_distribution_domain_name
    zone_id                = var.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

# A record for root domain pointing to redirect CloudFront
resource "aws_route53_record" "root" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.redirect_cloudfront_distribution_domain_name
    zone_id                = var.redirect_cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

# AAAA record for root domain (IPv6)
resource "aws_route53_record" "root_ipv6" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = var.redirect_cloudfront_distribution_domain_name
    zone_id                = var.redirect_cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

# MX record for email (Google Workspace)
resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600

  records = [
    "1 aspmx.l.google.com.",
    "5 alt1.aspmx.l.google.com.",
    "5 alt2.aspmx.l.google.com.",
    "10 alt3.aspmx.l.google.com.",
    "10 alt4.aspmx.l.google.com.",
  ]
}

# DKIM record for email authentication (Google Workspace)
# Google Workspace uses 'google' as the selector
# Note: Use just 'google._domainkey' without domain - Route 53 automatically appends the domain
# DKIM keys are long, so we split them into multiple strings (Route 53 limit is 255 chars per string)
# The parts must be in order: first part contains "v=DKIM1", second part is the continuation
resource "aws_route53_record" "dkim" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "google._domainkey"
  type    = "TXT"
  ttl     = 3600

  records = [
    "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwhbmylEy9FguMjX0x9ZfEqwo7iOfluxhmDjaBrmiLtylFycV2vDV7Oe45CR7WM/ja9vwx4UeErZjMlrWp8BGM7WvlLvADJL7UcXTdJdCHf15Gvwqpxit+dip9uByQ6vY/Ik/Eo6D55e3GJgU7CPmC84JWV0sY9aNxJNgeniiW8Jo+KQSv56BHff9Y21LAXZ2K",
    "YP3N8KOV9g9w41C5KNB+yC37AFITKXME2+7O85+arQVQMHnNkFaR9iNrMIQ296uvfeVzp6sKLFnCK4ZZ6b+NyUNDefH77FIFeGLCspNp0YQkytZUjDCwXnVOU1IAI61IjEiRQSsXsdECrW90rhoZwIDAQAB"
  ]
}

# Keep the default selector as well (in case it's needed for other services)
resource "aws_route53_record" "dkim_default" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "default._domainkey"
  type    = "TXT"
  ttl     = 3600

  records = [
    "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwhbmylEy9FguMjX0x9ZfEqwo7iOfluxhmDjaBrmiLtylFycV2vDV7Oe45CR7WM/ja9vwx4UeErZjMlrWp8BGM7WvlLvADJL7UcXTdJdCHf15Gvwqpxit+dip9uByQ6vY/Ik/Eo6D55e3GJgU7CPmC84JWV0sY9aNxJNgeniiW8Jo+KQSv56BHff9Y21LAXZ2K",
    "YP3N8KOV9g9w41C5KNB+yC37AFITKXME2+7O85+arQVQMHnNkFaR9iNrMIQ296uvfeVzp6sKLFnCK4ZZ6b+NyUNDefH77FIFeGLCspNp0YQkytZUjDCwXnVOU1IAI61IjEiRQSsXsdECrW90rhoZwIDAQAB"
  ]
}

