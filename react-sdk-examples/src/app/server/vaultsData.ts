import {
  isEulerEarn,
  isEVault,
  StandardEulerEarnPerspectives,
  StandardEVaultPerspectives,
  type VaultMetaPerspective,
} from "euler-v2-sdk"
import { CHAIN_NAMES } from "../config/chains"
import { formatAPY, formatBigInt, formatPriceUsd } from "../utils/format"
import { getServerQueryClient } from "./queryClient"
import { getSimulateRpcErrorsEnabled } from "./simulateRpcErrorsFlag"
import { getServerSdk } from "./sdk"

const ALL_PERSPECTIVES: VaultMetaPerspective[] = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
]

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 50
const SNAPSHOT_REFRESH_INTERVAL_MS = (() => {
  const raw = Number.parseInt(process.env.VAULTS_SNAPSHOT_REFRESH_MS ?? "", 10)
  if (Number.isFinite(raw) && raw > 0) return raw
  return 60 * 60_000
})()
const ENABLE_VAULTS_CACHE_LOGS =
  process.env.VAULTS_CACHE_DEBUG === "1" || process.env.VAULTS_CACHE_DEBUG === "true"

const globalForVaultsCacheDebug = globalThis as typeof globalThis & {
  __vaultsCacheInstanceId?: string
}

function getVaultsCacheInstanceId(): string {
  if (!globalForVaultsCacheDebug.__vaultsCacheInstanceId) {
    const random = Math.random().toString(36).slice(2, 8)
    globalForVaultsCacheDebug.__vaultsCacheInstanceId = `instance-${random}`
  }

  return globalForVaultsCacheDebug.__vaultsCacheInstanceId
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  return JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (typeof nestedValue === "bigint") return `bigint:${nestedValue.toString()}`
    if (typeof nestedValue === "symbol") return String(nestedValue)
    if (typeof nestedValue === "function") return "[function]"
    if (nestedValue && typeof nestedValue === "object") {
      const obj = nestedValue as object
      if (seen.has(obj)) return "[circular]"
      seen.add(obj)
    }
    return nestedValue
  })
}

function logVaultsCache(event: string, fields: Record<string, unknown>) {
  if (!ENABLE_VAULTS_CACHE_LOGS) return

  console.log(
    "[vaults-cache]",
    safeJsonStringify({
      event,
      instance: getVaultsCacheInstanceId(),
      ...fields,
    }),
  )
}

type SortDir = "asc" | "desc"
export type { SortDir }
export type VaultsTab = "evaults" | "eulerEarn"

export interface VaultTableQuery {
  tab: VaultsTab
  page: number
  pageSize: number
  q: string
  sortBy: string
  sortDir: SortDir
}

export interface EVaultRow {
  address: string
  name: string
  assetSymbol: string
  totalSupply: string
  totalBorrows: string
  supplyApy: string
  borrowApy: string
  marketPriceUsd: string
  collateralCount: number
}

export interface EulerEarnRow {
  address: string
  name: string
  assetSymbol: string
  totalAssets: string
  marketPriceUsd: string
  strategyCount: number
  performanceFee: string
}

export interface VaultTableData {
  chainId: number
  chainName: string
  snapshotUpdatedAt: number
  snapshotIsStale: boolean
  isRefreshing: boolean
  refreshError: string | null
  refreshErrorAt: number | null
  tab: VaultsTab
  page: number
  pageSize: number
  totalRows: number
  totalPages: number
  q: string
  sortBy: string
  sortDir: SortDir
  eVaultsCount: number
  earnVaultsCount: number
  eVaults: EVaultRow[]
  earnVaults: EulerEarnRow[]
}

type QueryInputValue = string | number | string[] | undefined

interface VaultTableQueryInput {
  tab?: QueryInputValue
  page?: QueryInputValue
  pageSize?: QueryInputValue
  q?: QueryInputValue
  sortBy?: QueryInputValue
  sortDir?: QueryInputValue
}

