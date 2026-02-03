#!/usr/bin/env bash
# Run each euler-v2-sdk example with a fresh Anvil instance: start anvil, run example, stop anvil, repeat.
# Requires: anvil (foundry), pnpm, and examples/.env with FORK_RPC_URL set.
# Usage: from packages/euler-v2-sdk: ./run-examples-with-fresh-anvil.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"

if [[ ! -f examples/.env ]]; then
  echo "Missing examples/.env. Create it and set FORK_RPC_URL (e.g. FORK_RPC_URL=https://eth.llamarpc.com)."
  exit 1
fi

# shellcheck disable=SC1091
source examples/.env
if [[ -z "${FORK_RPC_URL:-}" ]]; then
  echo "FORK_RPC_URL is not set in examples/.env."
  exit 1
fi

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

EXAMPLES=(
  deposit-example
  mint-example
  withdraw-example
  redeem-example
  borrow-example
  repay-from-wallet-example
  repay-from-deposit-example
  repay-with-swap-example
  multiply-example
  swap-collateral-example
  swap-debt-example
  transfer-example
  pull-debt-example
  liquidation-example
)

FAILED=()
PASSED=()

for name in "${EXAMPLES[@]}"; do
  echo "=============================================="
  echo "Example: $name (fresh Anvil)"
  echo "=============================================="

  kill_anvil
  sleep 1

  anvil --fork-url "$FORK_RPC_URL" --auto-impersonate --port "$ANVIL_PORT" &
  ANVIL_PID=$!

  if ! wait_for_anvil; then
    kill "$ANVIL_PID" 2>/dev/null || true
    FAILED+=("$name (anvil failed to start)")
    continue
  fi

  if pnpm run "$name"; then
    PASSED+=("$name")
  else
    FAILED+=("$name")
  fi

  kill "$ANVIL_PID" 2>/dev/null || true
  sleep 1
  kill_anvil
done

echo ""
echo "=============================================="
echo "Summary"
echo "=============================================="
echo "Passed: ${#PASSED[@]}"
printf '  - %s\n' "${PASSED[@]}"
echo "Failed: ${#FAILED[@]}"
printf '  - %s\n' "${FAILED[@]}"

[[ ${#FAILED[@]} -eq 0 ]]
