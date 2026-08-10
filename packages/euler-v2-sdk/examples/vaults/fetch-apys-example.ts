/**
 * FETCH APYs EXAMPLE
 *
 * This example fetches all EVaults and EulerEarn vaults from
 * standard perspectives and logs their supply and borrow APYs,
 * reward APRs, and intrinsic asset APYs.
 *
 * USAGE:
 *   Set EULER_SDK_RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx vaults/fetch-apys-example.ts
 */

import "dotenv/config";
import { mainnet } from "viem/chains";

import {
  buildEulerSDK,
  StandardEVaultPerspectives,
} from "@eulerxyz/euler-v2-sdk";

async function fetchApysExample() {

  const sdk = await buildEulerSDK({
    eVaultServiceConfig: { adapter: "onchain" },
    eulerEarnServiceConfig: { adapter: "onchain" },
  });

  // Fetch all factory EVaults with rewards and intrinsic APY
  console.log("Fetching factory EVaults...");
  const { result: eVaultResults } = await sdk.eVaultService.fetchVerifiedVaults(mainnet.id, [
    StandardEVaultPerspectives.FACTORY,
  ], {
    populateAll: true,
  });
  const eVaults = eVaultResults.filter((vault) => vault !== undefined);

  eVaults.sort((a, b) => Number(b.interestRates.supplyAPY) - Number(a.interestRates.supplyAPY));

  console.log(`\nFound ${eVaults.length} factory EVaults:\n`);
  console.log(
    "Vault".padEnd(50),
    "Address".padEnd(44),
    "Supply APY".padEnd(14),
    "Borrow APY".padEnd(14),
    "Rewards APR".padEnd(14),
    "Intrinsic APY",
  );
  console.log("-".repeat(155));

  for (const vault of eVaults) {
    const rewardsApr = vault.rewards?.totalRewardsApr ?? 0;
    const intrinsicApy = vault.intrinsicApy?.apy ?? 0;
    console.log(
      vault.shares.name.padEnd(50),
      vault.address.padEnd(44),
      `${Number(vault.interestRates.supplyAPY).toFixed(2)}%`.padEnd(14),
      `${Number(vault.interestRates.borrowAPY).toFixed(2)}%`.padEnd(14),
      rewardsApr > 0 ? `${(rewardsApr * 100).toFixed(2)}%`.padEnd(14) : "-".padEnd(14),
      intrinsicApy > 0 ? `${intrinsicApy.toFixed(2)}% (${vault.intrinsicApy!.provider})` : "-",
    );
  }

  // Fetch all EulerEarn vaults with rewards and intrinsic APY
  console.log("\nFetching EulerEarn vaults...");
  const { result: eulerEarnVaultResults } =
    await sdk.eulerEarnService.fetchAllVaults(mainnet.id, {
      options: { populateAll: true },
    });
  const eulerEarnVaults = eulerEarnVaultResults.filter(
    (vault) => vault !== undefined,
  );

  eulerEarnVaults.sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0));

  console.log(`\nFound ${eulerEarnVaults.length} EulerEarn vaults:\n`);
  console.log(
    "Vault".padEnd(50),
    "Address".padEnd(44),
    "Supply APY".padEnd(14),
    "Rewards APR".padEnd(14),
    "Intrinsic APY".padEnd(20),
    "Strategies",
  );
  console.log("-".repeat(160));

  for (const vault of eulerEarnVaults) {
    const supplyApy = vault.supplyApy !== undefined
      ? `${vault.supplyApy.toFixed(2)}%`
      : "N/A";
    const rewardsApr = vault.rewards?.totalRewardsApr ?? 0;
    const intrinsicApy = vault.intrinsicApy?.apy ?? 0;
    console.log(
      vault.shares.name.padEnd(50),
      vault.address.padEnd(44),
      supplyApy.padEnd(14),
      rewardsApr > 0 ? `${(rewardsApr * 100).toFixed(2)}%`.padEnd(14) : "-".padEnd(14),
      intrinsicApy > 0 ? `${intrinsicApy.toFixed(2)}% (${vault.intrinsicApy!.provider})`.padEnd(20) : "-".padEnd(20),
      `${vault.strategies.length} strategies`,
    );
  }
}

fetchApysExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
