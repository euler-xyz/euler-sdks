import { buildEulerSDK } from "../../dist/src/sdk/buildSDK.js";
import { formatUnits, getAddress } from "viem";

const APP_HOST = process.env.APP_HOST ?? "https://app.euler.finance";
const INDEXER_HOST = process.env.INDEXER_HOST ?? "https://indexer.euler.finance";
const V3_HOST = process.env.V3_HOST ?? "https://v3staging.eul.dev";
const ADAPTER_MODE = (process.env.ADAPTER_MODE ?? "v3").toLowerCase();

const DEFAULT_CHAIN_IDS = [1];
const CHAIN_IDS = process.env.CHAIN_IDS
  ? process.env.CHAIN_IDS.split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
  : DEFAULT_CHAIN_IDS;

const RPC_URLS = {
  1: "https://ethereum-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
  100: "https://gnosis-rpc.publicnode.com",
  130: "https://mainnet.unichain.org",
  143: "https://rpc3.monad.xyz",
  146: "https://rpc.soniclabs.com",
  239: "https://rpc.tac.build",
  480: "https://worldchain-mainnet.g.alchemy.com/public",
  999: "https://rpc.hyperliquid.xyz/evm",
  1923: "https://swell-mainnet.alt.technology",
  5000: "https://mantle-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
  9745: "https://rpc.plasma.to",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  57073: "https://rpc-gel.inkonchain.com",
  59144: "https://linea-rpc.publicnode.com",
  60808: "https://rpc.gobob.xyz",
  80094: "https://rpc.berachain.com",
};

const ONE_PERCENT = 0.01;
const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USD_ADDRESS = "0x0000000000000000000000000000000000000348";

const MAINNET_CLASSIC_ASSET_SYMBOL_ALIASES = new Map([
  ["0xdcee70654261af21c44c093c300ed3bb97b78192", "WOETH"],
  ["0x35d8949372d46b7a3d5a56006ae77b215fc69bc0", "USD0++"],
]);

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

function addIssue(issues, issue) {
  issues.push(issue);
}

function compareAddress(issues, field, appValue, sdkValue) {
  if (!meaningful(appValue) && !meaningful(sdkValue)) return;
  if (asLowerAddress(appValue) !== asLowerAddress(sdkValue)) {
    addIssue(issues, { field, app: appValue ?? null, sdk: sdkValue ?? null, kind: "address" });
  }
}

function compareGuardianAddress(issues, field, appValue, sdkValue) {
  const normalizedApp = asLowerAddress(appValue);
  const normalizedSdk = asLowerAddress(sdkValue);

  if (normalizedApp === undefined && normalizedSdk === ZERO_ADDRESS) return;

  compareAddress(issues, field, appValue, sdkValue);
}

function compareText(issues, field, appValue, sdkValue) {
  if (!meaningful(appValue) && !meaningful(sdkValue)) return;
  if ((appValue ?? null) !== (sdkValue ?? null)) {
    addIssue(issues, { field, app: appValue ?? null, sdk: sdkValue ?? null, kind: "text" });
  }
}

function normalizeClassicAssetSymbol(chainId, assetAddress, symbol) {
  if (typeof symbol !== "string") return symbol;
  if (chainId !== 1) return symbol;

  const normalizedAddress = asLowerAddress(assetAddress);
  if (!normalizedAddress) return symbol;

  return MAINNET_CLASSIC_ASSET_SYMBOL_ALIASES.get(normalizedAddress) ?? symbol;
}

function compareBigint(issues, field, appValue, sdkValue, decimals = 18) {
  const appBig = toBigint(appValue);
  const sdkBig = toBigint(sdkValue);
  if (appBig === undefined && sdkBig === undefined) return;
  if (appBig === undefined || sdkBig === undefined) {
    addIssue(issues, { field, app: appValue ?? null, sdk: sdkValue ?? null, kind: "bigint" });
    return;
  }
  const pct = bigintPctDiff(appBig, sdkBig);
  if (pct > ONE_PERCENT) {
    addIssue(issues, {
      field,
      app: appBig.toString(),
      sdk: sdkBig.toString(),
      pctDiff: pct,
      display: { app: maybeFormatBigint(appBig, decimals), sdk: maybeFormatBigint(sdkBig, decimals) },
      kind: "bigint",
    });
  }
}

