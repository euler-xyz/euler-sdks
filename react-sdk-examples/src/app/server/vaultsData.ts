import {
  isEulerEarn,
  isEVault,
  StandardEulerEarnPerspectives,
  StandardEVaultPerspectives,
  type VaultMetaPerspective,
} from "euler-v2-sdk";
import { CHAIN_NAMES } from "../config/chains";
import { formatAPY, formatBigInt, formatPriceUsd } from "../utils/format";
import { getServerSdk } from "./sdk";

const ALL_PERSPECTIVES: VaultMetaPerspective[] = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
];

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 50;

type SortDir = "asc" | "desc";
export type { SortDir };
export type VaultsTab = "evaults" | "eulerEarn";

export interface VaultTableQuery {
  tab: VaultsTab;
  page: number;
  pageSize: number;
  q: string;
  sortBy: string;
  sortDir: SortDir;
}

export interface EVaultRow {
  address: string;
  name: string;
  assetSymbol: string;
  totalSupply: string;
  totalBorrows: string;
  supplyApy: string;
  borrowApy: string;
  marketPriceUsd: string;
  collateralCount: number;
}

export interface EulerEarnRow {
  address: string;
  name: string;
  assetSymbol: string;
  totalAssets: string;
  marketPriceUsd: string;
  strategyCount: number;
  performanceFee: string;
}

export interface VaultTableData {
  chainId: number;
  chainName: string;
  tab: VaultsTab;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  q: string;
  sortBy: string;
  sortDir: SortDir;
  eVaultsCount: number;
  earnVaultsCount: number;
  eVaults: EVaultRow[];
  earnVaults: EulerEarnRow[];
}

type QueryInputValue = string | number | string[] | undefined;

interface VaultTableQueryInput {
  tab?: QueryInputValue;
  page?: QueryInputValue;
  pageSize?: QueryInputValue;
  q?: QueryInputValue;
  sortBy?: QueryInputValue;
  sortDir?: QueryInputValue;
}

interface EVaultRowInternal extends EVaultRow {
  nameLower: string;
  assetLower: string;
  addressLower: string;
  totalSupplyRaw: bigint;
  totalBorrowsRaw: bigint;
  supplyApyRaw: number;
  borrowApyRaw: number;
  priceRaw: bigint;
}

interface EulerEarnRowInternal extends EulerEarnRow {
  nameLower: string;
  assetLower: string;
  addressLower: string;
  totalAssetsRaw: bigint;
  priceRaw: bigint;
  performanceFeeRaw: number;
}

const EVAULT_SORT_FIELDS = new Set([
  "name",
  "asset",
  "address",
  "totalSupply",
  "totalBorrows",
  "supplyApy",
  "borrowApy",
  "price",
  "collaterals",
]);

const EULER_EARN_SORT_FIELDS = new Set([
  "name",
  "asset",
  "address",
  "totalAssets",
  "price",
  "strategies",
  "performanceFee",
]);

