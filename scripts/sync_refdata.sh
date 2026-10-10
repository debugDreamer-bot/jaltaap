#!/usr/bin/env bash
# Copy reference data into the Lambda package as the offline fallback (S3 data/ is primary).
set -euo pipefail
cd "$(dirname "$0")/.."
cp data/grid.json data/hotspots.json data/relief_points.json data/cities.json backend/refdata/
for f in hotspots_cities relief_cities relief_osm; do [[ -f data/$f.json ]] && cp data/$f.json backend/refdata/; done
echo "backend/refdata updated"
