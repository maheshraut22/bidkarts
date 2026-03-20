# BidKarts – End-to-End AWS Deployment Guide (with PostgreSQL)

> This guide explains how to migrate BidKarts from **Cloudflare Workers + D1 SQLite** to a production-grade **AWS** stack using **PostgreSQL (Amazon RDS)**, **Node.js (Express/Hono on EC2 or ECS)**, **S3 for file storage**, and **CloudFront for CDN**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)  
2. [AWS Services Used](#2-aws-services-used)  
3. [Prerequisites](#3-prerequisites)  
4. [Step 1 – Set Up Amazon RDS PostgreSQL](#4-step-1--set-up-amazon-rds-postgresql)  
5. [Step 2 – Migrate Database Schema (D1 → PostgreSQL)](#5-step-2--migrate-database-schema-d1--postgresql)  
6. [Step 3 – Adapt Backend Code for PostgreSQL](#6-step-3--adapt-backend-code-for-postgresql)  
7. [Step 4 – File Storage with Amazon S3](#7-step-4--file-storage-with-amazon-s3)  
8. [Step 5 – Deploy Backend on AWS (EC2 or ECS)](#8-step-5--deploy-backend-on-aws-ec2-or-ecs)  
9. [Step 6 – Frontend Deployment (S3 + CloudFront)](#9-step-6--frontend-deployment-s3--cloudfront)  
10. [Step 7 – Environment Variables & Secrets Manager](#10-step-7--environment-variables--secrets-manager)  
11. [Step 8 – Domain & SSL (Route 53 + ACM)](#11-step-8--domain--ssl-route-53--acm)  
12. [Step 9 – Enable Real OAuth (Google/Facebook/Twitter)](#12-step-9--enable-real-oauth-googlefacebooktwitter)  
13. [Step 10 – CI/CD Pipeline (CodePipeline or GitHub Actions)](#13-step-10--cicd-pipeline-codepipeline-or-github-actions)  
14. [Step 11 – Monitoring & Logging](#14-step-11--monitoring--logging)  
15. [Cost Estimate](#15-cost-estimate)  
16. [Security Checklist](#16-security-checklist)

---

## 1. Architecture Overview

```
Users ──► Route 53 (DNS)
             │
             ▼
         CloudFront (CDN)
         ┌──────────────────┐
         │   S3 (Frontend)  │  ← Static HTML/JS/CSS
         └──────────────────┘
             │
             ▼ API calls
         Application Load Balancer (ALB)
             │
             ▼
         ECS Fargate (or EC2)  ← Node.js/Hono API server
             │              │
             ▼              ▼
     Amazon RDS          Amazon S3
     (PostgreSQL)    (Document Storage)
             │
             ▼
     ElastiCache Redis  ← Session/cache (optional)
```

---

## 2. AWS Services Used

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| **Amazon RDS (PostgreSQL)** | Persistent relational database | 750 hrs/month db.t3.micro |
| **EC2 / ECS Fargate** | Node.js API server | 750 hrs/month t2.micro (EC2) |
| **S3** | Frontend hosting + document storage | 5 GB |
| **CloudFront** | CDN for frontend and API caching | 1 TB transfer |
| **Route 53** | DNS management | $0.50/hosted zone |
| **ACM** | Free SSL/TLS certificates | Free |
| **Secrets Manager** | Secure env variables | 30-day free trial |
| **ALB** | Load balancer | 750 hrs/month |
| **CloudWatch** | Logging & monitoring | Basic metrics free |

---

## 3. Prerequisites

- AWS Account with IAM admin access  
- AWS CLI installed and configured: `aws configure`  
- Node.js 18+ installed locally  
- PostgreSQL client (`psql`) installed  
- Docker installed (for ECS deployment)

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Configure
aws configure
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region: ap-south-1  (Mumbai, recommended for India)
# Default output format: json
```

---

## 4. Step 1 – Set Up Amazon RDS PostgreSQL

### 4.1 Create RDS Instance via AWS Console

1. Go to **RDS → Create database**
2. Select **PostgreSQL** → version **16.x**
3. Template: **Free tier** (or Production for production)
4. DB instance identifier: `bidkarts-db`
5. Master username: `bidkarts_admin`
6. Master password: (save this securely)
7. DB instance class: `db.t3.micro` (free tier)
8. Storage: `20 GB gp3`
9. VPC: Default VPC
10. Publicly accessible: **No** (for production) or **Yes** (for initial setup)
11. VPC security group: Create new → `bidkarts-rds-sg`
12. Database name: `bidkarts`

### 4.2 Create via CLI

```bash
aws rds create-db-instance \
  --db-instance-identifier bidkarts-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version "16.3" \
  --master-username bidkarts_admin \
  --master-user-password "YourSecurePassword123!" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --db-name bidkarts \
  --vpc-security-group-ids sg-xxxxxxxx \
  --backup-retention-period 7 \
  --no-multi-az \
  --region ap-south-1

# Wait for it to be available
aws rds wait db-instance-available --db-instance-identifier bidkarts-db

# Get endpoint
aws rds describe-db-instances \
  --db-instance-identifier bidkarts-db \
  --query 'DBInstances[0].Endpoint.Address'
```

---

## 5. Step 2 – Migrate Database Schema (D1 → PostgreSQL)

### 5.1 PostgreSQL-Compatible Schema

Create file `db/schema.postgres.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('customer','vendor','expert','admin')),
  address     TEXT,
  avatar_url  TEXT,
  is_verified INTEGER DEFAULT 1,
  is_active   INTEGER DEFAULT 1,
  subscription_plan TEXT DEFAULT 'free',
  referral_code TEXT UNIQUE,
  admin_notes TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES users(id),
  service_type TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  property_type TEXT,
  budget_min  NUMERIC,
  budget_max  NUMERIC,
  timeline    TEXT,
  status      TEXT DEFAULT 'open',
  vendor_id   INTEGER REFERENCES users(id),
  selected_vendor_id INTEGER REFERENCES users(id),
  bid_opening_date TIMESTAMP,
  bid_closing_date TIMESTAMP,
  expert_support INTEGER DEFAULT 0,
  admin_notes TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id   INTEGER REFERENCES users(id),
  bid_amount  NUMERIC NOT NULL,
  timeline_days INTEGER,
  equipment_details TEXT,
  warranty_details TEXT,
  message     TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  doc_type    TEXT DEFAULT 'other',
  file_name   TEXT NOT NULL,
  file_url    TEXT,
  file_size   INTEGER DEFAULT 0,
  s3_key      TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendor profiles
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER UNIQUE REFERENCES users(id),
  company_name TEXT,
  owner_name  TEXT,
  service_area TEXT,
  certifications TEXT,
  experience_years INTEGER DEFAULT 0,
  services_offered TEXT,
  rating      NUMERIC DEFAULT 0,
  total_bids  INTEGER DEFAULT 0,
  won_bids    INTEGER DEFAULT 0,
  is_approved INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  portfolio_url TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expert profiles
CREATE TABLE IF NOT EXISTS expert_profiles (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER UNIQUE REFERENCES users(id),
  certification TEXT,
  experience  INTEGER DEFAULT 0,
  location    TEXT,
  service_types TEXT,
  bio         TEXT,
  rating      NUMERIC DEFAULT 0,
  total_inspections INTEGER DEFAULT 0,
  is_approved INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  project_id  INTEGER REFERENCES projects(id),
  amount      NUMERIC NOT NULL,
  currency    TEXT DEFAULT 'INR',
  payment_type TEXT,
  status      TEXT DEFAULT 'pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages / Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id),
  customer_id INTEGER REFERENCES users(id),
  vendor_id   INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id   INTEGER REFERENCES users(id),
  content     TEXT NOT NULL,
  is_read     INTEGER DEFAULT 0,
  attachments TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT,
  related_id  INTEGER,
  related_type TEXT,
  is_read     INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Consultations
CREATE TABLE IF NOT EXISTS consultations (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES users(id),
  expert_id   INTEGER REFERENCES users(id),
  project_id  INTEGER REFERENCES projects(id),
  service_type TEXT,
  topic       TEXT,
  description TEXT,
  status      TEXT DEFAULT 'pending',
  fee         NUMERIC DEFAULT 1500,
  scheduled_date TEXT,
  scheduled_time TEXT,
  consultation_type TEXT DEFAULT 'video',
  location    TEXT,
  attachments TEXT,
  expert_notes TEXT,
  report_url  TEXT,
  recommendations TEXT,
  summary     TEXT,
  completed_at TIMESTAMP,
  rating      INTEGER,
  review      TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inspections
CREATE TABLE IF NOT EXISTS inspections (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id),
  customer_id INTEGER REFERENCES users(id),
  expert_id   INTEGER REFERENCES users(id),
  status      TEXT DEFAULT 'requested',
  fee         NUMERIC DEFAULT 1500,
  scheduled_at TIMESTAMP,
  report_url  TEXT,
  recommendation TEXT,
  notes       TEXT,
  rating      INTEGER,
  review      TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id          SERIAL PRIMARY KEY,
  referrer_id INTEGER REFERENCES users(id),
  referred_id INTEGER UNIQUE REFERENCES users(id),
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_bids_project ON bids(project_id);
CREATE INDEX IF NOT EXISTS idx_bids_vendor ON bids(vendor_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
```

### 5.2 Apply Schema

```bash
# Connect to RDS
psql -h <rds-endpoint> -U bidkarts_admin -d bidkarts -f db/schema.postgres.sql

# Or using connection string
psql "postgresql://bidkarts_admin:password@<endpoint>:5432/bidkarts" -f db/schema.postgres.sql
```

### 5.3 Seed Demo Data

```bash
psql "postgresql://bidkarts_admin:password@<endpoint>:5432/bidkarts" << 'SQL'
-- Insert admin user (password: Admin@123)
INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
VALUES ('Admin User', 'admin@bidkarts.com', '$2a$10$hash_here', 'admin', 1, 1)
ON CONFLICT (email) DO NOTHING;
SQL
```

---

## 6. Step 3 – Adapt Backend Code for PostgreSQL

### 6.1 Install PostgreSQL Driver

```bash
cd /home/user/webapp
npm install pg @types/pg
npm install dotenv
```

### 6.2 Create Database Connection Module

Create `src/lib/postgres.ts`:

```typescript
import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false  // For RDS with SSL
      } : false,
      max: 20,                    // Max connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
    pool.on('error', (err) => {
      console.error('Unexpected DB error:', err)
    })
  }
  return pool
}

// Helper: execute a query
export async function query(sql: string, params?: any[]) {
  const client = getPool()
  const result = await client.query(sql, params)
  return result.rows
}

// D1-compatible wrapper (makes migration easier)
export function db() {
  return {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => {
          const rows = await query(sql.replace(/\?/g, (_, i) => `$${++i}`), args)
          return rows[0] || null
        },
        all: async () => {
          const rows = await query(sql.replace(/\?/g, (_, i) => `$${++i}`), args)
          return { results: rows }
        },
        run: async () => {
          const res = await getPool().query(
            sql.replace(/\?/g, (_, i) => `$${++i}`),
            args
          )
          return { meta: { last_row_id: res.rows[0]?.id, changes: res.rowCount } }
        }
      })
    })
  }
}
```

### 6.3 Update Environment Variables

Create `.env.production`:

```env
# Database
DATABASE_URL=postgresql://bidkarts_admin:password@your-rds-endpoint:5432/bidkarts

# JWT
JWT_SECRET=your-256-bit-secret-key-here

# S3
AWS_REGION=ap-south-1
AWS_S3_BUCKET=bidkarts-documents
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Email (SES or SendGrid)
EMAIL_FROM=noreply@yourdomain.com
SENDGRID_API_KEY=SG.xxxxx

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=your-secret

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret

# App
NODE_ENV=production
PORT=3000
APP_URL=https://yourdomain.com
```

### 6.4 Update Main Server Entry Point

Create `src/server.ts` for AWS (Express + Hono adapter):

```typescript
import { serve } from '@hono/node-server'
import app from './index'
import dotenv from 'dotenv'

dotenv.config()

const port = parseInt(process.env.PORT || '3000')

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 BidKarts API running on http://localhost:${info.port}`)
})
```

Update `package.json`:

```json
{
  "scripts": {
    "start": "node dist/server.js",
    "build:aws": "tsc -p tsconfig.aws.json",
    "dev:aws": "ts-node src/server.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "pg": "^8.11.0",
    "dotenv": "^16.0.0"
  }
}
```

---

## 7. Step 4 – File Storage with Amazon S3

### 7.1 Create S3 Bucket

```bash
# Create bucket (replace with your region)
aws s3api create-bucket \
  --bucket bidkarts-documents \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket bidkarts-documents \
  --versioning-configuration Status=Enabled

# Block public access (files accessed via pre-signed URLs)
aws s3api put-public-access-block \
  --bucket bidkarts-documents \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Set CORS for browser uploads
aws s3api put-bucket-cors --bucket bidkarts-documents --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["GET","PUT","POST","DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}'
```

### 7.2 Update Document Upload to Use S3

Install AWS SDK:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Update `src/routes/projects.ts` document upload:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' })

// POST /api/projects/:id/documents
projects.post('/:id/documents', authMiddleware, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('id')
  const body = await c.req.json()
  const { doc_type, file_name, file_url, file_size } = body

  let s3Key = null
  let storedUrl = file_url

  // If base64 data, upload to S3
  if (file_url && file_url.startsWith('data:')) {
    const matches = file_url.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
      const mimeType = matches[1]
      const base64Data = matches[2]
      const buffer = Buffer.from(base64Data, 'base64')

      s3Key = `projects/${projectId}/docs/${Date.now()}-${file_name}`
      
      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: { project_id: projectId, uploaded_by: String(user.id) }
      }))

      // Generate pre-signed URL valid for 7 days
      storedUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key
      }), { expiresIn: 604800 })
    }
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO documents (project_id, user_id, doc_type, file_name, file_url, file_size, s3_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(parseInt(projectId), user.id, doc_type, file_name, storedUrl, file_size || 0, s3Key).run()

  return c.json({ document: { id: result.meta.last_row_id, file_name, file_url: storedUrl }, message: 'Document uploaded' }, 201)
})
```

---

## 8. Step 5 – Deploy Backend on AWS

### Option A: EC2 (Simpler, more control)

```bash
# Launch EC2 instance
aws ec2 run-instances \
  --image-id ami-0f5ee92e2d63afc18 \   # Amazon Linux 2023 in ap-south-1
  --instance-type t3.small \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxx \
  --iam-instance-profile Name=BidKartsEC2Role \
  --user-data '#!/bin/bash
    yum update -y
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs git
    npm install -g pm2
    cd /home/ec2-user
    git clone https://github.com/yourrepo/bidkarts.git
    cd bidkarts
    npm install
    npm run build:aws
    pm2 start dist/server.js --name bidkarts
    pm2 startup systemd && pm2 save
  '

# Get instance IP
aws ec2 describe-instances \
  --query 'Reservations[0].Instances[0].PublicIpAddress'
```

### Option B: ECS Fargate (Recommended for production)

**1. Create Dockerfile:**

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build:aws

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**2. Push to ECR:**

```bash
# Create ECR repository
aws ecr create-repository --repository-name bidkarts-api --region ap-south-1

# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.ap-south-1.amazonaws.com

# Build and push
docker build -t bidkarts-api .
docker tag bidkarts-api:latest <account-id>.dkr.ecr.ap-south-1.amazonaws.com/bidkarts-api:latest
docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/bidkarts-api:latest
```

**3. Create ECS Task Definition (`ecs-task-def.json`):**

```json
{
  "family": "bidkarts-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<account>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<account>:role/bidkarts-task-role",
  "containerDefinitions": [{
    "name": "bidkarts-api",
    "image": "<account>.dkr.ecr.ap-south-1.amazonaws.com/bidkarts-api:latest",
    "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
    "environment": [
      { "name": "NODE_ENV", "value": "production" },
      { "name": "PORT", "value": "3000" }
    ],
    "secrets": [
      { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:ap-south-1:<account>:secret:bidkarts/db-url" },
      { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:ap-south-1:<account>:secret:bidkarts/jwt-secret" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/bidkarts-api",
        "awslogs-region": "ap-south-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3
    }
  }]
}
```

```bash
# Register task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-def.json

# Create ECS cluster
aws ecs create-cluster --cluster-name bidkarts-cluster

# Create service
aws ecs create-service \
  --cluster bidkarts-cluster \
  --service-name bidkarts-api \
  --task-definition bidkarts-api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=bidkarts-api,containerPort=3000"
```

---

## 9. Step 6 – Frontend Deployment (S3 + CloudFront)

```bash
# Create S3 bucket for frontend
aws s3api create-bucket \
  --bucket bidkarts-frontend \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Enable static website hosting
aws s3 website s3://bidkarts-frontend/ \
  --index-document index.html \
  --error-document index.html

# Upload built frontend
npm run build
aws s3 sync dist/ s3://bidkarts-frontend/ --delete

# Create CloudFront distribution
aws cloudfront create-distribution --distribution-config '{
  "CallerReference": "bidkarts-'$(date +%s)'",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-bidkarts-frontend",
      "DomainName": "bidkarts-frontend.s3-website.ap-south-1.amazonaws.com",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only"
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-bidkarts-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "Enabled": true,
  "HttpVersion": "http2",
  "Comment": "BidKarts Frontend"
}'
```

---

## 10. Step 7 – Environment Variables & Secrets Manager

```bash
# Store database URL in Secrets Manager
aws secretsmanager create-secret \
  --name "bidkarts/db-url" \
  --secret-string "postgresql://bidkarts_admin:password@rds-endpoint:5432/bidkarts"

# Store JWT secret
aws secretsmanager create-secret \
  --name "bidkarts/jwt-secret" \
  --secret-string "$(openssl rand -base64 32)"

# Store all secrets from .env file
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == '#'* ]] && continue
  aws secretsmanager create-secret \
    --name "bidkarts/${key,,}" \
    --secret-string "$value" 2>/dev/null || \
  aws secretsmanager update-secret \
    --secret-id "bidkarts/${key,,}" \
    --secret-string "$value"
done < .env.production
```

---

## 11. Step 8 – Domain & SSL (Route 53 + ACM)

```bash
# Create hosted zone
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s)

# Request SSL certificate (must be in us-east-1 for CloudFront)
aws acm request-certificate \
  --domain-name yourdomain.com \
  --subject-alternative-names "*.yourdomain.com" \
  --validation-method DNS \
  --region us-east-1

# Get validation records and add to Route 53
CERT_ARN=$(aws acm list-certificates --region us-east-1 \
  --query 'CertificateSummaryList[0].CertificateArn' --output text)
aws acm describe-certificate --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'

# Create DNS records in Route 53
# Add CNAME for ACM validation
# Add A record for domain → CloudFront distribution
```

---

## 12. Step 9 – Enable Real OAuth (Google/Facebook/Twitter)

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable **Google Identity** API
3. Create **OAuth 2.0 Client ID** → Web application
4. Authorized origins: `https://yourdomain.com`
5. Authorized redirect URIs: `https://api.yourdomain.com/api/auth/oauth/google/callback`
6. Copy Client ID and Secret to Secrets Manager

### Facebook OAuth

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create app → Add **Facebook Login** product
3. Set Valid OAuth Redirect URIs: `https://api.yourdomain.com/api/auth/oauth/facebook/callback`
4. Copy App ID and App Secret

### Twitter/X OAuth

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create project → Create app
3. Set Callback URL: `https://api.yourdomain.com/api/auth/oauth/twitter/callback`
4. Copy API Key and Secret

### Backend OAuth Routes to Add

```typescript
// src/routes/auth.ts - Add these routes:

// Facebook OAuth callback
auth.get('/oauth/facebook/callback', async (c) => {
  const code = c.req.query('code')
  const tokenRes = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      redirect_uri: `${process.env.APP_URL}/api/auth/oauth/facebook/callback`,
      code
    })
  })
  const { access_token } = await tokenRes.json()
  
  const userRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${access_token}`)
  const fbUser = await userRes.json()
  
  // Find or create user (same pattern as Google OAuth)
  // ... return JWT token
})

// Twitter OAuth 2.0 PKCE flow
auth.get('/oauth/twitter/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  // Exchange code for token using PKCE
  // ... 
})
```

### Frontend Integration (Update login page)

Update the `completeSocialOAuth` function to use real OAuth URLs in production:

```javascript
// In public/static/app.js
function handleFacebookLogin() {
  const clientId = window.FB_APP_ID; // Set from server-side config
  const redirectUri = encodeURIComponent(`${location.origin}/api/auth/oauth/facebook/callback`);
  window.location.href = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=email,public_profile`;
}

function handleTwitterLogin() {
  // Use Authorization Code + PKCE flow
  window.location.href = `${location.origin}/api/auth/oauth/twitter/start`;
}
```

---

## 13. Step 10 – CI/CD Pipeline (GitHub Actions)

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
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build
      run: npm run build:aws
      env:
        NODE_ENV: production
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ap-south-1
    
    - name: Login to ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2
    
    - name: Build and push Docker image
      env:
        REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $REGISTRY/bidkarts-api:$IMAGE_TAG .
        docker push $REGISTRY/bidkarts-api:$IMAGE_TAG
    
    - name: Deploy to ECS
      run: |
        aws ecs update-service \
          --cluster bidkarts-cluster \
          --service bidkarts-api \
          --force-new-deployment
    
    - name: Deploy frontend to S3
      run: |
        aws s3 sync dist/ s3://bidkarts-frontend/ --delete
        aws cloudfront create-invalidation \
          --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} \
          --paths "/*"
    
    - name: Run database migrations
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
      run: npm run db:migrate:prod
```

---

## 14. Step 11 – Monitoring & Logging

```bash
# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/bidkarts-api

# Set log retention (30 days)
aws logs put-retention-policy \
  --log-group-name /ecs/bidkarts-api \
  --retention-in-days 30

# Create CloudWatch alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name "BidKarts-HighErrorRate" \
  --metric-name "5XXError" \
  --namespace "AWS/ApplicationELB" \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:ap-south-1:<account>:bidkarts-alerts

# Create CloudWatch Dashboard
aws cloudwatch put-dashboard \
  --dashboard-name BidKarts \
  --dashboard-body '{
    "widgets": [
      {"type":"metric","properties":{"metrics":[["AWS/ECS","CPUUtilization","ClusterName","bidkarts-cluster"]],"title":"ECS CPU"}},
      {"type":"metric","properties":{"metrics":[["AWS/RDS","DatabaseConnections","DBInstanceIdentifier","bidkarts-db"]],"title":"DB Connections"}},
      {"type":"metric","properties":{"metrics":[["AWS/ApplicationELB","RequestCount","LoadBalancer","app/bidkarts-alb/xxx"]],"title":"Request Count"}}
    ]
  }'
```

---

## 15. Cost Estimate

### Development/Staging (Monthly)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| EC2 t3.micro | 1 instance | ~$8 |
| RDS db.t3.micro | PostgreSQL | ~$15 |
| S3 | 10 GB + requests | ~$1 |
| CloudFront | 10 GB transfer | ~$1 |
| Route 53 | 1 hosted zone | ~$0.50 |
| **Total** | | **~$26/month** |

### Production (Monthly, moderate traffic)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| ECS Fargate | 2 tasks × 0.5 vCPU / 1 GB | ~$30 |
| RDS db.t3.small | Multi-AZ PostgreSQL | ~$50 |
| S3 | 100 GB + requests | ~$5 |
| CloudFront | 100 GB transfer | ~$8 |
| ALB | 1 load balancer | ~$20 |
| Route 53 | 1 hosted zone | ~$0.50 |
| Secrets Manager | 5 secrets | ~$2.50 |
| CloudWatch | Logs + metrics | ~$5 |
| **Total** | | **~$120/month** |

> 💡 **Tip:** Use **Savings Plans** or **Reserved Instances** for EC2/RDS to save up to 40% on 1-year commitment.

---

## 16. Security Checklist

- [ ] RDS not publicly accessible (use VPC only)
- [ ] All secrets in AWS Secrets Manager, not in code
- [ ] S3 bucket blocks all public access
- [ ] Security groups: only ALB can reach ECS, only ECS can reach RDS
- [ ] HTTPS enforced everywhere (ACM + CloudFront)
- [ ] JWT secrets rotated every 90 days
- [ ] Database passwords ≥ 16 characters with mixed chars
- [ ] Enable AWS GuardDuty for threat detection
- [ ] Enable AWS Config for compliance tracking
- [ ] Enable CloudTrail for audit logging
- [ ] Enable RDS automated backups (7-day retention minimum)
- [ ] Rate limiting on auth endpoints (AWS WAF)
- [ ] Input validation on all API routes
- [ ] CORS properly configured

---

## Quick Reference: Key Commands

```bash
# Check ECS service status
aws ecs describe-services --cluster bidkarts-cluster --services bidkarts-api

# View recent logs
aws logs tail /ecs/bidkarts-api --follow

# Force new deployment (re-pulls latest Docker image)
aws ecs update-service --cluster bidkarts-cluster --service bidkarts-api --force-new-deployment

# Scale service up/down
aws ecs update-service --cluster bidkarts-cluster --service bidkarts-api --desired-count 3

# Connect to RDS via EC2 bastion
ssh -L 5432:<rds-endpoint>:5432 ec2-user@<bastion-ip>
psql -h localhost -U bidkarts_admin -d bidkarts

# Backup database
pg_dump "postgresql://bidkarts_admin:pwd@rds-endpoint:5432/bidkarts" > backup_$(date +%Y%m%d).sql
aws s3 cp backup_$(date +%Y%m%d).sql s3://bidkarts-backups/

# View S3 bucket contents
aws s3 ls s3://bidkarts-documents/projects/ --human-readable
```

---

*Last updated: 2026-03-19 | BidKarts v9 AWS Deployment Guide*
