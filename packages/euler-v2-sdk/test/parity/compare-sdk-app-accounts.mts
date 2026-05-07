import { buildEulerSDK } from "../../dist/src/sdk/buildSDK.js";
import { getAddress } from "viem";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIR, "../../examples/.env") });

const INDEXER_HOST = process.env.INDEXER_HOST ?? "https://indexer.euler.finance";
const V3_HOST = process.env.V3_HOST ?? "https://v3.eul.dev";
const MAINNET_CHAIN_ID = 1;
const TARGET_ACCOUNT = getAddress("0x75cFE4ef963232ae8313aC33e21fC39241338618");
const EXTRA_ACCOUNTS_TARGET = Number(process.env.EXTRA_ACCOUNTS_TARGET ?? 10);
const ACCOUNT_LIST_FILE = process.env.ACCOUNT_LIST_FILE;
const POPULAR_VAULT_LIMIT = Number(process.env.POPULAR_VAULT_LIMIT ?? 20);
const HOLDER_PAGES = Number(process.env.HOLDER_PAGES ?? 2);
const HOLDER_CONCURRENCY = Number(process.env.HOLDER_CONCURRENCY ?? 2);
const BIGINT_RELATIVE_TOLERANCE = Number(process.env.BIGINT_RELATIVE_TOLERANCE ?? 0.000001);
const MAX_INT256 = (1n << 255n) - 1n;
const MAX_INT256_MINUS_ONE = MAX_INT256 - 1n;
const RPC_URL =
  process.env.RPC_URL_1 ??
  process.env.MAINNET_RPC_URL ??
  "https://ethereum-rpc.publicnode.com";

