/**
 * Parity check: SDK vs Euler Lite (indexer data)
 *
 * Euler Lite (https://euler-lite.euler.finance/) is a frontend-only app that
 * fetches vault data directly from the indexer (https://indexer.euler.finance).
 * Unlike app.euler.finance, it has no backend detail API (/api/v1/vault).
 *
 * This script compares SDK vault data against the same indexer data that
 * Euler Lite displays, checking for field-level mismatches.
 *
 * Key normalization issues handled:
 *   - Indexer field "totalBorrows" → SDK field "totalBorrowed"
 *   - Indexer field "cash" → SDK field "totalCash"
 *   - Indexer APY values are in percentage (5.0 = 5%), SDK uses decimal (0.05 = 5%)
 *   - Indexer "assetPrice" is a USD number, SDK "marketPriceUsd" is a WAD bigint (18 dec)
 *   - Indexer earn "performanceFee" is a WAD string, SDK is 0–1 decimal
 *   - Indexer caps: null/undefined = uncapped, SDK: MAX_UINT256 or 0n = uncapped
 *   - Indexer earn "strategy" → SDK "address" for strategy vault addresses
 *
 * Usage:
 *   npx tsx test/parity/compare-sdk-lite-vaults.mts
 *
 * Environment variables:
 *   CHAIN_IDS      - Comma-separated chain IDs (default: 1)
 *   INDEXER_HOST   - Indexer URL (default: https://indexer.euler.finance)
 *   V3_HOST        - V3 API URL (default: https://v3.eul.dev)
 *   ADAPTER_MODE   - SDK adapter mode: v3 or onchain (default: v3)
 */

import { buildEulerSDK } from "../../dist/src/sdk/buildSDK.js";
import { formatUnits, getAddress } from "viem";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIR, "../../examples/.env") });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INDEXER_HOST = process.env.INDEXER_HOST ?? "https://indexer.euler.finance";
const V3_HOST = process.env.V3_HOST ?? "https://v3.eul.dev";
const ADAPTER_MODE = (process.env.ADAPTER_MODE ?? "onchain").toLowerCase();

// Euler Lite supports these 14 chains (from __CHAIN_CONFIG__)
const LITE_SUPPORTED_CHAINS = [1, 56, 130, 143, 146, 239, 1923, 8453, 9745, 42161, 43114, 59144, 60808, 80094];

const DEFAULT_CHAIN_IDS = [1];
const CHAIN_IDS = process.env.CHAIN_IDS
  ? process.env.CHAIN_IDS.split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0 && LITE_SUPPORTED_CHAINS.includes(value))
  : DEFAULT_CHAIN_IDS;

const DEFAULT_RPC_URLS = {
  1: "https://ethereum-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
  130: "https://mainnet.unichain.org",
  143: "https://rpc3.monad.xyz",
  146: "https://rpc.soniclabs.com",
  239: "https://rpc.tac.build",
  1923: "https://swell-mainnet.alt.technology",
  8453: "https://base-rpc.publicnode.com",
  9745: "https://rpc.plasma.to",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  59144: "https://linea-rpc.publicnode.com",
  60808: "https://rpc.gobob.xyz",
  80094: "https://rpc.berachain.com",
};

const ENV_RPC_URLS = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key, value]) => key.startsWith("RPC_URL_") && value)
    .map(([key, value]) => [Number(key.slice("RPC_URL_".length)), value]),
);

