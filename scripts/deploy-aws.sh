#!/usr/bin/env bash
# =============================================================================
# BidKarts - Comprehensive AWS ECS Fargate Deployment Script v2
# =============================================================================
# Usage:
#   ./scripts/deploy-aws.sh                        # Full deployment
#   ./scripts/deploy-aws.sh --env staging          # Staging deployment
#   ./scripts/deploy-aws.sh --region us-east-1     # Specific region
#   ./scripts/deploy-aws.sh --skip-rds             # Skip RDS creation
#   ./scripts/deploy-aws.sh --image-only           # Build & push image only
#   ./scripts/deploy-aws.sh --migrate-only         # Run DB migrations only
#
# Prerequisites:
#   - AWS CLI v2 (aws configure with appropriate permissions)
#   - Docker Desktop or Docker Engine
#   - jq (brew install jq / apt-get install jq)
#   - psql (for running migrations)
#   - openssl (pre-installed on most systems)
#
# Required AWS IAM Permissions:
#   ec2:*, ecs:*, ecr:*, rds:*, iam:*, logs:*, ssm:*, elasticloadbalancing:*
#   (See: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam.html)
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_NAME="${APP_NAME:-bidkarts}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
ECR_REPO="${ECR_REPO:-${APP_NAME}}"
ECS_CLUSTER="${ECS_CLUSTER:-${APP_NAME}-cluster}"
ECS_SERVICE="${ECS_SERVICE:-${APP_NAME}-service}"
ECS_TASK_FAMILY="${ECS_TASK_FAMILY:-${APP_NAME}-task}"
ENVIRONMENT="${ENVIRONMENT:-production}"
RDS_INSTANCE="${RDS_INSTANCE:-${APP_NAME}-db}"
DB_NAME="${DB_NAME:-bidkarts}"
DB_USER="${DB_USER:-bidkarts}"
VPC_CIDR="${VPC_CIDR:-10.0.0.0/16}"
APP_PORT="${APP_PORT:-3000}"
TASK_CPU="${TASK_CPU:-512}"          # 0.5 vCPU (256, 512, 1024, 2048, 4096)
TASK_MEMORY="${TASK_MEMORY:-1024}"  # 1 GB (512-30720 MB)
DESIRED_COUNT="${DESIRED_COUNT:-2}" # Number of ECS tasks

# Flags
SKIP_RDS=false
IMAGE_ONLY=false
MIGRATE_ONLY=false
FORCE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail() { echo -e "${RED}❌ $*${NC}"; exit 1; }
info() { echo -e "${CYAN}ℹ️  $*${NC}"; }
header() { echo -e "\n${BOLD}${BLUE}═══════════════════════════════════════${NC}"; echo -e "${BOLD}${BLUE}  $*${NC}"; echo -e "${BOLD}${BLUE}═══════════════════════════════════════${NC}\n"; }

# ── Parse Arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env|-e)        ENVIRONMENT="$2"; shift 2 ;;
    --region|-r)     AWS_REGION="$2"; shift 2 ;;
    --account|-a)    AWS_ACCOUNT_ID="$2"; shift 2 ;;
    --skip-rds)      SKIP_RDS=true; shift ;;
    --image-only)    IMAGE_ONLY=true; shift ;;
    --migrate-only)  MIGRATE_ONLY=true; shift ;;
    --force)         FORCE=true; shift ;;
    --cpu)           TASK_CPU="$2"; shift 2 ;;
    --memory)        TASK_MEMORY="$2"; shift 2 ;;
    --count)         DESIRED_COUNT="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo "  --env|-e <env>        Environment (production|staging) [default: production]"
      echo "  --region|-r <region>  AWS region [default: ap-south-1]"
      echo "  --account|-a <id>     AWS account ID (auto-detected if not set)"
      echo "  --skip-rds            Skip RDS PostgreSQL creation"
      echo "  --image-only          Only build and push Docker image"
      echo "  --migrate-only        Only run database migrations"
      echo "  --force               Force re-creation of existing resources"
      echo "  --cpu <256-4096>      ECS task CPU units [default: 512]"
      echo "  --memory <512-30720>  ECS task memory in MB [default: 1024]"
      echo "  --count <n>           Desired ECS task count [default: 2]"
      exit 0
      ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Generated files ────────────────────────────────────────────────────────────
GENERATED_ENV_FILE=".env.aws.${ENVIRONMENT}.generated"
STATE_FILE=".deploy-state-${ENVIRONMENT}.json"

