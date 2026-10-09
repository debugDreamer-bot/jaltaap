#!/usr/bin/env bash
# Copy reference data into the Lambda package as the offline fallback (S3 data/ is primary).
set -euo pipefail
cd "$(dirname "$0")/.."
cp data/grid.json data/hotspots.json data/relief_points.json backend/refdata/
echo "backend/refdata updated"
