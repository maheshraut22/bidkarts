#!/usr/bin/env bash
# =============================================================================
# BidKarts - AWS Deployment Script
# Usage: ./scripts/deploy-aws.sh [--env production|staging] [--region ap-south-1]
# Prerequisites: AWS CLI v2, Docker, jq
# =============================================================================

set -euo pipefail

# ── Configuration (edit these or pass as env vars) ───────────────────────────
APP_NAME="${APP_NAME:-bidkarts}"
AWS_REGION="${AWS_REGION:-ap-south-1}"            # Mumbai region (closest to India)
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"              # Set via env or auto-detect
ECR_REPO="${ECR_REPO:-${APP_NAME}}"
ECS_CLUSTER="${ECS_CLUSTER:-${APP_NAME}-cluster}"
ECS_SERVICE="${ECS_SERVICE:-${APP_NAME}-service}"
ECS_TASK_FAMILY="${ECS_TASK_FAMILY:-${APP_NAME}-task}"
ENVIRONMENT="${ENVIRONMENT:-production}"
RDS_INSTANCE="${RDS_INSTANCE:-${APP_NAME}-db}"
DB_NAME="${DB_NAME:-bidkarts}"
DB_USER="${DB_USER:-bidkarts}"
VPC_CIDR="${VPC_CIDR:-10.0.0.0/16}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅${NC} $*"; }
warn() { echo -e "${YELLOW}⚠️${NC} $*"; }
fail() { echo -e "${RED}❌${NC} $*"; exit 1; }

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)     ENVIRONMENT="$2"; shift 2 ;;
    --region)  AWS_REGION="$2"; shift 2 ;;
    --account) AWS_ACCOUNT_ID="$2"; shift 2 ;;
    *) warn "Unknown arg: $1"; shift ;;
  esac
done

# ── Check prerequisites ──────────────────────────────────────────────────────
check_prerequisites() {
  log "Checking prerequisites..."
  command -v aws  >/dev/null 2>&1 || fail "AWS CLI not installed. Install from https://aws.amazon.com/cli/"
  command -v docker >/dev/null 2>&1 || fail "Docker not installed."
  command -v jq   >/dev/null 2>&1 || fail "jq not installed. Run: apt-get install jq or brew install jq"

  # Auto-detect AWS account ID
  if [[ -z "$AWS_ACCOUNT_ID" ]]; then
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
      || fail "Could not detect AWS Account ID. Configure AWS CLI: aws configure"
  fi

  ok "Prerequisites OK — Account: ${AWS_ACCOUNT_ID}, Region: ${AWS_REGION}"
}

