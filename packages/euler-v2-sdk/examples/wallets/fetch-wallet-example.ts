/**
 * Fetch wallet balances and allowance state.
 *
 * Demonstrates:
 *   - Native token balance via zeroAddress
 *   - Batched ERC20 balances through walletService
 *   - Direct ERC20 allowance and Permit2 allowance metadata for a spender
 */
import { buildEulerSDK } from "@eulerxyz/euler-v2-sdk";
import { formatEther, formatUnits, zeroAddress } from "viem";
import {
  account,
  EULER_PRIME_USDC_VAULT,
  initExample,
  USDC_ADDRESS,
  WETH_ADDRESS,
} from "../utils/config.js";

async function fetchWalletExample() {
  await initExample();

  const sdk = await buildEulerSDK();

  const { result: wallet, errors } = await sdk.walletService.fetchWallet(
    1,
    account.address,
    [
      { asset: zeroAddress },
      { asset: USDC_ADDRESS, spenders: [EULER_PRIME_USDC_VAULT] },
      { asset: WETH_ADDRESS },
    ],
  );

  if (errors.length) {
    console.log("Wallet diagnostics:");
    for (const issue of errors) {
      console.log(`  - ${issue.severity}: ${issue.message}`);
    }
  }

  console.log(`Native balance: ${formatEther(wallet.getBalance(zeroAddress))} ETH`);
  console.log(`USDC balance: ${formatUnits(wallet.getBalance(USDC_ADDRESS), 6)} USDC`);
  console.log(`WETH balance: ${formatUnits(wallet.getBalance(WETH_ADDRESS), 18)} WETH`);

  const usdcAllowances = wallet.getAllowances(
    USDC_ADDRESS,
    EULER_PRIME_USDC_VAULT,
  );

  console.log("USDC allowances for Euler Prime USDC vault:");
  console.log(`  direct allowance: ${formatUnits(usdcAllowances?.assetForVault ?? 0n, 6)} USDC`);
  console.log(`  allowance to Permit2: ${formatUnits(usdcAllowances?.assetForPermit2 ?? 0n, 6)} USDC`);
  console.log(`  Permit2 spender allowance: ${formatUnits(usdcAllowances?.assetForVaultInPermit2 ?? 0n, 6)} USDC`);
  console.log(`  Permit2 expiration: ${usdcAllowances?.permit2ExpirationTime ?? 0}`);
  console.log(`  Permit2 nonce: ${usdcAllowances?.permit2Nonce ?? 0}`);
}

fetchWalletExample().catch((error) => {
  console.error("Error in fetch wallet example:", error);
  process.exit(1);
});
