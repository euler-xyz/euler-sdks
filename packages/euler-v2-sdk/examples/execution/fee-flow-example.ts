/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FEE FLOW EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates how to buy protocol fees from FeeFlow by:
 * 1. Funding the buyer with the FeeFlow payment token
 * 2. Fetching verified FeeFlow-eligible vaults
 * 3. Selecting the highest-value FeeFlow candidates
 * 4. Executing a FeeFlow buy through the configured FeeFlow util
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
  getBalanceOverrides,
  StandardEVaultPerspectives,
  type EVault,
  } from "@eulerxyz/euler-v2-sdk";
  import {
  erc20Abi,
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
  } from "viem";
  import { mainnet } from "viem/chains";
  import { account, initExample, rpcUrls,
  exampleExecutionCallbacks,
} from "../utils/config.js";
import { printHeader } from "../utils/helpers.js";
import { createTransactionPlanLogger, walletAccountAddress } from "../utils/transactionPlanLogging.js";

type FeeFlowCandidate = {
  vault: EVault;
  protocolFeesAssets: bigint;
  feeFlowAssets: bigint;
  claimableAssets: bigint;
  claimableValueUsd: bigint;
};


async function feeFlowExample({
  walletClient,
  publicClient,
  testClient,
}: Awaited<ReturnType<typeof initExample>>) {
  const chainId = mainnet.id;
  const sdk = await buildEulerSDK({
    rpcUrls,
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

  const minimumFundingAmount = parseUnits("100000", paymentTokenDecimals);
  const buyerFundingAmount =
    feeFlowState.currentPrice > minimumFundingAmount
      ? feeFlowState.currentPrice
      : minimumFundingAmount;
  await fundBuyerWithPaymentToken({
    publicClient,
    testClient,
    token: feeFlowState.paymentToken,
    symbol: paymentTokenSymbol,
    decimals: paymentTokenDecimals,
    amount: buyerFundingAmount,
    recipient: account.address,
  });

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
      `value=$${formatUnits(candidate.claimableValueUsd, 18)}`
    );
  });

  printHeader("Executing FeeFlow buy");

  const selectedVaultAddresses = selected.map((candidate) => candidate.vault.address);
  const buyerPaymentTokenBalanceBefore = await publicClient.readContract({
    address: feeFlowState.paymentToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const beforeBalances = await fetchVaultTokenBalances(
    publicClient,
    selectedVaultAddresses,
    account.address,
  );

  let plan = await sdk.feeFlowService.buildBuyPlan({
    chainId,
    account: account.address,
    recipient: account.address,
    vaults: selectedVaultAddresses,
  });

  console.log(`Plan items:             ${plan.length}`);
  await sdk.executionService.executeTransactionPlan({
    plan,
    chainId,
    account: walletAccountAddress(walletClient),
    ...exampleExecutionCallbacks(walletClient),
    onProgress: createTransactionPlanLogger(sdk),
  });

  printHeader("Verifying received vault tokens");

  const feeFlowStateAfter = await sdk.feeFlowService.fetchState(chainId);
  const buyerPaymentTokenBalanceAfter = await publicClient.readContract({
    address: feeFlowState.paymentToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const afterBalances = await fetchVaultTokenBalances(
    publicClient,
    selectedVaultAddresses,
    account.address,
  );
  let positiveReceipts = 0;

  selected.forEach((candidate) => {
    const before = beforeBalances.get(candidate.vault.address) ?? 0n;
    const after = afterBalances.get(candidate.vault.address) ?? 0n;
    const delta = after - before;
    const received = delta > 0n;
    if (received) positiveReceipts += 1;

    console.log(
      `${received ? "✓" : "✗"} ${candidate.vault.asset.symbol.padEnd(8)} ` +
      `${formatUnits(delta >= 0n ? delta : 0n, candidate.vault.shares.decimals)} ${candidate.vault.shares.symbol}`
    );
  });

  const paymentSpent = buyerPaymentTokenBalanceBefore - buyerPaymentTokenBalanceAfter;
  const epochAdvanced = feeFlowStateAfter.slot0.epochId !== feeFlowState.slot0.epochId;

  console.log();
  console.log(
    `Payment spent:          ${formatUnits(paymentSpent >= 0n ? paymentSpent : 0n, paymentTokenDecimals)} ${paymentTokenSymbol}`
  );
  console.log(
    `Epoch advanced:         ${feeFlowState.slot0.epochId} -> ${feeFlowStateAfter.slot0.epochId}`
  );

  if (!epochAdvanced && paymentSpent <= 0n && positiveReceipts === 0) {
    throw new Error("FeeFlow buy succeeded but no state change was detected.");
  }

  console.log();
  console.log("FeeFlow example completed successfully.");
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
      const claimableValueUsd =
        vault.marketPriceUsd === undefined
          ? 0n
          : (claimableAssets * vault.marketPriceUsd) / 10n ** BigInt(vault.asset.decimals);

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

async function fetchVaultTokenBalances(
  publicClient: Awaited<ReturnType<typeof initExample>>["publicClient"],
  vaults: Address[],
  owner: Address,
): Promise<Map<Address, bigint>> {
  const balances = await Promise.all(
    vaults.map((vault) =>
      publicClient.readContract({
        address: vault,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      })
    )
  );

  return new Map(vaults.map((vault, index) => [vault, balances[index] ?? 0n]));
}

async function fundBuyerWithPaymentToken(args: {
  publicClient: Awaited<ReturnType<typeof initExample>>["publicClient"];
  testClient: Awaited<ReturnType<typeof initExample>>["testClient"];
  token: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
  recipient: Address;
}) {
  const { publicClient, testClient, token, symbol, decimals, amount, recipient } = args;
  const currentBalance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [recipient],
  });

  if (currentBalance >= amount) {
    console.log(
      `Buyer funded:           ${formatUnits(amount, decimals)} ${symbol} ` +
      `(wallet balance ${formatUnits(currentBalance, decimals)} ${symbol}, already sufficient)`
    );
    return;
  }

  const balanceOverrides = await getBalanceOverrides(
    publicClient as Parameters<typeof getBalanceOverrides>[0],
    recipient,
    [[token, amount]],
  );
  const tokenOverride = balanceOverrides.find(
    (override) => override.address.toLowerCase() === token.toLowerCase()
  );

  if (!tokenOverride?.stateDiff?.length) {
    throw new Error(`Unable to discover balance slot for ${symbol} (${token})`);
  }

  for (const diff of tokenOverride.stateDiff) {
    await testClient.request({
      method: "anvil_setStorageAt",
      params: [tokenOverride.address, diff.slot, diff.value],
    });
  }

  await testClient.mine({ blocks: 1 });

  const recipientBalance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [recipient],
  });

  console.log(
    `Buyer funded:           ${formatUnits(amount, decimals)} ${symbol} ` +
    `(wallet balance ${formatUnits(recipientBalance, decimals)} ${symbol}, ` +
    `slot ${tokenOverride.stateDiff[0]!.slot})`
  );
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
