#!/bin/bash
set -euo pipefail

# Enable Docker Buildx
if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  docker buildx create --use --name multiarch-builder || docker buildx use multiarch-builder
fi

# Build and push the multi-architecture image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t al3kc/plastic-slack-bot:v2 \
  --push .
