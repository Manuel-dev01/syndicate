#!/usr/bin/env bash
# deploy-devnet.sh — bring a Syndicate validator up on Canton Network DevNet, upload the DAR, and
# seed the demo facility. Run this ON the hosted VM whose egress IP a Super Validator has
# allowlisted (see docs/ARCHITECTURE.md → "DevNet deployment runbook" for the prerequisites and
# the sponsor/allowlist lead time).
#
# Everything is read from the environment (.env); no hardcoded hosts or secrets.
#   SPONSOR_SV_URL        e.g. https://sv.sv-1.dev.global.canton.network.sync.global
#   MIGRATION_ID          current DevNet migration id (see https://sync.global/sv-network/)
#   IMAGE_TAG             Splice release image tag to run
#   PARTY_HINT            org-func-enumerator, e.g. syndicate-validator-1
#   LEDGER_JSON_API_URL   the participant's JSON Ledger API v2 base, e.g. http://localhost:7575
#   LEDGER_JWT_SECRET     shared HS256 secret for dev tokens
#   DAR_PATH              path to the LF-2 DAR (daml/.daml/dist/syndicate-0.2.0.dar)
set -euo pipefail

req() { : "${!1:?Missing required env var $1}"; }
for v in SPONSOR_SV_URL MIGRATION_ID PARTY_HINT LEDGER_JSON_API_URL LEDGER_JWT_SECRET DAR_PATH; do req "$v"; done

echo "==> 1/4  Fetch a fresh onboarding secret (valid 1 hour) from the sponsoring SV"
ONBOARDING_SECRET="$(curl -fsS -X POST "$SPONSOR_SV_URL/api/sv/v0/devnet/onboard/validator/prepare")"
[ -n "$ONBOARDING_SECRET" ] || { echo "empty onboarding secret — is the SV sponsoring this IP yet?"; exit 1; }

echo "==> 2/4  Start the validator node (participant + validator app + wallet + Postgres)"
# Splice docker-compose validator bundle; see docs.sync.global/validator_operator/validator_compose.html
( cd "${SPLICE_VALIDATOR_DIR:-splice-node/docker-compose/validator}" \
  && IMAGE_TAG="${IMAGE_TAG:-latest}" ./start.sh \
       -s "$SPONSOR_SV_URL" -o "$ONBOARDING_SECRET" -p "$PARTY_HINT" -m "$MIGRATION_ID" -w )

echo "==> 2b   Wait for the JSON Ledger API to be healthy"
for i in $(seq 1 60); do
  if curl -fsS "$LEDGER_JSON_API_URL/v2/state/ledger-end" >/dev/null 2>&1; then break; fi
  sleep 5
done

echo "==> 3/4  Upload the LF-2 DAR (vetting happens on upload)"
curl -fsS --data-binary "@$DAR_PATH" -H "content-type: application/octet-stream" \
     "$LEDGER_JSON_API_URL/v2/packages" >/dev/null
echo "    uploaded $DAR_PATH"

echo "==> 4/4  Allocate parties + seed the demo facility"
npx tsx scripts/allocate-parties.ts
# DAML_PACKAGE_ID must be exported (main package id of the uploaded DAR):
#   daml damlc inspect-dar --json "$DAR_PATH" | jq -r .main_package_id
npx tsx scripts/init-ledger.ts

echo "==> Verify the privacy partition on the live ledger"
npx tsx scripts/verify-privacy.ts

echo "==> Done. Syndicate is live on Canton DevNet."