function normalizeRawValue(value: QueryInputValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

function parseIntOrDefault(raw: QueryInputValue, fallback: number): number {
  const value = normalizeRawValue(raw);
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveTab(raw: QueryInputValue): VaultsTab {
  return normalizeRawValue(raw) === "eulerEarn" ? "eulerEarn" : "evaults";
}

function resolveSortDir(raw: QueryInputValue, fallback: SortDir): SortDir {
  const value = normalizeRawValue(raw);
  if (value === "asc" || value === "desc") return value;
  return fallback;
}

function resolveSortBy(tab: VaultsTab, raw: QueryInputValue): string {
  const value = normalizeRawValue(raw);
  const defaultSortBy = tab === "evaults" ? "totalSupply" : "totalAssets";

  if (!value) return defaultSortBy;

  if (tab === "evaults") {
    return EVAULT_SORT_FIELDS.has(value) ? value : defaultSortBy;
  }

  return EULER_EARN_SORT_FIELDS.has(value) ? value : defaultSortBy;
}

export function parseVaultTableQuery(
  input: VaultTableQueryInput,
): VaultTableQuery {
  const tab = resolveTab(input.tab);
  const page = Math.max(1, parseIntOrDefault(input.page, 1));
  const pageSize = clamp(
    parseIntOrDefault(input.pageSize, DEFAULT_PAGE_SIZE),
    1,
    MAX_PAGE_SIZE,
  );
  const defaultSortDir: SortDir = "desc";

  return {
    tab,
    page,
    pageSize,
    q: (normalizeRawValue(input.q) ?? "").trim().toLowerCase(),
    sortBy: resolveSortBy(tab, input.sortBy),
    sortDir: resolveSortDir(input.sortDir, defaultSortDir),
  };
}

function compareBigInt(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function compareNumber(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function applySortDirection(value: number, sortDir: SortDir): number {
  return sortDir === "asc" ? value : -value;
}

function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): {
  rows: T[];
  page: number;
  totalRows: number;
  totalPages: number;
} {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = clamp(page, 1, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    totalRows,
    totalPages,
  };
}

function filterByQuery<
  T extends { nameLower: string; assetLower: string; addressLower: string },
>(rows: T[], q: string): T[] {
  if (!q) return rows;

  return rows.filter(
    (row) =>
      row.nameLower.includes(q) ||
      row.assetLower.includes(q) ||
      row.addressLower.includes(q),
  );
}

function sortEVaultRows(
  rows: EVaultRowInternal[],
  sortBy: string,
  sortDir: SortDir,
): EVaultRowInternal[] {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    let cmp = 0;

    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "asset":
        cmp = a.assetSymbol.localeCompare(b.assetSymbol);
        break;
      case "address":
        cmp = a.address.localeCompare(b.address);
        break;
      case "totalSupply":
        cmp = compareBigInt(a.totalSupplyRaw, b.totalSupplyRaw);
        break;
      case "totalBorrows":
        cmp = compareBigInt(a.totalBorrowsRaw, b.totalBorrowsRaw);
        break;
      case "supplyApy":
        cmp = compareNumber(a.supplyApyRaw, b.supplyApyRaw);
        break;
      case "borrowApy":
        cmp = compareNumber(a.borrowApyRaw, b.borrowApyRaw);
        break;
      case "price":
        cmp = compareBigInt(a.priceRaw, b.priceRaw);
        break;
      case "collaterals":
        cmp = compareNumber(a.collateralCount, b.collateralCount);
        break;
      default:
        cmp = compareBigInt(a.totalSupplyRaw, b.totalSupplyRaw);
    }

    if (cmp === 0) {
      cmp = a.address.localeCompare(b.address);
    }

    return applySortDirection(cmp, sortDir);
  });

  return sorted;
}

function sortEulerEarnRows(
  rows: EulerEarnRowInternal[],
  sortBy: string,
  sortDir: SortDir,
): EulerEarnRowInternal[] {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    let cmp = 0;

    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "asset":
        cmp = a.assetSymbol.localeCompare(b.assetSymbol);
        break;
      case "address":
        cmp = a.address.localeCompare(b.address);
        break;
      case "totalAssets":
        cmp = compareBigInt(a.totalAssetsRaw, b.totalAssetsRaw);
        break;
      case "price":
        cmp = compareBigInt(a.priceRaw, b.priceRaw);
        break;
      case "strategies":
        cmp = compareNumber(a.strategyCount, b.strategyCount);
        break;
      case "performanceFee":
        cmp = compareNumber(a.performanceFeeRaw, b.performanceFeeRaw);
        break;
      default:
        cmp = compareBigInt(a.totalAssetsRaw, b.totalAssetsRaw);
    }

    if (cmp === 0) {
      cmp = a.address.localeCompare(b.address);
    }

    return applySortDirection(cmp, sortDir);
  });

  return sorted;
}

function toPublicEVaultRow(row: EVaultRowInternal): EVaultRow {
  return {
    address: row.address,
    name: row.name,
    assetSymbol: row.assetSymbol,
    totalSupply: row.totalSupply,
    totalBorrows: row.totalBorrows,
    supplyApy: row.supplyApy,
    borrowApy: row.borrowApy,
    marketPriceUsd: row.marketPriceUsd,
    collateralCount: row.collateralCount,
  };
}

function toPublicEulerEarnRow(row: EulerEarnRowInternal): EulerEarnRow {
  return {
    address: row.address,
    name: row.name,
    assetSymbol: row.assetSymbol,
    totalAssets: row.totalAssets,
    marketPriceUsd: row.marketPriceUsd,
    strategyCount: row.strategyCount,
    performanceFee: row.performanceFee,
  };
}

