#!/usr/bin/env bash
# =============================================================================
# BidKarts - Quick Redeploy Script (for code updates)
# Usage: ./scripts/redeploy.sh [--env production] [--region ap-south-1]
# Run this after making code changes to push updated Docker image to ECS.
# =============================================================================

set -euo pipefail

APP_NAME="${APP_NAME:-bidkarts}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
ECR_REPO="${ECR_REPO:-${APP_NAME}}"
ECS_CLUSTER="${ECS_CLUSTER:-${APP_NAME}-cluster}"
ECS_SERVICE="${ECS_SERVICE:-${APP_NAME}-service}"
ECS_TASK_FAMILY="${ECS_TASK_FAMILY:-${APP_NAME}-task}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail() { echo -e "${RED}❌ $*${NC}"; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --env|-e)    ENVIRONMENT="$2"; shift 2 ;;
    --region|-r) AWS_REGION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo ""
echo -e "${BLUE}🔄 BidKarts Quick Redeploy${NC}"
echo -e "   Environment: ${YELLOW}${ENVIRONMENT}${NC} | Region: ${YELLOW}${AWS_REGION}${NC}"
echo ""

# Auto-detect AWS account
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  || fail "AWS credentials not configured. Run: aws configure"

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

# Login to ECR
log "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Build new image
IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
log "Building new Docker image: ${ECR_URI}:${IMAGE_TAG}..."
docker build \
  --platform linux/amd64 \
  --build-arg NODE_ENV=production \
  -t "${ECR_URI}:${IMAGE_TAG}" \
  -t "${ECR_URI}:latest" \
  -t "${ECR_URI}:${ENVIRONMENT}" \
  .

# Push image
log "Pushing to ECR..."
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"
docker push "${ECR_URI}:${ENVIRONMENT}"
ok "Image pushed: ${ECR_URI}:${IMAGE_TAG}"

# Get current task definition
log "Fetching current task definition..."
CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query "services[0].taskDefinition" \
  --output text --region "$AWS_REGION" 2>/dev/null || echo "")

if [[ -z "$CURRENT_TASK_DEF" || "$CURRENT_TASK_DEF" == "None" ]]; then
  fail "ECS service not found: $ECS_SERVICE. Run deploy-aws.sh first."
fi

# Get task definition JSON and update image
TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition "$ECS_TASK_FAMILY" \
  --region "$AWS_REGION" \
  --query 'taskDefinition' \
  --output json)

# Update image in task definition
NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | \
  jq --arg IMAGE "${ECR_URI}:${IMAGE_TAG}" \
  'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy) |
   .containerDefinitions[0].image = $IMAGE')

# Register new task definition revision
log "Registering new task definition..."
NEW_TASK_DEF_ARN=$(echo "$NEW_TASK_DEF" | \
  aws ecs register-task-definition \
  --cli-input-json file:///dev/stdin \
  --region "$AWS_REGION" \
  --query "taskDefinition.taskDefinitionArn" \
  --output text)
ok "New task definition: $NEW_TASK_DEF_ARN"

# Update ECS service with new task definition
log "Updating ECS service with new task definition..."
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment \
  --deployment-configuration "minimumHealthyPercent=50,maximumPercent=200" \
  --region "$AWS_REGION" >/dev/null
ok "ECS service update triggered"

# Wait for stable deployment
log "⏳ Waiting for deployment to stabilize (up to 5 minutes)..."
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" 2>/dev/null && ok "Deployment stable!" || \
  warn "Service may still be deploying. Check logs:"

echo ""
echo -e "  ${GREEN}✅ Redeploy complete!${NC}"
echo ""
echo "  View logs:"
echo "    aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}"
echo ""
echo "  Check service status:"
echo "    aws ecs describe-services --cluster ${ECS_CLUSTER} --services ${ECS_SERVICE} --region ${AWS_REGION}"
echo ""