# ── Helper: Save/load deploy state ────────────────────────────────────────────
save_state() {
  cat > "$STATE_FILE" <<EOF
{
  "vpc_id": "${VPC_ID:-}",
  "subnet_pub_1": "${SUBNET_PUB_1:-}",
  "subnet_pub_2": "${SUBNET_PUB_2:-}",
  "subnet_priv_1": "${SUBNET_PRIV_1:-}",
  "subnet_priv_2": "${SUBNET_PRIV_2:-}",
  "alb_sg": "${ALB_SG:-}",
  "ecs_sg": "${ECS_SG:-}",
  "rds_sg": "${RDS_SG:-}",
  "rds_endpoint": "${RDS_ENDPOINT:-}",
  "alb_dns": "${ALB_DNS:-}",
  "ecr_uri": "${ECR_URI:-}",
  "image_tag": "${IMAGE_TAG:-}",
  "target_group_arn": "${TG_ARN:-}",
  "alb_arn": "${ALB_ARN:-}",
  "environment": "${ENVIRONMENT}",
  "region": "${AWS_REGION}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  info "State saved to $STATE_FILE"
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    VPC_ID=$(jq -r '.vpc_id // empty' "$STATE_FILE" 2>/dev/null || echo "")
    SUBNET_PUB_1=$(jq -r '.subnet_pub_1 // empty' "$STATE_FILE" 2>/dev/null || echo "")
    SUBNET_PUB_2=$(jq -r '.subnet_pub_2 // empty' "$STATE_FILE" 2>/dev/null || echo "")
    SUBNET_PRIV_1=$(jq -r '.subnet_priv_1 // empty' "$STATE_FILE" 2>/dev/null || echo "")
    SUBNET_PRIV_2=$(jq -r '.subnet_priv_2 // empty' "$STATE_FILE" 2>/dev/null || echo "")
    ALB_SG=$(jq -r '.alb_sg // empty' "$STATE_FILE" 2>/dev/null || echo "")
    ECS_SG=$(jq -r '.ecs_sg // empty' "$STATE_FILE" 2>/dev/null || echo "")
    RDS_SG=$(jq -r '.rds_sg // empty' "$STATE_FILE" 2>/dev/null || echo "")
    RDS_ENDPOINT=$(jq -r '.rds_endpoint // empty' "$STATE_FILE" 2>/dev/null || echo "")
    ALB_DNS=$(jq -r '.alb_dns // empty' "$STATE_FILE" 2>/dev/null || echo "")
    ECR_URI=$(jq -r '.ecr_uri // empty' "$STATE_FILE" 2>/dev/null || echo "")
    TG_ARN=$(jq -r '.target_group_arn // empty' "$STATE_FILE" 2>/dev/null || echo "")
    ALB_ARN=$(jq -r '.alb_arn // empty' "$STATE_FILE" 2>/dev/null || echo "")
    info "Loaded state from $STATE_FILE"
  fi
}

# ── Step 0: Check Prerequisites ───────────────────────────────────────────────
check_prerequisites() {
  header "Checking Prerequisites"

  local missing=()
  command -v aws    >/dev/null 2>&1 || missing+=("aws-cli")
  command -v docker >/dev/null 2>&1 || missing+=("docker")
  command -v jq     >/dev/null 2>&1 || missing+=("jq")

  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required tools: ${missing[*]}\nInstall:\n  brew install awscli docker jq\n  or apt-get install awscli docker.io jq"
  fi

  # Verify AWS credentials
  if [[ -z "$AWS_ACCOUNT_ID" ]]; then
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
      || fail "AWS credentials not configured. Run: aws configure\nOr set: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION"
  fi

  # Verify Docker is running
  docker info >/dev/null 2>&1 || fail "Docker daemon is not running. Start Docker Desktop or: sudo systemctl start docker"

  ok "Prerequisites OK"
  info "AWS Account: ${AWS_ACCOUNT_ID}"
  info "AWS Region:  ${AWS_REGION}"
  info "Environment: ${ENVIRONMENT}"
  info "App Name:    ${APP_NAME}"
}

# ── Step 1: VPC + Networking ──────────────────────────────────────────────────
setup_networking() {
  header "Setting Up VPC & Networking"

  # Check existing VPC
  EXISTING_VPC=$(aws ec2 describe-vpcs \
    --filters "Name=tag:Name,Values=${APP_NAME}-vpc" \
    --query "Vpcs[0].VpcId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

  if [[ -n "$VPC_ID" && "$VPC_ID" != "None" && "$VPC_ID" != "" ]] && [[ "$FORCE" != "true" ]]; then
    warn "Using existing VPC from state: $VPC_ID"
  elif [[ "$EXISTING_VPC" != "None" && "$EXISTING_VPC" != "" ]]; then
    VPC_ID="$EXISTING_VPC"
    warn "VPC already exists: $VPC_ID — using existing"
  else
    log "Creating VPC ${VPC_CIDR}..."
    VPC_ID=$(aws ec2 create-vpc \
      --cidr-block "$VPC_CIDR" \
      --query "Vpc.VpcId" --output text --region "$AWS_REGION")

    aws ec2 create-tags --resources "$VPC_ID" \
      --tags "Key=Name,Value=${APP_NAME}-vpc" \
             "Key=Environment,Value=${ENVIRONMENT}" \
             "Key=App,Value=${APP_NAME}" \
      --region "$AWS_REGION"

    aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" \
      --enable-dns-hostnames --region "$AWS_REGION"
    aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" \
      --enable-dns-support --region "$AWS_REGION"

    ok "Created VPC: $VPC_ID"
  fi

  # Get availability zones
  mapfile -t AZS < <(aws ec2 describe-availability-zones \
    --query "AvailabilityZones[0:2].ZoneName" --output text --region "$AWS_REGION" | tr '\t' '\n')

  # Create subnets if not in state
  if [[ -z "${SUBNET_PUB_1:-}" ]]; then
    log "Creating subnets across 2 AZs..."

    # Public subnet 1
    SUBNET_PUB_1=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${APP_NAME}-pub-1" \
      --query "Subnets[0].SubnetId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [[ -z "$SUBNET_PUB_1" || "$SUBNET_PUB_1" == "None" ]]; then
      SUBNET_PUB_1=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" --cidr-block "10.0.1.0/24" \
        --availability-zone "${AZS[0]}" \
        --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
      aws ec2 create-tags --resources "$SUBNET_PUB_1" \
        --tags "Key=Name,Value=${APP_NAME}-pub-1" "Key=Type,Value=public" --region "$AWS_REGION"
      aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_PUB_1" \
        --map-public-ip-on-launch --region "$AWS_REGION"
    fi

    # Public subnet 2
    SUBNET_PUB_2=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${APP_NAME}-pub-2" \
      --query "Subnets[0].SubnetId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [[ -z "$SUBNET_PUB_2" || "$SUBNET_PUB_2" == "None" ]]; then
      SUBNET_PUB_2=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" --cidr-block "10.0.2.0/24" \
        --availability-zone "${AZS[1]}" \
        --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
      aws ec2 create-tags --resources "$SUBNET_PUB_2" \
        --tags "Key=Name,Value=${APP_NAME}-pub-2" "Key=Type,Value=public" --region "$AWS_REGION"
      aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_PUB_2" \
        --map-public-ip-on-launch --region "$AWS_REGION"
    fi

    # Private subnets for RDS
    SUBNET_PRIV_1=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${APP_NAME}-priv-1" \
      --query "Subnets[0].SubnetId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [[ -z "$SUBNET_PRIV_1" || "$SUBNET_PRIV_1" == "None" ]]; then
      SUBNET_PRIV_1=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" --cidr-block "10.0.10.0/24" \
        --availability-zone "${AZS[0]}" \
        --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
      aws ec2 create-tags --resources "$SUBNET_PRIV_1" \
        --tags "Key=Name,Value=${APP_NAME}-priv-1" "Key=Type,Value=private" --region "$AWS_REGION"
    fi

    SUBNET_PRIV_2=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${APP_NAME}-priv-2" \
      --query "Subnets[0].SubnetId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [[ -z "$SUBNET_PRIV_2" || "$SUBNET_PRIV_2" == "None" ]]; then
      SUBNET_PRIV_2=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" --cidr-block "10.0.11.0/24" \
        --availability-zone "${AZS[1]}" \
        --query "Subnet.SubnetId" --output text --region "$AWS_REGION")
      aws ec2 create-tags --resources "$SUBNET_PRIV_2" \
        --tags "Key=Name,Value=${APP_NAME}-priv-2" "Key=Type,Value=private" --region "$AWS_REGION"
    fi

    # Internet Gateway
    IGW_ID=$(aws ec2 describe-internet-gateways \
      --filters "Name=attachment.vpc-id,Values=${VPC_ID}" \
      --query "InternetGateways[0].InternetGatewayId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [[ -z "$IGW_ID" || "$IGW_ID" == "None" ]]; then
      IGW_ID=$(aws ec2 create-internet-gateway \
        --query "InternetGateway.InternetGatewayId" --output text --region "$AWS_REGION")
      aws ec2 attach-internet-gateway --vpc-id "$VPC_ID" \
        --internet-gateway-id "$IGW_ID" --region "$AWS_REGION"
      aws ec2 create-tags --resources "$IGW_ID" \
        --tags "Key=Name,Value=${APP_NAME}-igw" --region "$AWS_REGION"
    fi

    # Route table for public subnets
    RTB_ID=$(aws ec2 describe-route-tables \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${APP_NAME}-public-rtb" \
      --query "RouteTables[0].RouteTableId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [[ -z "$RTB_ID" || "$RTB_ID" == "None" ]]; then
      RTB_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
        --query "RouteTable.RouteTableId" --output text --region "$AWS_REGION")
      aws ec2 create-tags --resources "$RTB_ID" \
        --tags "Key=Name,Value=${APP_NAME}-public-rtb" --region "$AWS_REGION"
      aws ec2 create-route --route-table-id "$RTB_ID" \
        --destination-cidr-block "0.0.0.0/0" --gateway-id "$IGW_ID" --region "$AWS_REGION"
      aws ec2 associate-route-table --route-table-id "$RTB_ID" \
        --subnet-id "$SUBNET_PUB_1" --region "$AWS_REGION" >/dev/null
      aws ec2 associate-route-table --route-table-id "$RTB_ID" \
        --subnet-id "$SUBNET_PUB_2" --region "$AWS_REGION" >/dev/null
    fi

    ok "Networking created: VPC, 4 subnets, IGW, route tables"
  else
    ok "Using existing subnets from state"
  fi

  info "VPC:           $VPC_ID"
  info "Public-1:      $SUBNET_PUB_1"
  info "Public-2:      $SUBNET_PUB_2"
  info "Private-1:     $SUBNET_PRIV_1"
  info "Private-2:     $SUBNET_PRIV_2"

  export VPC_ID SUBNET_PUB_1 SUBNET_PUB_2 SUBNET_PRIV_1 SUBNET_PRIV_2
}

# ── Step 2: Security Groups ───────────────────────────────────────────────────
setup_security_groups() {
  header "Setting Up Security Groups"

  get_or_create_sg() {
    local name="$1" desc="$2"
    local sg_id
    sg_id=$(aws ec2 describe-security-groups \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${name}" \
      --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    if [[ -z "$sg_id" || "$sg_id" == "None" ]]; then
      sg_id=$(aws ec2 create-security-group \
        --group-name "$name" --description "$desc" \
        --vpc-id "$VPC_ID" --query "GroupId" --output text --region "$AWS_REGION")
      ok "Created SG: $name ($sg_id)"
    else
      info "Using existing SG: $name ($sg_id)"
    fi
    echo "$sg_id"
  }

  # ALB Security Group (allows HTTP/HTTPS from internet)
  ALB_SG=$(get_or_create_sg "${APP_NAME}-alb-sg" "BidKarts ALB - Public HTTP/HTTPS")
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$AWS_REGION" 2>/dev/null || true
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0 --region "$AWS_REGION" 2>/dev/null || true

  # ECS Security Group (allows traffic from ALB only)
  ECS_SG=$(get_or_create_sg "${APP_NAME}-ecs-sg" "BidKarts ECS Tasks")
  aws ec2 authorize-security-group-ingress --group-id "$ECS_SG" \
    --protocol tcp --port "$APP_PORT" --source-group "$ALB_SG" --region "$AWS_REGION" 2>/dev/null || true

  # RDS Security Group (allows PostgreSQL from ECS only)
  RDS_SG=$(get_or_create_sg "${APP_NAME}-rds-sg" "BidKarts RDS PostgreSQL")
  aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" \
    --protocol tcp --port 5432 --source-group "$ECS_SG" --region "$AWS_REGION" 2>/dev/null || true

  ok "Security groups configured"
  export ALB_SG ECS_SG RDS_SG
}

# ── Step 3: RDS PostgreSQL ────────────────────────────────────────────────────
setup_rds() {
  header "Setting Up RDS PostgreSQL 15"

  if [[ "$SKIP_RDS" == "true" ]]; then
    warn "Skipping RDS creation (--skip-rds flag set)"
    if [[ -z "${RDS_ENDPOINT:-}" ]]; then
      fail "RDS_ENDPOINT must be set when using --skip-rds. Set DATABASE_URL env var."
    fi
    return
  fi

  RDS_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE" \
    --query "DBInstances[0].DBInstanceStatus" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "not-found")

  if [[ "$RDS_STATUS" == "available" ]]; then
    warn "RDS instance '${RDS_INSTANCE}' already exists and is available"
  elif [[ "$RDS_STATUS" != "not-found" ]]; then
    log "RDS instance exists with status: $RDS_STATUS — waiting for it to be available..."
    aws rds wait db-instance-available \
      --db-instance-identifier "$RDS_INSTANCE" --region "$AWS_REGION"
  else
    # Generate secure random password
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)

    # Save password securely
    cat >> "$GENERATED_ENV_FILE" <<EOF
# Generated on $(date -u +%Y-%m-%dT%H:%M:%SZ)
DB_PASSWORD=${DB_PASSWORD}
DB_USER=${DB_USER}
DB_NAME=${DB_NAME}
RDS_INSTANCE=${RDS_INSTANCE}
EOF
    chmod 600 "$GENERATED_ENV_FILE"
    warn "DB Password saved to: ${GENERATED_ENV_FILE} (keep this safe!)"

    # Create DB subnet group
    aws rds create-db-subnet-group \
      --db-subnet-group-name "${APP_NAME}-db-subnet-group" \
      --db-subnet-group-description "BidKarts DB subnet group" \
      --subnet-ids "$SUBNET_PRIV_1" "$SUBNET_PRIV_2" \
      --region "$AWS_REGION" 2>/dev/null || true

    log "Creating RDS PostgreSQL 15 instance (this takes 5-10 minutes)..."
    aws rds create-db-instance \
      --db-instance-identifier "$RDS_INSTANCE" \
      --db-instance-class db.t3.micro \
      --engine postgres \
      --engine-version "15.4" \
      --master-username "$DB_USER" \
      --master-user-password "$DB_PASSWORD" \
      --db-name "$DB_NAME" \
      --vpc-security-group-ids "$RDS_SG" \
      --db-subnet-group-name "${APP_NAME}-db-subnet-group" \
      --allocated-storage 20 \
      --storage-type gp3 \
      --no-publicly-accessible \
      --backup-retention-period 7 \
      --preferred-backup-window "03:00-04:00" \
      --preferred-maintenance-window "Mon:04:00-Mon:05:00" \
      --storage-encrypted \
      --deletion-protection \
      --enable-performance-insights \
      --performance-insights-retention-period 7 \
      --tags "Key=Name,Value=${APP_NAME}-db" \
             "Key=Environment,Value=${ENVIRONMENT}" \
             "Key=App,Value=${APP_NAME}" \
      --region "$AWS_REGION" >/dev/null

    log "⏳ Waiting for RDS to become available (5-10 minutes)..."
    aws rds wait db-instance-available \
      --db-instance-identifier "$RDS_INSTANCE" --region "$AWS_REGION"
    ok "RDS PostgreSQL is ready!"
  fi

  # Get RDS endpoint
  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE" \
    --query "DBInstances[0].Endpoint.Address" \
    --output text --region "$AWS_REGION")

  ok "RDS endpoint: $RDS_ENDPOINT"

  # If we have DB_PASSWORD, store DATABASE_URL in generated env file
  if [[ -n "${DB_PASSWORD:-}" ]]; then
    DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/${DB_NAME}?sslmode=require"
    echo "DATABASE_URL=${DB_URL}" >> "$GENERATED_ENV_FILE"
    info "DATABASE_URL saved to ${GENERATED_ENV_FILE}"
  fi

  export RDS_ENDPOINT
}

# ── Step 4: ECR + Docker Build ────────────────────────────────────────────────
build_and_push() {
  header "Building & Pushing Docker Image to ECR"

  ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

  # Create ECR repo
  aws ecr describe-repositories --repository-names "$ECR_REPO" \
    --region "$AWS_REGION" >/dev/null 2>&1 || \
  aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --region "$AWS_REGION" >/dev/null
  ok "ECR repository: $ECR_URI"

  # Lifecycle policy: keep last 10 images
  aws ecr put-lifecycle-policy \
    --repository-name "$ECR_REPO" \
    --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Keep last 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' \
    --region "$AWS_REGION" 2>/dev/null || true

  # Docker login to ECR
  log "Authenticating Docker with ECR..."
  aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

  # Build image
  IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
  log "Building Docker image: ${ECR_URI}:${IMAGE_TAG}..."
  docker build \
    --platform linux/amd64 \
    --build-arg NODE_ENV=production \
    -t "${ECR_URI}:${IMAGE_TAG}" \
    -t "${ECR_URI}:latest" \
    -t "${ECR_URI}:${ENVIRONMENT}" \
    .

  # Push
  log "Pushing image to ECR..."
  docker push "${ECR_URI}:${IMAGE_TAG}"
  docker push "${ECR_URI}:latest"
  docker push "${ECR_URI}:${ENVIRONMENT}"

  ok "Image pushed: ${ECR_URI}:${IMAGE_TAG}"
  export ECR_URI IMAGE_TAG
}

# ── Step 5: IAM Roles ─────────────────────────────────────────────────────────
setup_iam() {
  header "Setting Up IAM Roles"

  EXEC_ROLE_NAME="${APP_NAME}-ecs-exec-role"
  TASK_ROLE_NAME="${APP_NAME}-ecs-task-role"

  # ECS Task Execution Role
  aws iam get-role --role-name "$EXEC_ROLE_NAME" >/dev/null 2>&1 || {
    aws iam create-role \
      --role-name "$EXEC_ROLE_NAME" \
      --assume-role-policy-document '{
        "Version":"2012-10-17",
        "Statement":[{
          "Effect":"Allow",
          "Principal":{"Service":"ecs-tasks.amazonaws.com"},
          "Action":"sts:AssumeRole"
        }]
      }' >/dev/null
    aws iam attach-role-policy \
      --role-name "$EXEC_ROLE_NAME" \
      --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    # Allow reading SSM parameters (for secrets)
    aws iam put-role-policy \
      --role-name "$EXEC_ROLE_NAME" \
      --policy-name "SSMParameterAccess" \
      --policy-document "{
        \"Version\":\"2012-10-17\",
        \"Statement\":[{
          \"Effect\":\"Allow\",
          \"Action\":[\"ssm:GetParameters\",\"ssm:GetParameter\",\"ssm:GetParametersByPath\",\"kms:Decrypt\"],
          \"Resource\":\"arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/*\"
        }]
      }"
    ok "Created ECS execution role: $EXEC_ROLE_NAME"
  }

  # ECS Task Role (application permissions)
  aws iam get-role --role-name "$TASK_ROLE_NAME" >/dev/null 2>&1 || {
    aws iam create-role \
      --role-name "$TASK_ROLE_NAME" \
      --assume-role-policy-document '{
        "Version":"2012-10-17",
        "Statement":[{
          "Effect":"Allow",
          "Principal":{"Service":"ecs-tasks.amazonaws.com"},
          "Action":"sts:AssumeRole"
        }]
      }' >/dev/null
    # Allow CloudWatch Logs
    aws iam put-role-policy \
      --role-name "$TASK_ROLE_NAME" \
      --policy-name "CloudWatchLogs" \
      --policy-document '{
        "Version":"2012-10-17",
        "Statement":[{
          "Effect":"Allow",
          "Action":["logs:CreateLogStream","logs:PutLogEvents"],
          "Resource":"*"
        }]
      }'
    ok "Created ECS task role: $TASK_ROLE_NAME"
  }

  EXEC_ROLE_ARN=$(aws iam get-role --role-name "$EXEC_ROLE_NAME" --query "Role.Arn" --output text)
  TASK_ROLE_ARN=$(aws iam get-role --role-name "$TASK_ROLE_NAME" --query "Role.Arn" --output text)

  ok "IAM roles ready"
  info "Exec role: $EXEC_ROLE_ARN"
  info "Task role: $TASK_ROLE_ARN"
  export EXEC_ROLE_ARN TASK_ROLE_ARN
}