interface EVaultRowInternal extends EVaultRow {
  nameLower: string
  assetLower: string
  addressLower: string
  totalSupplyRaw: bigint
  totalBorrowsRaw: bigint
  supplyApyRaw: number
  borrowApyRaw: number
  priceRaw: bigint
}

interface EulerEarnRowInternal extends EulerEarnRow {
  nameLower: string
  assetLower: string
  addressLower: string
  totalAssetsRaw: bigint
  priceRaw: bigint
  performanceFeeRaw: number
}

interface VaultsSnapshot {
  updatedAt: number
  eVaultRowsInternal: EVaultRowInternal[]
  eulerEarnRowsInternal: EulerEarnRowInternal[]
  eVaultsCount: number
  earnVaultsCount: number
}

interface VaultsSnapshotError {
  message: string
  at: number
}

interface LiveEVaultDetailForSnapshot {
  address: string
  shares: {
    name: string
  }
  asset: {
    symbol: string
    decimals: number
  }
  totalAssets: bigint
  totalBorrowed: bigint
  interestRates: {
    supplyAPY: string
    borrowAPY: string
  }
  marketPriceUsd?: bigint
  collaterals: unknown[]
}

interface LiveEulerEarnDetailForSnapshot {
  address: string
  shares: {
    name: string
  }
  asset: {
    symbol: string
    decimals: number
  }
  totalAssets: bigint
  marketPriceUsd?: bigint
  strategies: unknown[]
  performanceFee: number
}

export interface CachedVaultListSnapshot {
  row: EVaultRow | null
  snapshotUpdatedAt: number | null
}

export interface CachedEulerEarnListSnapshot {
  row: EulerEarnRow | null
  snapshotUpdatedAt: number | null
}

type ServerSdk = Awaited<ReturnType<typeof getServerSdk>>
type VerifiedVault = Awaited<
  ReturnType<ServerSdk["vaultMetaService"]["fetchVerifiedVaults"]>
>[number]

interface VaultsSnapshotMeta {
  refreshError: VaultsSnapshotError | null
  isRefreshing: boolean
}

function isSimulatedRpcErrorMessage(message: string): boolean {
  return message.includes("[simulated-rpc-error:server]")
}

export interface VaultsSnapshotCronChainStatus {
  chainId: number
  chainName: string
  hasInterval: boolean
  refreshInFlight: boolean
  hasSnapshot: boolean
  snapshotUpdatedAt: number | null
  snapshotAgeMs: number | null
  isRefreshing: boolean
  refreshError: string | null
  refreshErrorAt: number | null
}

export interface VaultsSnapshotCronStatus {
  started: boolean
  refreshIntervalMs: number
  chains: VaultsSnapshotCronChainStatus[]
}

const globalForVaultsSnapshotCronRuntime = globalThis as typeof globalThis & {
  __vaultsSnapshotCronStarted?: boolean
  __vaultsSnapshotCronIntervals?: Map<number, ReturnType<typeof setInterval>>
  __vaultsSnapshotRefreshPromises?: Map<number, Promise<void>>
}

function getVaultsSnapshotCronIntervals(): Map<number, ReturnType<typeof setInterval>> {
  if (!globalForVaultsSnapshotCronRuntime.__vaultsSnapshotCronIntervals) {
    globalForVaultsSnapshotCronRuntime.__vaultsSnapshotCronIntervals = new Map()
  }

  return globalForVaultsSnapshotCronRuntime.__vaultsSnapshotCronIntervals
}

function getVaultsSnapshotRefreshPromises(): Map<number, Promise<void>> {
  if (!globalForVaultsSnapshotCronRuntime.__vaultsSnapshotRefreshPromises) {
    globalForVaultsSnapshotCronRuntime.__vaultsSnapshotRefreshPromises = new Map()
  }

  return globalForVaultsSnapshotCronRuntime.__vaultsSnapshotRefreshPromises
}

