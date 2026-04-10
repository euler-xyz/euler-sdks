/**
 * Compare `accountService.fetchAccount()` output between:
 * - the SDK default adapter set (V3-backed by default)
 * - explicit onchain adapters
 *
 * The account list is resolved locally using the same discovery flow that used
 * to live in `compare-sdk-app-accounts.mts`:
 * - `ACCOUNT_LIST_FILE`, when provided
 * - otherwise the saved mainnet account list
 * - otherwise dynamic discovery from indexer + V3 account data
 *
 * Usage:
 *   npx tsx test/parity/compare-fetch-accounts-default-vs-onchain.ts
 *
 * Environment variables:
 *   CHAIN_ID           - Chain ID to compare. Defaults to `1`.
 *   REPORT_PREFIX      - Output file prefix. Defaults to `fetch-accounts-default-vs-onchain`.
 *   ACCOUNT_LIST_FILE  - Optional newline-delimited address file overriding the saved list.
 *   INPUT_REPORT_JSON  - Optional path to an existing JSON report whose snapshots
 *                        should be reused to rebuild the summaries and markdown.
 *
 * The script writes:
 * - `<prefix>.json` with the full machine-readable report
 * - `<prefix>.md` with a summary report
 */

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress, type Address } from "viem";

import {
  buildEulerSDK,
  type BuildQueryFn,
  type BuildSDKOptions,
} from "euler-v2-sdk";

import { getRpcUrls } from "../../examples/utils/config.js";

const ROOT = resolve(import.meta.dirname);
const REPORT_PREFIX =
  process.env.REPORT_PREFIX ?? "fetch-accounts-default-vs-onchain";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 1);
const INDEXER_HOST = process.env.INDEXER_HOST ?? "https://indexer.euler.finance";
const V3_HOST = process.env.V3_HOST ?? "https://v3staging.eul.dev";
const TARGET_ACCOUNT = getAddress("0x75cFE4ef963232ae8313aC33e21fC39241338618");
const EXTRA_ACCOUNTS_TARGET = Number(process.env.EXTRA_ACCOUNTS_TARGET ?? 10);
const ACCOUNT_LIST_FILE = process.env.ACCOUNT_LIST_FILE;
const POPULAR_VAULT_LIMIT = Number(process.env.POPULAR_VAULT_LIMIT ?? 20);
const HOLDER_PAGES = Number(process.env.HOLDER_PAGES ?? 2);
const HOLDER_CONCURRENCY = Number(process.env.HOLDER_CONCURRENCY ?? 2);
const NUMERIC_TOLERANCE = 0.01;
const BIGINT_TOLERANCE_BPS = 100n;
const DIFF_PREVIEW_LIMIT = 20;
const MAX_RETRIES = 5;
const PARITY_QUERY_CACHE_TTL_MS = 60_000;
const MAX_INT256 = (1n << 255n) - 1n;
const MAX_INT256_MINUS_ONE = MAX_INT256 - 1n;