# ── Step 6: CloudWatch Logs ───────────────────────────────────────────────────
setup_cloudwatch() {
  header "Setting Up CloudWatch Logs"

  aws logs create-log-group \
    --log-group-name "/ecs/${APP_NAME}" \
    --region "$AWS_REGION" 2>/dev/null || true

  aws logs put-retention-policy \
    --log-group-name "/ecs/${APP_NAME}" \
    --retention-in-days 30 \
    --region "$AWS_REGION" 2>/dev/null || true

  ok "CloudWatch log group: /ecs/${APP_NAME} (30 day retention)"
}

# ── Step 7: Store Secrets in SSM ──────────────────────────────────────────────
store_secrets() {
  header "Storing Secrets in AWS SSM Parameter Store"

  # Load generated env file if it exists
  [[ -f "$GENERATED_ENV_FILE" ]] && source "$GENERATED_ENV_FILE" 2>/dev/null || true
  # Load custom env file if provided
  [[ -f ".env.${ENVIRONMENT}" ]] && source ".env.${ENVIRONMENT}" 2>/dev/null || true
  [[ -f ".env.production" ]] && source ".env.production" 2>/dev/null || true

  # Generate JWT secret if not set
  JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)}"

  # Build DATABASE_URL if not set
  if [[ -z "${DATABASE_URL:-}" ]]; then
    if [[ -z "${DB_PASSWORD:-}" ]]; then
      warn "DB_PASSWORD not set. Please set DATABASE_URL manually in SSM:"
      warn "  aws ssm put-parameter --name '/${APP_NAME}/${ENVIRONMENT}/DATABASE_URL' --value 'postgresql://...' --type SecureString --overwrite"
    else
      DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/${DB_NAME}?sslmode=require"
    fi
  fi

  put_param() {
    local name="$1" value="$2" type="${3:-SecureString}"
    if [[ -n "$value" ]]; then
      aws ssm put-parameter \
        --name "/${APP_NAME}/${ENVIRONMENT}/${name}" \
        --value "$value" \
        --type "$type" \
        --overwrite \
        --region "$AWS_REGION" >/dev/null 2>&1 && ok "Stored: /${APP_NAME}/${ENVIRONMENT}/${name}" || \
        warn "Failed to store: $name"
    else
      warn "Skipping empty value for: $name"
    fi
  }

  put_param "DATABASE_URL"       "${DATABASE_URL:-}"
  put_param "JWT_SECRET"         "$JWT_SECRET"
  put_param "NODE_ENV"           "$ENVIRONMENT" "String"
  put_param "PORT"               "$APP_PORT"    "String"
  [[ -n "${SENDGRID_API_KEY:-}" ]]    && put_param "SENDGRID_API_KEY"    "$SENDGRID_API_KEY"
  [[ -n "${SMTP_FROM:-}" ]]           && put_param "SMTP_FROM"           "$SMTP_FROM"     "String"
  [[ -n "${RAZORPAY_KEY_ID:-}" ]]     && put_param "RAZORPAY_KEY_ID"     "$RAZORPAY_KEY_ID"
  [[ -n "${RAZORPAY_KEY_SECRET:-}" ]] && put_param "RAZORPAY_KEY_SECRET" "$RAZORPAY_KEY_SECRET"

  # Save JWT_SECRET to generated file for reference
  echo "JWT_SECRET=${JWT_SECRET}" >> "$GENERATED_ENV_FILE"

  ok "Secrets stored in SSM Parameter Store"
}

