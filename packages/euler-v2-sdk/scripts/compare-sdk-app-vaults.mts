import { buildEulerSDK } from "../dist/src/sdk/buildSDK.js";
import { formatUnits, getAddress } from "viem";

const APP_HOST = process.env.APP_HOST ?? "https://app.euler.finance";
const INDEXER_HOST = process.env.INDEXER_HOST ?? "https://indexer.euler.finance";
const V3_HOST = process.env.V3_HOST ?? "https://v3staging.eul.dev";
const ADAPTER_MODE = (process.env.ADAPTER_MODE ?? "v3").toLowerCase();

const DEFAULT_CHAIN_IDS = [
  1, 10, 56, 100, 130, 143, 146, 239, 480, 999, 1923, 5000, 8453, 9745, 42161,
  43114, 57073, 59144, 60808, 80094,
];
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

function asLowerAddress(value) {
  return value ? getAddress(value).toLowerCase() : undefined;
}

function meaningful(value) {
  return value !== undefined && value !== null;
}

function toBigint(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return undefined;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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

function compareText(issues, field, appValue, sdkValue) {
  if (!meaningful(appValue) && !meaningful(sdkValue)) return;
  if ((appValue ?? null) !== (sdkValue ?? null)) {
    addIssue(issues, { field, app: appValue ?? null, sdk: sdkValue ?? null, kind: "text" });
  }
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

function compareNumber(issues, field, appValue, sdkValue) {
  const appNum = toNumber(appValue);
  const sdkNum = toNumber(sdkValue);
  if (appNum === undefined && sdkNum === undefined) return;
  if (appNum === undefined || sdkNum === undefined) {
    addIssue(issues, { field, app: appValue ?? null, sdk: sdkValue ?? null, kind: "number" });
    return;
  }
  const pct = numberPctDiff(appNum, sdkNum);
  if (pct > ONE_PERCENT) {
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
  let page = 1;
  const limit = 100;
  while (true) {
    const result = await fetchJson(`${INDEXER_HOST}/v2/vault/list?chainId=${chainId}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chainId, page: String(page), limit: String(limit) }),
    });
    const batch = result.items ?? [];
    items.push(...batch);
    if (batch.length === 0) break;
    const total = Number(result.pagination?.total ?? items.length);
    if (items.length >= total || batch.length < limit) break;
    page += 1;
  }
  return items;
}

async function fetchAppClassicVaultDetails(chainId, addresses) {
  const out = new Map();
  const batchSize = 40;
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const query = new URLSearchParams({ chainId: String(chainId), vaults: batch.join(",") });
    const result = await fetchJson(`${APP_HOST}/api/v1/vault?${query.toString()}`);
    for (const [address, value] of Object.entries(result ?? {})) {
      out.set(getAddress(address), value);
    }
  }
  return out;
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

function compareClassicVault(appListItem, appDetail, sdkVault) {
  const issues = [];
  const assetDecimals = sdkVault?.asset?.decimals ?? appListItem.assetDecimals ?? 18;
  const shareDecimals = sdkVault?.shares?.decimals ?? appListItem.vaultDecimals ?? 18;

  compareText(issues, "name", appListItem.vaultName, sdkVault?.shares?.name);
  compareText(issues, "symbol", appListItem.vaultSymbol, sdkVault?.shares?.symbol);
  compareNumber(issues, "shareDecimals", appListItem.vaultDecimals, sdkVault?.shares?.decimals);
  compareAddress(issues, "assetAddress", appListItem.asset, sdkVault?.asset?.address);
  compareText(issues, "assetSymbol", appListItem.assetSymbol, sdkVault?.asset?.symbol);
  compareNumber(issues, "assetDecimals", appListItem.assetDecimals, sdkVault?.asset?.decimals);
  compareBigint(issues, "totalAssets", appListItem.totalAssets, sdkVault?.totalAssets, assetDecimals);
  compareBigint(issues, "totalShares", appListItem.totalShares, sdkVault?.totalShares, shareDecimals);
  compareBigint(issues, "totalBorrowed", appListItem.totalBorrows, sdkVault?.totalBorrowed, assetDecimals);
  compareBigint(issues, "totalCash", appListItem.cash, sdkVault?.totalCash, assetDecimals);
  compareBigint(issues, "supplyCap", appListItem.supplyCap, sdkVault?.caps?.supplyCap, assetDecimals);
  compareBigint(issues, "borrowCap", appListItem.borrowCap, sdkVault?.caps?.borrowCap, assetDecimals);
  compareNumber(issues, "utilization", appListItem.utilization, sdkVault ? Number(sdkVault.totalBorrowed) / Number(sdkVault.totalAssets || 1n) : undefined);
  compareNumber(issues, "assetPriceUsd", appListItem.assetPrice, sdkVault?.marketPriceUsd ? Number(formatUnits(sdkVault.marketPriceUsd, 18)) : undefined);
  compareNumber(issues, "totalAssetsUsd", appListItem.totalAssetsUSD, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.totalAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "cashUsd", appListItem.cashUSD, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.totalCash * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "supplyApy.base", appListItem.supplyApy?.baseApy, sdkVault?.interestRates?.supplyAPY ? Number(sdkVault.interestRates.supplyAPY) * 100 : undefined);
  compareNumber(issues, "supplyApy.rewards", appListItem.supplyApy?.rewardApy, sdkVault?.rewards?.totalRewardsApr ? sdkVault.rewards.totalRewardsApr * 100 : 0);
  compareNumber(issues, "borrowApy.base", appListItem.borrowApy?.baseApy, sdkVault?.interestRates?.borrowAPY ? Number(sdkVault.interestRates.borrowAPY) * 100 : undefined);
  compareNumber(issues, "intrinsicApy", appListItem.intrinsicApy?.apy, sdkVault?.intrinsicApy?.apy);
  compareAddress(issues, "governorAdmin", appListItem.governorAdmin, sdkVault?.governorAdmin);

  if (appDetail) {
    compareAddress(issues, "dToken", appDetail.dToken, sdkVault?.dToken);
    compareAddress(issues, "balanceTracker", appDetail.balanceTrackerAddress, sdkVault?.balanceTracker);
    compareAddress(issues, "unitOfAccount", appDetail.unitOfAccount, sdkVault?.unitOfAccount?.address);
    compareText(issues, "unitOfAccountSymbol", appDetail.unitOfAccountSymbol, sdkVault?.unitOfAccount?.symbol);

    const appCollaterals = [...(appDetail.collateralLTVInfo ?? [])].map((item) => ({
      address: getAddress(item.collateral),
      borrowLTV: Number(item.borrowLTV),
      liquidationLTV: Number(item.liquidationLTV),
    })).sort((a, b) => a.address.localeCompare(b.address));
    const sdkCollaterals = [...(sdkVault?.collaterals ?? [])].map((item) => ({
      address: getAddress(item.address),
      borrowLTV: item.borrowLTV,
      liquidationLTV: item.liquidationLTV,
    })).sort((a, b) => a.address.localeCompare(b.address));

    compareNumber(issues, "collaterals.count", appCollaterals.length, sdkCollaterals.length);
    for (const appCollateral of appCollaterals) {
      const sdkCollateral = sdkCollaterals.find((item) => item.address === appCollateral.address);
      if (!sdkCollateral) {
        addIssue(issues, { field: "collateral.missing", app: appCollateral.address, sdk: null, kind: "missing" });
        continue;
      }
      compareNumber(issues, `collateral.${appCollateral.address}.borrowLTV`, appCollateral.borrowLTV, sdkCollateral.borrowLTV);
      compareNumber(issues, `collateral.${appCollateral.address}.liquidationLTV`, appCollateral.liquidationLTV, sdkCollateral.liquidationLTV);
    }
  }

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
  compareNumber(issues, "assetPriceUsd", appVault.assetPrice, sdkVault?.marketPriceUsd ? Number(formatUnits(sdkVault.marketPriceUsd, 18)) : undefined);
  compareNumber(issues, "totalAssetsUsd", appVault.totalAssetsUSD, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.totalAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "availableAssetsUsd", appVault.availableAssetsUSD, sdkVault?.marketPriceUsd ? Number(formatUnits((sdkVault.availableAssets * sdkVault.marketPriceUsd) / 10n ** BigInt(assetDecimals), 18)) : undefined);
  compareNumber(issues, "apyCurrent", appVault.apyCurrent, sdkVault?.supplyApy ? sdkVault.supplyApy * 100 : undefined);
  compareNumber(issues, "supplyApy.base", appVault.supplyApy?.baseApy, sdkVault?.supplyApy ? sdkVault.supplyApy * 100 : undefined);
  compareNumber(issues, "supplyApy.rewards", appVault.supplyApy?.rewardApy, sdkVault?.rewards?.totalRewardsApr ? sdkVault.rewards.totalRewardsApr * 100 : 0);
  compareNumber(issues, "intrinsicApy", appVault.intrinsicApy?.apy, sdkVault?.intrinsicApy?.apy);
  compareAddress(issues, "owner", appVault.owner, sdkVault?.governance?.owner);
  compareAddress(issues, "creator", appVault.creator, sdkVault?.governance?.creator);
  compareAddress(issues, "curator", appVault.curator, sdkVault?.governance?.curator);
  compareAddress(issues, "guardian", appVault.guardian, sdkVault?.governance?.guardian);
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
    status: sdkVault.isPendingRemoval(item) ? "pendingRemoval" : "active",
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
  const onchainSupportedRpcUrls = Object.fromEntries(
    Object.entries(RPC_URLS).filter(([chainId]) =>
      [1, 56, 130, 143, 146, 239, 1923, 8453, 9745, 42161, 43114, 59144, 60808, 80094].includes(Number(chainId)),
    ),
  );

  const common = {
    rpcUrls: ADAPTER_MODE === "onchain" ? onchainSupportedRpcUrls : RPC_URLS,
    backendConfig: { endpoint: INDEXER_HOST },
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
      const issues = compareClassicVault(appVault, appClassicDetail.get(address), sdkVault);
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