const SAVED_ACCOUNT_LIST: Address[] = [
  "0x75cFE4ef963232ae8313aC33e21fC39241338618",
  "0xB81a0e6c38c3Fec8A171cFE9631F60127a0C5bfD",
  "0x81633C1357ddb25d8625efB2Cad26a60988475BF",
  "0x6Ed3c871aC6aAe698a9d6E547A5F54873B091E18",
  "0x81EBde24453B8E40454616579EA79C79A197699D",
  "0x815f5BB257e88b67216a344C7C83a3eA4EE74748",
  "0xa427DEf3f920F718A89e5ab473c79C065ab10Ef4",
  "0x6EFc48B8B6222924fa6EA95d174af5518b761177",
  "0x9dbb4c06357c3e9d92737d78F1A5d541B63ec7ee",
  "0x5BDE30D9629948274a309F8708924Fd5A64e6205",
  "0x4199559fBffC5265e96d8Ef191a0a676d6AF0549",
  "0xA8DBcDB0290000C810c72Fc00018F600B0272D87",
  "0xF208b13968CF79DB8ed788907e70C288A3169c0B",
  "0x4Cf86a850Ac8380C8542BD3da73bAec52A7d8FeE",
  "0x7A9e7a2453cC940B112d668656404a8ffEA8cb98",
  "0xcdF067F306E7a511Ef701588AFCdcff292B19282",
  "0x55D1a9A897F7Ef7041b0f1eC9A6aae9978992708",
  "0x14fABe94099B5dFe8130BDa0157d8c91b07c82A7",
  "0xd7583E3CF08bbcaB66F1242195227bBf9F865Fda",
  "0xb04F3175dA53f046c9a655eCda2c9e5be38B99ca",
  "0xC7F16d35100932eBe26beeF8273f12f6a352e042",
  "0x57c294FBF23033b7A9794841E932A3a8363aef71",
  "0x260B37Be409e29c89dFB7399eF48466cB1edfcfb",
  "0x609baF18F29027444070e71B9fD092438AFc0383",
  "0x5Dac9ccC215b9Af65B486066786F79d9aa0043Da",
  "0x84A7D732CaB139951ff29C1255154A15eff1b09b",
  "0x91aEDDc4aB91A90Aa1aa1ae94a5AD9a869295AfF",
  "0xA2636f5e3E2f63c3Ca3B50a97Ac3D9aa7Fce8FD0",
  "0x1024f785724Fe08902438761b288Eff3aE41048A",
  "0x3af4A49C8E2FcaF33Fd3389543B80D320FCC9091",
  "0xc93D036c58C83811A82fb98FeEd8cac7a942A110",
  "0x029cd954C38838b2731Cb5618E5C950ed4766956",
  "0x2175CE7c56BAa22874Eeb021c1270E6198059Cda",
  "0x5B9EFFDCBD65946F2B143725Dc244563248AA4Ee",
  "0xfF52FC331812c959293891Ccdc37404d903F5479",
  "0xA7a71E78128F6e3f6dB404ec47806E472F280ef8",
  "0xFe259bDF4f11E09826408923BAe36c62FF101fB2",
  "0x65b75050255BD57a8Bd155F85b91B403C6AA1ee0",
  "0xf781C9e19A7db2A4a36538f250557BCD703eEc78",
  "0xFF9D5bd7d4293442BA9673a078061596db9B340b",
  "0xd52929B69680A6f74D2eB9c8F1ef482f37b1b32B",
  "0x3f9B9df12C5Df2CC688b9DD4f8391A07067f3CC2",
  "0x78C695C75cde22C1bC67E974f839a869B59B470c",
  "0x810aDE1F763116D5F88b0b0197f2F9492891f506",
  "0x10098de28BA6928186954FcC18AD919040600Af3",
  "0xa765A629f11f538F6d67e3fDF799BaEd1506017d",
  "0x272C39C82CA9F10e5338A6eE75927cFe00C82e2c",
  "0x9aFDF37Fa2B1c486dD73b35FB154B679779C09A5",
  "0x3EB6F25A0a879e5A11270d3BC3C17efB6D41b518",
  "0xb497070466Dc15FA6420b4781bB0352257146495",
].map(getAddress);

type ScenarioName = "default-v3-adapters" | "explicit-onchain-adapters";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type BigIntSnapshot = { __type: "bigint"; value: string };
type UndefinedSnapshot = { __type: "undefined" };
type ComparableValue = JsonValue | BigIntSnapshot | UndefinedSnapshot;

type Issue = {
  path: string;
  reason: string;
  default: ComparableValue;
  onchain: ComparableValue;
};

type DataIssueSnapshot = {
  code: string;
  severity: string;
  message: string;
  paths?: string[];
  entityId?: string;
  source?: string;
};

type AccountSnapshot = {
  address: Address;
  chainId: number;
  subAccounts: number;
  value: ComparableValue;
};

type ScenarioSnapshot = {
  scenario: ScenarioName;
  chainId: number;
  requestedAccounts: Address[];
  accountCount: number;
  accounts: AccountSnapshot[];
  errors: DataIssueSnapshot[];
};

type AccountReportRow = {
  chainId: number;
  address: Address;
  status: "match" | "diff" | "missing_in_default" | "missing_in_onchain";
  issues: Issue[];
};