function getConfiguredChainIds(): number[] {
  return Object.keys(CHAIN_NAMES)
    .map(Number)
    .filter((chainId) => Number.isInteger(chainId))
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
])

const EULER_EARN_SORT_FIELDS = new Set([
  "name",
  "asset",
  "address",
  "totalAssets",
  "price",
  "strategies",
  "performanceFee",
])

function normalizeRawValue(value: QueryInputValue): string | undefined {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === "string" ? first : undefined
  }
  return undefined
}

function parseIntOrDefault(raw: QueryInputValue, fallback: number): number {
  const value = normalizeRawValue(raw)
  if (!value) return fallback

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resolveTab(raw: QueryInputValue): VaultsTab {
  return normalizeRawValue(raw) === "eulerEarn" ? "eulerEarn" : "evaults"
}

function resolveSortDir(raw: QueryInputValue, fallback: SortDir): SortDir {
  const value = normalizeRawValue(raw)
  if (value === "asc" || value === "desc") return value
  return fallback
}

function resolveSortBy(tab: VaultsTab, raw: QueryInputValue): string {
  const value = normalizeRawValue(raw)
  const defaultSortBy = tab === "evaults" ? "totalSupply" : "totalAssets"

  if (!value) return defaultSortBy

  if (tab === "evaults") {
    return EVAULT_SORT_FIELDS.has(value) ? value : defaultSortBy
  }

  return EULER_EARN_SORT_FIELDS.has(value) ? value : defaultSortBy
}

export function parseVaultTableQuery(input: VaultTableQueryInput): VaultTableQuery {
  const tab = resolveTab(input.tab)
  const page = Math.max(1, parseIntOrDefault(input.page, 1))
  const pageSize = clamp(parseIntOrDefault(input.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE)
  const defaultSortDir: SortDir = "desc"

  return {
    tab,
    page,
    pageSize,
    q: (normalizeRawValue(input.q) ?? "").trim().toLowerCase(),
    sortBy: resolveSortBy(tab, input.sortBy),
    sortDir: resolveSortDir(input.sortDir, defaultSortDir),
  }
}

function compareBigInt(a: bigint, b: bigint): number {
  if (a === b) return 0
  return a > b ? 1 : -1
}

function compareNumber(a: number, b: number): number {
  if (a === b) return 0
  return a > b ? 1 : -1
}

function applySortDirection(value: number, sortDir: SortDir): number {
  return sortDir === "asc" ? value : -value
}

function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): {
  rows: T[]
  page: number
  totalRows: number
  totalPages: number
} {
  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = clamp(page, 1, totalPages)
  const start = (safePage - 1) * pageSize

  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    totalRows,
    totalPages,
  }
}

function filterByQuery<T extends { nameLower: string; assetLower: string; addressLower: string }>(
  rows: T[],
  q: string,
): T[] {
  if (!q) return rows

  return rows.filter(
    (row) =>
      row.nameLower.includes(q) || row.assetLower.includes(q) || row.addressLower.includes(q),
  )
}

function sortEVaultRows(
  rows: EVaultRowInternal[],
  sortBy: string,
  sortDir: SortDir,
): EVaultRowInternal[] {
  const sorted = [...rows]

  sorted.sort((a, b) => {
    let cmp = 0

    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name)
        break
      case "asset":
        cmp = a.assetSymbol.localeCompare(b.assetSymbol)
        break
      case "address":
        cmp = a.address.localeCompare(b.address)
        break
      case "totalSupply":
        cmp = compareBigInt(a.totalSupplyRaw, b.totalSupplyRaw)
        break
      case "totalBorrows":
        cmp = compareBigInt(a.totalBorrowsRaw, b.totalBorrowsRaw)
        break
      case "supplyApy":
        cmp = compareNumber(a.supplyApyRaw, b.supplyApyRaw)
        break
      case "borrowApy":
        cmp = compareNumber(a.borrowApyRaw, b.borrowApyRaw)
        break
      case "price":
        cmp = compareBigInt(a.priceRaw, b.priceRaw)
        break
      case "collaterals":
        cmp = compareNumber(a.collateralCount, b.collateralCount)
        break
      default:
        cmp = compareBigInt(a.totalSupplyRaw, b.totalSupplyRaw)
    }

    if (cmp === 0) {
      cmp = a.address.localeCompare(b.address)
    }

    return applySortDirection(cmp, sortDir)
  })

  return sorted
}