# ── Step 1: Create VPC + Networking ─────────────────────────────────────────
setup_networking() {
  log "Setting up VPC and networking..."

  # Check if VPC already exists
  EXISTING_VPC=$(aws ec2 describe-vpcs \
    --filters "Name=tag:Name,Values=${APP_NAME}-vpc" \
    --query "Vpcs[0].VpcId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$EXISTING_VPC" != "None" && "$EXISTING_VPC" != "" ]]; then
    warn "VPC already exists: $EXISTING_VPC — skipping creation"
    VPC_ID="$EXISTING_VPC"
  else
    log "Creating VPC ${VPC_CIDR}..."
    VPC_ID=$(aws ec2 create-vpc \
      --cidr-block "$VPC_CIDR" \
      --query "Vpc.VpcId" --output text \
      --region "$AWS_REGION")
    aws ec2 create-tags --resources "$VPC_ID" \
      --tags "Key=Name,Value=${APP_NAME}-vpc" "Key=Environment,Value=${ENVIRONMENT}" \
      --region "$AWS_REGION"
    aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames \
      --region "$AWS_REGION"
    ok "Created VPC: $VPC_ID"
  fi

  # Create public subnets (2 AZs for HA)
  AZS=($(aws ec2 describe-availability-zones \
    --query "AvailabilityZones[0:2].ZoneName" --output text --region "$AWS_REGION"))

  SUBNET_PUB_1=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${APP_NAME}-pub-1" \
    --query "Subnets[0].SubnetId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$SUBNET_PUB_1" == "None" || "$SUBNET_PUB_1" == "" ]]; then
    SUBNET_PUB_1=$(aws ec2 create-subnet \
      --vpc-id "$VPC_ID" --cidr-block "10.0.1.0/24" \
      --availability-zone "${AZS[0]}" \
      --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
    aws ec2 create-tags --resources "$SUBNET_PUB_1" \
      --tags "Key=Name,Value=${APP_NAME}-pub-1" --region "$AWS_REGION"

    SUBNET_PUB_2=$(aws ec2 create-subnet \
      --vpc-id "$VPC_ID" --cidr-block "10.0.2.0/24" \
      --availability-zone "${AZS[1]}" \
      --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
    aws ec2 create-tags --resources "$SUBNET_PUB_2" \
      --tags "Key=Name,Value=${APP_NAME}-pub-2" --region "$AWS_REGION"

    # Private subnets for RDS
    SUBNET_PRIV_1=$(aws ec2 create-subnet \
      --vpc-id "$VPC_ID" --cidr-block "10.0.10.0/24" \
      --availability-zone "${AZS[0]}" \
      --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
    aws ec2 create-tags --resources "$SUBNET_PRIV_1" \
      --tags "Key=Name,Value=${APP_NAME}-priv-1" --region "$AWS_REGION"

    SUBNET_PRIV_2=$(aws ec2 create-subnet \
      --vpc-id "$VPC_ID" --cidr-block "10.0.11.0/24" \
      --availability-zone "${AZS[1]}" \
      --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
    aws ec2 create-tags --resources "$SUBNET_PRIV_2" \
      --tags "Key=Name,Value=${APP_NAME}-priv-2" --region "$AWS_REGION"

    # Internet Gateway
    IGW_ID=$(aws ec2 create-internet-gateway \
      --query "InternetGateway.InternetGatewayId" --output text --region "$AWS_REGION")
    aws ec2 attach-internet-gateway --vpc-id "$VPC_ID" --internet-gateway-id "$IGW_ID" --region "$AWS_REGION"
    aws ec2 create-tags --resources "$IGW_ID" \
      --tags "Key=Name,Value=${APP_NAME}-igw" --region "$AWS_REGION"

    # Route table for public subnets
    RTB_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
      --query "RouteTable.RouteTableId" --output text --region "$AWS_REGION")
    aws ec2 create-route --route-table-id "$RTB_ID" \
      --destination-cidr-block "0.0.0.0/0" --gateway-id "$IGW_ID" --region "$AWS_REGION"
    aws ec2 associate-route-table --route-table-id "$RTB_ID" --subnet-id "$SUBNET_PUB_1" --region "$AWS_REGION"
    aws ec2 associate-route-table --route-table-id "$RTB_ID" --subnet-id "$SUBNET_PUB_2" --region "$AWS_REGION"

    ok "Created networking: subnets, IGW, route tables"
  fi

  # Export for use by other functions
  export VPC_ID SUBNET_PUB_1 SUBNET_PUB_2 SUBNET_PRIV_1 SUBNET_PRIV_2
}

# ── Step 2: Security Groups ──────────────────────────────────────────────────
setup_security_groups() {
  log "Setting up security groups..."

  # ALB security group
  ALB_SG=$(aws ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${APP_NAME}-alb-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$ALB_SG" == "None" || "$ALB_SG" == "" ]]; then
    ALB_SG=$(aws ec2 create-security-group \
      --group-name "${APP_NAME}-alb-sg" \
      --description "BidKarts ALB Security Group" \
      --vpc-id "$VPC_ID" \
      --query "GroupId" --output text --region "$AWS_REGION")
    aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
      --protocol tcp --port 80  --cidr 0.0.0.0/0 --region "$AWS_REGION"
    aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
      --protocol tcp --port 443 --cidr 0.0.0.0/0 --region "$AWS_REGION"
    ok "Created ALB security group: $ALB_SG"
  fi

  # ECS task security group
  ECS_SG=$(aws ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${APP_NAME}-ecs-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$ECS_SG" == "None" || "$ECS_SG" == "" ]]; then
    ECS_SG=$(aws ec2 create-security-group \
      --group-name "${APP_NAME}-ecs-sg" \
      --description "BidKarts ECS Tasks Security Group" \
      --vpc-id "$VPC_ID" \
      --query "GroupId" --output text --region "$AWS_REGION")
    aws ec2 authorize-security-group-ingress --group-id "$ECS_SG" \
      --protocol tcp --port 3000 --source-group "$ALB_SG" --region "$AWS_REGION"
    ok "Created ECS security group: $ECS_SG"
  fi

  # RDS security group
  RDS_SG=$(aws ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${APP_NAME}-rds-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$RDS_SG" == "None" || "$RDS_SG" == "" ]]; then
    RDS_SG=$(aws ec2 create-security-group \
      --group-name "${APP_NAME}-rds-sg" \
      --description "BidKarts RDS Security Group" \
      --vpc-id "$VPC_ID" \
      --query "GroupId" --output text --region "$AWS_REGION")
    aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" \
      --protocol tcp --port 5432 --source-group "$ECS_SG" --region "$AWS_REGION"
    ok "Created RDS security group: $RDS_SG"
  fi

  export ALB_SG ECS_SG RDS_SG
}

# ── Step 3: RDS PostgreSQL ───────────────────────────────────────────────────
setup_rds() {
  log "Setting up RDS PostgreSQL..."

  # Check if RDS instance exists
  RDS_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE" \
    --query "DBInstances[0].DBInstanceStatus" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "not-found")

  if [[ "$RDS_STATUS" != "not-found" ]]; then
    warn "RDS instance ${RDS_INSTANCE} already exists (status: ${RDS_STATUS})"
  else
    # Generate random password
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    echo "DB_PASSWORD=$DB_PASSWORD" >> .env.aws.generated

    # Create DB subnet group
    aws rds create-db-subnet-group \
      --db-subnet-group-name "${APP_NAME}-subnet-group" \
      --db-subnet-group-description "BidKarts DB subnet group" \
      --subnet-ids "$SUBNET_PRIV_1" "$SUBNET_PRIV_2" \
      --region "$AWS_REGION" 2>/dev/null || true

    log "Creating RDS PostgreSQL 15 (t3.micro for cost efficiency)..."
    aws rds create-db-instance \
      --db-instance-identifier "$RDS_INSTANCE" \
      --db-instance-class db.t3.micro \
      --engine postgres \
      --engine-version "15.4" \
      --master-username "$DB_USER" \
      --master-user-password "$DB_PASSWORD" \
      --db-name "$DB_NAME" \
      --vpc-security-group-ids "$RDS_SG" \
      --db-subnet-group-name "${APP_NAME}-subnet-group" \
      --allocated-storage 20 \
      --storage-type gp2 \
      --no-publicly-accessible \
      --backup-retention-period 7 \
      --storage-encrypted \
      --deletion-protection \
      --tags "Key=Name,Value=${APP_NAME}-db" "Key=Environment,Value=${ENVIRONMENT}" \
      --region "$AWS_REGION"

    log "Waiting for RDS to become available (5-10 minutes)..."
    aws rds wait db-instance-available \
      --db-instance-identifier "$RDS_INSTANCE" \
      --region "$AWS_REGION"
    ok "RDS PostgreSQL ready!"
  fi

  # Get RDS endpoint
  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE" \
    --query "DBInstances[0].Endpoint.Address" \
    --output text --region "$AWS_REGION")

  export RDS_ENDPOINT
  ok "RDS endpoint: $RDS_ENDPOINT"
}

# ── Step 4: ECR Repository + Docker Build ───────────────────────────────────
build_and_push() {
  log "Building and pushing Docker image to ECR..."

  ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

  # Create ECR repo if not exists
  aws ecr describe-repositories --repository-names "$ECR_REPO" \
    --region "$AWS_REGION" >/dev/null 2>&1 || \
  aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --region "$AWS_REGION"

  # Enable lifecycle policy to keep only last 10 images
  aws ecr put-lifecycle-policy \
    --repository-name "$ECR_REPO" \
    --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Keep last 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' \
    --region "$AWS_REGION" 2>/dev/null || true

  # Login to ECR
  aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

  # Build image
  IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
  log "Building Docker image: ${ECR_URI}:${IMAGE_TAG}..."
  docker build -t "${ECR_URI}:${IMAGE_TAG}" -t "${ECR_URI}:latest" .

  # Push
  log "Pushing to ECR..."
  docker push "${ECR_URI}:${IMAGE_TAG}"
  docker push "${ECR_URI}:latest"

  export ECR_URI IMAGE_TAG
  ok "Image pushed: ${ECR_URI}:${IMAGE_TAG}"
}

# ── Step 5: IAM Role for ECS ─────────────────────────────────────────────────
setup_iam() {
  log "Setting up IAM roles for ECS..."

  TASK_ROLE_NAME="${APP_NAME}-ecs-task-role"
  EXEC_ROLE_NAME="${APP_NAME}-ecs-exec-role"

  # Task execution role (for pulling ECR images, CloudWatch logs)
  aws iam get-role --role-name "$EXEC_ROLE_NAME" >/dev/null 2>&1 || {
    aws iam create-role \
      --role-name "$EXEC_ROLE_NAME" \
      --assume-role-policy-document '{
        "Version":"2012-10-17",
        "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
      }'
    aws iam attach-role-policy \
      --role-name "$EXEC_ROLE_NAME" \
      --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    # Allow reading secrets from SSM Parameter Store
    aws iam attach-role-policy \
      --role-name "$EXEC_ROLE_NAME" \
      --policy-arn "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
    ok "Created ECS execution role: $EXEC_ROLE_NAME"
  }

  # Task role (for app permissions)
  aws iam get-role --role-name "$TASK_ROLE_NAME" >/dev/null 2>&1 || {
    aws iam create-role \
      --role-name "$TASK_ROLE_NAME" \
      --assume-role-policy-document '{
        "Version":"2012-10-17",
        "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
      }'
    ok "Created ECS task role: $TASK_ROLE_NAME"
  }

  EXEC_ROLE_ARN=$(aws iam get-role --role-name "$EXEC_ROLE_NAME" \
    --query "Role.Arn" --output text)
  TASK_ROLE_ARN=$(aws iam get-role --role-name "$TASK_ROLE_NAME" \
    --query "Role.Arn" --output text)

  export EXEC_ROLE_ARN TASK_ROLE_ARN
}

# ── Step 6: CloudWatch Log Group ─────────────────────────────────────────────
setup_cloudwatch() {
  log "Setting up CloudWatch log group..."
  aws logs create-log-group \
    --log-group-name "/ecs/${APP_NAME}" \
    --region "$AWS_REGION" 2>/dev/null || true
  aws logs put-retention-policy \
    --log-group-name "/ecs/${APP_NAME}" \
    --retention-in-days 30 \
    --region "$AWS_REGION" 2>/dev/null || true
  ok "CloudWatch log group: /ecs/${APP_NAME}"
}

# ── Step 7: Store secrets in SSM Parameter Store ─────────────────────────────
store_secrets() {
  log "Storing secrets in AWS SSM Parameter Store..."

  # Read from environment or .env.production
  [[ -f .env.production ]] && source .env.production 2>/dev/null || true

  JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48)}"
  DB_URL="postgresql://${DB_USER}:${DB_PASSWORD:-change_me}@${RDS_ENDPOINT}:5432/${DB_NAME}"

  store_param() {
    local name="$1" value="$2" type="${3:-SecureString}"
    aws ssm put-parameter \
      --name "/${APP_NAME}/${ENVIRONMENT}/${name}" \
      --value "$value" \
      --type "$type" \
      --overwrite \
      --region "$AWS_REGION" >/dev/null
    ok "Stored SSM: /${APP_NAME}/${ENVIRONMENT}/${name}"
  }

  store_param "DATABASE_URL"        "$DB_URL"
  store_param "JWT_SECRET"          "$JWT_SECRET"
  store_param "NODE_ENV"            "$ENVIRONMENT" "String"
  [[ -n "${SENDGRID_API_KEY:-}" ]]     && store_param "SENDGRID_API_KEY"     "$SENDGRID_API_KEY"
  [[ -n "${RAZORPAY_KEY_ID:-}" ]]      && store_param "RAZORPAY_KEY_ID"      "$RAZORPAY_KEY_ID"
  [[ -n "${RAZORPAY_KEY_SECRET:-}" ]]  && store_param "RAZORPAY_KEY_SECRET"  "$RAZORPAY_KEY_SECRET"
}

# ── Step 8: ECS Cluster + Task Definition + Service ──────────────────────────
setup_ecs() {
  log "Setting up ECS Fargate cluster and service..."

  # Create ECS cluster
  aws ecs describe-clusters --clusters "$ECS_CLUSTER" \
    --query "clusters[0].status" --output text --region "$AWS_REGION" 2>/dev/null | \
    grep -q "ACTIVE" || \
  aws ecs create-cluster \
    --cluster-name "$ECS_CLUSTER" \
    --capacity-providers FARGATE FARGATE_SPOT \
    --default-capacity-provider-strategy \
      'capacityProvider=FARGATE,weight=1,base=1' \
      'capacityProvider=FARGATE_SPOT,weight=3' \
    --tags "key=Environment,value=${ENVIRONMENT}" \
    --region "$AWS_REGION"

  ok "ECS cluster: $ECS_CLUSTER"

  # Register task definition
  TASK_DEF=$(cat <<EOF
{
  "family": "${ECS_TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${APP_NAME}",
      "image": "${ECR_URI}:${IMAGE_TAG}",
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "NODE_ENV",  "value": "${ENVIRONMENT}" },
        { "name": "PORT",      "value": "3000" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/${ENVIRONMENT}/DATABASE_URL"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/${ENVIRONMENT}/JWT_SECRET"
        },
        {
          "name": "SENDGRID_API_KEY",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/${ENVIRONMENT}/SENDGRID_API_KEY"
        },
        {
          "name": "RAZORPAY_KEY_ID",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/${ENVIRONMENT}/RAZORPAY_KEY_ID"
        },
        {
          "name": "RAZORPAY_KEY_SECRET",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/${ENVIRONMENT}/RAZORPAY_KEY_SECRET"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${APP_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 30
      },
      "essential": true
    }
  ]
}
EOF
)

  TASK_DEF_ARN=$(echo "$TASK_DEF" | aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin \
    --query "taskDefinition.taskDefinitionArn" --output text \
    --region "$AWS_REGION")

  ok "Registered task definition: $TASK_DEF_ARN"

  # Create or update ECS service
  SVC_STATUS=$(aws ecs describe-services \
    --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --query "services[0].status" --output text \
    --region "$AWS_REGION" 2>/dev/null || echo "INACTIVE")

  if [[ "$SVC_STATUS" == "ACTIVE" ]]; then
    log "Updating existing ECS service..."
    aws ecs update-service \
      --cluster "$ECS_CLUSTER" \
      --service "$ECS_SERVICE" \
      --task-definition "$TASK_DEF_ARN" \
      --desired-count 1 \
      --region "$AWS_REGION" >/dev/null
    ok "ECS service updated"
  else
    log "Creating ECS service (with ALB)..."
    setup_alb
    aws ecs create-service \
      --cluster "$ECS_CLUSTER" \
      --service-name "$ECS_SERVICE" \
      --task-definition "$TASK_DEF_ARN" \
      --desired-count 1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_PUB_1},${SUBNET_PUB_2}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
      --load-balancers "targetGroupArn=${TG_ARN},containerName=${APP_NAME},containerPort=3000" \
      --health-check-grace-period-seconds 60 \
      --region "$AWS_REGION" >/dev/null
    ok "ECS service created"
  fi
}