# ── Step 8: Application Load Balancer ────────────────────────────────────────
setup_alb() {
  header "Setting Up Application Load Balancer"

  ALB_NAME="${APP_NAME}-alb"

  # Check if ALB exists
  ALB_ARN=$(aws elbv2 describe-load-balancers \
    --names "$ALB_NAME" \
    --query "LoadBalancers[0].LoadBalancerArn" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "")

  if [[ -z "$ALB_ARN" || "$ALB_ARN" == "None" ]]; then
    log "Creating Application Load Balancer..."
    ALB_ARN=$(aws elbv2 create-load-balancer \
      --name "$ALB_NAME" \
      --subnets "$SUBNET_PUB_1" "$SUBNET_PUB_2" \
      --security-groups "$ALB_SG" \
      --scheme internet-facing \
      --type application \
      --ip-address-type ipv4 \
      --tags "Key=Name,Value=${ALB_NAME}" "Key=Environment,Value=${ENVIRONMENT}" \
      --query "LoadBalancers[0].LoadBalancerArn" \
      --output text --region "$AWS_REGION")
    ok "Created ALB: $ALB_ARN"
  else
    info "Using existing ALB: $ALB_ARN"
  fi

  ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns "$ALB_ARN" \
    --query "LoadBalancers[0].DNSName" \
    --output text --region "$AWS_REGION")

  # Create target group
  TG_NAME="${APP_NAME}-tg"
  TG_ARN=$(aws elbv2 describe-target-groups \
    --names "$TG_NAME" \
    --query "TargetGroups[0].TargetGroupArn" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "")

  if [[ -z "$TG_ARN" || "$TG_ARN" == "None" ]]; then
    TG_ARN=$(aws elbv2 create-target-group \
      --name "$TG_NAME" \
      --protocol HTTP \
      --port "$APP_PORT" \
      --vpc-id "$VPC_ID" \
      --target-type ip \
      --health-check-protocol HTTP \
      --health-check-path "/api/health" \
      --health-check-interval-seconds 30 \
      --health-check-timeout-seconds 10 \
      --healthy-threshold-count 2 \
      --unhealthy-threshold-count 3 \
      --tags "Key=Name,Value=${TG_NAME}" \
      --query "TargetGroups[0].TargetGroupArn" \
      --output text --region "$AWS_REGION")
    ok "Created Target Group: $TG_ARN"
  else
    info "Using existing Target Group: $TG_ARN"
  fi

  # Create HTTP listener (with redirect to HTTPS if you have SSL)
  LISTENER_ARN=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --query "Listeners[?Port==\`80\`].ListenerArn" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "")

  if [[ -z "$LISTENER_ARN" || "$LISTENER_ARN" == "None" ]]; then
    aws elbv2 create-listener \
      --load-balancer-arn "$ALB_ARN" \
      --protocol HTTP \
      --port 80 \
      --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
      --region "$AWS_REGION" >/dev/null
    ok "Created HTTP listener on port 80"
  fi

  ok "ALB configured"
  info "ALB DNS: http://${ALB_DNS}"
  export ALB_ARN TG_ARN ALB_DNS
}