export async function getVaultTableData(
  chainId: number,
  queryInput?: VaultTableQueryInput,
): Promise<VaultTableData> {
  const query = parseVaultTableQuery(queryInput ?? {});
  const sdk = await getServerSdk();
  const allVaults = await sdk.vaultMetaService.fetchVerifiedVaults(
    chainId,
    ALL_PERSPECTIVES,
    {
      populateMarketPrices: true,
    },
  );

  const eVaultRowsInternal: EVaultRowInternal[] = allVaults
    .filter(isEVault)
    .map((vault) => {
      const name = vault.shares.name || "-";
      const priceRaw = vault.marketPriceUsd ?? -1n;
      const supplyApyRaw = Number(vault.interestRates.supplyAPY);
      const borrowApyRaw = Number(vault.interestRates.borrowAPY);

      return {
        address: vault.address,
        name,
        assetSymbol: vault.asset.symbol,
        totalSupply: formatBigInt(vault.totalAssets, vault.asset.decimals),
        totalBorrows: formatBigInt(vault.totalBorrowed, vault.asset.decimals),
        supplyApy: formatAPY(vault.interestRates.supplyAPY),
        borrowApy: formatAPY(vault.interestRates.borrowAPY),
        marketPriceUsd: formatPriceUsd(vault.marketPriceUsd),
        collateralCount: vault.collaterals.length,

        nameLower: name.toLowerCase(),
        assetLower: vault.asset.symbol.toLowerCase(),
        addressLower: vault.address.toLowerCase(),
        totalSupplyRaw: vault.totalAssets,
        totalBorrowsRaw: vault.totalBorrowed,
        supplyApyRaw: Number.isFinite(supplyApyRaw) ? supplyApyRaw : 0,
        borrowApyRaw: Number.isFinite(borrowApyRaw) ? borrowApyRaw : 0,
        priceRaw,
      };
    });

  const eulerEarnRowsInternal: EulerEarnRowInternal[] = allVaults
    .filter(isEulerEarn)
    .map((vault) => {
      const name = vault.shares.name || "-";
      const priceRaw = vault.marketPriceUsd ?? -1n;

      return {
        address: vault.address,
        name,
        assetSymbol: vault.asset.symbol,
        totalAssets: formatBigInt(vault.totalAssets, vault.asset.decimals),
        marketPriceUsd: formatPriceUsd(vault.marketPriceUsd),
        strategyCount: vault.strategies.length,
        performanceFee: `${(vault.performanceFee * 100).toFixed(1)}%`,

        nameLower: name.toLowerCase(),
        assetLower: vault.asset.symbol.toLowerCase(),
        addressLower: vault.address.toLowerCase(),
        totalAssetsRaw: vault.totalAssets,
        priceRaw,
        performanceFeeRaw: vault.performanceFee,
      };
    });

  const eVaultsCount = eVaultRowsInternal.length;
  const earnVaultsCount = eulerEarnRowsInternal.length;

  if (query.tab === "evaults") {
    const filtered = filterByQuery(eVaultRowsInternal, query.q);
    const sorted = sortEVaultRows(filtered, query.sortBy, query.sortDir);
    const paged = paginateRows(sorted, query.page, query.pageSize);

    return {
      chainId,
      chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
      tab: query.tab,
      page: paged.page,
      pageSize: query.pageSize,
      totalRows: paged.totalRows,
      totalPages: paged.totalPages,
      q: query.q,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      eVaultsCount,
      earnVaultsCount,
      eVaults: paged.rows.map(toPublicEVaultRow),
      earnVaults: [],
    };
  }

  const filtered = filterByQuery(eulerEarnRowsInternal, query.q);
  const sorted = sortEulerEarnRows(filtered, query.sortBy, query.sortDir);
  const paged = paginateRows(sorted, query.page, query.pageSize);

  return {
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    tab: query.tab,
    page: paged.page,
    pageSize: query.pageSize,
    totalRows: paged.totalRows,
    totalPages: paged.totalPages,
    q: query.q,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    eVaultsCount,
    earnVaultsCount,
    eVaults: [],
    earnVaults: paged.rows.map(toPublicEulerEarnRow),
  };
}