function compareCapBigint(issues, field, appValue, sdkValue, decimals = 18) {
  const appBig = toBigint(appValue);
  const sdkBig = toBigint(sdkValue);

  const appIsUncapped = appValue === null || appValue === undefined;
  const sdkIsUncapped = sdkBig === MAX_UINT256 || sdkBig === 0n;

  if (appIsUncapped && sdkIsUncapped) return;

  compareBigint(issues, field, appValue, sdkValue, decimals);
}

function getSdkEarnStrategyStatus(strategy) {
  if ((strategy?.removableAt ?? 0) > 0) return "pendingRemoval";
  if ((strategy?.allocationCap?.current ?? 0n) > 0n) return "active";
  return "inactive";
}

function compareNumber(issues, field, appValue, sdkValue) {
  compareNumberWithTolerance(issues, field, appValue, sdkValue, ONE_PERCENT);
}

function compareNumberAllowMissingApp(issues, field, appValue, sdkValue) {
  const appNum = toNumber(appValue);
  const sdkNum = toNumber(sdkValue);
  if (appNum === undefined && sdkNum !== undefined) return;
  compareNumber(issues, field, appValue, sdkValue);
}

function compareNumberAllowZeroAppMissingSdk(issues, field, appValue, sdkValue) {
  const appNum = toNumber(appValue);
  const sdkNum = toNumber(sdkValue);
  if (appNum === 0 && sdkNum === undefined) return;
  compareNumber(issues, field, appValue, sdkValue);
}

