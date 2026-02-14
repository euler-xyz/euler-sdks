/**
 * FETCH VAULT DETAILS EXAMPLE
 *
 * Fetches a single EVault with collaterals fully resolved and USD
 * market prices, displaying vault info, prices, and collateral details.
 *
 * USAGE:
 *   Set RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx examples/vaults/fetch-vault-details-example.ts
 */

import "dotenv/config";
import { formatUnits } from "viem";
import { mainnet } from "viem/chains";

import { getRpcUrls } from "../utils/config.js";
import { buildSDK, type EVault } from "euler-v2-sdk";

const VAULT_ADDRESS = "0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1";

function formatUsd(priceWad: bigint | undefined): string {
  if (priceWad === undefined) return "N/A";
  return `$${Number(formatUnits(priceWad, 18)).toFixed(4)}`;
}

async function fetchVaultDetailsExample() {
  const rpcUrls = getRpcUrls();
  const sdk = await buildSDK({ rpcUrls });

  console.log(`Fetching vault ${VAULT_ADDRESS} with resolved collaterals and prices...\n`);

  const vault = await sdk.eVaultService.fetchVault(
    mainnet.id,
    VAULT_ADDRESS,
    { populateCollaterals: true, populateMarketPrices: true },
  );

  // Vault overview
  console.log("=".repeat(80));
  console.log("VAULT OVERVIEW");
  console.log("=".repeat(80));
  console.log(`  Name:            ${vault.shares.name}`);
  console.log(`  Address:         ${vault.address}`);
  console.log(`  Asset:           ${vault.asset.symbol} (${vault.asset.address})`);
  console.log(`  Unit of Account: ${vault.unitOfAccount.symbol} (${vault.unitOfAccount.address})`);
  console.log(`  Total Assets:    ${formatUnits(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`);
  console.log(`  Total Borrowed:  ${formatUnits(vault.totalBorrowed, vault.asset.decimals)} ${vault.asset.symbol}`);
  console.log(`  Total Cash:      ${formatUnits(vault.totalCash, vault.asset.decimals)} ${vault.asset.symbol}`);

  // Interest rates
  console.log("\n" + "-".repeat(80));
  console.log("INTEREST RATES");
  console.log("-".repeat(80));
  console.log(`  Supply APY:      ${(Number(vault.interestRates.supplyAPY) * 100).toFixed(4)}%`);
  console.log(`  Borrow APY:      ${(Number(vault.interestRates.borrowAPY) * 100).toFixed(4)}%`);

  // Prices
  console.log("\n" + "-".repeat(80));
  console.log("PRICES");
  console.log("-".repeat(80));
  console.log(`  Asset USD price:           ${formatUsd(vault.marketPriceUsd)}`);
  const assetPrice = vault.assetRiskPrice;
  if (assetPrice) {
    console.log(`  Oracle price (liquidation): ${formatUnits(assetPrice.priceLiquidation, 18)}`);
    console.log(`  Oracle price (borrowing):   ${formatUnits(assetPrice.priceBorrowing, 18)}`);
  }

  // Collaterals
  console.log("\n" + "-".repeat(80));
  console.log(`COLLATERALS (${vault.collaterals.length})`);
  console.log("-".repeat(80));

  if (vault.collaterals.length === 0) {
    console.log("  No collaterals configured");
  }

  for (const collateral of vault.collaterals) {
    console.log(`\n  ${collateral.address}`);
    console.log(`    Borrow LTV:      ${(collateral.borrowLTV * 100).toFixed(2)}%`);
    console.log(`    Liquidation LTV: ${(collateral.liquidationLTV * 100).toFixed(2)}%`);
    console.log(`    USD price:       ${formatUsd(collateral.marketPriceUsd)}`);

    if (collateral.vault) {
      const cv = collateral.vault;
      console.log(`    Vault name:      ${cv.shares.name}`);
      console.log(`    Vault asset:     ${cv.asset.symbol}`);
      console.log(`    Total assets:    ${formatUnits(cv.totalAssets, cv.asset.decimals)} ${cv.asset.symbol}`);

      if ("interestRates" in cv) {
        const rates = (cv as EVault).interestRates;
        console.log(`    Supply APY:      ${(Number(rates.supplyAPY) * 100).toFixed(4)}%`);
      }

      const collateralPrice = vault.getCollateralRiskPrice(cv);
      if (collateralPrice) {
        console.log(`    Oracle (liq):    ${formatUnits(collateralPrice.priceLiquidation, 18)}`);
        console.log(`    Oracle (borrow): ${formatUnits(collateralPrice.priceBorrowing, 18)}`);
      }
    } else {
      console.log("    Vault:           (not resolved)");
    }
  }

  console.log("\n" + "=".repeat(80));
}

fetchVaultDetailsExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