# ── Step 9: ECS Cluster, Task Definition, and Service ────────────────────────
setup_ecs() {
  header "Setting Up ECS Fargate Cluster & Service"

  # Create ECS cluster
  local cluster_status
  cluster_status=$(aws ecs describe-clusters \
    --clusters "$ECS_CLUSTER" \
    --query "clusters[0].status" --output text --region "$AWS_REGION" 2>/dev/null || echo "MISSING")

  if [[ "$cluster_status" != "ACTIVE" ]]; then
    log "Creating ECS cluster..."
    aws ecs create-cluster \
      --cluster-name "$ECS_CLUSTER" \
      --capacity-providers FARGATE FARGATE_SPOT \
      --default-capacity-provider-strategy \
        "capacityProvider=FARGATE,weight=1,base=1" \
        "capacityProvider=FARGATE_SPOT,weight=3" \
      --settings name=containerInsights,value=enabled \
      --tags "key=Environment,value=${ENVIRONMENT}" "key=App,value=${APP_NAME}" \
      --region "$AWS_REGION" >/dev/null
    ok "Created ECS cluster: $ECS_CLUSTER"
  else
    info "Using existing ECS cluster: $ECS_CLUSTER"
  fi

  # Build SSM secrets list for task definition
  local ssm_base="arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/${APP_NAME}/${ENVIRONMENT}"
  local secrets_json
  secrets_json=$(cat <<EOF
[
  {"name":"DATABASE_URL",    "valueFrom":"${ssm_base}/DATABASE_URL"},
  {"name":"JWT_SECRET",      "valueFrom":"${ssm_base}/JWT_SECRET"},
  {"name":"NODE_ENV",        "valueFrom":"${ssm_base}/NODE_ENV"},
  {"name":"PORT",            "valueFrom":"${ssm_base}/PORT"},
  {"name":"SENDGRID_API_KEY","valueFrom":"${ssm_base}/SENDGRID_API_KEY"},
  {"name":"SMTP_FROM",       "valueFrom":"${ssm_base}/SMTP_FROM"},
  {"name":"RAZORPAY_KEY_ID", "valueFrom":"${ssm_base}/RAZORPAY_KEY_ID"},
  {"name":"RAZORPAY_KEY_SECRET","valueFrom":"${ssm_base}/RAZORPAY_KEY_SECRET"}
]
EOF
  )

  # Create task definition
  local TASK_DEF_JSON
  TASK_DEF_JSON=$(cat <<EOF
{
  "family": "${ECS_TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${TASK_CPU}",
  "memory": "${TASK_MEMORY}",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${APP_NAME}",
      "image": "${ECR_URI}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": ${APP_PORT},
          "hostPort": ${APP_PORT},
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT",     "value": "${APP_PORT}"}
      ],
      "secrets": ${secrets_json},
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group":         "/ecs/${APP_NAME}",
          "awslogs-region":        "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:${APP_PORT}/api/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 60
      },
      "stopTimeout": 30,
      "linuxParameters": {
        "initProcessEnabled": true
      }
    }
  ]
}
EOF
  )

  log "Registering ECS task definition..."
  TASK_DEF_ARN=$(echo "$TASK_DEF_JSON" | aws ecs register-task-definition \
    --cli-input-json file:///dev/stdin \
    --region "$AWS_REGION" \
    --query "taskDefinition.taskDefinitionArn" \
    --output text)
  ok "Task definition registered: $TASK_DEF_ARN"

  # Create or update ECS service
  local service_status
  service_status=$(aws ecs describe-services \
    --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --query "services[0].status" --output text --region "$AWS_REGION" 2>/dev/null || echo "MISSING")

  if [[ "$service_status" == "ACTIVE" ]]; then
    log "Updating existing ECS service..."
    aws ecs update-service \
      --cluster "$ECS_CLUSTER" \
      --service "$ECS_SERVICE" \
      --task-definition "$TASK_DEF_ARN" \
      --desired-count "$DESIRED_COUNT" \
      --deployment-configuration "minimumHealthyPercent=50,maximumPercent=200" \
      --force-new-deployment \
      --region "$AWS_REGION" >/dev/null
    ok "ECS service updated with new task definition"
  else
    log "Creating ECS service..."
    aws ecs create-service \
      --cluster "$ECS_CLUSTER" \
      --service-name "$ECS_SERVICE" \
      --task-definition "$TASK_DEF_ARN" \
      --desired-count "$DESIRED_COUNT" \
      --launch-type FARGATE \
      --platform-version LATEST \
      --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_PUB_1},${SUBNET_PUB_2}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
      --load-balancers "targetGroupArn=${TG_ARN},containerName=${APP_NAME},containerPort=${APP_PORT}" \
      --deployment-configuration "minimumHealthyPercent=50,maximumPercent=200" \
      --deployment-controller type=ECS \
      --health-check-grace-period-seconds 120 \
      --enable-execute-command \
      --tags "key=Environment,value=${ENVIRONMENT}" "key=App,value=${APP_NAME}" \
      --region "$AWS_REGION" >/dev/null
    ok "ECS service created: $ECS_SERVICE"
  fi

  # Setup Auto Scaling
  log "Configuring Auto Scaling..."
  local resource_id="service/${ECS_CLUSTER}/${ECS_SERVICE}"

  aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id "$resource_id" \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 1 \
    --max-capacity 10 \
    --region "$AWS_REGION" 2>/dev/null || true

  aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id "$resource_id" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name "${APP_NAME}-cpu-scaling" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
      "PredefinedMetricSpecification": {
        "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
      },
      "TargetValue": 70.0,
      "ScaleInCooldown": 300,
      "ScaleOutCooldown": 60
    }' \
    --region "$AWS_REGION" 2>/dev/null || true

  ok "Auto Scaling configured (1-10 tasks, CPU target 70%)"
}

