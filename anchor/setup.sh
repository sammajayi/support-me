#!/bin/bash
# SupportMe local Anchor Platform — TESTNET, DEV ONLY.
#
# Generates + funds testnet keypairs (SEP-10 host, distribution, USDC issuer),
# issues local USDC so the anchor can settle, renders the config templates, and
# starts the stack. Adapted from stellar/anchor-platform quick-run/ap_start.sh.
#
# Requirements: docker (with compose), stellar CLI, node (for issue-usdc.mjs).
# Re-runnable: existing keypairs are reused, not regenerated.
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- tool checks ----------------------------------------------------------
if command -v docker-compose &> /dev/null; then DOCKER_COMPOSE="docker-compose";
elif docker compose version &> /dev/null; then DOCKER_COMPOSE="docker compose";
else echo -e "${RED}Error: docker compose not found.${NC}"; exit 1; fi

if ! command -v stellar &> /dev/null; then
  echo -e "${RED}Error: stellar CLI not found.${NC} Install: https://github.com/stellar/stellar-cli"
  exit 1
fi
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: node not found (needed to issue USDC).${NC}"; exit 1
fi

# Generate+fund a named testnet keypair if it doesn't already exist; echo secret.
ensure_key() {
  local name="$1"
  if ! stellar keys secret "$name" &>/dev/null; then
    echo -e "  ${YELLOW}generating + funding $name...${NC}" >&2
    stellar keys generate "$name" --fund --network testnet >&2 2>&1 \
      || stellar keys generate "$name" --fund >&2 2>&1
  else
    echo -e "  ✓ reusing existing $name" >&2
  fi
}

echo -e "${GREEN}Step 1: keypairs${NC}"
ensure_key ap-sep10-account
ensure_key ap-distribution-account
ensure_key ap-usdc-issuer

HOST_SEP10_SECRET_KEY=$(stellar keys secret ap-sep10-account | head -1)
HOST_SEP10_ACCOUNT=$(stellar keys public-key ap-sep10-account | head -1)
DISTRIBUTION_ACCOUNT_SECRET_KEY=$(stellar keys secret ap-distribution-account | head -1)
DISTRIBUTION_ACCOUNT=$(stellar keys public-key ap-distribution-account | head -1)
USDC_ISSUER_SECRET=$(stellar keys secret ap-usdc-issuer | head -1)
USDC_ISSUER=$(stellar keys public-key ap-usdc-issuer | head -1)

echo "  SEP-10 host:  $HOST_SEP10_ACCOUNT"
echo "  distribution: $DISTRIBUTION_ACCOUNT"
echo "  USDC issuer:  $USDC_ISSUER"

echo -e "${GREEN}Step 2: issue local USDC (trustline + mint to distribution)${NC}"
node issue-usdc.mjs "$USDC_ISSUER_SECRET" "$DISTRIBUTION_ACCOUNT_SECRET_KEY"

echo -e "${GREEN}Step 3: render config from templates${NC}"
sed -e "s|\${DISTRIBUTION_ACCOUNT_SECRET_KEY}|$DISTRIBUTION_ACCOUNT_SECRET_KEY|g" \
    -e "s|\${DISTRIBUTION_ACCOUNT}|$DISTRIBUTION_ACCOUNT|g" \
    config/reference-config.yaml.template > config/reference-config.yaml
sed -e "s|\${DISTRIBUTION_ACCOUNT}|$DISTRIBUTION_ACCOUNT|g" \
    -e "s|\${HOST_SEP10_ACCOUNT}|$HOST_SEP10_ACCOUNT|g" \
    -e "s|\${USDC_ISSUER}|$USDC_ISSUER|g" \
    config/stellar.localhost.toml.template > config/stellar.localhost.toml
sed -e "s|\${DISTRIBUTION_ACCOUNT}|$DISTRIBUTION_ACCOUNT|g" \
    -e "s|\${USDC_ISSUER}|$USDC_ISSUER|g" \
    config/assets.yaml.template > config/assets.yaml
echo "  ✓ reference-config.yaml, stellar.localhost.toml, assets.yaml"

echo -e "${GREEN}Step 4: start stack${NC}"
HOST_SEP10_SECRET_KEY="$HOST_SEP10_SECRET_KEY" $DOCKER_COMPOSE up -d

echo
echo -e "${GREEN}========================================${NC}"
cat <<EOF
Anchor Platform starting (testnet, dev only).
  SEP server:    http://localhost:8080
  Platform API:  http://localhost:8085
  Reference srv: http://localhost:8091
  SEP-24 UI:     http://localhost:3001

USDC issuer for the frontend: $USDC_ISSUER

Verify:  curl http://localhost:8080/.well-known/stellar.toml
Logs:    $DOCKER_COMPOSE logs -f
Stop:    $DOCKER_COMPOSE down
EOF
echo -e "${GREEN}========================================${NC}"
