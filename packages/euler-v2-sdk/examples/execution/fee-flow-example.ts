/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FEE FLOW EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates the currently supported read-only FeeFlow flow:
 * 1. Fetching verified FeeFlow-eligible vaults
 * 2. Selecting the highest-value FeeFlow candidates
 * 3. Reporting why buy execution is disabled
 *
 * USAGE:
 *   1. Set FORK_RPC_URL in examples/.env
 *   2. Start Anvil: npm run anvil
 *   3. Run: npx tsx execution/fee-flow-example.ts
 *   Optionally set PRIVATE_KEY in examples/.env to use an existing account.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import {
  buildEulerSDK,
  StandardEVaultPerspectives,
  type EVault,
  } from "@eulerxyz/euler-v2-sdk";
  import {
  formatUnits,
  getAddress,
  type Address,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { initExample } from "../utils/config.js";
import { printHeader } from "../utils/helpers.js";

type FeeFlowCandidate = {
  vault: EVault;
  protocolFeesAssets: bigint;
  feeFlowAssets: bigint;
  claimableAssets: bigint;
  claimableValueUsd: number;
};

function tokenAmountToUsdValue(
  amount: bigint,
  decimals: number,
  priceUsd: number | undefined,
): number {
  if (priceUsd === undefined) return 0;
  return Number(formatUnits(amount, decimals)) * priceUsd;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function feeFlowExample() {
  const chainId = mainnet.id;
  const sdk = await buildEulerSDK({
    eVaultServiceConfig: { adapter: "onchain" },
    eulerEarnServiceConfig: { adapter: "onchain" },
  });

  const feeFlowState = await sdk.feeFlowService.fetchState(chainId);
  const tokenList = await sdk.tokenlistService.loadTokenlist(chainId);
  const paymentTokenMeta = tokenList.find(
    (token) => token.address.toLowerCase() === feeFlowState.paymentToken.toLowerCase()
  );
  if (!paymentTokenMeta) {
    throw new Error(`Payment token ${feeFlowState.paymentToken} not found in token list`);
  }
  const paymentTokenSymbol = paymentTokenMeta.symbol;
  const paymentTokenDecimals = paymentTokenMeta.decimals;

  console.log(`FeeFlow controller:     ${feeFlowState.feeFlowControllerAddress}`);
  console.log(`FeeFlow util:           ${feeFlowState.feeFlowControllerUtilAddress ?? "n/a"}`);
  console.log(`Payment token:          ${paymentTokenSymbol} (${feeFlowState.paymentToken})`);
  console.log(`Current price:          ${formatUnits(feeFlowState.currentPrice, paymentTokenDecimals)} ${paymentTokenSymbol}`);
  console.log(`Time remaining:         ${formatDuration(feeFlowState.timeRemaining)}`);

  printHeader("Fetching vault universe");

  const verifiedAddresses = await sdk.eVaultService.fetchVerifiedVaultAddresses(chainId, [
    StandardEVaultPerspectives.GOVERNED,
    StandardEVaultPerspectives.ESCROW,
  ]);

  const { result: allVaultResults, errors } = await sdk.eVaultService.fetchVaults(
    chainId,
    verifiedAddresses,
    { populateAll: true }
  );
  if (errors.length > 0) {
    console.log(`Vault diagnostics:      ${errors.length}`);
  }

  const allEVaults = allVaultResults.filter(Boolean) as EVault[];

  const eligibleVaults = sdk.feeFlowService.getEligibleVaults(allEVaults, chainId);

  const candidates = await buildFeeFlowCandidates(sdk, chainId, feeFlowState.feeFlowControllerAddress, eligibleVaults);
  const selected = candidates.slice(0, 3);

  if (selected.length === 0) {
    console.log("No FeeFlow candidates with claimable value were found.");
    console.log("FeeFlow example completed without executing a buy.");
    return;
  }

  console.log(`Verified EVaults:       ${allEVaults.length}`);
  console.log(`FeeFlow-eligible:       ${eligibleVaults.length}`);
  console.log(`Selected vaults:        ${selected.length}`);
  console.log();
  selected.forEach((candidate, index) => {
    console.log(
      `${String(index + 1).padStart(2, " ")}. ${candidate.vault.asset.symbol.padEnd(8)} ` +
      `${candidate.vault.address} ` +
      `claimable=${formatUnits(candidate.claimableAssets, candidate.vault.asset.decimals)} ` +
      `value=${formatUsd(candidate.claimableValueUsd)}`
    );
  });

  console.log();
  console.log("FeeFlow buy execution is disabled until the deployed path enforces a minimum selected-vault payout atomically.");
}

async function buildFeeFlowCandidates(
  sdk: Awaited<ReturnType<typeof buildEulerSDK>>,
  chainId: number,
  feeFlowAddress: Address,
  vaults: EVault[]
): Promise<FeeFlowCandidate[]> {
  const subAccount = (
    await sdk.accountService.fetchSubAccount(
      chainId,
      feeFlowAddress,
      vaults.map((vault) => vault.address),
      { populateVaults: false }
    )
  ).result;

  const feeFlowAssetsByVault = new Map<string, bigint>();
  for (const position of subAccount?.positions ?? []) {
    const key = getAddress(position.vaultAddress).toLowerCase();
    feeFlowAssetsByVault.set(key, (feeFlowAssetsByVault.get(key) ?? 0n) + position.assets);
  }

  const candidates = vaults
    .map<FeeFlowCandidate>((vault) => {
      const protocolFeeBps = BigInt(Math.round(vault.fees.protocolFeeShare * 10_000));
      const protocolFeesAssets = (vault.fees.accumulatedFeesAssets * protocolFeeBps) / 10_000n;
      const feeFlowAssets = feeFlowAssetsByVault.get(vault.address.toLowerCase()) ?? 0n;
      const claimableAssets = protocolFeesAssets + feeFlowAssets;
      const claimableValueUsd = tokenAmountToUsdValue(
        claimableAssets,
        vault.asset.decimals,
        vault.marketPriceUsd,
      );

      return {
        vault,
        protocolFeesAssets,
        feeFlowAssets,
        claimableAssets,
        claimableValueUsd,
      };
    })
    .filter((candidate) => candidate.claimableAssets > 0n)
    .sort((a, b) =>
      a.claimableValueUsd === b.claimableValueUsd
        ? a.claimableAssets === b.claimableAssets
          ? 0
          : a.claimableAssets > b.claimableAssets
            ? -1
            : 1
        : a.claimableValueUsd > b.claimableValueUsd
          ? -1
          : 1
    );

  return candidates;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

printHeader("FEE FLOW EXAMPLE");
initExample()
  .then(feeFlowExample)
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