type ChainSummary = {
  requestedAccounts: number;
  defaultAccounts: number;
  onchainAccounts: number;
  matchedAccounts: number;
  missingInDefault: number;
  missingInOnchain: number;
  accountsWithDiffs: number;
  fieldDiffs: Record<string, number>;
  defaultErrors: number;
  onchainErrors: number;
};

type Report = {
  generatedAt: string;
  chainId: number;
  reportPrefix: string;
  comparedAccounts: Address[];
  discovery: ComparisonAccountDiscovery;
  summary: ChainSummary;
  snapshots: {
    default: ScenarioSnapshot;
    onchain: ScenarioSnapshot;
  };
  accounts: AccountReportRow[];
};

type SnapshotReuseInput = {
  chainId: number;
  comparedAccounts: Address[];
  discovery?: ComparisonAccountDiscovery;
  snapshots: {
    default: ScenarioSnapshot;
    onchain: ScenarioSnapshot;
  };
};

type DiscoveredExtra = {
  address: Address;
  source: "account_list_file" | "saved_account_list" | "vault_holders";
  sourceVault?: Address;
  sourceVaultName?: string | null;
  sourceVaultSymbol?: string | null;
  sourceHolder?: Address;
  activeSubAccounts?: number;
  borrowingSubAccounts?: number;
  borrowedPositions?: number;
  rowCount?: number;
};

type DiscoveredVault = {
  address: Address;
  name: string | null;
  symbol: string | null;
  assetSymbol: string | null;
  totalAssetsUSD: number;
};

type ComparisonAccountDiscovery = {
  warnings: string[];
  targetSummary: {
    address: Address;
    activeSubAccounts: number;
    borrowingSubAccounts: number;
    borrowedPositions: number;
    rowCount: number;
  } | null;
  accounts: Address[];
  discoveredExtras: DiscoveredExtra[];
  scannedVaults: DiscoveredVault[];
};

function buildExplicitOnchainOptions(
  rpcUrls: Record<number, string>,
): BuildSDKOptions {
  const v3ApiKey = process.env.EULER_V3_API_KEY;

  return {
    rpcUrls,
    ...(v3ApiKey ? { v3ApiKey } : {}),
    accountServiceConfig: {
      adapter: "onchain",
    },
    eVaultServiceConfig: {
      adapter: "onchain",
    },
    eulerEarnServiceConfig: {
      adapter: "onchain",
    },
  };
}

function serializeQueryArgs(args: unknown[]): string | null {
  try {
    return JSON.stringify(args, (_key, value) => {
      if (typeof value === "bigint") {
        return { __type: "bigint", value: value.toString() };
      }
      if (typeof value === "function") return "[function]";
      return value;
    });
  } catch {
    return null;
  }
}

function createSharedParityBuildQuery(
  ttlMs = PARITY_QUERY_CACHE_TTL_MS,
): BuildQueryFn {
  const cache = new Map<
    string,
    {
      expiresAt: number;
      value?: unknown;
      promise?: Promise<unknown>;
    }
  >();

  return <T extends (...args: any[]) => Promise<any>>(
    queryName: string,
    fn: T,
  ): T => {
    const wrapped = (async (...args: Parameters<T>) => {
      const serializedArgs = serializeQueryArgs(args);
      if (serializedArgs === null) {
        return fn(...args);
      }

      const cacheKey = `${queryName}:${serializedArgs}`;
      const now = Date.now();
      const cached = cache.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        if (cached.promise) return cached.promise as Awaited<ReturnType<T>>;
        if ("value" in cached) return cached.value as Awaited<ReturnType<T>>;
      }

      const promise = fn(...args)
        .then((value) => {
          cache.set(cacheKey, {
            expiresAt: Date.now() + ttlMs,
            value,
          });
          return value;
        })
        .catch((error) => {
          const current = cache.get(cacheKey);
          if (current?.promise === promise) {
            cache.delete(cacheKey);
          }
          throw error;
        });

      cache.set(cacheKey, {
        expiresAt: now + ttlMs,
        promise,
      });

      return promise as Awaited<ReturnType<T>>;
    }) as T;

    return wrapped;
  };
}

