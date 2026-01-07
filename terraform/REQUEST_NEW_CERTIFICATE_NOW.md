# Request New Certificate - Step by Step

## ✅ Verification Complete

**Current Certificate Issue Confirmed:**
- Current certificate ARN: `arn:aws:acm:us-east-1:052380405056:certificate/a4cd02d9-28e8-43b3-90f4-b8820942fd1d`
- **Only covers**: `alerts.spartan.tech`
- **Missing**: `spartan.tech` and `www.spartan.tech` ❌

This is why the main site is broken!

## 🚀 Request New Certificate via AWS Console

### Step 1: Open AWS Certificate Manager

1. Go to: **https://console.aws.amazon.com/acm/home?region=us-east-1**
   - ⚠️ **CRITICAL**: Must be in **us-east-1** region (CloudFront requirement)

### Step 2: Request Certificate

1. Click **"Request a certificate"** button (top right)
2. Select **"Request a public certificate"**
3. Click **"Next"**

### Step 3: Configure Domains

**Fully qualified domain name:**
```
spartan.tech
```

**Subject alternative names (click "Add another name to this certificate"):**
1. First SAN: `www.spartan.tech`
2. Second SAN: `alerts.spartan.tech`

**Final list should show:**
- `spartan.tech` (primary)
- `www.spartan.tech` (SAN)
- `alerts.spartan.tech` (SAN)

Click **"Next"**

### Step 4: Choose Validation Method

- Select **"DNS validation"**
- Click **"Request"**

### Step 5: Validate Certificate

AWS will show CNAME records that need to be added to Route53.

**Option A: Automatic (Recommended)**
- Click **"Create record in Route53"** for each domain
- AWS will automatically add the validation records
- Wait 5-15 minutes for validation

**Option B: Manual**
- Copy the CNAME records shown
- Add them to Route53 hosted zone: `Z0652485TZM0N7T1PPFP`
- Wait 5-15 minutes for validation

### Step 6: Wait for Issuance

- Certificate status will change from **"Pending validation"** → **"Issued"**
- Usually takes **5-15 minutes** after DNS records are added
- Refresh the page to check status

### Step 7: Copy Certificate ARN

Once status shows **"Issued"**:

1. Click on the certificate to view details
2. Copy the **Certificate ARN**
   - Format: `arn:aws:acm:us-east-1:052380405056:certificate/XXXX-XXXX-XXXX-XXXX`
3. Save it - you'll need it for the next step

## 📝 Update Terraform Configuration

After you have the new certificate ARN, I'll help you update `terraform.tfvars` and apply the changes.

**What to do:**
1. Get the new certificate ARN from Step 7 above
2. Tell me the ARN, and I'll update the configuration
3. Then we'll run `terraform apply` to fix the main site

## ✅ Verification Checklist

After the new certificate is issued, verify it covers all domains:
- ✅ `spartan.tech`
- ✅ `www.spartan.tech`
- ✅ `alerts.spartan.tech`

## 🎯 Expected Result

After updating Terraform with the new certificate:
- ✅ `https://spartan.tech` will work (redirects to www)
- ✅ `https://www.spartan.tech` will work
- ✅ `https://alerts.spartan.tech` will work
- ✅ All three domains will have valid SSL certificates

---

**Once you have the new certificate ARN, let me know and I'll update the Terraform configuration!**