# ── Step 9: Application Load Balancer ────────────────────────────────────────
setup_alb() {
  log "Setting up Application Load Balancer..."

  ALB_ARN=$(aws elbv2 describe-load-balancers \
    --names "${APP_NAME}-alb" \
    --query "LoadBalancers[0].LoadBalancerArn" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$ALB_ARN" == "None" || "$ALB_ARN" == "" ]]; then
    ALB_ARN=$(aws elbv2 create-load-balancer \
      --name "${APP_NAME}-alb" \
      --subnets "$SUBNET_PUB_1" "$SUBNET_PUB_2" \
      --security-groups "$ALB_SG" \
      --scheme internet-facing \
      --type application \
      --tags "Key=Name,Value=${APP_NAME}-alb" "Key=Environment,Value=${ENVIRONMENT}" \
      --query "LoadBalancers[0].LoadBalancerArn" --output text \
      --region "$AWS_REGION")
    ok "Created ALB: $ALB_ARN"
  fi

  ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns "$ALB_ARN" \
    --query "LoadBalancers[0].DNSName" --output text --region "$AWS_REGION")

  # Target group
  TG_ARN=$(aws elbv2 describe-target-groups \
    --names "${APP_NAME}-tg" \
    --query "TargetGroups[0].TargetGroupArn" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ "$TG_ARN" == "None" || "$TG_ARN" == "" ]]; then
    TG_ARN=$(aws elbv2 create-target-group \
      --name "${APP_NAME}-tg" \
      --protocol HTTP \
      --port 3000 \
      --vpc-id "$VPC_ID" \
      --target-type ip \
      --health-check-path "/api/health" \
      --health-check-interval-seconds 30 \
      --healthy-threshold-count 2 \
      --unhealthy-threshold-count 3 \
      --query "TargetGroups[0].TargetGroupArn" --output text \
      --region "$AWS_REGION")
    ok "Created target group: $TG_ARN"

    # Create HTTP listener
    aws elbv2 create-listener \
      --load-balancer-arn "$ALB_ARN" \
      --protocol HTTP --port 80 \
      --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
      --region "$AWS_REGION" >/dev/null
    ok "Created HTTP listener on port 80"
  fi

  export ALB_ARN ALB_DNS TG_ARN
  ok "ALB DNS: http://${ALB_DNS}"
}

