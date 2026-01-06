# AWS SES DKIM Configuration Guide

## Overview

This guide will help you configure DKIM (DomainKeys Identified Mail) for `spartan.tech` in AWS SES. DKIM allows recipients to verify that emails sent from your domain are authentic and haven't been tampered with.

## Prerequisites

- AWS account with SES access
- Route 53 hosted zone for `spartan.tech`
- Domain verified in SES (or ability to verify it)

## Step 1: Verify Domain in SES

1. Go to **AWS Console → Simple Email Service (SES)**
2. Make sure you're in the **us-east-1** region
3. Click **Verified identities** in the left sidebar
4. Click **Create identity**
5. Select **Domain**
6. Enter `spartan.tech`
7. Select **Easy DKIM** (recommended)
8. Click **Create identity**

## Step 2: Enable DKIM

1. In the **Verified identities** list, click on `spartan.tech`
2. Scroll down to **DKIM authentication**
3. Click **Edit**
4. Select **Easy DKIM**
5. Click **Save changes**

## Step 3: Get DKIM Tokens

After enabling DKIM, AWS will generate 3 CNAME records. You'll see something like:

```
CNAME records to add:
- _c1._domainkey.spartan.tech → _c1.domainkey.xxxxx.dkim.amazonses.com
- _c2._domainkey.spartan.tech → _c2.domainkey.xxxxx.dkim.amazonses.com  
- _c3._domainkey.spartan.tech → _c3.domainkey.xxxxx.dkim.amazonses.com
```

**Copy these 3 CNAME records** - you'll need them for Route 53.

## Step 4: Add CNAME Records to Route 53

You can add these via Terraform or AWS Console:

### Option A: Via AWS Console

1. Go to **Route 53 → Hosted zones → spartan.tech**
2. Click **Create record**
3. For each of the 3 CNAME records:
   - **Record name**: `_c1._domainkey` (or `_c2._domainkey`, `_c3._domainkey`)
   - **Record type**: `CNAME`
   - **Value**: The corresponding value from SES (e.g., `_c1.domainkey.xxxxx.dkim.amazonses.com`)
   - **TTL**: `3600`
   - Click **Create records**

### Option B: Via Terraform

Add these resources to `terraform/modules/route53/main.tf`:

```hcl
# SES DKIM CNAME records
# Replace the values with the actual tokens from SES
resource "aws_route53_record" "ses_dkim_1" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_c1._domainkey"
  type    = "CNAME"
  ttl     = 3600
  records = ["_c1.domainkey.XXXXX.dkim.amazonses.com"]  # Replace XXXXX with your actual token
}

resource "aws_route53_record" "ses_dkim_2" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_c2._domainkey"
  type    = "CNAME"
  ttl     = 3600
  records = ["_c2.domainkey.XXXXX.dkim.amazonses.com"]  # Replace XXXXX with your actual token
}

resource "aws_route53_record" "ses_dkim_3" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_c3._domainkey"
  type    = "CNAME"
  ttl     = 3600
  records = ["_c3.domainkey.XXXXX.dkim.amazonses.com"]  # Replace XXXXX with your actual token
}
```

## Step 5: Verify DKIM Status

After adding the CNAME records, wait 5-10 minutes for DNS propagation, then:

1. Go back to **SES → Verified identities → spartan.tech**
2. Check **DKIM authentication** status
3. It should show **3 of 3 tokens verified** and status should be **Success**

## Step 6: Test Email Sending

Once DKIM is verified, test sending an email:

```bash
aws ses send-email \
  --from noreply@spartan.tech \
  --to your-email@example.com \
  --subject "Test Email" \
  --text "This is a test email" \
  --region us-east-1
```

Check the email headers - you should see DKIM signatures.

## Current Status

- ✅ **Google Workspace DKIM**: Already configured (`google._domainkey.spartan.tech`)
- ⚠️ **AWS SES DKIM**: Needs to be configured (follow steps above)

## Notes

- **Google Workspace DKIM** is for emails received via Google Workspace (incoming emails)
- **AWS SES DKIM** is for emails sent via AWS SES (outgoing emails from Lambda functions)
- Both can coexist - they serve different purposes
- SES DKIM uses CNAME records (easier to manage)
- Google Workspace DKIM uses TXT records (already configured)

## Troubleshooting

### DKIM not verifying
- Wait 10-15 minutes for DNS propagation
- Verify CNAME records are correct in Route 53
- Check that record names match exactly (including underscores)
- Ensure TTL is reasonable (3600 seconds is fine)

### Permission errors
If you get permission errors, you need IAM permissions:
- `ses:GetIdentityDkimAttributes`
- `ses:SetIdentityDkimEnabled`
- `ses:GetIdentityVerificationAttributes`
- `ses:VerifyDomainIdentity`

## Reference

- [AWS SES DKIM Documentation](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim-easy.html)
- [Route 53 CNAME Records](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-cname.html)

