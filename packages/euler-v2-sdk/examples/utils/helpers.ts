import { Address, erc20Abi, formatUnits, isAddressEqual, parseAbi, PublicClient, TestClient, WalletClient } from "viem";
import { publicClient } from "./config.js";
import { Account, SubAccount, AccountPosition, getSubAccountAddress, EulerSDK, eVaultAbi } from "euler-v2-sdk";


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

/**
 * Metadata cache to avoid redundant fetches
 */
interface TokenMetadata {
  symbol: string;
  decimals: number;
}

interface VaultMetadata {
  name: string;
  assetSymbol: string;
  assetDecimals: number;
  vaultSymbol: string;
  vaultDecimals: number;
}

const metadataCache: {
  tokens: Map<string, TokenMetadata>;
  vaults: Map<string, VaultMetadata>;
} = {
  tokens: new Map(),
  vaults: new Map(),
};

/**
 * Fetch token metadata (symbol, decimals)
 */
async function fetchTokenMetadata(chainId: number, address: Address, sdk: EulerSDK): Promise<TokenMetadata> {
  const cacheKey = `${chainId}:${address.toLowerCase()}`;
  const cached = metadataCache.tokens.get(cacheKey);
  if (cached) return cached;

  const provider = sdk.providerService.getProvider(chainId);
  const [symbol, decimals] = await Promise.all([
    provider.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    provider.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);

  const metadata = { symbol, decimals };
  metadataCache.tokens.set(cacheKey, metadata);
  return metadata;
}

/**
 * Fetch vault metadata (name, asset symbol, asset decimals, vault decimals)
 */
async function fetchVaultMetadata(chainId: number, vaultAddress: Address, assetAddress: Address, sdk: EulerSDK): Promise<VaultMetadata> {
  const cacheKey = `${chainId}:${vaultAddress.toLowerCase()}`;
  const cached = metadataCache.vaults.get(cacheKey);
  if (cached) return cached;

  const [assetMetadata, vaultMetadata, labels] = await Promise.all([
    fetchTokenMetadata(chainId, assetAddress, sdk),
    fetchTokenMetadata(chainId, vaultAddress, sdk), // Vault token decimals (for shares)
    sdk.eulerLabelsService.getEulerLabelsVaults(chainId).catch(() => ({} as Record<Address, any>)),
  ]);

  const labelInfo = labels[vaultAddress.toLowerCase() as Address];
  const vaultName = labelInfo?.name || `Vault ${truncateAddress(vaultAddress)}`;

  const metadata = {
    name: vaultName,
    assetSymbol: assetMetadata.symbol,
    assetDecimals: assetMetadata.decimals,
    vaultSymbol: vaultMetadata.symbol,
    vaultDecimals: vaultMetadata.decimals,
  };

  metadataCache.vaults.set(cacheKey, metadata);
  return metadata;
}

/**
 * Format a bigint value for display with decimals
 */
function formatAmount(value: bigint, decimals: number, symbol: string): string {
  if (value === 0n) return `0 ${symbol}`;
  const formatted = formatUnits(value, decimals);
  // Remove trailing zeros only from the fractional part, do not strip integer zeros
  const cleaned = formatted.includes('.')
    ? formatted.replace(/\.?0+$/, '')
    : formatted;
  return `${cleaned} ${symbol}`;
}

/**
 * Format a bigint value for display (raw, without decimals)
 */
function formatBigInt(value: bigint): string {
  if (value === 0n) return "0";
  const str = value.toString();
  // Add commas for readability
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Truncate an address for display
 */
function truncateAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Log a position with formatting, skipping default/empty values
 */
async function logPosition(chainId: number, position: AccountPosition, sdk: EulerSDK, indent: string = "    ") {
  const vaultMeta = await fetchVaultMetadata(chainId, position.vault, position.asset, sdk);
  
  console.log(`${indent}Vault:       ${vaultMeta.name}`);
  console.log(`${indent}Asset:       ${vaultMeta.assetSymbol}`);
  
  if (position.shares !== 0n) {
    console.log(`${indent}Shares:      ${formatAmount(position.shares, vaultMeta.vaultDecimals, vaultMeta.vaultSymbol)}`);
  }
  if (position.assets !== 0n) {
    console.log(`${indent}Assets:      ${formatAmount(position.assets, vaultMeta.assetDecimals, vaultMeta.assetSymbol)}`);
  }
  if (position.borrowed !== 0n) {
    console.log(`${indent}Borrowed:    ${formatAmount(position.borrowed, vaultMeta.assetDecimals, vaultMeta.assetSymbol)}`);
  }
  if (position.isController) {
    console.log(`${indent}Controller:  ${position.isController}`);
  }
  if (position.isCollateral) {
    console.log(`${indent}Collateral:  ${position.isCollateral}`);
  }
}

/**
 * Log the difference between two positions, skipping default/empty values unless they changed
 */
async function logPositionDiff(chainId: number, before: AccountPosition, after: AccountPosition, sdk: EulerSDK, indent: string = "    ") {
  const vaultMeta = await fetchVaultMetadata(chainId, after.vault, after.asset, sdk);
  
  console.log(`${indent}Vault:       ${vaultMeta.name}`);
  console.log(`${indent}Asset:       ${vaultMeta.assetSymbol}`);
  
  // Shares diff - show if changed OR if after value is not 0n
  if (before.shares !== after.shares) {
    const diff = after.shares - before.shares;
    const sign = diff > 0n ? "+" : diff < 0n ? "-" : "";
    const beforeFormatted = formatAmount(before.shares, vaultMeta.vaultDecimals, vaultMeta.vaultSymbol);
    const afterFormatted = formatAmount(after.shares, vaultMeta.vaultDecimals, vaultMeta.vaultSymbol);
    const diffFormatted = formatAmount(diff > 0n ? diff : -diff, vaultMeta.vaultDecimals, vaultMeta.vaultSymbol);
    console.log(`${indent}Shares:      ${beforeFormatted} → ${afterFormatted} (${sign}${diffFormatted})`);
  } else if (after.shares !== 0n) {
    console.log(`${indent}Shares:      ${formatAmount(after.shares, vaultMeta.vaultDecimals, vaultMeta.vaultSymbol)}`);
  }

  // Assets diff - show if changed OR if after value is not 0n
  if (before.assets !== after.assets) {
    const diff = after.assets - before.assets;
    const sign = diff > 0n ? "+" : "";
    const beforeFormatted = formatAmount(before.assets, vaultMeta.assetDecimals, vaultMeta.assetSymbol);
    const afterFormatted = formatAmount(after.assets, vaultMeta.assetDecimals, vaultMeta.assetSymbol);
    const diffFormatted = formatAmount(diff > 0n ? diff : -diff, vaultMeta.assetDecimals, vaultMeta.assetSymbol);
    console.log(`${indent}Assets:      ${beforeFormatted} → ${afterFormatted} (${sign}${diffFormatted})`);
  } else if (after.assets !== 0n) {
    console.log(`${indent}Assets:      ${formatAmount(after.assets, vaultMeta.assetDecimals, vaultMeta.assetSymbol)}`);
  }

  // Borrowed diff - show if changed OR if after value is not 0n
  if (before.borrowed !== after.borrowed) {
    const diff = after.borrowed - before.borrowed;
    const sign = diff > 0n ? "+" : "";
    const beforeFormatted = formatAmount(before.borrowed, vaultMeta.assetDecimals, vaultMeta.assetSymbol);
    const afterFormatted = formatAmount(after.borrowed, vaultMeta.assetDecimals, vaultMeta.assetSymbol);
    const diffFormatted = formatAmount(diff > 0n ? diff : -diff, vaultMeta.assetDecimals, vaultMeta.assetSymbol);
    console.log(`${indent}Borrowed:    ${beforeFormatted} → ${afterFormatted} (${sign}${diffFormatted})`);
  } else if (after.borrowed !== 0n) {
    console.log(`${indent}Borrowed:    ${formatAmount(after.borrowed, vaultMeta.assetDecimals, vaultMeta.assetSymbol)}`);
  }

  // Controller/Collateral status - show if changed OR if after value is true
  if (before.isController !== after.isController) {
    console.log(`${indent}Controller:  ${before.isController} → ${after.isController}`);
  } else if (after.isController) {
    console.log(`${indent}Controller:  ${after.isController}`);
  }

  if (before.isCollateral !== after.isCollateral) {
    console.log(`${indent}Collateral:  ${before.isCollateral} → ${after.isCollateral}`);
  } else if (after.isCollateral) {
    console.log(`${indent}Collateral:  ${after.isCollateral}`);
  }
}

/**
 * Check if a position has any meaningful data (non-default values)
 */
function hasPositionData(position: AccountPosition): boolean {
  return position.shares !== 0n || 
          position.assets !== 0n || 
          position.borrowed !== 0n || 
          position.isController || 
          position.isCollateral;
}

/**
 * Find a position in a sub-account by vault address
 */
function findPosition(subAccount: SubAccount, vaultAddress: Address): AccountPosition | undefined {
  return subAccount.positions.find(p => isAddressEqual(p.vault, vaultAddress));
}

/**
 * Fetch vault name for address
 */
async function getVaultName(chainId: number, vaultAddress: Address, sdk: EulerSDK): Promise<string> {
  try {
    const labels = await sdk.eulerLabelsService.getEulerLabelsVaults(chainId);
    const labelInfo = labels[vaultAddress.toLowerCase() as Address] as any;
    return labelInfo?.name || truncateAddress(vaultAddress);
  } catch {
    return truncateAddress(vaultAddress);
  }
}

/**
 * Format a list of vault addresses to names
 */
async function formatVaultList(chainId: number, vaultAddresses: Address[], sdk: EulerSDK): Promise<string> {
  if (vaultAddresses.length === 0) return "none";
  const names = await Promise.all(
    vaultAddresses.map(addr => getVaultName(chainId, addr, sdk))
  );
  return names.join(", ");
}

/**
 * Log the changes between before and after operation states
 * 
 * @param chainId - Chain ID for the operation
 * @param before - Account state before the operation
 * @param after - Account or (SubAccount | undefined)[] state after the operation
 * @param sdk - SDK instance for fetching metadata
 * 
 * @example
 * const accountBefore = await sdk.accountService.fetchAccount(chainId, address);
 * await executePlan(plan, sdk);
 * const accountAfter = await sdk.accountService.fetchAccount(chainId, address);
 * await logOperationResult(chainId, accountBefore, accountAfter, sdk);
 * 
 * @example
 * // Or with sub-accounts only
 * const accountBefore = await sdk.accountService.fetchAccount(chainId, address);
 * await executePlan(plan, sdk);
 * const subAccounts = await Promise.all([
 *   sdk.accountService.fetchSubAccount(chainId, subAccountAddr1, vaults),
 *   sdk.accountService.fetchSubAccount(chainId, subAccountAddr2, vaults),
 * ]);
 * await logOperationResult(chainId, accountBefore, subAccounts, sdk);
 */
export async function logOperationResult(chainId: number, before: Account, after: Account | (SubAccount | undefined)[], sdk: EulerSDK) {
  console.log("\n" + "═".repeat(80));
  console.log("OPERATION RESULT");
  console.log("═".repeat(80));

  // Normalize after to array of sub-accounts, filtering out undefined values
  const afterSubAccounts = Array.isArray(after) ? after.filter((sa): sa is SubAccount => sa !== undefined) : after.subAccounts;
  
  // Create maps for easy lookup
  const beforeMap = new Map(before.subAccounts.map(sa => [sa.account, sa]));
  const afterMap = new Map(afterSubAccounts.map(sa => [sa.account, sa]));

  // Track all sub-account addresses
  const allSubAccountAddresses = new Set([
    ...before.subAccounts.map(sa => sa.account),
    ...afterSubAccounts.map(sa => sa.account)
  ]);

  let hasChanges = false;

  // Iterate through all sub-accounts
  for (const subAccountAddr of allSubAccountAddresses) {
    const beforeSub = beforeMap.get(subAccountAddr);
    const afterSub = afterMap.get(subAccountAddr);

    // Case 1: New sub-account created
    if (!beforeSub && afterSub) {
      hasChanges = true;
      console.log(`\n🆕 NEW SUB-ACCOUNT: ${truncateAddress(afterSub.account)}`);
      console.log(`  Owner:            ${truncateAddress(afterSub.owner)}`);
      
      if (afterSub.isLockdownMode) {
        console.log(`  Lockdown Mode:    ${afterSub.isLockdownMode}`);
      }
      if (afterSub.enabledControllers.length > 0) {
        const controllers = await formatVaultList(chainId, afterSub.enabledControllers, sdk);
        console.log(`  Controllers:      ${controllers}`);
      }
      if (afterSub.enabledCollaterals.length > 0) {
        const collaterals = await formatVaultList(chainId, afterSub.enabledCollaterals, sdk);
        console.log(`  Collaterals:      ${collaterals}`);
      }
      
      const meaningfulPositions = afterSub.positions.filter(hasPositionData);
      if (meaningfulPositions.length > 0) {
        console.log(`  Positions (${meaningfulPositions.length}):`);
        for (let idx = 0; idx < meaningfulPositions.length; idx++) {
          const pos = meaningfulPositions[idx]!;
          console.log(`\n    Position ${idx + 1}:`);
          await logPosition(chainId, pos, sdk);
        }
      }
      continue;
    }

    // Case 2: Sub-account removed (unlikely in normal operations)
    if (beforeSub && !afterSub) {
      hasChanges = true;
      console.log(`\n❌ REMOVED SUB-ACCOUNT: ${truncateAddress(beforeSub.account)}`);
      continue;
    }

    // Case 3: Sub-account exists in both - check for changes
    if (beforeSub && afterSub) {
      let subHasChanges = false;
      let changeLog: string[] = [];

      // Check for new/removed controllers
      const beforeControllers = new Set(beforeSub.enabledControllers);
      const afterControllers = new Set(afterSub.enabledControllers);
      const newControllers = afterSub.enabledControllers.filter(c => !beforeControllers.has(c));
      const removedControllers = beforeSub.enabledControllers.filter(c => !afterControllers.has(c));

      if (newControllers.length > 0) {
        subHasChanges = true;
        const controllersStr = await formatVaultList(chainId, newControllers, sdk);
        changeLog.push(`  ✓ Controllers enabled: ${controllersStr}`);
      }
      if (removedControllers.length > 0) {
        subHasChanges = true;
        const controllersStr = await formatVaultList(chainId, removedControllers, sdk);
        changeLog.push(`  ✗ Controllers disabled: ${controllersStr}`);
      }

      // Check for new/removed collaterals
      const beforeCollaterals = new Set(beforeSub.enabledCollaterals);
      const afterCollaterals = new Set(afterSub.enabledCollaterals);
      const newCollaterals = afterSub.enabledCollaterals.filter(c => !beforeCollaterals.has(c));
      const removedCollaterals = beforeSub.enabledCollaterals.filter(c => !afterCollaterals.has(c));

      if (newCollaterals.length > 0) {
        subHasChanges = true;
        const collateralsStr = await formatVaultList(chainId, newCollaterals, sdk);
        changeLog.push(`  ✓ Collaterals enabled: ${collateralsStr}`);
      }
      if (removedCollaterals.length > 0) {
        subHasChanges = true;
        const collateralsStr = await formatVaultList(chainId, removedCollaterals, sdk);
        changeLog.push(`  ✗ Collaterals disabled: ${collateralsStr}`);
      }

      // Check for position changes
      const beforePositions = new Map(beforeSub.positions.map(p => [p.vault, p]));
      const afterPositions = new Map(afterSub.positions.map(p => [p.vault, p]));
      const allVaults = new Set([...beforePositions.keys(), ...afterPositions.keys()]);

      const positionChanges: { type: 'new' | 'changed' | 'removed', vault: Address, before?: AccountPosition, after?: AccountPosition }[] = [];

      for (const vault of allVaults) {
        const beforePos = beforePositions.get(vault);
        const afterPos = afterPositions.get(vault);

        if (!beforePos && afterPos) {
          // New position - only include if it has meaningful data
          if (hasPositionData(afterPos)) {
            positionChanges.push({ type: 'new', vault, after: afterPos });
          }
        } else if (beforePos && !afterPos) {
          // Removed position
          positionChanges.push({ type: 'removed', vault, before: beforePos });
        } else if (beforePos && afterPos) {
          // Check if position changed
          const hasChange = 
            beforePos.shares !== afterPos.shares ||
            beforePos.assets !== afterPos.assets ||
            beforePos.borrowed !== afterPos.borrowed ||
            beforePos.isController !== afterPos.isController ||
            beforePos.isCollateral !== afterPos.isCollateral;

          if (hasChange) {
            positionChanges.push({ type: 'changed', vault, before: beforePos, after: afterPos });
          }
        }
      }

      if (positionChanges.length > 0) {
        subHasChanges = true;
      }

      // Print changes if any
      if (subHasChanges) {
        hasChanges = true;
        console.log(`\n📝 UPDATED SUB-ACCOUNT: ${truncateAddress(afterSub.account)}`);
        
        if (changeLog.length > 0) {
          changeLog.forEach(log => console.log(log));
        }

        if (positionChanges.length > 0) {
          console.log(`  Positions:`);
          
          for (const change of positionChanges) {
            if (change.type === 'new') {
              console.log(`\n    ➕ NEW Position:`);
              await logPosition(chainId, change.after!, sdk);
            } else if (change.type === 'removed') {
              console.log(`\n    ➖ REMOVED Position:`);
              await logPosition(chainId, change.before!, sdk);
            } else if (change.type === 'changed') {
              console.log(`\n    🔄 CHANGED Position:`);
              await logPositionDiff(chainId, change.before!, change.after!, sdk);
            }
          }
        }
      }
    }
  }

  if (!hasChanges) {
    console.log("\nℹ️  No changes detected");
  }

  console.log("\n" + "═".repeat(80) + "\n");
}

export function stringify(obj: any) {
  return JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
}