function sortEulerEarnRows(
  rows: EulerEarnRowInternal[],
  sortBy: string,
  sortDir: SortDir,
): EulerEarnRowInternal[] {
  const sorted = [...rows]

  sorted.sort((a, b) => {
    let cmp = 0

    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name)
        break
      case "asset":
        cmp = a.assetSymbol.localeCompare(b.assetSymbol)
        break
      case "address":
        cmp = a.address.localeCompare(b.address)
        break
      case "totalAssets":
        cmp = compareBigInt(a.totalAssetsRaw, b.totalAssetsRaw)
        break
      case "price":
        cmp = compareBigInt(a.priceRaw, b.priceRaw)
        break
      case "strategies":
        cmp = compareNumber(a.strategyCount, b.strategyCount)
        break
      case "performanceFee":
        cmp = compareNumber(a.performanceFeeRaw, b.performanceFeeRaw)
        break
      default:
        cmp = compareBigInt(a.totalAssetsRaw, b.totalAssetsRaw)
    }

    if (cmp === 0) {
      cmp = a.address.localeCompare(b.address)
    }

    return applySortDirection(cmp, sortDir)
  })

  return sorted
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
  }
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
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function getVaultsSnapshotQueryKey(chainId: number) {
  return ["sdk", "vaultsTableSnapshotCron", chainId] as const
}

function getVaultsSnapshotMetaQueryKey(chainId: number) {
  return ["sdk", "vaultsTableSnapshotCronMeta", chainId] as const
}

