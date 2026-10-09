#!/usr/bin/env bash
# M0: list Bedrock models and inference profiles visible in ap-south-1, then make one Converse call
# with each chosen id. Pass the ids you plan to deploy with:
#   ./scripts/check_bedrock.sh global.anthropic.claude-haiku-4-5-20251001-v1:0 apac.amazon.nova-lite-v1:0
set -euo pipefail
REGION="${BEDROCK_REGION:-ap-south-1}"
echo "== Inference profiles in $REGION (Anthropic / Nova) =="
aws bedrock list-inference-profiles --region "$REGION" \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId,'anthropic') || contains(inferenceProfileId,'nova')].[inferenceProfileId,status]" --output text || true
echo "== Foundation models in $REGION with tool use (Anthropic / Nova) =="
aws bedrock list-foundation-models --region "$REGION" \
  --query "modelSummaries[?providerName=='Anthropic' || providerName=='Amazon'].[modelId,join(',',inputModalities)]" --output text || true
for id in "$@"; do
  echo "== Converse test: $id =="
  aws bedrock-runtime converse --region "$REGION" --model-id "$id" \
    --messages '[{"role":"user","content":[{"text":"Reply with the single word: ready"}]}]' \
    --inference-config '{"maxTokens":10,"temperature":0}' \
    --query "output.message.content[0].text" --output text
done
echo "If an Anthropic model fails with AccessDenied, submit the one-time use-case form in the Bedrock console."
