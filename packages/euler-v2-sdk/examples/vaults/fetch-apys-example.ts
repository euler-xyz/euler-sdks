/**
 * FETCH APYs EXAMPLE
 *
 * This example fetches all EVaults and EulerEarn vaults from
 * governed perspectives and logs their supply and borrow APYs.
 *
 * USAGE:
 *   Set RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx examples/vaults/fetch-apys-example.ts
 */

import "dotenv/config";
import { mainnet } from "viem/chains";

import { getRpcUrls } from "../utils/config.js";
import {
  buildSDK,
  StandardEVaultPerspectives,
  StandardEulerEarnPerspectives,
} from "euler-v2-sdk";

async function fetchApysExample() {
  const rpcUrls = getRpcUrls();

  const sdk = await buildSDK({ rpcUrls });

  // Fetch all governed EVaults
  console.log("Fetching governed EVaults...");
  const eVaults = await sdk.eVaultService.fetchVerifiedVaults(mainnet.id, [
    StandardEVaultPerspectives.GOVERNED,
  ]);

  eVaults.sort((a, b) => Number(b.interestRates.supplyAPY) - Number(a.interestRates.supplyAPY));

  console.log(`\nFound ${eVaults.length} governed EVaults:\n`);
  console.log(
    "Vault".padEnd(50),
    "Address".padEnd(44),
    "Supply APY".padEnd(14),
    "Borrow APY",
  );
  console.log("-".repeat(120));

  for (const vault of eVaults) {
    console.log(
      vault.shares.name.padEnd(50),
      vault.address.padEnd(44),
      `${(Number(vault.interestRates.supplyAPY) * 100).toFixed(2)}%`.padEnd(14),
      `${(Number(vault.interestRates.borrowAPY) * 100).toFixed(2)}%`,
    );
  }

  // Fetch all governed EulerEarn vaults
  console.log("\nFetching governed EulerEarn vaults...");
  const eulerEarnVaults =
    await sdk.eulerEarnService.fetchVerifiedVaults(mainnet.id, [
      StandardEulerEarnPerspectives.GOVERNED,
    ]);

  eulerEarnVaults.sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0));

  console.log(`\nFound ${eulerEarnVaults.length} governed EulerEarn vaults:\n`);
  console.log(
    "Vault".padEnd(50),
    "Address".padEnd(44),
    "Supply APY".padEnd(14),
    "Strategies",
  );
  console.log("-".repeat(130));

  for (const vault of eulerEarnVaults) {
    const supplyApy = vault.supplyApy !== undefined
      ? `${(vault.supplyApy * 100).toFixed(2)}%`
      : "N/A";
    console.log(
      vault.shares.name.padEnd(50),
      vault.address.padEnd(44),
      supplyApy.padEnd(14),
      `${vault.strategies.length} strategies`,
    );
  }
}

fetchApysExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