# ── Step 10: Run DB Migrations ────────────────────────────────────────────────
run_migrations() {
  header "Running Database Migrations"

  # Load DATABASE_URL from generated file or env
  [[ -f "$GENERATED_ENV_FILE" ]] && source "$GENERATED_ENV_FILE" 2>/dev/null || true

  if [[ -z "${DATABASE_URL:-}" ]]; then
    # Try to fetch from SSM
    DATABASE_URL=$(aws ssm get-parameter \
      --name "/${APP_NAME}/${ENVIRONMENT}/DATABASE_URL" \
      --with-decryption \
      --query "Parameter.Value" \
      --output text --region "$AWS_REGION" 2>/dev/null || echo "")
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    warn "DATABASE_URL not available — skipping direct migration"
    info "To run migrations manually:"
    info "  export DATABASE_URL=\$(aws ssm get-parameter --name /${APP_NAME}/${ENVIRONMENT}/DATABASE_URL --with-decryption --query Parameter.Value --output text)"
    info "  psql \$DATABASE_URL -f migrations/001_initial_schema.sql"
    return
  fi

  if ! command -v psql >/dev/null 2>&1; then
    warn "psql not installed — skipping direct migration"
    info "Install: brew install postgresql  OR  apt-get install postgresql-client"
    info "Then run: psql \$DATABASE_URL -f migrations/001_initial_schema.sql"
    return
  fi

  log "Running migrations against PostgreSQL..."
  PGPASSWORD="" psql "$DATABASE_URL" -f migrations/001_initial_schema.sql && \
    ok "Migrations completed successfully!" || \
    warn "Migration failed — check DATABASE_URL and PostgreSQL connectivity"
}

