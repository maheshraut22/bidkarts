#!/usr/bin/env bash
# =============================================================================
# BidKarts - Quick Redeploy Script
# Use after code changes to rebuild + push + force ECS re-deploy
# Usage: ./scripts/redeploy.sh
# =============================================================================

set -euo pipefail

source "$(dirname "$0")/deploy-aws.sh" 2>/dev/null || true

APP_NAME="${APP_NAME:-bidkarts}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ECS_CLUSTER="${ECS_CLUSTER:-${APP_NAME}-cluster}"
ECS_SERVICE="${ECS_SERVICE:-${APP_NAME}-service}"
ECR_REPO="${ECR_REPO:-${APP_NAME}}"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

# Detect account
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)

echo -e "${BLUE}[BidKarts Redeploy]${NC} Building new image: ${IMAGE_TAG}"

# Build & push
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker build -t "${ECR_URI}:${IMAGE_TAG}" -t "${ECR_URI}:latest" .
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"

echo -e "${BLUE}[BidKarts Redeploy]${NC} Forcing ECS service update..."

# Update task definition with new image
CURRENT_TASK=$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
  --query "services[0].taskDefinition" --output text \
  --region "$AWS_REGION")

TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition "$CURRENT_TASK" \
  --region "$AWS_REGION" | \
  jq --arg img "${ECR_URI}:${IMAGE_TAG}" \
    '.taskDefinition | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy) | .containerDefinitions[0].image = $img')

NEW_TASK_ARN=$(echo "$TASK_DEF_JSON" | \
  aws ecs register-task-definition --cli-input-json file:///dev/stdin \
  --query "taskDefinition.taskDefinitionArn" --output text \
  --region "$AWS_REGION")

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TASK_ARN" \
  --force-new-deployment \
  --region "$AWS_REGION" >/dev/null

echo -e "${GREEN}✅ Redeployment triggered! New image: ${ECR_URI}:${IMAGE_TAG}${NC}"
echo ""
echo "Monitor rollout:"
echo "  aws ecs wait services-stable --cluster ${ECS_CLUSTER} --services ${ECS_SERVICE} --region ${AWS_REGION}"
echo "  aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}"
