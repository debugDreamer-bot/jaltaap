#!/usr/bin/env bash
# Upload reference data, replays and backtest outputs to the stack's bucket, and refresh the
# copy bundled in the Lambda package. Usage: ./scripts/seed_s3.sh [stack-name]
set -euo pipefail
cd "$(dirname "$0")/.."
STACK="${1:-jaltaap}"
REGION="${AWS_REGION:-ap-south-1}"
BUCKET=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
echo "Bucket: $BUCKET"
for f in grid hotspots relief_points hotspots_cities relief_cities relief_osm; do
  [[ -f "data/$f.json" ]] || continue
  aws s3 cp "data/$f.json" "s3://$BUCKET/data/$f.json" --region "$REGION" --content-type application/json
done
aws s3 cp backtests/outputs/replays/ "s3://$BUCKET/replays/" --recursive --region "$REGION" --content-type application/json
aws s3 cp backtests/outputs/ "s3://$BUCKET/backtests/" --recursive --region "$REGION" --exclude "replays/*"
./scripts/sync_refdata.sh
echo "Seeded. Re-run 'sam build && sam deploy' if backend/refdata changed."