# ── Step 11: Wait for Service Stability ──────────────────────────────────────
wait_for_deployment() {
  header "Waiting for ECS Service to Stabilize"

  log "Waiting for service to be stable (up to 10 minutes)..."
  aws ecs wait services-stable \
    --cluster "$ECS_CLUSTER" \
    --services "$ECS_SERVICE" \
    --region "$AWS_REGION" \
    2>/dev/null && ok "Service is stable!" || warn "Service may not be fully stable yet. Check CloudWatch logs."
}

# ── Step 12: Print Summary ────────────────────────────────────────────────────
print_summary() {
  header "🚀 Deployment Complete!"

  echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║           BidKarts AWS Deployment Summary                ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BOLD}Environment:${NC}    ${ENVIRONMENT}"
  echo -e "  ${BOLD}AWS Region:${NC}     ${AWS_REGION}"
  echo -e "  ${BOLD}App URL:${NC}        ${CYAN}http://${ALB_DNS:-<ALB_DNS>}${NC}"
  echo -e "  ${BOLD}Health Check:${NC}   ${CYAN}http://${ALB_DNS:-<ALB_DNS>}/api/health${NC}"
  echo -e "  ${BOLD}DB Setup:${NC}       ${CYAN}http://${ALB_DNS:-<ALB_DNS>}/api/setup${NC} (run once!)"
  echo ""
  echo -e "  ${BOLD}ECS Cluster:${NC}    $ECS_CLUSTER"
  echo -e "  ${BOLD}ECS Service:${NC}    $ECS_SERVICE"
  echo -e "  ${BOLD}Docker Image:${NC}   ${ECR_URI:-<ECR_URI>}:${IMAGE_TAG:-latest}"
  echo -e "  ${BOLD}RDS Instance:${NC}   $RDS_INSTANCE (${RDS_ENDPOINT:-N/A})"
  echo ""
  echo -e "  ${YELLOW}${BOLD}📋 Next Steps:${NC}"
  echo -e "  1. ${YELLOW}Seed the database:${NC}"
  echo -e "     curl http://${ALB_DNS:-<alb-dns>}/api/setup"
  echo ""
  echo -e "  2. ${YELLOW}View application logs:${NC}"
  echo -e "     aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}"
  echo ""
  echo -e "  3. ${YELLOW}Update secrets (SendGrid/Razorpay):${NC}"
  echo -e "     aws ssm put-parameter --name '/${APP_NAME}/${ENVIRONMENT}/SENDGRID_API_KEY' \\"
  echo -e "       --value 'SG.xxx' --type SecureString --overwrite"
  echo ""
  echo -e "  4. ${YELLOW}Re-deploy after code changes:${NC}"
  echo -e "     npm run redeploy:aws"
  echo ""
  echo -e "  5. ${YELLOW}Add custom domain (optional):${NC}"
  echo -e "     Use AWS Route 53 + ACM certificate for HTTPS"
  echo ""
  echo -e "  ${YELLOW}${BOLD}💰 Estimated Monthly Cost (ap-south-1):${NC}"
  echo -e "     • ECS Fargate (2 tasks): ~₹1,200/mo"
  echo -e "     • RDS PostgreSQL t3.micro: ~₹1,500/mo"
  echo -e "     • ALB: ~₹600/mo"
  echo -e "     • ECR, CloudWatch, data: ~₹300/mo"
  echo -e "     ${BOLD}Total: ~₹3,600/mo${NC}"
  echo ""
  if [[ -f "$GENERATED_ENV_FILE" ]]; then
    echo -e "  ${RED}${BOLD}⚠️  IMPORTANT: ${GENERATED_ENV_FILE} contains DB password — keep it safe!${NC}"
    echo ""
  fi
  echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
}

# ── Main Execution ─────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}${BLUE}🚀 BidKarts AWS ECS Fargate Deployment v2${NC}"
  echo -e "${BLUE}   Environment: ${YELLOW}${ENVIRONMENT}${NC} | Region: ${YELLOW}${AWS_REGION}${NC}"
  echo ""

  # Load existing state
  load_state

  check_prerequisites

  if [[ "$MIGRATE_ONLY" == "true" ]]; then
    run_migrations
    exit 0
  fi

  if [[ "$IMAGE_ONLY" == "true" ]]; then
    build_and_push
    save_state
    exit 0
  fi

  # Full deployment
  setup_networking
  save_state

  setup_security_groups
  save_state

  if [[ "$SKIP_RDS" != "true" ]]; then
    setup_rds
    save_state
  fi

  build_and_push
  save_state

  setup_iam
  setup_cloudwatch
  store_secrets
  setup_alb
  save_state

  setup_ecs
  save_state

  run_migrations

  wait_for_deployment

  print_summary
}

main "$@"