function asAddress(value) {
  if (!value) return undefined;
  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

function asLowerAddress(value) {
  return asAddress(value)?.toLowerCase();
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

function compareAddress(issues, field, appValue, sdkValue) {
  if (!meaningful(appValue) && !meaningful(sdkValue)) return;
  if (asLowerAddress(appValue) !== asLowerAddress(sdkValue)) {
    issues.push({ field, kind: "address", app: appValue ?? null, sdk: sdkValue ?? null });
  }
}

function compareBoolean(issues, field, appValue, sdkValue) {
  if (!meaningful(appValue) && !meaningful(sdkValue)) return;
  if (Boolean(appValue) !== Boolean(sdkValue)) {
    issues.push({ field, kind: "boolean", app: Boolean(appValue), sdk: Boolean(sdkValue) });
  }
}

function compareText(issues, field, appValue, sdkValue) {
  if (!meaningful(appValue) && !meaningful(sdkValue)) return;
  if ((appValue ?? null) !== (sdkValue ?? null)) {
    issues.push({ field, kind: "text", app: appValue ?? null, sdk: sdkValue ?? null });
  }
}

function compareBigint(issues, field, appValue, sdkValue) {
  const appBig = toBigint(appValue);
  const sdkBig = toBigint(sdkValue);
  if (appBig === undefined && sdkBig === undefined) return;
  if (appBig === undefined || sdkBig === undefined) {
    issues.push({
      field,
      kind: "bigint",
      app: appBig?.toString() ?? appValue ?? null,
      sdk: sdkBig?.toString() ?? sdkValue ?? null,
    });
    return;
  }

  const pctDiff = bigintPctDiff(appBig, sdkBig);
  if (pctDiff !== undefined && pctDiff > BIGINT_RELATIVE_TOLERANCE) {
    issues.push({
      field,
      kind: "bigint",
      app: appBig.toString(),
      sdk: sdkBig.toString(),
      pctDiff,
    });
  }
}

function compareNumber(issues, field, appValue, sdkValue, tolerance = 1e-9) {
  const appNum = toNumber(appValue);
  const sdkNum = toNumber(sdkValue);
  if (appNum === undefined && sdkNum === undefined) return;
  if (appNum === undefined || sdkNum === undefined || Math.abs(appNum - sdkNum) > tolerance) {
    issues.push({ field, kind: "number", app: appNum ?? appValue ?? null, sdk: sdkNum ?? sdkValue ?? null });
  }
}

function compareAddressArray(issues, field, appValue, sdkValue) {
  const appList = [...new Set((appValue ?? []).map(asAddress).filter(Boolean))].sort();
  const sdkList = [...new Set((sdkValue ?? []).map(asAddress).filter(Boolean))].sort();
  if (JSON.stringify(appList) !== JSON.stringify(sdkList)) {
    issues.push({ field, kind: "address[]", app: appList, sdk: sdkList });
  }
}

function sortByAddress(items, field = "address") {
  return [...items].sort((a, b) => {
    const aa = asLowerAddress(a?.[field]) ?? "";
    const bb = asLowerAddress(b?.[field]) ?? "";
    return aa.localeCompare(bb);
  });
}

function normalizeDaysToLiquidation(value) {
  if (!meaningful(value)) return null;
  if (value === "Infinity" || value === "MoreThanAYear") return value;

  const asBigint = toBigint(value);
  if (asBigint === undefined) return String(value);
  if (asBigint === MAX_INT256) return "Infinity";
  if (asBigint === MAX_INT256_MINUS_ONE) return "MoreThanAYear";
  return Number.isSafeInteger(Number(asBigint)) ? Number(asBigint) : asBigint.toString();
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchJsonWithRetry(url, init, options = {}) {
  const retries = options.retries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 750;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchJson(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;

      const message = String(error?.message ?? error);
      const isRetriable =
        message.includes("HTTP 429") || message.includes("HTTP 500") || message.includes("HTTP 502") || message.includes("HTTP 503");
      if (!isRetriable) break;

      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapConcurrent(items, limit, fn) {
  const out = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      out[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function fetchPopularVaults(chainId, limit) {
  const result = await fetchJson(`${INDEXER_HOST}/v2/vault/list?chainId=${chainId}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ chainId, page: "1", limit: String(Math.max(limit, 50)) }),
  });

  return (result.items ?? [])
    .filter((item) => asAddress(item?.vault))
    .sort((a, b) => Number(b?.totalAssetsUSD ?? 0) - Number(a?.totalAssetsUSD ?? 0))
    .slice(0, limit)
    .map((item) => ({
      address: getAddress(item.vault),
      name: item.vaultName ?? null,
      symbol: item.vaultSymbol ?? null,
      assetSymbol: item.assetSymbol ?? null,
      totalAssetsUSD: Number(item.totalAssetsUSD ?? 0),
    }));
}

async function fetchVaultHolders(vault, pages) {
  const holders = [];
  const seen = new Set();

  for (let page = 1; page <= pages; page += 1) {
    const html = await fetch(`https://etherscan.io/token/generic-tokenholders2?a=${vault}&p=${page}`).then((response) =>
      response.text(),
    );
    const matches = [...html.matchAll(/data-clipboard-text='(0x[a-fA-F0-9]{40})'/g)].map((match) => match[1]);

    for (const match of matches) {
      const address = asAddress(match);
      if (!address || seen.has(address)) continue;
      seen.add(address);
      holders.push(address);
    }

    if (matches.length === 0) break;
  }

  return holders;
}

const appRowsCache = new Map();
const accountSummaryCache = new Map();

async function fetchAppAccountRows(address) {
  const normalized = getAddress(address);
  if (!appRowsCache.has(normalized)) {
    appRowsCache.set(
      normalized,
      (async () => {
        const rowsByKey = new Map();
        const pushMergedRow = (row) => {
          const account = asAddress(row?.account);
          const vault = asAddress(row?.vault);
          if (!account || !vault) return;

          const key = `${account.toLowerCase()}:${vault.toLowerCase()}`;
          const previous = rowsByKey.get(key) ?? {};
          rowsByKey.set(key, {
            ...previous,
            ...row,
            account,
            vault,
            asset: row.asset ?? previous.asset,
            shares: row.shares ?? previous.shares ?? "0",
            assets: row.assets ?? previous.assets ?? "0",
            borrowed: row.borrowed ?? previous.borrowed ?? "0",
            isController: meaningful(row.isController) ? row.isController : previous.isController,
            isCollateral: meaningful(row.isCollateral) ? row.isCollateral : previous.isCollateral,
            balanceForwarderEnabled: meaningful(row.balanceForwarderEnabled)
              ? row.balanceForwarderEnabled
              : previous.balanceForwarderEnabled,
            subAccount: row.subAccount ?? previous.subAccount,
            liquidity: row.liquidity ?? previous.liquidity ?? null,
          });
        };

        const v3Url = `${V3_HOST.replace(/\/+$/, "")}/v3/accounts/${normalized}/positions?chainId=${MAINNET_CHAIN_ID}`;
        const v3Result = await fetchJsonWithRetry(v3Url).catch(() => undefined);
        for (const row of v3Result?.data ?? []) {
          pushMergedRow({
            account: row.account,
            vault: row.vault,
            asset: row.asset,
            shares: row.shares ?? "0",
            assets: row.assets ?? "0",
            borrowed: row.borrowed ?? row.debt ?? "0",
            isController: Boolean(row.isController),
            isCollateral: Boolean(row.isCollateral),
            balanceForwarderEnabled: Boolean(row.balanceForwarderEnabled),
            subAccount: row.subAccount
              ? {
                  owner: asAddress(row.subAccount.owner) ?? normalized,
                  timestamp: toNumber(row.subAccount.timestamp) ?? 0,
                  lastAccountStatusCheckTimestamp: toNumber(row.subAccount.lastAccountStatusCheckTimestamp) ?? 0,
                  enabledControllers: (row.subAccount.enabledControllers ?? []).map((item) => getAddress(item)),
                  enabledCollaterals: (row.subAccount.enabledCollaterals ?? []).map((item) => getAddress(item)),
                  isLockdownMode: Boolean(row.subAccount.isLockdownMode),
                  isPermitDisabledMode: Boolean(row.subAccount.isPermitDisabledMode),
                }
              : undefined,
            liquidity: row.liquidity ?? null,
          });
        }

        const v2Url = `${INDEXER_HOST.replace(/\/+$/, "")}/v2/account/positions?chainId=${MAINNET_CHAIN_ID}&address=${normalized}`;
        const result = await fetchJson(v2Url).catch(() => undefined);
        if (!result || typeof result !== "object") return [...rowsByKey.values()];

        for (const entry of Object.values(result)) {
          const evcAccountInfo = entry?.evcAccountInfo;
          const subAccount = evcAccountInfo?.account ? getAddress(evcAccountInfo.account) : undefined;
          if (!subAccount) continue;

          const sharedSubAccount = {
            owner: asAddress(evcAccountInfo?.owner) ?? normalized,
            timestamp: toNumber(evcAccountInfo?.timestamp) ?? 0,
            lastAccountStatusCheckTimestamp: toNumber(evcAccountInfo?.lastAccountStatusCheckTimestamp) ?? 0,
            enabledControllers: (evcAccountInfo?.enabledControllers ?? []).map((item) => getAddress(item)),
            enabledCollaterals: (evcAccountInfo?.enabledCollaterals ?? []).map((item) => getAddress(item)),
            isLockdownMode: Boolean(evcAccountInfo?.isLockdownMode),
            isPermitDisabledMode: Boolean(evcAccountInfo?.isPermitDisabledMode),
          };

          const pushPosition = (positionLike) => {
            if (!positionLike?.vault) return;
            pushMergedRow({
              account: subAccount,
              vault: getAddress(positionLike.vault),
              asset: asAddress(positionLike.asset),
              shares: positionLike.shares ?? "0",
              assets: positionLike.assets ?? "0",
              borrowed: positionLike.borrowed ?? "0",
              isController: Boolean(positionLike.isController),
              isCollateral: Boolean(positionLike.isCollateral),
              balanceForwarderEnabled: Boolean(positionLike.balanceForwarderEnabled),
              subAccount: sharedSubAccount,
              liquidity: positionLike.isController && positionLike.liquidityInfo
                ? {
                    vaultAddress: positionLike.liquidityInfo.vault,
                    unitOfAccount: positionLike.liquidityInfo.unitOfAccount,
                    daysToLiquidation: normalizeDaysToLiquidation(positionLike.liquidityInfo.timeToLiquidation),
                    liabilityValue: {
                      borrowing: positionLike.liquidityInfo.liabilityValueBorrowing ?? "0",
                      liquidation: positionLike.liquidityInfo.liabilityValueLiquidation ?? "0",
                      oracleMid: positionLike.liquidityInfo.liabilityValueLiquidation ?? "0",
                    },
                    totalCollateralValue: {
                      borrowing: positionLike.liquidityInfo.collateralValueBorrowing ?? "0",
                      liquidation: positionLike.liquidityInfo.collateralValueLiquidation ?? "0",
                      oracleMid: positionLike.liquidityInfo.collateralValueRaw ?? "0",
                    },
                    collaterals: (positionLike.liquidityInfo.collaterals ?? []).map((collateral, index) => ({
                      address: collateral,
                      value: {
                        borrowing: positionLike.liquidityInfo.collateralValuesBorrowing?.[index] ?? "0",
                        liquidation: positionLike.liquidityInfo.collateralValuesLiquidation?.[index] ?? "0",
                        oracleMid: positionLike.liquidityInfo.collateralValuesRaw?.[index] ?? "0",
                      },
                    })),
                  }
                : null,
            });
          };

          pushPosition(entry?.debt);
          for (const collateral of Object.values(entry?.collaterals ?? {})) {
            pushPosition(collateral);
          }
          for (const saving of Object.values(entry?.savings ?? {})) {
            pushPosition(saving);
          }
        }

        return [...rowsByKey.values()];
      })(),
    );
  }
  return appRowsCache.get(normalized);
}

function summarizeAppRows(rows, requestedAddress) {
  const normalizedRequested = getAddress(requestedAddress);
  const owner = asAddress(rows.find((row) => row?.subAccount?.owner)?.subAccount?.owner) ?? normalizedRequested;
  const grouped = new Map();

  for (const row of rows) {
    const subAccount = asAddress(row?.account);
    if (!subAccount) continue;
    const entry = grouped.get(subAccount) ?? { positions: 0, borrowedPositions: 0, totalBorrowed: 0n };
    entry.positions += 1;
    const borrowed = toBigint(row?.borrowed) ?? 0n;
    if (borrowed > 0n) entry.borrowedPositions += 1;
    entry.totalBorrowed += borrowed;
    grouped.set(subAccount, entry);
  }

  const activeSubAccounts = [...grouped.values()].filter((entry) => entry.positions > 0).length;
  const borrowingSubAccounts = [...grouped.values()].filter((entry) => entry.totalBorrowed > 0n).length;
  const borrowedPositions = [...grouped.values()].reduce((total, entry) => total + entry.borrowedPositions, 0);

  return {
    owner,
    activeSubAccounts,
    borrowingSubAccounts,
    borrowedPositions,
    rowCount: rows.length,
  };
}

async function inspectDiscoveredAccount(address) {
  const normalized = getAddress(address);
  if (accountSummaryCache.has(normalized)) {
    return accountSummaryCache.get(normalized);
  }

  const promise = (async () => {
    const initialRows = await fetchAppAccountRows(normalized);
    if (initialRows.length === 0) return undefined;

    const initialSummary = summarizeAppRows(initialRows, normalized);
    if (initialSummary.owner === normalized) {
      return { ...initialSummary, rows: initialRows };
    }

    const ownerRows = await fetchAppAccountRows(initialSummary.owner);
    if (ownerRows.length === 0) {
      return { ...initialSummary, rows: initialRows };
    }

    const ownerSummary = summarizeAppRows(ownerRows, initialSummary.owner);
    return { ...ownerSummary, rows: ownerRows };
  })();

  accountSummaryCache.set(normalized, promise);
  return promise;
}

async function discoverComparisonAccounts() {
  const warnings = [];
  const explicitAccounts = [];
  const explicitOwners = new Set();

  if (ACCOUNT_LIST_FILE) {
    const contents = await fs.readFile(ACCOUNT_LIST_FILE, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const address = asAddress(trimmed);
      if (!address || explicitOwners.has(address)) continue;
      explicitOwners.add(address);
      explicitAccounts.push(address);
    }
  }

  if (explicitAccounts.length > 0) {
    const normalized = explicitAccounts.includes(TARGET_ACCOUNT)
      ? explicitAccounts
      : [TARGET_ACCOUNT, ...explicitAccounts.filter((address) => address !== TARGET_ACCOUNT)];

    return {
      warnings,
      targetSummary: null,
      accounts: normalized,
      discoveredExtras: explicitAccounts
        .filter((address) => address !== TARGET_ACCOUNT)
        .map((address) => ({ address, source: "account_list_file" })),
      scannedVaults: [],
    };
  }

  const selected = [];
  const selectedOwners = new Set([TARGET_ACCOUNT]);

  const targetSummary = await inspectDiscoveredAccount(TARGET_ACCOUNT);
  if (!targetSummary) {
    warnings.push(`Target account ${TARGET_ACCOUNT} returned no V3 rows.`);
  } else if (targetSummary.activeSubAccounts < 2 || targetSummary.borrowingSubAccounts < 1) {
    warnings.push(
      `Target account ${TARGET_ACCOUNT} does not currently meet the requested filter: activeSubAccounts=${targetSummary.activeSubAccounts}, borrowingSubAccounts=${targetSummary.borrowingSubAccounts}.`,
    );
  }

  const popularVaults = await fetchPopularVaults(MAINNET_CHAIN_ID, POPULAR_VAULT_LIMIT);

  for (const vault of popularVaults) {
    if (selected.length >= EXTRA_ACCOUNTS_TARGET) break;

    const holders = await fetchVaultHolders(vault.address, HOLDER_PAGES);
    const inspected = await mapConcurrent(holders, HOLDER_CONCURRENCY, async (holder) => {
      const summary = await inspectDiscoveredAccount(holder);
      return summary
        ? {
            holder,
            owner: summary.owner,
            activeSubAccounts: summary.activeSubAccounts,
            borrowingSubAccounts: summary.borrowingSubAccounts,
            borrowedPositions: summary.borrowedPositions,
            rowCount: summary.rowCount,
          }
        : undefined;
    });

    for (const entry of inspected) {
      if (!entry) continue;
      if (selectedOwners.has(entry.owner)) continue;
      if (entry.activeSubAccounts < 2 || entry.borrowingSubAccounts < 1) continue;

      selectedOwners.add(entry.owner);
      selected.push({
        address: entry.owner,
        sourceVault: vault.address,
        sourceVaultName: vault.name,
        sourceVaultSymbol: vault.symbol,
        sourceHolder: entry.holder,
        activeSubAccounts: entry.activeSubAccounts,
        borrowingSubAccounts: entry.borrowingSubAccounts,
        borrowedPositions: entry.borrowedPositions,
        rowCount: entry.rowCount,
      });

      if (selected.length >= EXTRA_ACCOUNTS_TARGET) break;
    }
  }

  if (selected.length < EXTRA_ACCOUNTS_TARGET) {
    warnings.push(`Discovered ${selected.length} additional eligible accounts, below the target of ${EXTRA_ACCOUNTS_TARGET}.`);
  }

  return {
    warnings,
    targetSummary: targetSummary
      ? {
          address: TARGET_ACCOUNT,
          activeSubAccounts: targetSummary.activeSubAccounts,
          borrowingSubAccounts: targetSummary.borrowingSubAccounts,
          borrowedPositions: targetSummary.borrowedPositions,
          rowCount: targetSummary.rowCount,
        }
      : null,
    accounts: [TARGET_ACCOUNT, ...selected.map((entry) => entry.address)],
    discoveredExtras: selected,
    scannedVaults: popularVaults,
  };
}

function normalizeLiquidity(liquidity) {
  if (!liquidity) return undefined;
  return {
    vaultAddress: asAddress(liquidity.vaultAddress),
    unitOfAccount: asAddress(liquidity.unitOfAccount),
    daysToLiquidation: meaningful(liquidity.daysToLiquidation) ? liquidity.daysToLiquidation : null,
    liabilityValue: liquidity.liabilityValue
      ? {
          borrowing: toBigint(liquidity.liabilityValue.borrowing) ?? 0n,
          liquidation: toBigint(liquidity.liabilityValue.liquidation) ?? 0n,
          oracleMid: toBigint(liquidity.liabilityValue.oracleMid) ?? 0n,
        }
      : undefined,
    totalCollateralValue: liquidity.totalCollateralValue
      ? {
          borrowing: toBigint(liquidity.totalCollateralValue.borrowing) ?? 0n,
          liquidation: toBigint(liquidity.totalCollateralValue.liquidation) ?? 0n,
          oracleMid: toBigint(liquidity.totalCollateralValue.oracleMid) ?? 0n,
        }
      : undefined,
    collaterals: sortByAddress(
      (liquidity.collaterals ?? []).map((collateral) => ({
        address: asAddress(collateral.address),
        value: {
          borrowing: toBigint(collateral.value?.borrowing) ?? 0n,
          liquidation: toBigint(collateral.value?.liquidation) ?? 0n,
          oracleMid: toBigint(collateral.value?.oracleMid) ?? 0n,
        },
      })),
    ),
  };
}

function normalizePosition(position) {
  const borrowed = toBigint(position.borrowed) ?? 0n;
  return {
    vaultAddress: asAddress(position.vaultAddress ?? position.vault),
    asset: asAddress(position.asset),
    shares: toBigint(position.shares) ?? 0n,
    assets: toBigint(position.assets) ?? 0n,
    borrowed,
    isController: Boolean(position.isController),
    isCollateral: Boolean(position.isCollateral),
    balanceForwarderEnabled: Boolean(position.balanceForwarderEnabled),
    liquidity: borrowed > 0n ? normalizeLiquidity(position.liquidity) : undefined,
  };
}

function normalizeAppAccount(rows, requestedAddress) {
  const owner = asAddress(rows.find((row) => row?.subAccount?.owner)?.subAccount?.owner) ?? getAddress(requestedAddress);
  const grouped = new Map();

  for (const row of rows) {
    const subAccountAddress = asAddress(row?.account);
    if (!subAccountAddress) continue;

    const current = grouped.get(subAccountAddress) ?? {
      account: subAccountAddress,
      owner: asAddress(row?.subAccount?.owner) ?? owner,
      timestamp: toNumber(row?.subAccount?.timestamp) ?? 0,
      lastAccountStatusCheckTimestamp: toNumber(row?.subAccount?.lastAccountStatusCheckTimestamp) ?? 0,
      enabledControllers: (row?.subAccount?.enabledControllers ?? []).map((item) => getAddress(item)),
      enabledCollaterals: (row?.subAccount?.enabledCollaterals ?? []).map((item) => getAddress(item)),
      positions: [],
    };

    current.positions.push(normalizePosition(row));
    grouped.set(subAccountAddress, current);
  }

  const subAccounts = [...grouped.values()]
    .map((subAccount) => ({
      ...subAccount,
      enabledControllers: [...new Set(subAccount.enabledControllers)].sort(),
      enabledCollaterals: [...new Set(subAccount.enabledCollaterals)].sort(),
      positions: sortByAddress(subAccount.positions, "vaultAddress"),
    }))
    .sort((a, b) => a.account.toLowerCase().localeCompare(b.account.toLowerCase()));

  const primarySubAccount = subAccounts.find((subAccount) => subAccount.account === owner) ?? subAccounts[0];
  return {
    owner,
    isLockdownMode: Boolean(rows.find((row) => asAddress(row?.account) === primarySubAccount?.account)?.subAccount?.isLockdownMode),
    isPermitDisabledMode: Boolean(rows.find((row) => asAddress(row?.account) === primarySubAccount?.account)?.subAccount?.isPermitDisabledMode),
    subAccounts,
  };
}

function normalizeSdkAccount(account, errors = []) {
  const unavailableLiquidity = new Set();
  for (const error of errors) {
    if (error?.code !== "SOURCE_UNAVAILABLE" || error?.source !== "accountLens") continue;
    const location = error.locations?.find(
      (value) =>
        value?.owner?.kind === "accountPosition" &&
        value.path === "$.liquidity",
    );
    const subAccount = asAddress(location?.owner?.account);
    const vault = asAddress(location?.owner?.vault);
    if (!subAccount || !vault) continue;
    unavailableLiquidity.add(`${subAccount.toLowerCase()}:${vault.toLowerCase()}`);
  }

  const subAccounts = Object.values(account?.subAccounts ?? {})
    .filter(Boolean)
    .map((subAccount) => ({
      account: getAddress(subAccount.account),
      owner: getAddress(subAccount.owner),
      timestamp: subAccount.timestamp,
      lastAccountStatusCheckTimestamp: subAccount.lastAccountStatusCheckTimestamp,
      enabledControllers: [...new Set((subAccount.enabledControllers ?? []).map((item) => getAddress(item)))].sort(),
      enabledCollaterals: [...new Set((subAccount.enabledCollaterals ?? []).map((item) => getAddress(item)))].sort(),
      positions: sortByAddress((subAccount.positions ?? []).map(normalizePosition), "vaultAddress"),
    }))
    .sort((a, b) => a.account.toLowerCase().localeCompare(b.account.toLowerCase()));

  return {
    owner: getAddress(account.owner),
    isLockdownMode: Boolean(account.isLockdownMode),
    isPermitDisabledMode: Boolean(account.isPermitDisabledMode),
    subAccounts,
    unavailableLiquidity,
  };
}

function compareLiquidity(issues, prefix, appLiquidity, sdkLiquidity) {
  if (!appLiquidity && !sdkLiquidity) return;
  if (!appLiquidity || !sdkLiquidity) {
    issues.push({ field: prefix, kind: "presence", app: appLiquidity ? "present" : null, sdk: sdkLiquidity ? "present" : null });
    return;
  }

  compareAddress(issues, `${prefix}.vaultAddress`, appLiquidity.vaultAddress, sdkLiquidity.vaultAddress);
  compareAddress(issues, `${prefix}.unitOfAccount`, appLiquidity.unitOfAccount, sdkLiquidity.unitOfAccount);
  compareText(issues, `${prefix}.daysToLiquidation`, String(appLiquidity.daysToLiquidation), String(sdkLiquidity.daysToLiquidation));
  compareBigint(issues, `${prefix}.liabilityValue.borrowing`, appLiquidity.liabilityValue?.borrowing, sdkLiquidity.liabilityValue?.borrowing);
  compareBigint(issues, `${prefix}.liabilityValue.liquidation`, appLiquidity.liabilityValue?.liquidation, sdkLiquidity.liabilityValue?.liquidation);
  compareBigint(issues, `${prefix}.liabilityValue.oracleMid`, appLiquidity.liabilityValue?.oracleMid, sdkLiquidity.liabilityValue?.oracleMid);
  compareBigint(issues, `${prefix}.totalCollateralValue.borrowing`, appLiquidity.totalCollateralValue?.borrowing, sdkLiquidity.totalCollateralValue?.borrowing);
  compareBigint(issues, `${prefix}.totalCollateralValue.liquidation`, appLiquidity.totalCollateralValue?.liquidation, sdkLiquidity.totalCollateralValue?.liquidation);
  compareBigint(issues, `${prefix}.totalCollateralValue.oracleMid`, appLiquidity.totalCollateralValue?.oracleMid, sdkLiquidity.totalCollateralValue?.oracleMid);
  compareNumber(issues, `${prefix}.collaterals.length`, appLiquidity.collaterals.length, sdkLiquidity.collaterals.length, 0);

  for (const appCollateral of appLiquidity.collaterals) {
    const sdkCollateral = sdkLiquidity.collaterals.find((item) => item.address === appCollateral.address);
    if (!sdkCollateral) {
      issues.push({ field: `${prefix}.collateral.missing`, kind: "missing", app: appCollateral.address, sdk: null });
      continue;
    }
    compareBigint(issues, `${prefix}.collaterals.${appCollateral.address}.borrowing`, appCollateral.value.borrowing, sdkCollateral.value.borrowing);
    compareBigint(issues, `${prefix}.collaterals.${appCollateral.address}.liquidation`, appCollateral.value.liquidation, sdkCollateral.value.liquidation);
    compareBigint(issues, `${prefix}.collaterals.${appCollateral.address}.oracleMid`, appCollateral.value.oracleMid, sdkCollateral.value.oracleMid);
  }
}

function comparePositions(issues, prefix, appPosition, sdkPosition, options = {}) {
  compareAddress(issues, `${prefix}.vaultAddress`, appPosition.vaultAddress, sdkPosition.vaultAddress);
  compareAddress(issues, `${prefix}.asset`, appPosition.asset, sdkPosition.asset);
  compareBigint(issues, `${prefix}.shares`, appPosition.shares, sdkPosition.shares);
  compareBigint(issues, `${prefix}.assets`, appPosition.assets, sdkPosition.assets);
  compareBigint(issues, `${prefix}.borrowed`, appPosition.borrowed, sdkPosition.borrowed);
  compareBoolean(issues, `${prefix}.isController`, appPosition.isController, sdkPosition.isController);
  compareBoolean(issues, `${prefix}.isCollateral`, appPosition.isCollateral, sdkPosition.isCollateral);
  compareBoolean(issues, `${prefix}.balanceForwarderEnabled`, appPosition.balanceForwarderEnabled, sdkPosition.balanceForwarderEnabled);
  if (!options.skipLiquidity) {
    compareLiquidity(issues, `${prefix}.liquidity`, appPosition.liquidity, sdkPosition.liquidity);
  }
}

function compareAccounts(appAccount, sdkAccount) {
  const issues = [];

  compareAddress(issues, "owner", appAccount.owner, sdkAccount.owner);
  compareBoolean(issues, "isLockdownMode", appAccount.isLockdownMode, sdkAccount.isLockdownMode);
  compareBoolean(issues, "isPermitDisabledMode", appAccount.isPermitDisabledMode, sdkAccount.isPermitDisabledMode);
  compareNumber(issues, "subAccounts.length", appAccount.subAccounts.length, sdkAccount.subAccounts.length, 0);

  for (const appSubAccount of appAccount.subAccounts) {
    const sdkSubAccount = sdkAccount.subAccounts.find((item) => item.account === appSubAccount.account);
    if (!sdkSubAccount) {
      issues.push({ field: "subAccount.missing", kind: "missing", app: appSubAccount.account, sdk: null });
      continue;
    }

    const prefix = `subAccounts.${appSubAccount.account}`;
    compareAddress(issues, `${prefix}.owner`, appSubAccount.owner, sdkSubAccount.owner);
    compareAddressArray(issues, `${prefix}.enabledControllers`, appSubAccount.enabledControllers, sdkSubAccount.enabledControllers);
    compareAddressArray(issues, `${prefix}.enabledCollaterals`, appSubAccount.enabledCollaterals, sdkSubAccount.enabledCollaterals);
    compareNumber(issues, `${prefix}.positions.length`, appSubAccount.positions.length, sdkSubAccount.positions.length, 0);

    for (const appPosition of appSubAccount.positions) {
      const sdkPosition = sdkSubAccount.positions.find((item) => item.vaultAddress === appPosition.vaultAddress);
      if (!sdkPosition) {
        issues.push({ field: `${prefix}.position.missing`, kind: "missing", app: appPosition.vaultAddress, sdk: null });
        continue;
      }
      const liquidityKey = `${appSubAccount.account.toLowerCase()}:${appPosition.vaultAddress.toLowerCase()}`;
      comparePositions(issues, `${prefix}.positions.${appPosition.vaultAddress}`, appPosition, sdkPosition, {
        skipLiquidity: sdkAccount.unavailableLiquidity?.has(liquidityKey),
      });
    }
  }

  return issues;
}

function buildSdkOptions() {
  return {
    rpcUrls: { [MAINNET_CHAIN_ID]: RPC_URL },
    backendConfig: { endpoint: INDEXER_HOST },
    eVaultServiceConfig: { adapter: "onchain" },
    eulerEarnServiceConfig: { adapter: "onchain" },
    accountServiceConfig: { adapter: "onchain" },
  };
}

async function main() {
  const discovery = await discoverComparisonAccounts();
  const sdk = await buildEulerSDK(buildSdkOptions());

  const report = {
    generatedAt: new Date().toISOString(),
    chainId: MAINNET_CHAIN_ID,
    adapterMode: "onchain",
    config: {
      indexerHost: INDEXER_HOST,
      v3Host: V3_HOST,
      rpcUrl: RPC_URL,
      targetAccount: TARGET_ACCOUNT,
      extraAccountsTarget: EXTRA_ACCOUNTS_TARGET,
      popularVaultLimit: POPULAR_VAULT_LIMIT,
      holderPages: HOLDER_PAGES,
      holderConcurrency: HOLDER_CONCURRENCY,
    },
    discovery,
    accounts: [],
    summary: {
      requested: discovery.accounts.length,
      matches: 0,
      diffs: 0,
      missingInApp: 0,
      missingInSdk: 0,
      sdkErrorAccounts: 0,
      fieldDiffs: {},
    },
  };

  for (const address of discovery.accounts) {
    const appRows = await fetchAppAccountRows(address);
    const appAccount = normalizeAppAccount(appRows, address);
    const sdkResult = await sdk.accountService.fetchAccount(MAINNET_CHAIN_ID, address, { populateVaults: false });
    const sdkAccount = normalizeSdkAccount(sdkResult.result, sdkResult.errors);
    const issues = compareAccounts(appAccount, sdkAccount);

    if (appRows.length === 0) {
      report.summary.missingInApp += 1;
    }
    if (sdkAccount.subAccounts.length === 0) {
      report.summary.missingInSdk += 1;
    }
    if ((sdkResult.errors ?? []).length > 0) {
      report.summary.sdkErrorAccounts += 1;
    }

    if (issues.length === 0) {
      report.summary.matches += 1;
    } else {
      report.summary.diffs += 1;
      for (const issue of issues) {
        report.summary.fieldDiffs[issue.field] = (report.summary.fieldDiffs[issue.field] ?? 0) + 1;
      }
    }

    report.accounts.push({
      address,
      status: issues.length === 0 ? "match" : "diff",
      app: {
        subAccounts: appAccount.subAccounts.length,
        borrowedPositions: appAccount.subAccounts.reduce(
          (total, subAccount) => total + subAccount.positions.filter((position) => position.borrowed > 0n).length,
          0,
        ),
      },
      sdk: {
        subAccounts: sdkAccount.subAccounts.length,
        errors: sdkResult.errors ?? [],
      },
      issues,
    });
  }

  console.log(JSON.stringify(report, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
