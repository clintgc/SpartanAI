# Setup Instructions for Terraform Deployment

## Prerequisites

1. **Install Terraform** (if not already installed):
   ```bash
   # macOS (via Homebrew)
   brew install terraform
   
   # Or download from: https://www.terraform.io/downloads
   ```

2. **AWS CLI configured** with appropriate credentials

3. **ACM Certificate** - You need to create this first (see below)

## Step-by-Step Deployment

### Step 1: Create ACM Certificate

You need to create an ACM certificate in the `us-east-1` region. You can do this via:

**Option A: AWS Console**
1. Go to AWS Console → Certificate Manager (ACM)
2. Make sure you're in the `us-east-1` region (CloudFront requirement)
3. Click "Request a certificate"
4. Select "Request a public certificate"
5. Domain names:
   - `spartan.tech`
   - `www.spartan.tech` (as Subject Alternative Name)
6. Validation method: DNS
7. Click "Request"
8. Copy the Certificate ARN (starts with `arn:aws:acm:us-east-1:`)

**Option B: AWS CLI** (if you have permissions)
```bash
aws acm request-certificate \
  --domain-name spartan.tech \
  --subject-alternative-names www.spartan.tech \
  --validation-method DNS \
  --region us-east-1
```

### Step 2: Configure Terraform Variables

1. Copy the example file:
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` and update:
   - `acm_certificate_arn` with your certificate ARN from Step 1

### Step 3: Initialize Terraform

```bash
cd terraform
terraform init
```

### Step 4: Review Plan

```bash
terraform plan
```

This will show you what resources will be created. Review carefully.

### Step 5: Apply Configuration

```bash
terraform apply
```

Type `yes` when prompted to confirm.

### Step 6: Get Name Servers

After deployment completes, get the Route 53 name servers:

```bash
terraform output route53_name_servers
```

### Step 7: Update GoDaddy Name Servers

1. Log into GoDaddy
2. Go to Domain Management → DNS Settings
3. Update the name servers to match the output from Step 6
4. Wait for DNS propagation (can take up to 48 hours, usually much faster)

## Uploading Website Files

After deployment, upload your website files:

```bash
# Get the bucket name
BUCKET=$(terraform output -raw s3_website_bucket_name)

# Upload files from www directory
aws s3 sync ../www/ s3://$BUCKET/ --delete
```

## Troubleshooting

- **Terraform not found**: Install via `brew install terraform` or download from terraform.io
- **ACM permissions**: You may need IAM permissions to create/list certificates
- **Certificate validation**: After creating the certificate, you'll need to add DNS validation records to Route 53 (or your DNS provider) before it can be used

