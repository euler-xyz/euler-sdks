import { Address, erc20Abi, formatUnits } from "viem";
import { publicClient } from "./config.js";
import { Account, getSubAccountAddress } from "euler-v2-sdk";

  // Helper function for header
  export function printHeader(msg: string) {
    console.log("=".repeat(80));
    console.log(msg);
    console.log("=".repeat(80));
    console.log();
  }
  
  export async function getBalance(tokenAddress: Address, accountAddress: Address) {
    return await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
  }

  export async function getDecimals(tokenAddress: Address) {
    return await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    });
  }

  export async function getSymbol(tokenAddress: Address) {
    return await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    });
  }

  export async function logWalletBalance(tokenAddress: Address, accountAddress: Address) {
    const balance = await getBalance(tokenAddress, accountAddress);
    const symbol = await getSymbol(tokenAddress);
    console.log(`  Wallet ${symbol} balance: ${formatUnits(balance, await getDecimals(tokenAddress))} ${symbol}`);
  }

  export async function logVaultBalance(vaultAddress: Address, account: Account, subAccountId: number) {
    const position = account.getPosition(getSubAccountAddress(account.owner, subAccountId), vaultAddress);
    const vaultBalance = position?.assets ?? 0n;
    const symbol = await getSymbol(vaultAddress);
    console.log(`  Vault ${symbol} balance: ${formatUnits(vaultBalance, await getDecimals(vaultAddress))} ${symbol}`);
  }

  export function logAccount(account: Account) {
    if (account.subAccounts.length === 0) {
      console.log("Note: Account has no existing positions. Creating new account...");
    } else {
      console.log(`✓ Account found with ${account.subAccounts.length} sub-account(s)`);
    }
  }