/**
 * FETCH TOP VERIFIED VAULTS EXAMPLE
 *
 * Fetches verified vault addresses on mainnet, resolves vaults via `fetchVaults`
 * with full population, filters out deprecated vaults (labels), and prints:
 * - Top 3 EVaults by total supply in USD
 * - Top 3 Euler Earn vaults by liquidity (total assets in USD)
 *
 * USAGE:
 *   Set RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx vaults/fetch-top-verified-vaults-example.ts
 */

import "dotenv/config";
import { formatUnits } from "viem";
import { mainnet } from "viem/chains";

import { getRpcUrls } from "../utils/config.js";
import {
  buildEulerSDK,
  StandardEVaultPerspectives,
  StandardEulerEarnPerspectives,
  isEVault,
  isEulerEarn,
  type EVault,
  type EulerEarn,
} from "@eulerxyz/euler-v2-sdk";

async function fetchTopVerifiedVaultsExample() {
  const rpcUrls = getRpcUrls();
  const sdk = await buildEulerSDK({ rpcUrls });

  console.log("Fetching verified vault addresses from mainnet via vaultMetaService...");
  const verifiedAddresses = await sdk.vaultMetaService.fetchVerifiedVaultAddresses(mainnet.id, [
    StandardEVaultPerspectives.GOVERNED,
    StandardEVaultPerspectives.ESCROW,
    StandardEulerEarnPerspectives.GOVERNED,
  ]);
  console.log(`Found ${verifiedAddresses.length} verified vault addresses.`);

  console.log("Fetching vaults via vaultMetaService.fetchVaults with populateAll...");
  const { result: vaultResult, errors } = await sdk.vaultMetaService.fetchVaults(
    mainnet.id,
    verifiedAddresses,
    { populateAll: true },
  );
  if (errors.length > 0) {
    console.log(`Vault diagnostics: ${errors.length} issues`);
  }

  const resolvedVaults = vaultResult.filter((vault): vault is NonNullable<typeof vault> => vault !== undefined);
  const eVaults = resolvedVaults
    .filter(isEVault)
    .filter((vault) => !vault.eulerLabel?.deprecated);
  const eulerEarns = resolvedVaults
    .filter(isEulerEarn)
    .filter((vault) => !vault.eulerLabel?.deprecated);

  const topEVaults = toTopByUsd(eVaults);
  const topEulerEarns = toTopByUsd(eulerEarns);

  printEVaultTable(topEVaults);
  printEulerEarnTable(topEulerEarns);
}

fetchTopVerifiedVaultsExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});



type WithUsd<T> = { vault: T; usd: bigint };
type RewardAction = "LEND" | "BORROW";

function calcVaultUsd(totalAssets: bigint, decimals: number, marketPriceUsd: bigint | undefined): bigint {
  if (marketPriceUsd === undefined) return 0n;
  return (totalAssets * marketPriceUsd) / (10n ** BigInt(decimals));
}

function formatAssetAmount(amount: bigint, decimals: number): string {
  const value = Number(formatUnits(amount, decimals));
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsdWad(usdWad: bigint): string {
  const value = Number(formatUnits(usdWad, 18));
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getRewardsAprByAction(vault: EVault | EulerEarn, action: RewardAction): number {
  if (!vault.rewards?.campaigns) return 0;
  let total = 0;
  for (const campaign of vault.rewards.campaigns) {
    if (campaign.action === action) {
      total += campaign.apr;
    }
  }
  return total;
}

function getIntrinsicApyDecimal(vault: EVault | EulerEarn): number {
  return vault.intrinsicApy ? vault.intrinsicApy.apy / 100 : 0;
}

function getEVaultSupplyApyTotal(vault: EVault): number {
  const base = Number(vault.interestRates.supplyAPY);
  const rewards = getRewardsAprByAction(vault, "LEND");
  const intrinsic = getIntrinsicApyDecimal(vault);
  return base + rewards + intrinsic;
}

function getEVaultBorrowApyTotal(vault: EVault): number {
  const base = Number(vault.interestRates.borrowAPY);
  const rewards = getRewardsAprByAction(vault, "BORROW");
  return base + rewards;
}

function getEulerEarnSupplyApyTotal(vault: EulerEarn): number | undefined {
  if (vault.supplyApy === undefined) return undefined;
  const rewards = getRewardsAprByAction(vault, "LEND");
  const intrinsic = getIntrinsicApyDecimal(vault);
  return vault.supplyApy + rewards + intrinsic;
}

function toTopByUsd<T extends EVault | EulerEarn>(vaults: T[]): WithUsd<T>[] {
  return vaults
    .map((vault) => ({
      vault,
      usd: calcVaultUsd(vault.totalAssets, vault.asset.decimals, vault.marketPriceUsd),
    }))
    .sort((a, b) => (a.usd === b.usd ? 0 : a.usd > b.usd ? -1 : 1))
    .slice(0, 3);
}

function printEVaultTable(rows: WithUsd<EVault>[]) {
  console.log("\nTop 3 EVaults by Total Supply (USD):\n");
  console.log(
    "Name".padEnd(48),
    "Address".padEnd(44),
    "Total Supply".padEnd(20),
    "Total Supply (USD)".padEnd(20),
    "Supply APY".padEnd(12),
    "Borrow APY",
  );
  console.log("-".repeat(170));

  for (const { vault, usd } of rows) {
    console.log(
      vault.shares.name.slice(0, 47).padEnd(48),
      vault.address.padEnd(44),
      `${formatAssetAmount(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`.padEnd(20),
      formatUsdWad(usd).padEnd(20),
      formatPercent(getEVaultSupplyApyTotal(vault)).padEnd(12),
      formatPercent(getEVaultBorrowApyTotal(vault)),
    );
  }
}

function printEulerEarnTable(rows: WithUsd<EulerEarn>[]) {
  console.log("\nTop 3 Euler Earn Vaults by Liquidity (USD):\n");
  console.log(
    "Name".padEnd(48),
    "Address".padEnd(44),
    "Liquidity".padEnd(20),
    "Liquidity (USD)".padEnd(20),
    "Supply APY".padEnd(12),
    "Borrow APY",
  );
  console.log("-".repeat(170));

  for (const { vault, usd } of rows) {
    const supplyApy = getEulerEarnSupplyApyTotal(vault);
    console.log(
      vault.shares.name.slice(0, 47).padEnd(48),
      vault.address.padEnd(44),
      `${formatAssetAmount(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`.padEnd(20),
      formatUsdWad(usd).padEnd(20),
      (supplyApy !== undefined ? formatPercent(supplyApy) : "N/A").padEnd(12),
      "N/A",
    );
  }
}
