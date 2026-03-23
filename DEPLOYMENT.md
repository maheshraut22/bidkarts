# BidKarts - AWS PostgreSQL Deployment Guide

## Overview

BidKarts supports two deployment modes:
- **Cloudflare Pages** (sandbox/development): Uses Cloudflare D1 SQLite  
- **AWS ECS Fargate** (production): Uses PostgreSQL on AWS RDS

---

## Quick Start

### Option A: Local Development with Docker Compose

```bash
# 1. Clone and install
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env with your settings (JWT_SECRET is required!)

# 3. Start PostgreSQL + App
npm run docker:up

# 4. Seed the database (first time only)
npm run db:seed

# 5. Open http://localhost:3000
```

**Demo Credentials:**
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@bidkarts.com | Admin@123 |
| Customer | customer@bidkarts.com | Customer@123 |
| Vendor | vendor@bidkarts.com | Vendor@123 |
| Expert | expert@bidkarts.com | Expert@123 |

---

### Option B: AWS Production Deployment

#### Prerequisites
```bash
# Install required tools
brew install awscli docker jq postgresql  # macOS
# OR
apt-get install awscli docker.io jq postgresql-client  # Ubuntu

# Configure AWS credentials
aws configure
# Enter: AWS Access Key ID, Secret, Region (ap-south-1), Output (json)
```

#### Deploy to AWS
```bash
# Set required environment variables
export SENDGRID_API_KEY=SG.xxxx          # Optional: for emails
export RAZORPAY_KEY_ID=rzp_live_xxxx     # For payments
export RAZORPAY_KEY_SECRET=xxxx          # For payments

# Full deployment (creates VPC, RDS, ECR, ECS, ALB)
npm run deploy:aws

# This will:
# 1. Create VPC with public/private subnets
# 2. Create RDS PostgreSQL 15 (t3.micro, encrypted)
# 3. Build and push Docker image to ECR
# 4. Create ECS Fargate cluster + service
# 5. Set up Application Load Balancer
# 6. Store secrets in AWS SSM Parameter Store
# 7. Run database migrations
```

After deployment, your app will be at: `http://<alb-dns-name>/`

#### Seed the database (first time only)
```bash
curl http://<your-alb-dns>/api/setup
```

---

## Code Updates (Re-deploy)

```bash
# After making code changes:
npm run redeploy:aws

# This will:
# 1. Build new Docker image
# 2. Push to ECR
# 3. Register new ECS task definition
# 4. Force new deployment (zero-downtime rolling update)
```

---

## Architecture

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│       AWS Application Load Balancer  │
│         (HTTP :80 / HTTPS :443)      │
└──────────────┬──────────────────────┘
               │
    ┌──────────▼──────────┐
    │   ECS Fargate        │
    │  ┌────────────────┐  │
    │  │  BidKarts App  │  │  ← Docker container (Node.js + Hono)
    │  │  Port 3000     │  │
    │  └────────────────┘  │
    │  ┌────────────────┐  │
    │  │  BidKarts App  │  │  ← 2nd task (auto-scaling 1-10)
    │  └────────────────┘  │
    └──────────┬───────────┘
               │
    ┌──────────▼──────────┐
    │   RDS PostgreSQL 15  │  ← Private subnet, encrypted
    │   db.t3.micro        │
    └─────────────────────┘
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Min 32 chars, random secret |
| `NODE_ENV` | ✅ | `production` or `development` |
| `PORT` | ✅ | App port (default: 3000) |
| `SENDGRID_API_KEY` | ⚪ | For real email notifications |
| `SMTP_FROM` | ⚪ | Sender email address |
| `RAZORPAY_KEY_ID` | ⚪ | For payment processing |
| `RAZORPAY_KEY_SECRET` | ⚪ | For payment processing |

### Managing Secrets in AWS

```bash
# View stored secrets
aws ssm get-parameters-by-path \
  --path /bidkarts/production \
  --with-decryption \
  --region ap-south-1

# Update a secret
aws ssm put-parameter \
  --name /bidkarts/production/SENDGRID_API_KEY \
  --value "SG.xxx" \
  --type SecureString \
  --overwrite \
  --region ap-south-1

# After updating secrets, force new deployment:
npm run redeploy:aws
```

---

## Database Operations

### Run Migrations
```bash
# Local (Docker Compose)
npm run db:migrate

# Production (via SSM)
npm run db:migrate:prod

# Connect to DB console
npm run db:console
```

### Useful Queries
```sql
-- Check all users
SELECT id, name, email, role, is_active FROM users;

-- Check pending vendor approvals
SELECT u.name, u.email, vp.company_name
FROM users u JOIN vendor_profiles vp ON vp.user_id = u.id
WHERE vp.is_approved = 0;

-- Revenue summary
SELECT DATE_TRUNC('month', created_at) as month,
       SUM(amount)/100 as revenue_inr
FROM payments WHERE status = 'completed'
GROUP BY 1 ORDER BY 1 DESC;
```

---

## Monitoring & Debugging

### View Logs
```bash
# AWS CloudWatch logs (streaming)
npm run logs:aws

# Docker Compose logs
npm run docker:logs

# ECS service status
npm run status:aws
```

### Health Check
```bash
curl http://<your-app>/api/health
# {"status":"ok","platform":"BidKarts","version":"2.0.0"}
```

---

## Estimated AWS Costs (ap-south-1 / Mumbai)

| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| ECS Fargate | 2 tasks × 0.5 vCPU × 1 GB | ~₹900 |
| RDS PostgreSQL | db.t3.micro, 20GB gp3 | ~₹1,500 |
| Application Load Balancer | Standard | ~₹600 |
| ECR | Image storage | ~₹50 |
| CloudWatch | Logs (30 days) | ~₹150 |
| Data Transfer | Typical usage | ~₹200 |
| **Total** | | **~₹3,400/mo** |

> Scale up: RDS db.t3.small (~₹3,000/mo) + more ECS tasks as traffic grows

---

## Troubleshooting

### "DATABASE_URL not set" error
```bash
# Check SSM parameter exists
aws ssm get-parameter --name /bidkarts/production/DATABASE_URL \
  --with-decryption --region ap-south-1

# If missing, set it
aws ssm put-parameter --name /bidkarts/production/DATABASE_URL \
  --value "postgresql://..." --type SecureString --overwrite
```

### ECS tasks failing to start
```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster bidkarts-cluster \
  --tasks $(aws ecs list-tasks --cluster bidkarts-cluster --query 'taskArns[0]' --output text) \
  --region ap-south-1 \
  --query 'tasks[0].containers[0].reason'

# View CloudWatch logs
aws logs tail /ecs/bidkarts --follow --region ap-south-1
```

### Database connection refused
```bash
# Verify RDS security group allows ECS security group on port 5432
aws ec2 describe-security-groups \
  --group-ids <rds-sg-id> \
  --query 'SecurityGroups[0].IpPermissions'

# Test connectivity from local (requires VPN or bastion host)
```

### Reset and re-deploy
```bash
# Full clean redeploy
FORCE=true npm run deploy:aws
```

---

## CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build and deploy to AWS
        run: npm run redeploy:aws
        env:
          APP_NAME: bidkarts
          AWS_REGION: ap-south-1
          ENVIRONMENT: production
```

---

## Support

- **Admin Dashboard**: `/dashboard/admin`
- **API Health**: `/api/health`
- **DB Setup/Seed**: `/api/setup` (GET, run once after deployment)

---

*Last Updated: March 2026 | BidKarts v2.0.0*