async function getComparisonAccounts(): Promise<Address[]> {
  if (ACCOUNT_LIST_FILE) {
    const contents = await readFile(resolve(process.cwd(), ACCOUNT_LIST_FILE), "utf8");
    const seen = new Set<string>();
    const accounts: Address[] = [];

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const address = getAddress(trimmed);
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      accounts.push(address);
    }

    return accounts;
  }

  return SAVED_ACCOUNT_LIST;
}

function emptySummary(requestedAccounts: number): ChainSummary {
  return {
    requestedAccounts,
    defaultAccounts: 0,
    onchainAccounts: 0,
    matchedAccounts: 0,
    missingInDefault: 0,
    missingInOnchain: 0,
    accountsWithDiffs: 0,
    fieldDiffs: {},
    defaultErrors: 0,
    onchainErrors: 0,
  };
}

function toDataIssueSnapshot(issue: unknown): DataIssueSnapshot {
  const value = (issue ?? {}) as Record<string, unknown>;
  return {
    code: typeof value.code === "string" ? value.code : "UNKNOWN",
    severity: typeof value.severity === "string" ? value.severity : "unknown",
    message: typeof value.message === "string" ? value.message : JSON.stringify(value),
    paths: Array.isArray(value.paths)
      ? value.paths.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    entityId: typeof value.entityId === "string" ? value.entityId : undefined,
    source: typeof value.source === "string" ? value.source : undefined,
  };
}

function toComparableValue(
  input: unknown,
  ancestors = new WeakSet<object>(),
): ComparableValue {
  if (input === null) return null;
  if (input === undefined) return { __type: "undefined" };

  const inputType = typeof input;
  if (
    inputType === "string" ||
    inputType === "number" ||
    inputType === "boolean"
  ) {
    return input as string | number | boolean;
  }
  if (inputType === "bigint") {
    return { __type: "bigint", value: input.toString() };
  }
  if (inputType === "function") {
    return "[function]";
  }

  if (Array.isArray(input)) {
    return input.map((value) => toComparableValue(value, ancestors));
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input && inputType === "object") {
    if (ancestors.has(input as object)) {
      return "[circular]";
    }
    ancestors.add(input as object);

    const output: Record<string, ComparableValue> = {};
    const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [key, value] of entries) {
      if (typeof value === "function") continue;
      output[key] = toComparableValue(value, ancestors);
    }

    ancestors.delete(input as object);
    return output;
  }

  return String(input);
}

function isBigIntSnapshot(value: ComparableValue): value is BigIntSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "__type" in value &&
    value.__type === "bigint"
  );
}

function isUndefinedSnapshot(value: ComparableValue): value is UndefinedSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "__type" in value &&
    value.__type === "undefined"
  );
}

function isPlainObject(
  value: ComparableValue,
): value is Record<string, ComparableValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestampPath(path: string): boolean {
  return (
    path === "$.timestamp" ||
    path.endsWith(".timestamp") ||
    path.endsWith(".lastAccountStatusCheckTimestamp")
  );
}

function toFiniteNumberLike(value: ComparableValue): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isValidUnixTimestampLike(value: ComparableValue): boolean {
  const parsed = toFiniteNumberLike(value);
  if (parsed === null) return false;
  return parsed >= 0;
}

function toBigIntLike(value: ComparableValue): bigint | null {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }

  if (isBigIntSnapshot(value)) {
    return BigInt(value.value);
  }

  return null;
}

function valuesDifferWithinTolerance(left: number, right: number): boolean {
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return !(Number.isNaN(left) && Number.isNaN(right));
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return left !== right;
  }
  if (Object.is(left, right)) return false;

  const maxAbs = Math.max(Math.abs(left), Math.abs(right));
  if (maxAbs === 0) return true;

  return Math.abs(left - right) / maxAbs > NUMERIC_TOLERANCE;
}

function bigIntsDifferWithinTolerance(left: bigint, right: bigint): boolean {
  if (left === right) return false;

  const absLeft = left < 0n ? -left : left;
  const absRight = right < 0n ? -right : right;
  const maxAbs = absLeft > absRight ? absLeft : absRight;

  if (maxAbs === 0n) return true;

  const diff = left > right ? left - right : right - left;
  return diff * 10_000n > maxAbs * BIGINT_TOLERANCE_BPS;
}

function getComparableSortKey(value: ComparableValue): string {
  return JSON.stringify(value);
}

