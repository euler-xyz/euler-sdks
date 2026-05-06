/**
 * FETCH ACCOUNT EXAMPLE
 *
 * Fetches an Euler account by owner address, displaying sub-accounts,
 * positions (deposits, borrows), enabled collaterals/controllers,
 * and per-position liquidity info when available.
 *
 * USAGE:
 *   Set RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx accounts/fetch-account-example.ts [ownerAddress]
 */

import "dotenv/config";
import { formatUnits, type Address } from "viem";
import { mainnet } from "viem/chains";

import { getRpcUrls } from "../utils/config.js";
import { buildEulerSDK, createPythPlugin } from "@eulerxyz/euler-v2-sdk";

// Default: a known address with Euler positions on mainnet
const DEFAULT_OWNER = "0x75cFE4ef963232ae8313aC33e21fC39241338618" as Address;

async function fetchAccountExample() {
  const owner = (process.argv[2] as Address) || DEFAULT_OWNER;
  const rpcUrls = getRpcUrls();
  const sdk = await buildEulerSDK({ rpcUrls, plugins: [createPythPlugin()] });

  console.log(`Fetching account for ${owner} on mainnet...\n`);

  const { result: account, errors } = await sdk.accountService.fetchAccount(mainnet.id, owner, {
    populateAll: true,
    vaultFetchOptions: {
      populateAll: true,
    },
  });
  if (errors.length > 0) {
    console.log(`Diagnostics: ${errors.length} issues`);
  }

  // Account overview
  console.log("=".repeat(80));
  console.log("ACCOUNT OVERVIEW");
  console.log("=".repeat(80));
  console.log(`  Owner:                  ${account.owner}`);
  console.log(`  Lockdown Mode:          ${account.isLockdownMode}`);
  console.log(`  Permit Disabled Mode:   ${account.isPermitDisabledMode}`);

  const subAccounts = Object.values(account.subAccounts).filter(
    (sa): sa is NonNullable<typeof sa> => sa != null,
  );
  console.log(`  Sub-accounts:           ${subAccounts.length}`);

  if (subAccounts.length === 0) {
    console.log("\n  No sub-accounts found (no positions on this chain).");
    console.log("=".repeat(80));
    return;
  }

  for (const sa of subAccounts) {
    console.log("\n" + "-".repeat(80));
    console.log(`SUB-ACCOUNT: ${sa.account}`);
    console.log("-".repeat(80));
    console.log(`  Controllers: ${sa.enabledControllers.length > 0 ? sa.enabledControllers.join(", ") : "(none)"}`);
    console.log(`  Collaterals: ${sa.enabledCollaterals.length > 0 ? sa.enabledCollaterals.join(", ") : "(none)"}`);
    console.log(`  Positions:   ${sa.positions.length}`);

    for (const pos of sa.positions) {
      console.log(`\n  POSITION: ${pos.vaultAddress}`);

      if (pos.vault && "shares" in pos.vault) {
        console.log(`    Vault name:    ${pos.vault.shares.name}`);
      }
      if (pos.vault && "asset" in pos.vault) {
        const asset = pos.vault.asset;
        console.log(`    Asset:         ${asset.symbol} (${asset.address})`);
        console.log(`    Deposited:     ${formatUnits(pos.assets, asset.decimals)} ${asset.symbol}`);
        console.log(`    Borrowed:      ${formatUnits(pos.borrowed, asset.decimals)} ${asset.symbol}`);
      } else {
        console.log(`    Shares:        ${pos.shares.toString()}`);
        console.log(`    Assets:        ${pos.assets.toString()}`);
        console.log(`    Borrowed:      ${pos.borrowed.toString()}`);
      }

      console.log(`    Is Controller: ${pos.isController}`);
      console.log(`    Is Collateral: ${pos.isCollateral}`);

      // Market price (from populateMarketPrices)
      if (pos.marketPriceUsd != null) {
        console.log(`    Market Price:  $${formatUnits(pos.marketPriceUsd, 18)}`);
      }
      if (pos.suppliedValueUsd != null) {
        console.log(`    Supplied USD:  $${formatUnits(pos.suppliedValueUsd, 18)}`);
      }
      if (pos.borrowedValueUsd != null) {
        console.log(`    Borrowed USD:  $${formatUnits(pos.borrowedValueUsd, 18)}`);
      }

      // Labels (from populateLabels)
      const vault = pos.vault as any;
      if (vault?.eulerLabel) {
        const label = vault.eulerLabel;
        console.log(`    Label:`);
        if (label.entities?.length > 0) {
          console.log(`      Entities:   ${label.entities.map((e: any) => e.name).join(", ")}`);
        }
        if (label.products?.length > 0) {
          console.log(`      Products:   ${label.products.map((p: any) => p.name).join(", ")}`);
        }
        if (label.points?.length > 0) {
          console.log(`      Points:     ${label.points.map((p: any) => p.name).join(", ")}`);
        }
        if (label.deprecated) {
          console.log(`      DEPRECATED: ${label.deprecationReason}`);
        }
        if (label.portfolioNotice) {
          console.log(`      Notice:     ${label.portfolioNotice}`);
        }
        if (label.featured) {
          console.log(`      Featured:   true`);
        }
      }

      // Rewards (from populateRewards)
      if (vault?.rewards) {
        const rewards = vault.rewards;
        console.log(`    Rewards:`);
        console.log(`      Total APR:  ${(rewards.totalRewardsApr * 100).toFixed(2)}%`);
        for (const c of rewards.campaigns) {
          console.log(`      ${c.rewardTokenSymbol} (${c.source}/${c.action}): ${(c.apr * 100).toFixed(2)}%`);
        }
      }

      // Collaterals (from populateCollaterals)
      if (vault?.collaterals?.length > 0) {
        console.log(`    Collaterals:`);
        for (const coll of vault.collaterals) {
          const collName = coll.vault && "shares" in coll.vault ? coll.vault.shares.name : coll.address;
          console.log(`      ${collName}: bLTV=${(coll.borrowLTV * 100).toFixed(1)}% lLTV=${(coll.liquidationLTV * 100).toFixed(1)}%`);
        }
      }

      if (pos.liquidity) {
        const liq = pos.liquidity;
        console.log(`    Liquidity:`);
        console.log(`      Days to Liquidation:    ${liq.daysToLiquidation}`);
        console.log(`      Liability (mid):        ${formatUnits(liq.liabilityValue.oracleMid, 18)}`);
        console.log(`      Total Collateral (mid): ${formatUnits(liq.totalCollateralValue.oracleMid, 18)}`);
        console.log(`      Collateral Breakdown:`);
        for (const coll of liq.collaterals) {
          const label = coll.vault && "shares" in coll.vault ? coll.vault.shares.name : coll.address;
          console.log(`        ${label}: ${formatUnits(coll.value.oracleMid, 18)}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(80));
}

fetchAccountExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