const RPC_URLS = {
  ...DEFAULT_RPC_URLS,
  ...ENV_RPC_URLS,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ONE_PERCENT = 0.01;
const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Some mainnet tokens are displayed with different symbols on different frontends
const MAINNET_ASSET_SYMBOL_ALIASES = new Map([
  ["0xdcee70654261af21c44c093c300ed3bb97b78192", "WOETH"],
  ["0x35d8949372d46b7a3d5a56006ae77b215fc69bc0", "USD0++"],
]);

// ---------------------------------------------------------------------------
// Utility helpers (same logic as compare-sdk-app-vaults)
// ---------------------------------------------------------------------------

function asLowerAddress(value) {
  if (!value) return undefined;
  try {
    return getAddress(value).toLowerCase();
  } catch {
    return undefined;
  }
}

function meaningful(value) {
  return value !== undefined && value !== null;
}

function toBigint(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && value.startsWith("__bigint__")) {
    return BigInt(value.slice("__bigint__".length));
  }
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return undefined;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.startsWith("__bigint__")) {
    const parsed = Number(value.slice("__bigint__".length));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

function bigintPctDiff(a, b) {
  const aa = toBigint(a);
  const bb = toBigint(b);
  if (aa === undefined || bb === undefined) return undefined;
  if (aa === 0n) return bb === 0n ? 0 : Number.POSITIVE_INFINITY;
  const diff = aa > bb ? aa - bb : bb - aa;
  return Number(diff) / Number(aa);
}

function numberPctDiff(a, b) {
  const aa = toNumber(a);
  const bb = toNumber(b);
  if (aa === undefined || bb === undefined) return undefined;
  if (aa === 0) return bb === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(bb - aa) / Math.abs(aa);
}

function maybeFormatBigint(value, decimals = 18) {
  const bigint = toBigint(value);
  if (bigint === undefined) return String(value);
  try {
    return formatUnits(bigint, decimals);
  } catch {
    return bigint.toString();
  }
}

// ---------------------------------------------------------------------------
// Issue tracking
// ---------------------------------------------------------------------------

function addIssue(issues, issue) {
  issues.push(issue);
}

function compareAddress(issues, field, liteValue, sdkValue) {
  if (!meaningful(liteValue) && !meaningful(sdkValue)) return;
  if (asLowerAddress(liteValue) !== asLowerAddress(sdkValue)) {
    addIssue(issues, { field, lite: liteValue ?? null, sdk: sdkValue ?? null, kind: "address" });
  }
}

function compareGuardianAddress(issues, field, liteValue, sdkValue) {
  const normalizedLite = asLowerAddress(liteValue);
  const normalizedSdk = asLowerAddress(sdkValue);
  if (normalizedLite === undefined) return;
  if (normalizedLite === undefined && normalizedSdk === ZERO_ADDRESS) return;
  compareAddress(issues, field, liteValue, sdkValue);
}

function compareText(issues, field, liteValue, sdkValue) {
  if (!meaningful(liteValue) && !meaningful(sdkValue)) return;
  if ((liteValue ?? null) !== (sdkValue ?? null)) {
    addIssue(issues, { field, lite: liteValue ?? null, sdk: sdkValue ?? null, kind: "text" });
  }
}

function compareBigint(issues, field, liteValue, sdkValue, decimals = 18) {
  const liteBig = toBigint(liteValue);
  const sdkBig = toBigint(sdkValue);
  if (liteBig === undefined && sdkBig === undefined) return;
  if (liteBig === undefined || sdkBig === undefined) {
    addIssue(issues, { field, lite: liteValue ?? null, sdk: sdkValue ?? null, kind: "bigint" });
    return;
  }
  const pct = bigintPctDiff(liteBig, sdkBig);
  if (pct > ONE_PERCENT) {
    addIssue(issues, {
      field,
      lite: liteBig.toString(),
      sdk: sdkBig.toString(),
      pctDiff: pct,
      display: { lite: maybeFormatBigint(liteBig, decimals), sdk: maybeFormatBigint(sdkBig, decimals) },
      kind: "bigint",
    });
  }
}

function compareBigintAllowZeroLiteTinySdk(issues, field, liteValue, sdkValue, decimals = 18, tinyThreshold = 10n) {
  const liteBig = toBigint(liteValue);
  const sdkBig = toBigint(sdkValue);
  if (liteBig === 0n && sdkBig !== undefined && sdkBig >= 0n && sdkBig <= tinyThreshold) return;
  compareBigint(issues, field, liteValue, sdkValue, decimals);
}

function compareCapBigint(issues, field, liteValue, sdkValue, decimals = 18) {
  const liteBig = toBigint(liteValue);
  const sdkBig = toBigint(sdkValue);
  const liteIsUncapped = liteValue === null || liteValue === undefined;
  const sdkIsUncapped = sdkBig === MAX_UINT256 || sdkBig === 0n;
  if (liteIsUncapped && sdkIsUncapped) return;
  compareBigint(issues, field, liteValue, sdkValue, decimals);
}

function compareNumber(issues, field, liteValue, sdkValue) {
  compareNumberWithTolerance(issues, field, liteValue, sdkValue, ONE_PERCENT);
}

function compareNumberAllowMissingLite(issues, field, liteValue, sdkValue) {
  const liteNum = toNumber(liteValue);
  const sdkNum = toNumber(sdkValue);
  if (liteNum === undefined && sdkNum !== undefined) return;
  compareNumber(issues, field, liteValue, sdkValue);
}

function compareNumberAllowZeroLiteMissingSdk(issues, field, liteValue, sdkValue) {
  const liteNum = toNumber(liteValue);
  const sdkNum = toNumber(sdkValue);
  if (liteNum === 0 && sdkNum === undefined) return;
  compareNumber(issues, field, liteValue, sdkValue);
}

function compareNumberWithTolerance(issues, field, liteValue, sdkValue, tolerance) {
  const liteNum = toNumber(liteValue);
  const sdkNum = toNumber(sdkValue);
  if (liteNum === undefined && sdkNum === undefined) return;
  if (liteNum === undefined || sdkNum === undefined) {
    addIssue(issues, { field, lite: liteValue ?? null, sdk: sdkValue ?? null, kind: "number" });
    return;
  }
  if (Math.max(Math.abs(liteNum), Math.abs(sdkNum)) < 1e-12) return;
  const pct = numberPctDiff(liteNum, sdkNum);
  if (pct > tolerance) {
    addIssue(issues, { field, lite: liteNum, sdk: sdkNum, pctDiff: pct, kind: "number" });
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeAssetSymbol(chainId, assetAddress, symbol) {
  if (typeof symbol !== "string") return symbol;
  if (chainId !== 1) return symbol;
  const normalizedAddress = asLowerAddress(assetAddress);
  if (!normalizedAddress) return symbol;
  return MAINNET_ASSET_SYMBOL_ALIASES.get(normalizedAddress) ?? symbol;
}

function getSdkEarnStrategyStatus(strategy) {
  if ((strategy?.removableAt ?? 0) > 0) return "pendingRemoval";
  if ((strategy?.allocationCap?.current ?? 0n) > 0n) return "active";
  return "inactive";
}

// ---------------------------------------------------------------------------
// Data fetching — uses only the indexer (as Euler Lite does)
// ---------------------------------------------------------------------------

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchLiteClassicVaultList(chainId) {
  const items = [];
  const seen = new Set();
  let page = 1;
  const limit = 100;
  while (true) {
    const result = await fetchJson(`${INDEXER_HOST}/v2/vault/list?chainId=${chainId}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chainId, page: String(page), limit: String(limit) }),
    });
    const batch = result.items ?? [];
    for (const item of batch) {
      const normalizedAddress = asLowerAddress(item?.vault);
      if (!normalizedAddress || seen.has(normalizedAddress)) continue;
      seen.add(normalizedAddress);
      items.push(item);
    }
    if (batch.length === 0) break;
    const total = Number(result.pagination?.total ?? items.length);
    if (items.length >= total || batch.length < limit) break;
    page += 1;
  }
  // Same filter as compare-sdk-app-vaults: exclude unverified placeholders
  return items.filter((item) => {
    const perspectives = Array.isArray(item.perspectives) ? item.perspectives : [];
    const governorType = typeof item.governorType === "string" ? item.governorType : "";
    if (perspectives.length === 0 && governorType === "UNKNOWN") return false;
    return true;
  });
}

async function fetchLiteEarnVaultList(chainId) {
  const items = [];
  let skip = 0;
  const take = 100;
  while (true) {
    const query = new URLSearchParams({ chainId: String(chainId), skip: String(skip), take: String(take) });
    const result = await fetchJson(`${INDEXER_HOST}/v1/earn/vaults?${query.toString()}`);
    const batch = result.items ?? [];
    items.push(...batch);
    if (batch.length === 0) break;
    const total = Number(result.pagination?.total ?? items.length);
    skip += batch.length;
    if (skip >= total || batch.length < take) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Comparison: Classic vaults (indexer list → SDK)
// ---------------------------------------------------------------------------

function compareClassicVault(liteVault, sdkVault) {
  const issues = [];

  // Normalize indexer field names:
  //   indexer "totalBorrows" → SDK "totalBorrowed"
  //   indexer "cash"         → SDK "totalCash"
  const liteTotalAssets = toBigint(liteVault.totalAssets) ?? 0n;
  const liteTotalShares = toBigint(liteVault.totalShares) ?? 0n;
  const liteTotalBorrowed = toBigint(liteVault.totalBorrows) ?? 0n;
  const liteTotalCash = toBigint(liteVault.cash) ?? 0n;
  const liteAssetDecimals = toNumber(liteVault.assetDecimals) ?? 18;
  const liteShareDecimals = toNumber(liteVault.vaultDecimals) ?? 18;
  const assetDecimals = sdkVault?.asset?.decimals ?? liteAssetDecimals;
  const shareDecimals = sdkVault?.shares?.decimals ?? liteShareDecimals;
  const chainId = sdkVault?.chainId ?? 1;

  // Indexer returns assetPrice as a USD number directly
  const litePriceUsd = toNumber(liteVault.assetPrice);
  const liteTotalAssetsUsd = liteVault.totalAssetsUSD;
  // Indexer "cashUSD" may or may not be present; compute from cash * price as fallback
  const liteCashUsd =
    litePriceUsd !== undefined
      ? Number(formatUnits(liteTotalCash, liteAssetDecimals)) * litePriceUsd
      : liteVault.cashUSD;

  const normalizedLiteAssetSymbol = normalizeAssetSymbol(chainId, liteVault.asset, liteVault.assetSymbol);
  const normalizedSdkAssetSymbol = normalizeAssetSymbol(chainId, sdkVault?.asset?.address, sdkVault?.asset?.symbol);

  // SDK price is a WAD bigint (18 decimals)
  const sdkPriceUsd = sdkVault?.marketPriceUsd ? Number(formatUnits(sdkVault.marketPriceUsd, 18)) : undefined;
  const sdkTotalAssetsUsd = sdkVault?.marketPriceUsd
    ? Number(formatUnits((sdkVault.totalAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18))
    : undefined;
  const sdkCashUsd = sdkVault?.marketPriceUsd
    ? Number(formatUnits((sdkVault.totalCash * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18))
    : undefined;

  compareText(issues, "name", liteVault.vaultName, sdkVault?.shares?.name);
  compareText(issues, "symbol", liteVault.vaultSymbol, sdkVault?.shares?.symbol);
  compareNumber(issues, "shareDecimals", liteShareDecimals, sdkVault?.shares?.decimals);
  compareAddress(issues, "assetAddress", liteVault.asset, sdkVault?.asset?.address);
  compareText(issues, "assetSymbol", normalizedLiteAssetSymbol, normalizedSdkAssetSymbol);
  compareNumber(issues, "assetDecimals", liteAssetDecimals, sdkVault?.asset?.decimals);
  compareBigint(issues, "totalAssets", liteTotalAssets, sdkVault?.totalAssets, assetDecimals);
  compareBigint(issues, "totalShares", liteTotalShares, sdkVault?.totalShares, shareDecimals);
  compareBigint(issues, "totalBorrowed", liteTotalBorrowed, sdkVault?.totalBorrowed, assetDecimals);
  compareBigint(issues, "totalCash", liteTotalCash, sdkVault?.totalCash, assetDecimals);
  compareCapBigint(issues, "supplyCap", liteVault.supplyCap, sdkVault?.caps?.supplyCap, assetDecimals);
  compareCapBigint(issues, "borrowCap", liteVault.borrowCap, sdkVault?.caps?.borrowCap, assetDecimals);
  compareNumber(
    issues,
    "utilization",
    liteVault.utilization,
    sdkVault ? Number(sdkVault.totalBorrowed) / Number(sdkVault.totalAssets || 1n) : undefined,
  );
  compareNumberAllowMissingLite(issues, "assetPriceUsd", litePriceUsd, sdkPriceUsd);
  compareNumberAllowZeroLiteMissingSdk(issues, "totalAssetsUsd", liteTotalAssetsUsd, sdkTotalAssetsUsd);
  compareNumberAllowZeroLiteMissingSdk(issues, "cashUsd", liteCashUsd, sdkCashUsd);

  // APY: indexer values are in percentage, SDK in decimal → multiply SDK by 100
  compareNumber(
    issues,
    "supplyApy.base",
    liteVault.supplyApy?.baseApy,
    sdkVault?.interestRates?.supplyAPY ? Number(sdkVault.interestRates.supplyAPY) * 100 : undefined,
  );
  compareNumber(
    issues,
    "supplyApy.rewards",
    liteVault.supplyApy?.rewardApy,
    sdkVault?.rewards?.totalRewardsApr ? sdkVault.rewards.totalRewardsApr * 100 : 0,
  );
  compareNumber(
    issues,
    "borrowApy.base",
    liteVault.borrowApy?.baseApy,
    sdkVault?.interestRates?.borrowAPY ? Number(sdkVault.interestRates.borrowAPY) * 100 : undefined,
  );
  compareAddress(issues, "governorAdmin", liteVault.governorAdmin, sdkVault?.governorAdmin);

  return issues;
}

// ---------------------------------------------------------------------------
// Comparison: Earn vaults (indexer v1/earn → SDK)
// ---------------------------------------------------------------------------

function compareEarnVault(liteVault, sdkVault) {
  const issues = [];
  const assetDecimals = sdkVault?.asset?.decimals ?? toNumber(liteVault.assetDecimals) ?? 18;
  const shareDecimals = sdkVault?.shares?.decimals ?? toNumber(liteVault.vaultDecimals) ?? 18;

  // Indexer v1/earn/vaults returns APY as percentages (0.175 = 0.175%).
  // V3 adapter's supplyApy1h is also in percentages → compare directly.
  // Onchain adapter's supplyApy1h is a raw fraction (0.00175 = 0.175%) → multiply by 100.
  const sdkSupplyApyForComparison =
    sdkVault?.supplyApy1h != null
      ? ADAPTER_MODE === "onchain" ? sdkVault.supplyApy1h * 100 : sdkVault.supplyApy1h
      : sdkVault?.supplyApy1h;
  // Indexer performanceFee is WAD string, SDK is 0–1 decimal
  const sdkPerformanceFee = sdkVault?.performanceFee !== undefined ? sdkVault.performanceFee * 1e18 : undefined;

  const sdkPriceUsd = sdkVault?.marketPriceUsd ? Number(formatUnits(sdkVault.marketPriceUsd, 18)) : undefined;
  const sdkTotalAssetsUsd = sdkVault?.marketPriceUsd
    ? Number(formatUnits((sdkVault.totalAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18))
    : undefined;
  const sdkAvailableAssetsUsd = sdkVault?.marketPriceUsd
    ? Number(formatUnits((sdkVault.availableAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18))
    : undefined;

  compareText(issues, "name", liteVault.vaultName, sdkVault?.shares?.name);
  compareText(issues, "symbol", liteVault.vaultSymbol, sdkVault?.shares?.symbol);
  compareNumber(issues, "shareDecimals", liteVault.vaultDecimals, sdkVault?.shares?.decimals);
  compareAddress(issues, "assetAddress", liteVault.asset, sdkVault?.asset?.address);
  compareText(issues, "assetSymbol", liteVault.assetSymbol, sdkVault?.asset?.symbol);
  compareNumber(issues, "assetDecimals", liteVault.assetDecimals, sdkVault?.asset?.decimals);
  compareBigint(issues, "totalAssets", liteVault.totalAssets, sdkVault?.totalAssets, assetDecimals);
  compareBigint(issues, "totalShares", liteVault.totalShares, sdkVault?.totalShares, shareDecimals);
  compareBigintAllowZeroLiteTinySdk(issues, "lostAssets", liteVault.lostAssets, sdkVault?.lostAssets, assetDecimals);
  compareBigint(issues, "availableAssets", liteVault.availableAssets, sdkVault?.availableAssets, assetDecimals);
  compareNumber(issues, "performanceFee", Number(liteVault.performanceFee), sdkPerformanceFee);
  compareNumberAllowMissingLite(issues, "assetPriceUsd", liteVault.assetPrice, sdkPriceUsd);
  compareNumberAllowZeroLiteMissingSdk(issues, "totalAssetsUsd", liteVault.totalAssetsUSD, sdkTotalAssetsUsd);
  compareNumberAllowZeroLiteMissingSdk(issues, "availableAssetsUsd", liteVault.availableAssetsUSD, sdkAvailableAssetsUsd);
  // Indexer returns apyCurrent=0 for vaults without APY data; SDK returns undefined/null.
  // Treat indexer 0 with SDK null/undefined as matching.
  // Use 5% tolerance for earn APY — the 1h aggregation window causes natural drift.
  {
    const liteApy = toNumber(liteVault.apyCurrent);
    const liteBaseApy = toNumber(liteVault.supplyApy?.baseApy);
    // Use == null to catch both null and undefined (SDK sets supplyApy1h to null, not undefined)
    if (!(liteApy === 0 && sdkSupplyApyForComparison == null)) {
      compareNumberWithTolerance(issues, "apyCurrent", liteVault.apyCurrent, sdkSupplyApyForComparison, 0.05);
    }
    if (!(liteBaseApy === 0 && sdkSupplyApyForComparison == null)) {
      compareNumberWithTolerance(issues, "supplyApy.base", liteVault.supplyApy?.baseApy, sdkSupplyApyForComparison, 0.05);
    }
  }
  compareNumber(
    issues,
    "supplyApy.rewards",
    liteVault.supplyApy?.rewardApy,
    sdkVault?.rewards?.totalRewardsApr ?? 0,
  );
  compareAddress(issues, "owner", liteVault.owner, sdkVault?.governance?.owner);
  compareAddress(issues, "creator", liteVault.creator, sdkVault?.governance?.creator);
  compareAddress(issues, "curator", liteVault.curator, sdkVault?.governance?.curator);
  compareGuardianAddress(issues, "guardian", liteVault.guardian, sdkVault?.governance?.guardian);
  compareAddress(issues, "feeReceiver", liteVault.feeReceiver, sdkVault?.governance?.feeReceiver);
  compareNumber(issues, "timelock", Number(liteVault.timelock), sdkVault?.governance?.timelock);

  // Strategy comparison
  const liteStrategies = [...(liteVault.strategies ?? [])]
    .map((item) => ({
      address: getAddress(item.strategy),
      allocatedAssets: item.allocatedAssets,
      currentAllocationCap: item.currentAllocationCap,
      pendingAllocationCap: item.pendingAllocationCap,
      removableAt: item.removableAt,
      status: item.status,
    }))
    .sort((a, b) => a.address.localeCompare(b.address));

  const sdkStrategies = [...(sdkVault?.strategies ?? [])]
    .map((item) => ({
      address: getAddress(item.address),
      allocatedAssets: item.allocatedAssets.toString(),
      currentAllocationCap: item.allocationCap.current.toString(),
      pendingAllocationCap: item.allocationCap.pending.toString(),
      removableAt: item.removableAt,
      status: getSdkEarnStrategyStatus(item),
    }))
    .sort((a, b) => a.address.localeCompare(b.address));

  compareNumber(issues, "strategies.count", liteStrategies.length, sdkStrategies.length);

  for (const liteStrategy of liteStrategies) {
    const sdkStrategy = sdkStrategies.find((item) => item.address === liteStrategy.address);
    if (!sdkStrategy) {
      addIssue(issues, { field: "strategy.missing", lite: liteStrategy.address, sdk: null, kind: "missing" });
      continue;
    }
    compareBigint(
      issues,
      `strategy.${liteStrategy.address}.allocatedAssets`,
      liteStrategy.allocatedAssets,
      sdkStrategy.allocatedAssets,
      assetDecimals,
    );
    compareBigint(
      issues,
      `strategy.${liteStrategy.address}.currentAllocationCap`,
      liteStrategy.currentAllocationCap,
      sdkStrategy.currentAllocationCap,
      assetDecimals,
    );
    compareBigint(
      issues,
      `strategy.${liteStrategy.address}.pendingAllocationCap`,
      liteStrategy.pendingAllocationCap,
      sdkStrategy.pendingAllocationCap,
      assetDecimals,
    );
    compareNumber(
      issues,
      `strategy.${liteStrategy.address}.removableAt`,
      Number(liteStrategy.removableAt),
      sdkStrategy.removableAt,
    );
    compareText(issues, `strategy.${liteStrategy.address}.status`, liteStrategy.status, sdkStrategy.status);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// SDK configuration
// ---------------------------------------------------------------------------

function buildSdkOptions() {
  const comparisonRpcUrls = Object.fromEntries(
    Object.entries(RPC_URLS).filter(([chainId]) => CHAIN_IDS.includes(Number(chainId))),
  );
  const onchainSupportedRpcUrls = Object.fromEntries(
    Object.entries(RPC_URLS).filter(([chainId]) =>
      LITE_SUPPORTED_CHAINS.includes(Number(chainId)),
    ),
  );

  const common = {
    config: { rpcUrls: ADAPTER_MODE === "onchain" ? onchainSupportedRpcUrls : comparisonRpcUrls },
    pricingServiceConfig: { endpoint: INDEXER_HOST },
    intrinsicApyServiceConfig: {
      v3AdapterConfig: {
        endpoint: V3_HOST,
      },
    },
  };

  if (ADAPTER_MODE === "onchain") {
    return {
      ...common,
      eVaultServiceConfig: { adapter: "onchain" },
      eulerEarnServiceConfig: { adapter: "onchain" },
      accountServiceConfig: { adapter: "onchain" },
    };
  }

  return {
    ...common,
    eVaultServiceConfig: { adapter: "v3", endpoint: V3_HOST },
    eulerEarnServiceConfig: { adapter: "v3", endpoint: V3_HOST },
    vaultTypeAdapterConfig: { adapter: "v3", endpoint: V3_HOST },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[lite-parity] adapter=${ADAPTER_MODE} chains=${CHAIN_IDS.join(",")}`);

  const sdk = await buildEulerSDK(buildSdkOptions());

  const report = {
    generatedAt: new Date().toISOString(),
    adapterMode: ADAPTER_MODE,
    source: "euler-lite (indexer)",
    classic: [],
    earn: [],
    summary: {
      classic: { liteVaults: 0, sdkMatches: 0, missingInSdk: 0, vaultsWithDiffs: 0, fieldDiffs: {} },
      earn: { liteVaults: 0, sdkMatches: 0, missingInSdk: 0, vaultsWithDiffs: 0, fieldDiffs: {} },
    },
  };

  for (const chainId of CHAIN_IDS) {
    console.error(`[lite-parity] processing chain ${chainId}...`);

    // ---- Fetch Euler Lite (indexer) data ----
    let liteClassicList = [];
    let liteEarnList = [];
    try {
      liteClassicList = await fetchLiteClassicVaultList(chainId);
      console.error(`[lite-parity]   classic vaults from indexer: ${liteClassicList.length}`);
    } catch (err) {
      console.error(`[lite-parity]   failed to fetch classic vaults: ${err.message}`);
    }
    try {
      liteEarnList = await fetchLiteEarnVaultList(chainId);
      console.error(`[lite-parity]   earn vaults from indexer: ${liteEarnList.length}`);
    } catch (err) {
      console.error(`[lite-parity]   failed to fetch earn vaults: ${err.message}`);
    }

    // ---- Fetch SDK data ----
    let sdkClassicRaw = [];
    let sdkEarnRaw = [];
    try {
      const classicResult = await sdk.eVaultService.fetchAllVaults(chainId, {
        options: {
          populateCollaterals: true,
          populateMarketPrices: true,
          populateRewards: true,
          populateIntrinsicApy: true,
          populateLabels: true,
        },
      });
      sdkClassicRaw = classicResult.result;
      console.error(`[lite-parity]   classic vaults from SDK: ${sdkClassicRaw.length}`);
    } catch (err) {
      console.error(`[lite-parity]   failed to fetch SDK classic vaults: ${err.message}`);
    }
    try {
      const earnResult = await sdk.eulerEarnService.fetchAllVaults(chainId, {
        options: {
          populateStrategyVaults: true,
          eVaultFetchOptions: { populateMarketPrices: true },
          populateMarketPrices: true,
          populateRewards: true,
          populateIntrinsicApy: true,
          populateLabels: true,
        },
      });
      sdkEarnRaw = earnResult.result;
      console.error(`[lite-parity]   earn vaults from SDK: ${sdkEarnRaw.length}`);
    } catch (err) {
      console.error(`[lite-parity]   failed to fetch SDK earn vaults: ${err.message}`);
    }

    const sdkClassic = new Map(sdkClassicRaw.filter(Boolean).map((vault) => [getAddress(vault.address), vault]));
    const sdkEarn = new Map(sdkEarnRaw.filter(Boolean).map((vault) => [getAddress(vault.address), vault]));

    // ---- Compare classic vaults ----
    report.summary.classic.liteVaults += liteClassicList.length;
    for (const liteVault of liteClassicList) {
      const address = getAddress(liteVault.vault);
      const sdkVault = sdkClassic.get(address);
      if (!sdkVault) {
        report.summary.classic.missingInSdk += 1;
        report.classic.push({ chainId, address, status: "missing_in_sdk", issues: [] });
        continue;
      }
      report.summary.classic.sdkMatches += 1;
      const issues = compareClassicVault(liteVault, sdkVault);
      if (issues.length > 0) {
        report.summary.classic.vaultsWithDiffs += 1;
        for (const issue of issues) {
          report.summary.classic.fieldDiffs[issue.field] = (report.summary.classic.fieldDiffs[issue.field] ?? 0) + 1;
        }
      }
      report.classic.push({ chainId, address, status: issues.length > 0 ? "diff" : "match", issues });
    }

    // ---- Compare earn vaults ----
    report.summary.earn.liteVaults += liteEarnList.length;
    for (const liteVault of liteEarnList) {
      const address = getAddress(liteVault.vault);
      const sdkVault = sdkEarn.get(address);
      if (!sdkVault) {
        report.summary.earn.missingInSdk += 1;
        report.earn.push({ chainId, address, status: "missing_in_sdk", issues: [] });
        continue;
      }
      report.summary.earn.sdkMatches += 1;
      const issues = compareEarnVault(liteVault, sdkVault);
      if (issues.length > 0) {
        report.summary.earn.vaultsWithDiffs += 1;
        for (const issue of issues) {
          report.summary.earn.fieldDiffs[issue.field] = (report.summary.earn.fieldDiffs[issue.field] ?? 0) + 1;
        }
      }
      report.earn.push({ chainId, address, status: issues.length > 0 ? "diff" : "match", issues });
    }
  }

  // ---- Print summary to stderr ----
  console.error(`\n[lite-parity] ===== SUMMARY =====`);
  console.error(`[lite-parity] Classic: ${report.summary.classic.liteVaults} lite vaults, ${report.summary.classic.sdkMatches} SDK matches, ${report.summary.classic.missingInSdk} missing, ${report.summary.classic.vaultsWithDiffs} with diffs`);
  if (Object.keys(report.summary.classic.fieldDiffs).length > 0) {
    console.error(`[lite-parity]   field diffs: ${JSON.stringify(report.summary.classic.fieldDiffs)}`);
  }
  console.error(`[lite-parity] Earn: ${report.summary.earn.liteVaults} lite vaults, ${report.summary.earn.sdkMatches} SDK matches, ${report.summary.earn.missingInSdk} missing, ${report.summary.earn.vaultsWithDiffs} with diffs`);
  if (Object.keys(report.summary.earn.fieldDiffs).length > 0) {
    console.error(`[lite-parity]   field diffs: ${JSON.stringify(report.summary.earn.fieldDiffs)}`);
  }

  // ---- Full JSON report to stdout ----
  console.log(JSON.stringify(report, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