function sortComparableArray(values: ComparableValue[]): ComparableValue[] {
  return [...values].sort((left, right) =>
    getComparableSortKey(left).localeCompare(getComparableSortKey(right)),
  );
}

function isAddressKeyedArrayPath(path: string): boolean {
  return path.endsWith(".positions") || path.endsWith(".collaterals");
}

function getAddressKeyedEntryToken(
  path: string,
  value: ComparableValue,
): string | undefined {
  if (!isAddressKeyedArrayPath(path) || !isPlainObject(value)) return undefined;

  if (typeof value.address === "string") {
    return `address:${value.address.toLowerCase()}`;
  }
  if (typeof value.vaultAddress === "string") {
    return `vault:${value.vaultAddress.toLowerCase()}`;
  }

  return undefined;
}

function compareValues(
  left: ComparableValue,
  right: ComparableValue,
  path: string,
  differences: Issue[],
) {
  if (isTimestampPath(path)) {
    if (!isValidUnixTimestampLike(left) || !isValidUnixTimestampLike(right)) {
      differences.push({
        path,
        reason: "invalid timestamp",
        default: left,
        onchain: right,
      });
    }
    return;
  }

  if (typeof left === "number" && typeof right === "number") {
    if (valuesDifferWithinTolerance(left, right)) {
      differences.push({
        path,
        reason: "numeric values differ by more than 1%",
        default: left,
        onchain: right,
      });
    }
    return;
  }

  if (isBigIntSnapshot(left) && isBigIntSnapshot(right)) {
    const leftBigInt = BigInt(left.value);
    const rightBigInt = BigInt(right.value);
    if (bigIntsDifferWithinTolerance(leftBigInt, rightBigInt)) {
      differences.push({
        path,
        reason: "bigint values differ by more than 1%",
        default: left,
        onchain: right,
      });
    }
    return;
  }

  const leftBigInt = toBigIntLike(left);
  const rightBigInt = toBigIntLike(right);
  if (leftBigInt !== null && rightBigInt !== null) {
    if (bigIntsDifferWithinTolerance(leftBigInt, rightBigInt)) {
      differences.push({
        path,
        reason: "integer-like values differ by more than 1%",
        default: left,
        onchain: right,
      });
    }
    return;
  }

  if (isUndefinedSnapshot(left) && isUndefinedSnapshot(right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const leftKeys = left.map((value) => getAddressKeyedEntryToken(path, value));
    const rightKeys = right.map((value) => getAddressKeyedEntryToken(path, value));
    const canCompareByAddressKey =
      left.length > 0 &&
      right.length > 0 &&
      leftKeys.every((key): key is string => typeof key === "string") &&
      rightKeys.every((key): key is string => typeof key === "string") &&
      new Set(leftKeys).size === leftKeys.length &&
      new Set(rightKeys).size === rightKeys.length;

    if (canCompareByAddressKey) {
      if (left.length !== right.length) {
        differences.push({
          path,
          reason: "array length mismatch",
          default: left.length,
          onchain: right.length,
        });
      }

      const leftMap = new Map(leftKeys.map((key, index) => [key, left[index]!]));
      const rightMap = new Map(rightKeys.map((key, index) => [key, right[index]!]));
      const allKeys = [...new Set([...leftKeys, ...rightKeys])].sort();

      for (const key of allKeys) {
        const leftValue = leftMap.get(key);
        const rightValue = rightMap.get(key);
        if (leftValue === undefined) {
          differences.push({
            path: `${path}[${key}]`,
            reason: "missing on default",
            default: { __type: "undefined" },
            onchain: rightValue!,
          });
          continue;
        }
        if (rightValue === undefined) {
          differences.push({
            path: `${path}[${key}]`,
            reason: "missing on onchain",
            default: leftValue,
            onchain: { __type: "undefined" },
          });
          continue;
        }

        compareValues(leftValue, rightValue, `${path}[${key}]`, differences);
      }
      return;
    }

    const sortedLeft = sortComparableArray(left);
    const sortedRight = sortComparableArray(right);

    if (sortedLeft.length !== sortedRight.length) {
      differences.push({
        path,
        reason: "array length mismatch",
        default: sortedLeft.length,
        onchain: sortedRight.length,
      });
    }

    const maxLength = Math.max(sortedLeft.length, sortedRight.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= sortedLeft.length) {
        differences.push({
          path: `${path}[${index}]`,
          reason: "missing on default",
          default: { __type: "undefined" },
          onchain: sortedRight[index]!,
        });
        continue;
      }
      if (index >= sortedRight.length) {
        differences.push({
          path: `${path}[${index}]`,
          reason: "missing on onchain",
          default: sortedLeft[index]!,
          onchain: { __type: "undefined" },
        });
        continue;
      }

      compareValues(
        sortedLeft[index]!,
        sortedRight[index]!,
        `${path}[${index}]`,
        differences,
      );
    }
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of Array.from(keys).sort()) {
      if (!(key in left)) {
        if (isUndefinedSnapshot(right[key]!)) continue;
        differences.push({
          path: `${path}.${key}`,
          reason: "missing on default",
          default: { __type: "undefined" },
          onchain: right[key]!,
        });
        continue;
      }
      if (!(key in right)) {
        if (isUndefinedSnapshot(left[key]!)) continue;
        differences.push({
          path: `${path}.${key}`,
          reason: "missing on onchain",
          default: left[key]!,
          onchain: { __type: "undefined" },
        });
        continue;
      }

      compareValues(left[key]!, right[key]!, `${path}.${key}`, differences);
    }
    return;
  }

  if (JSON.stringify(left) !== JSON.stringify(right)) {
    differences.push({
      path,
      reason: "value mismatch",
      default: left,
      onchain: right,
    });
  }
}

