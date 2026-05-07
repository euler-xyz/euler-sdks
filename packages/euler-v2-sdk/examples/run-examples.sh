#!/usr/bin/env bash
# Run @eulerxyz/euler-v2-sdk examples.
# - Execution/simulation examples run against a fresh Anvil fork (per example).
# - Account/vault read examples run directly against EULER_SDK_RPC_URL_1.
# Requires: anvil (foundry), pnpm, and examples/.env with FORK_RPC_URL set.
# Usage: from examples/: ./run-examples.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"

if [[ ! -f .env ]]; then
  echo "Missing .env. Create it in examples/ and set FORK_RPC_URL (e.g. FORK_RPC_URL=https://eth.llamarpc.com)."
  exit 1
fi

# shellcheck disable=SC1091
source .env
if [[ -z "${FORK_RPC_URL:-}" ]]; then
  echo "FORK_RPC_URL is not set in examples/.env."
  exit 1
fi
READONLY_EULER_SDK_RPC_URL_1="${EULER_SDK_RPC_URL_1:-$FORK_RPC_URL}"
ANVIL_EULER_SDK_RPC_URL_1="http://${ANVIL_HOST}:${ANVIL_PORT}"
export EULER_SDK_RPC_URL_1="$READONLY_EULER_SDK_RPC_URL_1"

kill_anvil() {
  local pid
  if command -v lsof &>/dev/null; then
    pid=$(lsof -ti :"$ANVIL_PORT" 2>/dev/null) || true
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    pkill -f "anvil.*--port $ANVIL_PORT" 2>/dev/null || true
  fi
}

wait_for_anvil() {
  local max_attempts=30
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    if curl -sS -X POST -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
      "http://${ANVIL_HOST}:${ANVIL_PORT}" &>/dev/null; then
      return 0
    fi
    sleep 0.5
    attempt=$((attempt + 1))
  done
  echo "Anvil did not become ready in time."
  return 1
}

start_anvil() {
  local max_attempts="${ANVIL_START_ATTEMPTS:-3}"
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    kill_anvil
    sleep 1

    env -u ALL_PROXY -u HTTPS_PROXY -u HTTP_PROXY NO_PROXY="*" \
      anvil --fork-url "$FORK_RPC_URL" --auto-impersonate --port "$ANVIL_PORT" &
    ANVIL_PID=$!

    if wait_for_anvil; then
      return 0
    fi

    kill "$ANVIL_PID" 2>/dev/null || true
    echo "Anvil failed to start (attempt ${attempt}/${max_attempts})."
    attempt=$((attempt + 1))
  done
  return 1
}

ANVIL_EXAMPLES=(
  "execution/deposit-example.ts"
  "execution/deposit-usdt-reset-approval-example.ts"
  "execution/mint-example.ts"
  "execution/withdraw-example.ts"
  "execution/redeem-example.ts"
  "execution/borrow-example.ts"
  "execution/borrow-from-savings-example.ts"
  "execution/repay-from-wallet-example.ts"
  "execution/repay-from-deposit-example.ts"
  "execution/repay-from-deposit-different-vault-example.ts"
  "execution/repay-with-swap-example.ts"
  "execution/multiply-example.ts"
  "execution/multiply-from-savings-example.ts"
  "execution/same-asset-position-migration-example.ts"
  "execution/swap-collateral-example.ts"
  "execution/swap-debt-example.ts"
  "execution/transfer-example.ts"
  "execution/pull-debt-example.ts"
  "execution/liquidation-example.ts"
  "execution/merge-plans-example.ts"
  "execution/borrow-with-pyth-example.ts"
  "execution/deposit-with-swap-from-wallet-example.ts"
  "execution/swap-from-wallet-example.ts"
  "execution/fee-flow-example.ts"
  "simulations/simulate-deposit-example.ts"
  "simulations/simulate-deposit-with-swap-from-wallet-example.ts"
)

READONLY_EXAMPLES=(
  "accounts/fetch-account-example.ts"
  "vaults/fetch-apys-example.ts"
  "vaults/fetch-vault-details-example.ts"
  "vaults/fetch-top-verified-vaults-example.ts"
)

FAILED=()
PASSED=()

run_tsx_example() {
  local path="$1"
  node --import tsx "$path"
}

for path in "${ANVIL_EXAMPLES[@]}"; do
  name="$(basename "$path" .ts)"
  echo "=============================================="
  echo "Example: $name (fresh Anvil fork)"
  echo "=============================================="

  if ! start_anvil; then
    FAILED+=("$name (anvil failed to start)")
    continue
  fi

  export EULER_SDK_RPC_URL_1="$ANVIL_EULER_SDK_RPC_URL_1"
  if run_tsx_example "$path"; then
    PASSED+=("$name")
  else
    FAILED+=("$name")
  fi

  kill "$ANVIL_PID" 2>/dev/null || true
  sleep 1
  kill_anvil
done

export EULER_SDK_RPC_URL_1="$READONLY_EULER_SDK_RPC_URL_1"

for path in "${READONLY_EXAMPLES[@]}"; do
  name="$(basename "$path" .ts)"
  echo "=============================================="
  echo "Example: $name (direct RPC)"
  echo "=============================================="

  if run_tsx_example "$path"; then
    PASSED+=("$name")
  else
    FAILED+=("$name")
  fi
done

echo ""
echo "=============================================="
echo "Summary"
echo "=============================================="
echo "Passed: ${#PASSED[@]}"
if [[ ${#PASSED[@]} -gt 0 ]]; then
  printf '  - %s\n' "${PASSED[@]}"
fi
echo "Failed: ${#FAILED[@]}"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  printf '  - %s\n' "${FAILED[@]}"
fi

[[ ${#FAILED[@]} -eq 0 ]]