# ── Step 10: Auto Scaling ────────────────────────────────────────────────────
setup_autoscaling() {
  log "Setting up auto-scaling..."

  aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "service/${ECS_CLUSTER}/${ECS_SERVICE}" \
    --min-capacity 1 \
    --max-capacity 5 \
    --region "$AWS_REGION" 2>/dev/null || true

  # Scale out on CPU > 70%
  aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "service/${ECS_CLUSTER}/${ECS_SERVICE}" \
    --policy-name "${APP_NAME}-cpu-scale" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
      "TargetValue": 70.0,
      "PredefinedMetricSpecification": {
        "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
      },
      "ScaleInCooldown": 300,
      "ScaleOutCooldown": 60
    }' \
    --region "$AWS_REGION" 2>/dev/null || true

  ok "Auto-scaling configured (1-5 tasks, CPU target: 70%)"
}

# ── Run DB migrations ────────────────────────────────────────────────────────
run_migrations() {
  log "Running database migrations via /api/setup endpoint..."
  sleep 30  # Wait for ECS service to stabilize
  APP_URL="http://${ALB_DNS}"
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/setup" 2>/dev/null || echo "000")
  if [[ "$RESPONSE" == "200" ]]; then
    ok "Database migrated and seeded!"
  else
    warn "Could not auto-run /api/setup (HTTP ${RESPONSE}). Run manually: curl ${APP_URL}/api/setup"
  fi
}