function compareNumberWithTolerance(issues, field, appValue, sdkValue, tolerance) {
  const appNum = toNumber(appValue);
  const sdkNum = toNumber(sdkValue);
  if (appNum === undefined && sdkNum === undefined) return;
  if (appNum === undefined || sdkNum === undefined) {
    addIssue(issues, { field, app: appValue ?? null, sdk: sdkValue ?? null, kind: "number" });
    return;
  }
  if (Math.max(Math.abs(appNum), Math.abs(sdkNum)) < 1e-12) return;
  const pct = numberPctDiff(appNum, sdkNum);
  if (pct > tolerance) {
    addIssue(issues, { field, app: appNum, sdk: sdkNum, pctDiff: pct, kind: "number" });
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchAppClassicVaultList(chainId) {
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
  return items.filter((item) => {
    const perspectives = Array.isArray(item.perspectives) ? item.perspectives : [];
    const governorType = typeof item.governorType === "string" ? item.governorType : "";

    // App list payload can include non-verified placeholder vaults with no perspectives
    // and unknown governance. Treat those as out of scope for parity checks.
    if (perspectives.length === 0 && governorType === "UNKNOWN") return false;

    return true;
  });
}

async function fetchAppClassicVaultDetails(chainId, addresses) {
  const out = new Map();
  const batchSize = 40;
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const query = new URLSearchParams({ chainId: String(chainId), vaults: batch.join(",") });
    try {
      const result = await fetchJson(`${APP_HOST}/api/v1/vault?${query.toString()}`);
      for (const [address, value] of Object.entries(result ?? {})) {
        const normalized = asLowerAddress(address);
        if (normalized) out.set(normalized, value);
      }
    } catch {}
  }
  return out;
}

function getAppClassicDetail(appClassicDetail, address) {
  const normalized = asLowerAddress(address);
  if (!normalized) return undefined;
  return appClassicDetail.get(normalized);
}

async function fetchAppEarnVaultList(chainId) {
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

async function fetchIndexerPrices(chainId, assets) {
  const addresses = [...new Set(assets.map((asset) => asLowerAddress(asset)).filter(Boolean))];
  const out = new Map();
  const batchSize = 100;

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const query = new URLSearchParams({ chainId: String(chainId), assets: batch.join(",") });
    const result = await fetchJson(`${INDEXER_HOST}/v1/prices?${query.toString()}`);
    for (const [address, value] of Object.entries(result ?? {})) {
      out.set(asLowerAddress(address), value);
    }
  }

  return out;
}

function getAppClassicCurrentPriceUsd(appListItem, appDetail, unitOfAccountPrices) {
  const appListPriceUsd = toNumber(appListItem.assetPrice);
  if (appListPriceUsd !== undefined) return appListPriceUsd;

  const resolvePriceUsd = (priceInfo) => {
    if (priceInfo?.queryFailure) return undefined;
    const amountOutMid = toBigint(priceInfo?.amountOutMid);
    const unitOfAccount = asLowerAddress(priceInfo?.unitOfAccount ?? appDetail?.unitOfAccount);
    if (amountOutMid === undefined || !unitOfAccount) return undefined;
    if (amountOutMid <= 0n) return undefined;

    const quote = Number(formatUnits(amountOutMid, unitOfAccountDecimals));
    if (!Number.isFinite(quote)) return undefined;
    if (unitOfAccount === USD_ADDRESS) return quote;

    const unitOfAccountPriceUsd = toNumber(unitOfAccountPrices.get(unitOfAccount)?.price);
    if (unitOfAccountPriceUsd === undefined) return undefined;

    return quote * unitOfAccountPriceUsd;
  };

  const unitOfAccountDecimals = toNumber(appDetail?.unitOfAccountDecimals) ?? 18;

  const primaryPriceUsd = resolvePriceUsd(appDetail?.liabilityPriceInfo);
  if (primaryPriceUsd !== undefined) return primaryPriceUsd;

  const backupPriceUsd = resolvePriceUsd(appDetail?.backupAssetPriceInfo);
  if (backupPriceUsd !== undefined) return backupPriceUsd;

  return appListItem.assetPrice;
}

function compareClassicVault(appListItem, appDetail, sdkVault, unitOfAccountPrices) {
  const issues = [];
  const appTotalAssets = toBigint(appDetail?.totalAssets) ?? toBigint(appListItem.totalAssets) ?? 0n;
  const appTotalShares = toBigint(appDetail?.totalShares) ?? toBigint(appListItem.totalShares) ?? 0n;
  const appTotalBorrowed = toBigint(appDetail?.totalBorrowed) ?? toBigint(appListItem.totalBorrows) ?? 0n;
  const appTotalCash = toBigint(appDetail?.totalCash) ?? toBigint(appListItem.cash) ?? 0n;
  const appAssetDecimals = toNumber(appDetail?.assetDecimals) ?? appListItem.assetDecimals ?? 18;
  const appShareDecimals = toNumber(appDetail?.vaultDecimals) ?? appListItem.vaultDecimals ?? 18;
  const assetDecimals = sdkVault?.asset?.decimals ?? appAssetDecimals ?? 18;
  const shareDecimals = sdkVault?.shares?.decimals ?? appShareDecimals ?? 18;
  const appCurrentPriceUsd = getAppClassicCurrentPriceUsd(appListItem, appDetail, unitOfAccountPrices);
  const appTotalAssetsUsd =
    appCurrentPriceUsd !== undefined
      ? Number(formatUnits(appTotalAssets, appAssetDecimals)) * appCurrentPriceUsd
      : appListItem.totalAssetsUSD;
  const appCashUsd =
    appCurrentPriceUsd !== undefined
      ? Number(formatUnits(appTotalCash, appAssetDecimals)) * appCurrentPriceUsd
      : appListItem.cashUSD;
  const normalizedAppAssetSymbol = normalizeClassicAssetSymbol(
    sdkVault?.chainId ?? 1,
    appListItem.asset,
    appListItem.assetSymbol,
  );
  const normalizedSdkAssetSymbol = normalizeClassicAssetSymbol(
    sdkVault?.chainId ?? 1,
    sdkVault?.asset?.address,
    sdkVault?.asset?.symbol,
  );

  compareText(issues, "name", appListItem.vaultName, sdkVault?.shares?.name);
  compareText(issues, "symbol", appListItem.vaultSymbol, sdkVault?.shares?.symbol);
  compareNumber(issues, "shareDecimals", appShareDecimals, sdkVault?.shares?.decimals);
  compareAddress(issues, "assetAddress", appListItem.asset, sdkVault?.asset?.address);
  compareText(issues, "assetSymbol", normalizedAppAssetSymbol, normalizedSdkAssetSymbol);
  compareNumber(issues, "assetDecimals", appAssetDecimals, sdkVault?.asset?.decimals);
  compareBigint(issues, "totalAssets", appTotalAssets, sdkVault?.totalAssets, assetDecimals);
  compareBigint(issues, "totalShares", appTotalShares, sdkVault?.totalShares, shareDecimals);
  compareBigint(issues, "totalBorrowed", appTotalBorrowed, sdkVault?.totalBorrowed, assetDecimals);
  compareBigint(issues, "totalCash", appTotalCash, sdkVault?.totalCash, assetDecimals);
  compareCapBigint(issues, "supplyCap", appListItem.supplyCap, sdkVault?.caps?.supplyCap, assetDecimals);
  compareCapBigint(issues, "borrowCap", appListItem.borrowCap, sdkVault?.caps?.borrowCap, assetDecimals);
  compareNumber(issues, "utilization", appListItem.utilization, sdkVault ? Number(sdkVault.totalBorrowed) / Number(sdkVault.totalAssets || 1n) : undefined);
  compareNumberAllowMissingApp(issues, "assetPriceUsd", appCurrentPriceUsd, sdkVault?.marketPriceUsd ? Number(formatUnits(sdkVault.marketPriceUsd, 18)) : undefined);
  compareNumberAllowZeroAppMissingSdk(issues, "totalAssetsUsd", appTotalAssetsUsd, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.totalAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumberAllowZeroAppMissingSdk(issues, "cashUsd", appCashUsd, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.totalCash * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "supplyApy.base", appListItem.supplyApy?.baseApy, sdkVault?.interestRates?.supplyAPY ? Number(sdkVault.interestRates.supplyAPY) * 100 : undefined);
  compareNumber(issues, "supplyApy.rewards", appListItem.supplyApy?.rewardApy, sdkVault?.rewards?.totalRewardsApr ? sdkVault.rewards.totalRewardsApr * 100 : 0);
  compareNumber(issues, "borrowApy.base", appListItem.borrowApy?.baseApy, sdkVault?.interestRates?.borrowAPY ? Number(sdkVault.interestRates.borrowAPY) * 100 : undefined);
  compareAddress(issues, "governorAdmin", appListItem.governorAdmin, sdkVault?.governorAdmin);

  return issues;
}

function compareEarnVault(appVault, sdkVault) {
  const issues = [];
  const assetDecimals = sdkVault?.asset?.decimals ?? appVault.assetDecimals ?? 18;
  const shareDecimals = sdkVault?.shares?.decimals ?? appVault.vaultDecimals ?? 18;

  compareText(issues, "name", appVault.vaultName, sdkVault?.shares?.name);
  compareText(issues, "symbol", appVault.vaultSymbol, sdkVault?.shares?.symbol);
  compareNumber(issues, "shareDecimals", appVault.vaultDecimals, sdkVault?.shares?.decimals);
  compareAddress(issues, "assetAddress", appVault.asset, sdkVault?.asset?.address);
  compareText(issues, "assetSymbol", appVault.assetSymbol, sdkVault?.asset?.symbol);
  compareNumber(issues, "assetDecimals", appVault.assetDecimals, sdkVault?.asset?.decimals);
  compareBigint(issues, "totalAssets", appVault.totalAssets, sdkVault?.totalAssets, assetDecimals);
  compareBigint(issues, "totalShares", appVault.totalShares, sdkVault?.totalShares, shareDecimals);
  compareBigint(issues, "lostAssets", appVault.lostAssets, sdkVault?.lostAssets, assetDecimals);
  compareBigint(issues, "availableAssets", appVault.availableAssets, sdkVault?.availableAssets, assetDecimals);
  compareNumber(issues, "performanceFee", Number(appVault.performanceFee), sdkVault?.performanceFee ? sdkVault.performanceFee * 1e18 : undefined);
  compareNumberAllowMissingApp(issues, "assetPriceUsd", appVault.assetPrice, sdkVault?.marketPriceUsd ? Number(formatUnits(sdkVault.marketPriceUsd, 18)) : undefined);
  compareNumber(issues, "totalAssetsUsd", appVault.totalAssetsUSD, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.totalAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "availableAssetsUsd", appVault.availableAssetsUSD, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.availableAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "apyCurrent", appVault.apyCurrent, sdkVault?.supplyApy ? sdkVault.supplyApy * 100 : undefined);
  compareNumber(issues, "supplyApy.base", appVault.supplyApy?.baseApy, sdkVault?.supplyApy ? sdkVault.supplyApy * 100 : undefined);
  compareNumber(issues, "supplyApy.rewards", appVault.supplyApy?.rewardApy, sdkVault?.rewards?.totalRewardsApr ? sdkVault.rewards.totalRewardsApr * 100 : 0);
  compareAddress(issues, "owner", appVault.owner, sdkVault?.governance?.owner);
  compareAddress(issues, "creator", appVault.creator, sdkVault?.governance?.creator);
  compareAddress(issues, "curator", appVault.curator, sdkVault?.governance?.curator);
  compareGuardianAddress(issues, "guardian", appVault.guardian, sdkVault?.governance?.guardian);
  compareAddress(issues, "feeReceiver", appVault.feeReceiver, sdkVault?.governance?.feeReceiver);
  compareNumber(issues, "timelock", Number(appVault.timelock), sdkVault?.governance?.timelock);

  const appStrategies = [...(appVault.strategies ?? [])].map((item) => ({
    address: getAddress(item.strategy),
    allocatedAssets: item.allocatedAssets,
    currentAllocationCap: item.currentAllocationCap,
    pendingAllocationCap: item.pendingAllocationCap,
    removableAt: item.removableAt,
    status: item.status,
  })).sort((a, b) => a.address.localeCompare(b.address));
  const sdkStrategies = [...(sdkVault?.strategies ?? [])].map((item) => ({
    address: getAddress(item.address),
    allocatedAssets: item.allocatedAssets.toString(),
    currentAllocationCap: item.allocationCap.current.toString(),
    pendingAllocationCap: item.allocationCap.pending.toString(),
    removableAt: item.removableAt,
    status: getSdkEarnStrategyStatus(item),
  })).sort((a, b) => a.address.localeCompare(b.address));

  compareNumber(issues, "strategies.count", appStrategies.length, sdkStrategies.length);
  for (const appStrategy of appStrategies) {
    const sdkStrategy = sdkStrategies.find((item) => item.address === appStrategy.address);
    if (!sdkStrategy) {
      addIssue(issues, { field: "strategy.missing", app: appStrategy.address, sdk: null, kind: "missing" });
      continue;
    }
    compareBigint(issues, `strategy.${appStrategy.address}.allocatedAssets`, appStrategy.allocatedAssets, sdkStrategy.allocatedAssets, assetDecimals);
    compareBigint(issues, `strategy.${appStrategy.address}.currentAllocationCap`, appStrategy.currentAllocationCap, sdkStrategy.currentAllocationCap, assetDecimals);
    compareBigint(issues, `strategy.${appStrategy.address}.pendingAllocationCap`, appStrategy.pendingAllocationCap, sdkStrategy.pendingAllocationCap, assetDecimals);
    compareNumber(issues, `strategy.${appStrategy.address}.removableAt`, Number(appStrategy.removableAt), sdkStrategy.removableAt);
    compareText(issues, `strategy.${appStrategy.address}.status`, appStrategy.status, sdkStrategy.status);
  }
  return issues;
}

function buildSdkOptions() {
  const comparisonRpcUrls = Object.fromEntries(
    Object.entries(RPC_URLS).filter(([chainId]) => CHAIN_IDS.includes(Number(chainId))),
  );
  const onchainSupportedRpcUrls = Object.fromEntries(
    Object.entries(RPC_URLS).filter(([chainId]) =>
      [1, 56, 130, 143, 146, 239, 1923, 8453, 9745, 42161, 43114, 59144, 60808, 80094].includes(Number(chainId)),
    ),
  );

  const common = {
    rpcUrls: ADAPTER_MODE === "onchain" ? onchainSupportedRpcUrls : comparisonRpcUrls,
    backendConfig: { endpoint: INDEXER_HOST },
    intrinsicApyServiceConfig: {
      adapter: "v3",
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

async function main() {
  const sdk = await buildEulerSDK(buildSdkOptions());
  const report = {
    generatedAt: new Date().toISOString(),
    adapterMode: ADAPTER_MODE,
    classic: [],
    earn: [],
    summary: {
      classic: { appVaults: 0, sdkMatches: 0, missingInSdk: 0, vaultsWithDiffs: 0, fieldDiffs: {} },
      earn: { appVaults: 0, sdkMatches: 0, missingInSdk: 0, vaultsWithDiffs: 0, fieldDiffs: {} },
    },
  };

  for (const chainId of CHAIN_IDS) {
    let appClassicList = [];
    let appClassicDetail = new Map();
    let appEarnList = [];

    try { appClassicList = await fetchAppClassicVaultList(chainId); } catch {}
    try {
      if (appClassicList.length > 0) {
        appClassicDetail = await fetchAppClassicVaultDetails(chainId, appClassicList.map((item) => getAddress(item.vault)));
      }
    } catch {}
    try { appEarnList = await fetchAppEarnVaultList(chainId); } catch {}

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
    } catch {}
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
    } catch {}

    const sdkClassic = new Map(sdkClassicRaw.filter(Boolean).map((vault) => [getAddress(vault.address), vault]));
    const sdkEarn = new Map(sdkEarnRaw.filter(Boolean).map((vault) => [getAddress(vault.address), vault]));
    let classicUnitOfAccountPrices = new Map();

    try {
      classicUnitOfAccountPrices = await fetchIndexerPrices(
        chainId,
        [...appClassicDetail.values()].map((detail) => detail?.liabilityPriceInfo?.unitOfAccount ?? detail?.unitOfAccount),
      );
    } catch {}

    report.summary.classic.appVaults += appClassicList.length;
    report.summary.earn.appVaults += appEarnList.length;

    for (const appVault of appClassicList) {
      const address = getAddress(appVault.vault);
      const sdkVault = sdkClassic.get(address);
      if (!sdkVault) {
        report.summary.classic.missingInSdk += 1;
        report.classic.push({ chainId, address, status: "missing_in_sdk", issues: [] });
        continue;
      }
      report.summary.classic.sdkMatches += 1;
      const issues = compareClassicVault(appVault, getAppClassicDetail(appClassicDetail, address), sdkVault, classicUnitOfAccountPrices);
      if (issues.length > 0) {
        report.summary.classic.vaultsWithDiffs += 1;
        for (const issue of issues) {
          report.summary.classic.fieldDiffs[issue.field] = (report.summary.classic.fieldDiffs[issue.field] ?? 0) + 1;
        }
      }
      report.classic.push({ chainId, address, status: issues.length > 0 ? "diff" : "match", issues });
    }

    for (const appVault of appEarnList) {
      const address = getAddress(appVault.vault);
      const sdkVault = sdkEarn.get(address);
      if (!sdkVault) {
        report.summary.earn.missingInSdk += 1;
        report.earn.push({ chainId, address, status: "missing_in_sdk", issues: [] });
        continue;
      }
      report.summary.earn.sdkMatches += 1;
      const issues = compareEarnVault(appVault, sdkVault);
      if (issues.length > 0) {
        report.summary.earn.vaultsWithDiffs += 1;
        for (const issue of issues) {
          report.summary.earn.fieldDiffs[issue.field] = (report.summary.earn.fieldDiffs[issue.field] ?? 0) + 1;
        }
      }
      report.earn.push({ chainId, address, status: issues.length > 0 ? "diff" : "match", issues });
    }
  }

  console.log(JSON.stringify(report, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