function countSubAccounts(accountValue: unknown): number {
  if (!accountValue || typeof accountValue !== "object") return 0;
  const subAccounts = (accountValue as { subAccounts?: Record<string, unknown> }).subAccounts;
  return subAccounts && typeof subAccounts === "object" ? Object.keys(subAccounts).length : 0;
}

function toAccountSnapshot(
  address: Address,
  chainId: number,
  account: unknown,
): AccountSnapshot | undefined {
  const subAccounts = countSubAccounts(account);
  if (subAccounts === 0) return undefined;

  return {
    address,
    chainId,
    subAccounts,
    value: toComparableValue(account),
  };
}

async function fetchScenarioSnapshot(
  scenario: ScenarioName,
  sdkOptions: BuildSDKOptions,
  chainId: number,
  accounts: Address[],
): Promise<ScenarioSnapshot> {
  const sdk = await buildEulerSDK(sdkOptions);
  const snapshots: AccountSnapshot[] = [];
  const errors: DataIssueSnapshot[] = [];

  for (const address of accounts) {
    const response = await sdk.accountService.fetchAccount(chainId, address, {
      populateVaults: false,
    });

    const snapshot = toAccountSnapshot(address, chainId, response.result);
    if (snapshot) {
      snapshots.push(snapshot);
    }

    errors.push(
      ...response.errors.map((issue) => ({
        ...toDataIssueSnapshot(issue),
        entityId: toDataIssueSnapshot(issue).entityId ?? address,
      })),
    );
  }

  snapshots.sort((left, right) => left.address.localeCompare(right.address));

  return {
    scenario,
    chainId,
    requestedAccounts: accounts,
    accountCount: snapshots.length,
    accounts: snapshots,
    errors,
  };
}

