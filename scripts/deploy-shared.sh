#!/usr/bin/env bash
# deploy-shared.sh — deploy Syndicate onto the hackathon's SHARED Canton DevNet validator
# (Seaport / fivenorth). No node to run: upload the DAR, allocate + grant parties, seed the demo
# facility, and verify the privacy partition — all over the JSON Ledger API v2.
#
# Config comes from .env (LEDGER_JSON_API_URL, LEDGER_OIDC_*, LEDGER_APP_USER, DAML_PACKAGE_ID,
# DAR_PATH). No hardcoded hosts or secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; source .env; set +a; }
TSX="scripts/node_modules/.bin/tsx"

echo "==> 1/4  Upload the LF-2 DAR"
"$TSX" scripts/upload-dar.ts

echo "==> 2/4  Allocate + grant the demo parties"
"$TSX" scripts/allocate-parties.ts

echo "==> 3/4  Seed the demo facility (Facility + LenderPositions + Cash)"
"$TSX" scripts/init-ledger.ts

echo "==> 4/4  Verify the privacy partition on the live ledger"
"$TSX" scripts/verify-privacy.ts

echo "==> Done. Syndicate is live on Canton DevNet."
