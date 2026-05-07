/**
 * FETCH VAULT DETAILS EXAMPLE
 *
 * Fetches a single EVault with collaterals fully resolved and USD
 * market prices, displaying vault info, prices, collateral details,
 * labels (off-chain metadata), and reward campaigns.
 *
 * USAGE:
 *   Set EULER_SDK_RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx vaults/fetch-vault-details-example.ts
 */

import "dotenv/config";
import { formatUnits } from "viem";
import { mainnet } from "viem/chains";

import { EULER_PRIME_USDC_VAULT } from "../utils/config.js";
import { buildEulerSDK, createPythPlugin, type EVault } from "@eulerxyz/euler-v2-sdk";

const VAULT_ADDRESS = EULER_PRIME_USDC_VAULT;

function formatUsd(priceWad: bigint | undefined): string {
  if (priceWad === undefined) return "N/A";
  return `$${Number(formatUnits(priceWad, 18)).toFixed(4)}`;
}

async function fetchVaultDetailsExample() {
  const sdk = await buildEulerSDK({ plugins: [createPythPlugin()] });

  console.log(`Fetching vault ${VAULT_ADDRESS} with resolved collaterals and prices...\n`);

  const { result: vault, errors } = await sdk.eVaultService.fetchVault(
    mainnet.id,
    VAULT_ADDRESS,
    { populateAll: true },
  );
  if (errors.length > 0) {
    console.log(`Diagnostics: ${errors.length} issues`);
  }
  if (!vault) {
    console.error(`Vault ${VAULT_ADDRESS} was not found.`);
    return;
  }

  // Vault overview
  console.log("=".repeat(80));
  console.log("VAULT OVERVIEW");
  console.log("=".repeat(80));
  console.log(`  Name:            ${vault.shares.name}`);
  console.log(`  Address:         ${vault.address}`);
  console.log(`  Asset:           ${vault.asset.symbol} (${vault.asset.address})`);
  console.log(
    `  Unit of Account: ${
      vault.unitOfAccount
        ? `${vault.unitOfAccount.symbol} (${vault.unitOfAccount.address})`
        : "None"
    }`,
  );
  console.log(`  Total Assets:    ${formatUnits(vault.totalAssets, vault.asset.decimals)} ${vault.asset.symbol}`);
  console.log(`  Total Borrowed:  ${formatUnits(vault.totalBorrowed, vault.asset.decimals)} ${vault.asset.symbol}`);
  console.log(`  Total Cash:      ${formatUnits(vault.totalCash, vault.asset.decimals)} ${vault.asset.symbol}`);
  console.log(`  Available Liq.:  ${formatUnits(vault.availableToBorrow, vault.asset.decimals)} ${vault.asset.symbol}`);

  // Interest rates
  console.log("\n" + "-".repeat(80));
  console.log("INTEREST RATES");
  console.log("-".repeat(80));
  console.log(`  Supply APY:      ${Number(vault.interestRates.supplyAPY).toFixed(4)}%`);
  console.log(`  Borrow APY:      ${Number(vault.interestRates.borrowAPY).toFixed(4)}%`);

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
        console.log(`    Supply APY:      ${Number(rates.supplyAPY).toFixed(4)}%`);
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

  // Labels (off-chain metadata from euler-labels)
  console.log("\n" + "-".repeat(80));
  console.log("LABELS");
  console.log("-".repeat(80));

  if (vault.eulerLabel) {
    const label = vault.eulerLabel;
    for (const entity of label.entities) {
      console.log(`  Entity:          ${entity.name}`);
      if (entity.url) console.log(`    URL:           ${entity.url}`);
      if (entity.logo) console.log(`    Logo:          ${entity.logo}`);
    }

    for (const product of label.products) {
      console.log(`  Product:         ${product.name} (${product.vaults.length} vaults)`);
      if (product.description) console.log(`    Description:   ${product.description}`);
    }

    for (const point of label.points) {
      console.log(`  Points:          ${point.name}`);
      if (point.logo) console.log(`    Logo:          ${point.logo}`);
    }
  } else {
    console.log("  No labels available");
  }

  // Rewards
  console.log("\n" + "-".repeat(80));
  console.log("REWARDS");
  console.log("-".repeat(80));

  if (vault.rewards && vault.rewards.campaigns.length > 0) {
    console.log(`  Total rewards APR: ${(vault.rewards.totalRewardsApr * 100).toFixed(4)}%`);
    for (const campaign of vault.rewards.campaigns) {
      console.log(`  Campaign:        ${campaign.rewardTokenSymbol} (${campaign.source})`);
      console.log(`    APR:           ${(campaign.apr * 100).toFixed(4)}%`);
    }
  } else {
    console.log("  No rewards campaigns");
  }

  // Intrinsic APY
  console.log("\n" + "-".repeat(80));
  console.log("INTRINSIC APY");
  console.log("-".repeat(80));

  if (vault.intrinsicApy && vault.intrinsicApy.apy > 0) {
    console.log(`  APY:             ${vault.intrinsicApy.apy.toFixed(4)}%`);
    console.log(`  Provider:        ${vault.intrinsicApy.provider}`);
    if (vault.intrinsicApy.source) {
      console.log(`  Source:          ${vault.intrinsicApy.source}`);
    }
  } else {
    console.log("  No intrinsic APY for this asset");
  }

  console.log("\n" + "=".repeat(80));
}

fetchVaultDetailsExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