# ── Print deployment summary ──────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  🎉  BidKarts Deployed Successfully to AWS!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${BLUE}Application URL:${NC}  http://${ALB_DNS}"
  echo -e "  ${BLUE}Health Check:${NC}     http://${ALB_DNS}/api/health"
  echo -e "  ${BLUE}DB Setup:${NC}         http://${ALB_DNS}/api/setup  (run once)"
  echo ""
  echo -e "  ${BLUE}ECS Cluster:${NC}      ${ECS_CLUSTER}"
  echo -e "  ${BLUE}ECS Service:${NC}      ${ECS_SERVICE}"
  echo -e "  ${BLUE}ECR Image:${NC}        ${ECR_URI}:${IMAGE_TAG}"
  echo -e "  ${BLUE}RDS Endpoint:${NC}     ${RDS_ENDPOINT}"
  echo -e "  ${BLUE}Region:${NC}           ${AWS_REGION}"
  echo ""
  echo -e "  ${YELLOW}Next Steps:${NC}"
  echo -e "  1. Point your domain DNS → ${ALB_DNS}"
  echo -e "  2. Add HTTPS: aws acm request-certificate --domain-name yourdomain.com"
  echo -e "  3. Visit http://${ALB_DNS}/api/setup to initialize the database"
  echo ""
  echo -e "  ${YELLOW}Useful Commands:${NC}"
  echo -e "  View logs:       aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}"
  echo -e "  Scale service:   aws ecs update-service --cluster ${ECS_CLUSTER} --service ${ECS_SERVICE} --desired-count 2 --region ${AWS_REGION}"
  echo -e "  Redeploy:        ./scripts/deploy-aws.sh"
  echo ""
}

# ── MAIN ─────────────────────────────────────────────────────────────────────
main() {
  echo -e "${BLUE}"
  echo "  ██████╗ ██╗██████╗ ██╗  ██╗ █████╗ ██████╗ ████████╗███████╗"
  echo "  ██╔══██╗██║██╔══██╗██║ ██╔╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝"
  echo "  ██████╔╝██║██║  ██║█████╔╝ ███████║██████╔╝   ██║   ███████╗"
  echo "  ██╔══██╗██║██║  ██║██╔═██╗ ██╔══██║██╔══██╗   ██║   ╚════██║"
  echo "  ██████╔╝██║██████╔╝██║  ██╗██║  ██║██║  ██║   ██║   ███████║"
  echo "  ╚═════╝ ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝"
  echo -e "${NC}"
  echo -e "  ${YELLOW}AWS Deployment Script${NC} — Environment: ${ENVIRONMENT} — Region: ${AWS_REGION}"
  echo ""

  check_prerequisites
  setup_networking
  setup_security_groups
  setup_rds
  build_and_push
  setup_iam
  setup_cloudwatch
  store_secrets
  setup_ecs
  setup_autoscaling
  run_migrations
  print_summary
}

main "$@"