function summarizeChain(
  requestedAccounts: Address[],
  defaultSnapshot: ScenarioSnapshot,
  onchainSnapshot: ScenarioSnapshot,
): { summary: ChainSummary; rows: AccountReportRow[] } {
  const summary = emptySummary(requestedAccounts.length);
  const rows: AccountReportRow[] = [];

  summary.defaultAccounts = defaultSnapshot.accountCount;
  summary.onchainAccounts = onchainSnapshot.accountCount;
  summary.defaultErrors = defaultSnapshot.errors.length;
  summary.onchainErrors = onchainSnapshot.errors.length;

  const defaultMap = new Map(
    defaultSnapshot.accounts.map((account) => [account.address.toLowerCase(), account]),
  );
  const onchainMap = new Map(
    onchainSnapshot.accounts.map((account) => [account.address.toLowerCase(), account]),
  );

  for (const address of requestedAccounts) {
    const addressKey = address.toLowerCase();
    const defaultAccount = defaultMap.get(addressKey);
    const onchainAccount = onchainMap.get(addressKey);

    if (!defaultAccount && onchainAccount) {
      summary.missingInDefault += 1;
      rows.push({
        chainId: onchainAccount.chainId,
        address,
        status: "missing_in_default",
        issues: [],
      });
      continue;
    }

    if (defaultAccount && !onchainAccount) {
      summary.missingInOnchain += 1;
      rows.push({
        chainId: defaultAccount.chainId,
        address,
        status: "missing_in_onchain",
        issues: [],
      });
      continue;
    }

    if (!defaultAccount && !onchainAccount) {
      summary.matchedAccounts += 1;
      rows.push({
        chainId: defaultSnapshot.chainId,
        address,
        status: "match",
        issues: [],
      });
      continue;
    }

    const issues: Issue[] = [];
    compareValues(defaultAccount!.value, onchainAccount!.value, "$", issues);

    if (issues.length === 0) {
      summary.matchedAccounts += 1;
      rows.push({
        chainId: defaultAccount!.chainId,
        address,
        status: "match",
        issues: [],
      });
      continue;
    }

    summary.accountsWithDiffs += 1;
    for (const issue of issues) {
      summary.fieldDiffs[issue.path] = (summary.fieldDiffs[issue.path] ?? 0) + 1;
    }
    rows.push({
      chainId: defaultAccount!.chainId,
      address,
      status: "diff",
      issues,
    });
  }

  return { summary, rows };
}

function topFieldDiffs(
  fieldDiffs: Record<string, number>,
  limit = 10,
): Array<[string, number]> {
  return Object.entries(fieldDiffs)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function formatIssueValue(value: ComparableValue): string {
  return `\`${JSON.stringify(value)}\``;
}

function renderMarkdownReport(report: Report): string {
  const summary = report.summary;
  const diffs = report.accounts
    .filter((row) => row.status === "diff")
    .slice(0, DIFF_PREVIEW_LIMIT);
  const missingInDefault = report.accounts
    .filter((row) => row.status === "missing_in_default")
    .slice(0, DIFF_PREVIEW_LIMIT);
  const missingInOnchain = report.accounts
    .filter((row) => row.status === "missing_in_onchain")
    .slice(0, DIFF_PREVIEW_LIMIT);

  return `# fetchAccount default (V3) vs explicit onchain

Generated on ${report.generatedAt}.

## Totals

- Chain compared: \`${report.chainId}\`
- Requested accounts: \`${summary.requestedAccounts}\`
- Default (V3) accounts: \`${summary.defaultAccounts}\`
- Onchain accounts: \`${summary.onchainAccounts}\`
- Matched accounts: \`${summary.matchedAccounts}\`
- Missing in default: \`${summary.missingInDefault}\`
- Missing in onchain: \`${summary.missingInOnchain}\`
- Accounts with diffs: \`${summary.accountsWithDiffs}\`
- Default errors: \`${summary.defaultErrors}\`
- Onchain errors: \`${summary.onchainErrors}\`

## Top diff paths

${topFieldDiffs(summary.fieldDiffs)
  .map(([field, count]) => `- \`${field}\`: \`${count}\``)
  .join("\n") || "- none"}

## Representative diffs

${diffs
  .map((row) => {
    const issue = row.issues[0]!;
    return `- account \`${row.address}\`: \`${issue.path}\` ${issue.reason}; default ${formatIssueValue(issue.default)} vs onchain ${formatIssueValue(issue.onchain)}`;
  })
  .join("\n") || "- none"}

## Representative accounts missing in default

${missingInDefault.map((row) => `- \`${row.address}\``).join("\n") || "- none"}

## Representative accounts missing in onchain