function ensureVaultsSnapshotQueryDefaults(chainId: number) {
  const queryClient = getServerQueryClient()
  queryClient.setQueryDefaults(getVaultsSnapshotQueryKey(chainId), {
    staleTime: Infinity,
    gcTime: Infinity,
  })
  queryClient.setQueryDefaults(getVaultsSnapshotMetaQueryKey(chainId), {
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

function getVaultsSnapshotState(chainId: number): {
  snapshot: VaultsSnapshot | null
  refreshError: VaultsSnapshotError | null
  isRefreshing: boolean
} {
  const queryClient = getServerQueryClient()
  const snapshot = queryClient.getQueryData<VaultsSnapshot>(getVaultsSnapshotQueryKey(chainId)) ?? null
  const meta = queryClient.getQueryData<VaultsSnapshotMeta>(getVaultsSnapshotMetaQueryKey(chainId))

  return {
    snapshot,
    refreshError: meta?.refreshError ?? null,
    isRefreshing: meta?.isRefreshing ?? false,
  }
}

async function runVaultsSnapshotRefresh(
  chainId: number,
  trigger: "startup" | "cron" | "manual",
): Promise<void> {
  ensureVaultsSnapshotQueryDefaults(chainId)
  const refreshPromises = getVaultsSnapshotRefreshPromises()
  const inFlight = refreshPromises.get(chainId)
  if (inFlight) {
    return inFlight
  }

  const queryClient = getServerQueryClient()
  const snapshotKey = getVaultsSnapshotQueryKey(chainId)
  const metaKey = getVaultsSnapshotMetaQueryKey(chainId)
  const snapshotBefore = queryClient.getQueryData<VaultsSnapshot>(snapshotKey) ?? null
  const startedAt = Date.now()
  queryClient.setQueryData<VaultsSnapshotMeta>(metaKey, (previous) => ({
    refreshError: previous?.refreshError ?? null,
    isRefreshing: true,
  }))

  logVaultsCache("cron:refresh-start", {
    chainId,
    trigger,
    hasSnapshot: !!snapshotBefore,
    snapshotAgeMs: snapshotBefore ? Date.now() - snapshotBefore.updatedAt : null,
  })

  const refreshPromise = (async () => {
    try {
      const snapshot = await fetchFreshSnapshot(chainId)
      queryClient.setQueryData(snapshotKey, snapshot, {
        updatedAt: snapshot.updatedAt,
      })
      queryClient.setQueryData<VaultsSnapshotMeta>(metaKey, {
        refreshError: null,
        isRefreshing: false,
      })
      logVaultsCache("cron:refresh-success", {
        chainId,
        trigger,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotAgeMs: Date.now() - snapshot.updatedAt,
      })
    } catch (error) {
      const refreshError: VaultsSnapshotError = {
        message: toErrorMessage(error),
        at: Date.now(),
      }
      queryClient.setQueryData<VaultsSnapshotMeta>(metaKey, {
        refreshError,
        isRefreshing: false,
      })
      const snapshotAfter = queryClient.getQueryData<VaultsSnapshot>(snapshotKey) ?? null
      logVaultsCache("cron:refresh-failed", {
        chainId,
        trigger,
        error: toErrorMessage(error),
        hasSnapshot: !!snapshotAfter,
        snapshotAgeMs: snapshotAfter ? Date.now() - snapshotAfter.updatedAt : null,
      })
      if (process.env.NODE_ENV === "development") {
        console.warn("[vaults] cron refresh failed", toErrorMessage(error))
      }
    } finally {
      refreshPromises.delete(chainId)
      const state = getVaultsSnapshotState(chainId)
      logVaultsCache("cron:refresh-done", {
        chainId,
        trigger,
        durationMs: Date.now() - startedAt,
        hasSnapshot: !!state.snapshot,
        hasError: !!state.refreshError,
      })
    }
  })()

  refreshPromises.set(chainId, refreshPromise)
  return refreshPromise
}

function startVaultsSnapshotCronForChain(chainId: number) {
  ensureVaultsSnapshotQueryDefaults(chainId)
  const intervals = getVaultsSnapshotCronIntervals()
  if (intervals.has(chainId)) return

  void runVaultsSnapshotRefresh(chainId, "startup")

  const intervalHandle = setInterval(() => {
    void runVaultsSnapshotRefresh(chainId, "cron")
  }, SNAPSHOT_REFRESH_INTERVAL_MS)

  if (typeof intervalHandle === "object" && "unref" in intervalHandle) {
    intervalHandle.unref()
  }

  intervals.set(chainId, intervalHandle)

  logVaultsCache("cron:chain-started", {
    chainId,
    refreshIntervalMs: SNAPSHOT_REFRESH_INTERVAL_MS,
  })
}

export function startVaultsSnapshotCronJobs() {
  if (globalForVaultsSnapshotCronRuntime.__vaultsSnapshotCronStarted) return
  globalForVaultsSnapshotCronRuntime.__vaultsSnapshotCronStarted = true

  const chainIds = getConfiguredChainIds()

  for (const chainId of chainIds) {
    startVaultsSnapshotCronForChain(chainId)
  }

  logVaultsCache("cron:all-started", {
    chainIds,
    refreshIntervalMs: SNAPSHOT_REFRESH_INTERVAL_MS,
  })
}

export async function triggerVaultsSnapshotCronRefreshNow(options?: {
  ensurePostInFlightRefresh?: boolean
}) {
  startVaultsSnapshotCronJobs()

  const chainIds = getConfiguredChainIds()
  const refreshPromises = getVaultsSnapshotRefreshPromises()

  const pendingRefreshes = chainIds.map((chainId) => {
    const inFlight = refreshPromises.get(chainId)

    if (options?.ensurePostInFlightRefresh && inFlight) {
      return inFlight.finally(() => runVaultsSnapshotRefresh(chainId, "manual"))
    }

    return runVaultsSnapshotRefresh(chainId, "manual")
  })

  logVaultsCache("cron:manual-triggered", {
    chainIds,
    ensurePostInFlightRefresh: !!options?.ensurePostInFlightRefresh,
  })

  await Promise.allSettled(pendingRefreshes)
}

export function getVaultsSnapshotCronStatus(): VaultsSnapshotCronStatus {
  const intervals = getVaultsSnapshotCronIntervals()
  const refreshPromises = getVaultsSnapshotRefreshPromises()
  const now = Date.now()

  return {
    started: !!globalForVaultsSnapshotCronRuntime.__vaultsSnapshotCronStarted,
    refreshIntervalMs: SNAPSHOT_REFRESH_INTERVAL_MS,
    chains: getConfiguredChainIds().map((chainId) => {
      const state = getVaultsSnapshotState(chainId)
      const snapshotUpdatedAt = state.snapshot?.updatedAt ?? null

      return {
        chainId,
        chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
        hasInterval: intervals.has(chainId),
        refreshInFlight: refreshPromises.has(chainId),
        hasSnapshot: !!state.snapshot,
        snapshotUpdatedAt,
        snapshotAgeMs: snapshotUpdatedAt ? now - snapshotUpdatedAt : null,
        isRefreshing: state.isRefreshing,
        refreshError: state.refreshError?.message ?? null,
        refreshErrorAt: state.refreshError?.at ?? null,
      }
    }),
  }
}

export function clearVaultsSnapshotSimulatedRefreshErrors() {
  const queryClient = getServerQueryClient()

  for (const chainId of getConfiguredChainIds()) {
    ensureVaultsSnapshotQueryDefaults(chainId)
    const metaKey = getVaultsSnapshotMetaQueryKey(chainId)
    const meta = queryClient.getQueryData<VaultsSnapshotMeta>(metaKey)
    if (!meta?.refreshError) continue
    if (!isSimulatedRpcErrorMessage(meta.refreshError.message)) continue

    queryClient.setQueryData<VaultsSnapshotMeta>(metaKey, {
      refreshError: null,
      isRefreshing: meta.isRefreshing,
    })
  }
}

export function getCachedVaultListSnapshot(
  chainId: number,
  address: string,
): CachedVaultListSnapshot {
  const { snapshot } = getVaultsSnapshotState(chainId)
  if (!snapshot) {
    return {
      row: null,
      snapshotUpdatedAt: null,
    }
  }

  const addressLower = address.toLowerCase()
  const rowInternal = snapshot.eVaultRowsInternal.find((row) => row.addressLower === addressLower)

  return {
    row: rowInternal ? toPublicEVaultRow(rowInternal) : null,
    snapshotUpdatedAt: snapshot.updatedAt,
  }
}

export function getCachedEulerEarnListSnapshot(
  chainId: number,
  address: string,
): CachedEulerEarnListSnapshot {
  const { snapshot } = getVaultsSnapshotState(chainId)
  if (!snapshot) {
    return {
      row: null,
      snapshotUpdatedAt: null,
    }
  }

  const addressLower = address.toLowerCase()
  const rowInternal = snapshot.eulerEarnRowsInternal.find(
    (row) => row.addressLower === addressLower,
  )

  return {
    row: rowInternal ? toPublicEulerEarnRow(rowInternal) : null,
    snapshotUpdatedAt: snapshot.updatedAt,
  }
}

function toEVaultRowInternalFromLiveDetail(vault: LiveEVaultDetailForSnapshot): EVaultRowInternal {
  const name = vault.shares.name || "-"
  const priceRaw = vault.marketPriceUsd ?? -1n
  const supplyApyRaw = Number(vault.interestRates.supplyAPY)
  const borrowApyRaw = Number(vault.interestRates.borrowAPY)

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
  }
}

function toEulerEarnRowInternalFromLiveDetail(
  vault: LiveEulerEarnDetailForSnapshot,
): EulerEarnRowInternal {
  const name = vault.shares.name || "-"
  const priceRaw = vault.marketPriceUsd ?? -1n

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
  }
}

export function updateCachedVaultListSnapshotFromLiveDetail(
  chainId: number,
  vault: LiveEVaultDetailForSnapshot,
): boolean {
  ensureVaultsSnapshotQueryDefaults(chainId)
  const queryClient = getServerQueryClient()
  const snapshotKey = getVaultsSnapshotQueryKey(chainId)
  const nextRow = toEVaultRowInternalFromLiveDetail(vault)
  let didUpdate = false

  queryClient.setQueryData<VaultsSnapshot>(snapshotKey, (previous) => {
    if (!previous) return previous

    const index = previous.eVaultRowsInternal.findIndex(
      (row) => row.addressLower === nextRow.addressLower,
    )
    if (index === -1) return previous

    const nextRows = [...previous.eVaultRowsInternal]
    nextRows[index] = nextRow
    didUpdate = true

    return {
      ...previous,
      eVaultRowsInternal: nextRows,
    }
  })

  if (didUpdate) {
    logVaultsCache("snapshot:row-updated", {
      chainId,
      tab: "evaults",
      address: nextRow.address,
    })
  }

  return didUpdate
}

export function updateCachedEulerEarnListSnapshotFromLiveDetail(
  chainId: number,
  vault: LiveEulerEarnDetailForSnapshot,
): boolean {
  ensureVaultsSnapshotQueryDefaults(chainId)
  const queryClient = getServerQueryClient()
  const snapshotKey = getVaultsSnapshotQueryKey(chainId)
  const nextRow = toEulerEarnRowInternalFromLiveDetail(vault)
  let didUpdate = false

  queryClient.setQueryData<VaultsSnapshot>(snapshotKey, (previous) => {
    if (!previous) return previous

    const index = previous.eulerEarnRowsInternal.findIndex(
      (row) => row.addressLower === nextRow.addressLower,
    )
    if (index === -1) return previous

    const nextRows = [...previous.eulerEarnRowsInternal]
    nextRows[index] = nextRow
    didUpdate = true

    return {
      ...previous,
      eulerEarnRowsInternal: nextRows,
    }
  })

  if (didUpdate) {
    logVaultsCache("snapshot:row-updated", {
      chainId,
      tab: "eulerEarn",
      address: nextRow.address,
    })
  }

  return didUpdate
}

function createSnapshotFromVaults(allVaults: VerifiedVault[]): VaultsSnapshot {
  const eVaultRowsInternal: EVaultRowInternal[] = allVaults
    .filter(isEVault)
    .map((vault) => toEVaultRowInternalFromLiveDetail(vault))

  const eulerEarnRowsInternal: EulerEarnRowInternal[] = allVaults
    .filter(isEulerEarn)
    .map((vault) => toEulerEarnRowInternalFromLiveDetail(vault))

  return {
    updatedAt: Date.now(),
    eVaultRowsInternal,
    eulerEarnRowsInternal,
    eVaultsCount: eVaultRowsInternal.length,
    earnVaultsCount: eulerEarnRowsInternal.length,
  }
}

async function fetchFreshSnapshot(chainId: number): Promise<VaultsSnapshot> {
  const sdk = await getServerSdk()
  const allVaults = await sdk.vaultMetaService.fetchVerifiedVaults(chainId, ALL_PERSPECTIVES, {
    populateMarketPrices: true,
  })

  return createSnapshotFromVaults(allVaults)
}

async function getCachedSnapshot(chainId: number): Promise<{
  snapshot: VaultsSnapshot
  snapshotUpdatedAt: number
  snapshotIsStale: boolean
  isRefreshing: boolean
  refreshError: VaultsSnapshotError | null
}> {
  let state = getVaultsSnapshotState(chainId)

  // On cold boot, wait for the startup refresh once before serving.
  if (!state.snapshot) {
    const inFlight = getVaultsSnapshotRefreshPromises().get(chainId)
    if (inFlight) {
      await inFlight
      state = getVaultsSnapshotState(chainId)
    }
  }

  const snapshot = state.snapshot
  const refreshError = state.refreshError
  logVaultsCache("request:start", {
    chainId,
    hasInMemorySnapshot: !!snapshot,
    inMemorySnapshotAgeMs: snapshot ? Date.now() - snapshot.updatedAt : null,
    hasError: !!refreshError,
    errorAgeMs: refreshError?.at ? Date.now() - refreshError.at : null,
    isRefreshing: state.isRefreshing,
  })

  if (!snapshot) {
    const detail = refreshError ? ` Last refresh failed: ${refreshError.message}` : ""
    throw new Error(`Vault snapshot unavailable.${detail}`)
  }

  const snapshotUpdatedAt = snapshot.updatedAt
  const snapshotIsStale = Date.now() - snapshotUpdatedAt >= SNAPSHOT_REFRESH_INTERVAL_MS
  const isRefreshing = state.isRefreshing

  logVaultsCache("request:done", {
    chainId,
    snapshotUpdatedAt,
    snapshotAgeMs: Date.now() - snapshotUpdatedAt,
    snapshotIsStale,
    isRefreshing,
    hasError: !!refreshError,
  })

  return {
    snapshot,
    snapshotUpdatedAt,
    snapshotIsStale,
    isRefreshing,
    refreshError,
  }
}

export async function getVaultTableData(
  chainId: number,
  queryInput?: VaultTableQueryInput,
): Promise<VaultTableData> {
  const query = parseVaultTableQuery(queryInput ?? {})
  const { snapshot, snapshotUpdatedAt, snapshotIsStale, isRefreshing, refreshError: rawRefreshError } =
    await getCachedSnapshot(chainId)
  const refreshError =
    rawRefreshError &&
    isSimulatedRpcErrorMessage(rawRefreshError.message) &&
    !getSimulateRpcErrorsEnabled()
      ? null
      : rawRefreshError

  if (query.tab === "evaults") {
    const filtered = filterByQuery(snapshot.eVaultRowsInternal, query.q)
    const sorted = sortEVaultRows(filtered, query.sortBy, query.sortDir)
    const paged = paginateRows(sorted, query.page, query.pageSize)

    return {
      chainId,
      chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
      snapshotUpdatedAt,
      snapshotIsStale,
      isRefreshing,
      refreshError: refreshError?.message ?? null,
      refreshErrorAt: refreshError?.at ?? null,
      tab: query.tab,
      page: paged.page,
      pageSize: query.pageSize,
      totalRows: paged.totalRows,
      totalPages: paged.totalPages,
      q: query.q,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      eVaultsCount: snapshot.eVaultsCount,
      earnVaultsCount: snapshot.earnVaultsCount,
      eVaults: paged.rows.map(toPublicEVaultRow),
      earnVaults: [],
    }
  }

  const filtered = filterByQuery(snapshot.eulerEarnRowsInternal, query.q)
  const sorted = sortEulerEarnRows(filtered, query.sortBy, query.sortDir)
  const paged = paginateRows(sorted, query.page, query.pageSize)

  return {
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    snapshotUpdatedAt,
    snapshotIsStale,
    isRefreshing,
    refreshError: refreshError?.message ?? null,
    refreshErrorAt: refreshError?.at ?? null,
    tab: query.tab,
    page: paged.page,
    pageSize: query.pageSize,
    totalRows: paged.totalRows,
    totalPages: paged.totalPages,
    q: query.q,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    eVaultsCount: snapshot.eVaultsCount,
    earnVaultsCount: snapshot.earnVaultsCount,
    eVaults: [],
    earnVaults: paged.rows.map(toPublicEulerEarnRow),
  }
}