${missingInOnchain.map((row) => `- \`${row.address}\``).join("\n") || "- none"}
`;
}

function buildReportFromSnapshots(
  chainId: number,
  comparedAccounts: Address[],
  defaultSnapshot: ScenarioSnapshot,
  onchainSnapshot: ScenarioSnapshot,
): Report {
  const { summary, rows } = summarizeChain(
    comparedAccounts,
    defaultSnapshot,
    onchainSnapshot,
  );

  return {
    generatedAt: new Date().toISOString(),
    chainId,
    reportPrefix: REPORT_PREFIX,
    comparedAccounts,
    summary,
    snapshots: {
      default: defaultSnapshot,
      onchain: onchainSnapshot,
    },
    accounts: rows,
  };
}

function isRateLimitError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes("429") || message.toLowerCase().includes("rate limit");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const delayMs = 1_500 * attempt;
      console.warn(
        `[compare-fetch-accounts] ${label}: rate-limited on attempt ${attempt}/${MAX_RETRIES}, retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function main() {
  if (!Number.isInteger(CHAIN_ID) || CHAIN_ID <= 0) {
    throw new Error(`Invalid CHAIN_ID: ${process.env.CHAIN_ID ?? CHAIN_ID}`);
  }

  if (process.env.INPUT_REPORT_JSON) {
    const inputPath = resolve(process.cwd(), process.env.INPUT_REPORT_JSON);
    const existing = JSON.parse(
      await readFile(inputPath, "utf8"),
    ) as SnapshotReuseInput;
    const report = buildReportFromSnapshots(
      existing.chainId,
      existing.comparedAccounts,
      existing.snapshots.default,
      existing.snapshots.onchain,
    );

    const jsonPath = resolve(ROOT, `${REPORT_PREFIX}.json`);
    const markdownPath = resolve(ROOT, `${REPORT_PREFIX}.md`);

    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    await writeFile(markdownPath, renderMarkdownReport(report));

    console.log(`[compare-fetch-accounts] rebuilt JSON report from snapshots: ${jsonPath}`);
    console.log(`[compare-fetch-accounts] rebuilt Markdown report from snapshots: ${markdownPath}`);
    return;
  }

  const rpcUrls = getRpcUrls();
  const rpcUrl = rpcUrls[CHAIN_ID];
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for chain ${CHAIN_ID}.`);
  }

  const comparedAccounts = await getComparisonAccounts();
  if (comparedAccounts.length === 0) {
    throw new Error("No accounts available for comparison.");
  }

  const sharedBuildQuery = createSharedParityBuildQuery();
  const baseSdkOptions: BuildSDKOptions = {
    rpcUrls: { [CHAIN_ID]: rpcUrl },
    ...(process.env.EULER_V3_API_KEY ? { v3ApiKey: process.env.EULER_V3_API_KEY } : {}),
    buildQuery: sharedBuildQuery,
  };

  console.log(`[compare-fetch-accounts] chain ${CHAIN_ID}: comparing ${comparedAccounts.length} accounts...`);

  const defaultSnapshot = await withRetries(
    `chain ${CHAIN_ID} default-v3 snapshot`,
    () =>
      fetchScenarioSnapshot(
        "default-v3-adapters",
        baseSdkOptions,
        CHAIN_ID,
        comparedAccounts,
      ),
  );

  const onchainSnapshot = await withRetries(
    `chain ${CHAIN_ID} explicit-onchain snapshot`,
    () =>
      fetchScenarioSnapshot(
        "explicit-onchain-adapters",
        {
          ...buildExplicitOnchainOptions({ [CHAIN_ID]: rpcUrl }),
          buildQuery: sharedBuildQuery,
        },
        CHAIN_ID,
        comparedAccounts,
      ),
  );

  const report = buildReportFromSnapshots(
    CHAIN_ID,
    comparedAccounts,
    defaultSnapshot,
    onchainSnapshot,
  );

  const jsonPath = resolve(ROOT, `${REPORT_PREFIX}.json`);
  const markdownPath = resolve(ROOT, `${REPORT_PREFIX}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(markdownPath, renderMarkdownReport(report));

  console.log(
    `[compare-fetch-accounts] chain ${CHAIN_ID}: default=${report.summary.defaultAccounts}, onchain=${report.summary.onchainAccounts}, diffs=${report.summary.accountsWithDiffs}, missing_in_default=${report.summary.missingInDefault}, missing_in_onchain=${report.summary.missingInOnchain}`,
  );
  console.log(`[compare-fetch-accounts] wrote JSON report: ${jsonPath}`);
  console.log(`[compare-fetch-accounts] wrote Markdown report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
