/**
 * Compare fully populated `vaultMetaService.fetchAllVaults()` output between:
 * - the SDK default adapter set (V3-backed by default)
 * - explicit onchain adapters
 *
 * Usage:
 *   npx tsx test/parity/compare-fetch-all-vaults-default-vs-onchain.ts
 *
 * Environment variables:
 *   CHAIN_IDS     - Comma-separated chain IDs to compare. Defaults to `1`.
 *   REPORT_PREFIX - Output file prefix. Defaults to `fetch-all-vaults-default-vs-onchain`.
 *   INPUT_REPORT_JSON - Optional path to an existing JSON report whose snapshots
 *                       should be reused to rebuild the summaries and markdown.
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
  type BuildSDKOptions,
  type VaultEntity,
} from "euler-v2-sdk";

import { getRpcUrls } from "../../examples/utils/config.js";

const ROOT = resolve(import.meta.dirname);
const REPORT_PREFIX =
  process.env.REPORT_PREFIX ?? "fetch-all-vaults-default-vs-onchain";
const NUMERIC_TOLERANCE = 0.01;
const BIGINT_TOLERANCE_BPS = 100n;
const FEE_BIGINT_TOLERANCE_BPS = 200n;
const DIFF_PREVIEW_LIMIT = 20;
const MAX_RETRIES = 5;

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

type VaultSnapshot = {
  address: Address;
  chainId: number;
  type?: string;
  value: ComparableValue;
};

type ScenarioSnapshot = {
  scenario: ScenarioName;
  chainId: number;
  vaultCount: number;
  vaults: VaultSnapshot[];
  errors: DataIssueSnapshot[];
};

type VaultReportRow = {
  chainId: number;
  address: Address;
  type: string;
  status: "match" | "diff" | "missing_in_default" | "missing_in_onchain";
  issues: Issue[];
};

type ChainSummary = {
  defaultVaults: number;
  onchainVaults: number;
  matchedVaults: number;
  missingInDefault: number;
  missingInOnchain: number;
  vaultsWithDiffs: number;
  fieldDiffs: Record<string, number>;
  defaultErrors: number;
  onchainErrors: number;
};

type Report = {
  generatedAt: string;
  chainIds: number[];
  reportPrefix: string;
  summary: {
    totals: ChainSummary;
    byChain: Record<string, ChainSummary>;
  };
  snapshots: {
    default: ScenarioSnapshot[];
    onchain: ScenarioSnapshot[];
  };
  vaults: VaultReportRow[];
};

type SnapshotReuseInput = {
  chainIds: number[];
  snapshots: {
    default: ScenarioSnapshot[];
    onchain: ScenarioSnapshot[];
  };
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

function getChainIds(rpcUrls: Record<number, string>): number[] {
  if (process.env.CHAIN_IDS) {
    return process.env.CHAIN_IDS.split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  return [1].filter((chainId) => rpcUrls[chainId]);
}

function emptySummary(): ChainSummary {
  return {
    defaultVaults: 0,
    onchainVaults: 0,
    matchedVaults: 0,
    missingInDefault: 0,
    missingInOnchain: 0,
    vaultsWithDiffs: 0,
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

function isNormalizedPythNumericPath(path: string): boolean {
  return (
    path.endsWith(".pythDetail.maxConfWidth") ||
    path.endsWith(".pythDetail.maxStaleness")
  );
}

function isSupplyApyPath(path: string): boolean {
  return path.endsWith(".interestRates.supplyAPY");
}

function isFeeBigIntPath(path: string): boolean {
  return path.includes(".fees.");
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
  return bigIntsDifferWithinToleranceBps(left, right, BIGINT_TOLERANCE_BPS);
}

function bigIntsDifferWithinToleranceBps(
  left: bigint,
  right: bigint,
  toleranceBps: bigint,
): boolean {
  if (left === right) return false;

  const absLeft = left < 0n ? -left : left;
  const absRight = right < 0n ? -right : right;
  const maxAbs = absLeft > absRight ? absLeft : absRight;

  if (maxAbs === 0n) return true;

  const diff = left > right ? left - right : right - left;
  return diff * 10_000n > maxAbs * toleranceBps;
}

function getComparableSortKey(value: ComparableValue): string {
  return JSON.stringify(value);
}

function sortComparableArray(values: ComparableValue[]): ComparableValue[] {
  return [...values].sort((left, right) =>
    getComparableSortKey(left).localeCompare(getComparableSortKey(right)),
  );
}

function compareValues(
  left: ComparableValue,
  right: ComparableValue,
  path: string,
  differences: Issue[],
) {
  if (isNormalizedPythNumericPath(path)) {
    const leftBigInt = toBigIntLike(left);
    const rightBigInt = toBigIntLike(right);
    if (leftBigInt !== null && rightBigInt !== null) {
      if (leftBigInt !== rightBigInt) {
        differences.push({
          path,
          reason: "value mismatch",
          default: left,
          onchain: right,
        });
      }
      return;
    }
  }

  if (isSupplyApyPath(path)) {
    const leftNumber = toFiniteNumberLike(left);
    const rightNumber = toFiniteNumberLike(right);
    if (leftNumber !== null && rightNumber !== null) {
      if (valuesDifferWithinTolerance(leftNumber, rightNumber)) {
        differences.push({
          path,
          reason: "numeric values differ by more than 1%",
          default: left,
          onchain: right,
        });
      }
      return;
    }
  }

  if (typeof left === "number" && typeof right === "number") {
    if (path.endsWith(".interestRateModel.type")) {
      if (!Object.is(left, right)) {
        differences.push({
          path,
          reason: "enum value mismatch",
          default: left,
          onchain: right,
        });
      }
      return;
    }

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
    const toleranceBps = isFeeBigIntPath(path)
      ? FEE_BIGINT_TOLERANCE_BPS
      : BIGINT_TOLERANCE_BPS;
    if (
      bigIntsDifferWithinToleranceBps(
        BigInt(left.value),
        BigInt(right.value),
        toleranceBps,
      )
    ) {
      differences.push({
        path,
        reason: `bigint values differ by more than ${Number(toleranceBps) / 100}%`,
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
        if (isUndefinedSnapshot(right[key]!)) {
          continue;
        }
        differences.push({
          path: `${path}.${key}`,
          reason: "missing on default",
          default: { __type: "undefined" },
          onchain: right[key]!,
        });
        continue;
      }
      if (!(key in right)) {
        if (isUndefinedSnapshot(left[key]!)) {
          continue;
        }
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

function getVaultType(vault: VaultEntity | undefined): string {
  if (!vault) return "Unknown";
  const value = vault as { type?: unknown };
  return typeof value.type === "string" ? value.type : vault.constructor.name;
}

function toVaultMap(vaults: (VaultEntity | undefined)[]): Map<string, VaultSnapshot> {
  const map = new Map<string, VaultSnapshot>();

  for (const vault of vaults) {
    if (!vault) continue;
    const address = getAddress(vault.address);
    map.set(address.toLowerCase(), {
      address,
      chainId: vault.chainId,
      type: getVaultType(vault),
      value: toComparableValue(vault),
    });
  }

  return map;
}

async function fetchScenarioSnapshot(
  scenario: ScenarioName,
  sdkOptions: BuildSDKOptions,
  chainId: number,
): Promise<ScenarioSnapshot> {
  const sdk = await buildEulerSDK(sdkOptions);
  const response = await sdk.vaultMetaService.fetchAllVaults(chainId, {
    options: {
      populateAll: true,
    },
  });

  const vaultMap = toVaultMap(response.result);

  return {
    scenario,
    chainId,
    vaultCount: vaultMap.size,
    vaults: [...vaultMap.values()].sort((left, right) =>
      left.address.localeCompare(right.address),
    ),
    errors: response.errors.map((issue) => toDataIssueSnapshot(issue)),
  };
}

function summarizeChain(
  chainId: number,
  defaultSnapshot: ScenarioSnapshot,
  onchainSnapshot: ScenarioSnapshot,
): { summary: ChainSummary; rows: VaultReportRow[] } {
  const summary = emptySummary();
  const rows: VaultReportRow[] = [];

  summary.defaultVaults = defaultSnapshot.vaultCount;
  summary.onchainVaults = onchainSnapshot.vaultCount;
  summary.defaultErrors = defaultSnapshot.errors.length;
  summary.onchainErrors = onchainSnapshot.errors.length;

  const defaultMap = new Map(
    defaultSnapshot.vaults.map((vault) => [vault.address.toLowerCase(), vault]),
  );
  const onchainMap = new Map(
    onchainSnapshot.vaults.map((vault) => [vault.address.toLowerCase(), vault]),
  );

  const allAddresses = [...new Set([...defaultMap.keys(), ...onchainMap.keys()])].sort();

  for (const addressKey of allAddresses) {
    const defaultVault = defaultMap.get(addressKey);
    const onchainVault = onchainMap.get(addressKey);

    if (!defaultVault && onchainVault) {
      summary.missingInDefault += 1;
      rows.push({
        chainId,
        address: onchainVault.address,
        type: onchainVault.type ?? "Unknown",
        status: "missing_in_default",
        issues: [],
      });
      continue;
    }

    if (defaultVault && !onchainVault) {
      summary.missingInOnchain += 1;
      rows.push({
        chainId,
        address: defaultVault.address,
        type: defaultVault.type ?? "Unknown",
        status: "missing_in_onchain",
        issues: [],
      });
      continue;
    }

    const issues: Issue[] = [];
    compareValues(defaultVault!.value, onchainVault!.value, "$", issues);

    if (issues.length === 0) {
      summary.matchedVaults += 1;
      rows.push({
        chainId,
        address: defaultVault!.address,
        type: defaultVault!.type ?? onchainVault!.type ?? "Unknown",
        status: "match",
        issues: [],
      });
      continue;
    }

    summary.vaultsWithDiffs += 1;
    for (const issue of issues) {
      summary.fieldDiffs[issue.path] = (summary.fieldDiffs[issue.path] ?? 0) + 1;
    }
    rows.push({
      chainId,
      address: defaultVault!.address,
      type: defaultVault!.type ?? onchainVault!.type ?? "Unknown",
      status: "diff",
      issues,
    });
  }

  return { summary, rows };
}

function mergeIntoTotals(target: ChainSummary, source: ChainSummary): void {
  target.defaultVaults += source.defaultVaults;
  target.onchainVaults += source.onchainVaults;
  target.matchedVaults += source.matchedVaults;
  target.missingInDefault += source.missingInDefault;
  target.missingInOnchain += source.missingInOnchain;
  target.vaultsWithDiffs += source.vaultsWithDiffs;
  target.defaultErrors += source.defaultErrors;
  target.onchainErrors += source.onchainErrors;

  for (const [field, count] of Object.entries(source.fieldDiffs)) {
    target.fieldDiffs[field] = (target.fieldDiffs[field] ?? 0) + count;
  }
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

function tokenizePath(path: string): Array<string | number> {
  if (!path.startsWith("$")) return [];

  const tokens: Array<string | number> = [];
  let index = 1;
  while (index < path.length) {
    const char = path[index];
    if (char === ".") {
      index += 1;
      let end = index;
      while (end < path.length && path[end] !== "." && path[end] !== "[") {
        end += 1;
      }
      if (end > index) {
        tokens.push(path.slice(index, end));
      }
      index = end;
      continue;
    }

    if (char === "[") {
      const end = path.indexOf("]", index);
      if (end === -1) break;
      const value = Number(path.slice(index + 1, end));
      if (Number.isInteger(value)) {
        tokens.push(value);
      }
      index = end + 1;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function findDeepestAddressForPath(
  root: ComparableValue | undefined,
  path: string,
): { address?: string; depth: number } {
  if (!root) return { depth: -1 };

  const tokens = tokenizePath(path);
  let current: ComparableValue | undefined = root;
  let bestAddress: string | undefined;
  let bestDepth = -1;

  const updateBestAddress = (value: ComparableValue | undefined, depth: number) => {
    if (!isPlainObject(value)) return;
    const address = value.address;
    if (typeof address === "string") {
      bestAddress = address;
      bestDepth = depth;
    }
  };

  updateBestAddress(current, -1);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (typeof token === "string") {
      if (!isPlainObject(current) || !(token in current)) break;
      current = current[token];
    } else {
      if (!Array.isArray(current) || token < 0 || token >= current.length) break;
      current = current[token];
    }

    updateBestAddress(current, index);
  }

  return { address: bestAddress, depth: bestDepth };
}

function getSnapshotValue(
  report: Report,
  chainId: number,
  scenario: ScenarioName,
  address: Address,
): ComparableValue | undefined {
  const snapshots = scenario === "default-v3-adapters"
    ? report.snapshots.default
    : report.snapshots.onchain;
  const snapshot = snapshots.find((entry) => entry.chainId === chainId);
  const vault = snapshot?.vaults.find(
    (entry) => entry.address.toLowerCase() === address.toLowerCase(),
  );
  return vault?.value;
}

function getIssueVaultAddress(
  report: Report,
  row: VaultReportRow,
  issue: Issue,
): string | undefined {
  const defaultValue = getSnapshotValue(
    report,
    row.chainId,
    "default-v3-adapters",
    row.address,
  );
  const onchainValue = getSnapshotValue(
    report,
    row.chainId,
    "explicit-onchain-adapters",
    row.address,
  );

  const candidates = [
    findDeepestAddressForPath(defaultValue, issue.path),
    findDeepestAddressForPath(onchainValue, issue.path),
  ].filter((candidate) => candidate.address);

  if (candidates.length === 0) return undefined;

  candidates.sort((left, right) => right.depth - left.depth);
  return candidates[0]!.address;
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
        `[compare-fetch-all-vaults] ${label}: rate-limited on attempt ${attempt}/${MAX_RETRIES}, retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function renderChainSection(chainId: number, report: Report): string {
  const summary = report.summary.byChain[String(chainId)];
  const rows = report.vaults.filter((row) => row.chainId === chainId);
  const diffs = rows.filter((row) => row.status === "diff").slice(0, DIFF_PREVIEW_LIMIT);
  const missingInDefault = rows
    .filter((row) => row.status === "missing_in_default")
    .slice(0, DIFF_PREVIEW_LIMIT);
  const missingInOnchain = rows
    .filter((row) => row.status === "missing_in_onchain")
    .slice(0, DIFF_PREVIEW_LIMIT);

  const topDiffLines = topFieldDiffs(summary.fieldDiffs)
    .map(([field, count]) => `- \`${field}\`: \`${count}\``)
    .join("\n");

  const diffLines = diffs
    .map((row) => {
      const issue = row.issues[0]!;
      const issueVaultAddress = getIssueVaultAddress(report, row, issue);
      const issueVaultSuffix =
        issueVaultAddress && issueVaultAddress.toLowerCase() !== row.address.toLowerCase()
          ? `; issue vault \`${issueVaultAddress}\``
          : "";
      return `- root \`${row.address}\` (${row.type})${issueVaultSuffix}: \`${issue.path}\` ${issue.reason}; default ${formatIssueValue(issue.default)} vs onchain ${formatIssueValue(issue.onchain)}`;
    })
    .join("\n");

  const missingDefaultLines = missingInDefault
    .map((row) => `- \`${row.address}\` (${row.type})`)
    .join("\n");

  const missingOnchainLines = missingInOnchain
    .map((row) => `- \`${row.address}\` (${row.type})`)
    .join("\n");

  return `## Chain ${chainId}

- Default (V3) vaults: \`${summary.defaultVaults}\`
- Onchain vaults: \`${summary.onchainVaults}\`
- Matched vaults: \`${summary.matchedVaults}\`
- Missing in default: \`${summary.missingInDefault}\`
- Missing in onchain: \`${summary.missingInOnchain}\`
- Vaults with diffs: \`${summary.vaultsWithDiffs}\`
- Default errors: \`${summary.defaultErrors}\`
- Onchain errors: \`${summary.onchainErrors}\`

Top diff paths:

${topDiffLines || "- none"}

Representative diff vaults:

${diffLines || "- none"}

Representative vaults missing in default:

${missingDefaultLines || "- none"}

Representative vaults missing in onchain:

${missingOnchainLines || "- none"}
`;
}

function renderMarkdownReport(report: Report): string {
  const totals = report.summary.totals;

  return `# fetchAllVaults default (V3) vs explicit onchain

Generated on ${report.generatedAt}.

## Totals

- Chains compared: \`${report.chainIds.join(", ")}\`
- Default (V3) vaults: \`${totals.defaultVaults}\`
- Onchain vaults: \`${totals.onchainVaults}\`
- Matched vaults: \`${totals.matchedVaults}\`
- Missing in default: \`${totals.missingInDefault}\`
- Missing in onchain: \`${totals.missingInOnchain}\`
- Vaults with diffs: \`${totals.vaultsWithDiffs}\`
- Default errors: \`${totals.defaultErrors}\`
- Onchain errors: \`${totals.onchainErrors}\`

## Top diff paths

${topFieldDiffs(totals.fieldDiffs)
  .map(([field, count]) => `- \`${field}\`: \`${count}\``)
  .join("\n") || "- none"}

${report.chainIds.map((chainId) => renderChainSection(chainId, report)).join("\n\n")}
`;
}

function buildReportFromSnapshots(
  chainIds: number[],
  defaultSnapshots: ScenarioSnapshot[],
  onchainSnapshots: ScenarioSnapshot[],
): Report {
  const reportRows: VaultReportRow[] = [];
  const totals = emptySummary();
  const byChain: Record<string, ChainSummary> = {};

  for (const chainId of chainIds) {
    const defaultSnapshot = defaultSnapshots.find(
      (snapshot) => snapshot.chainId === chainId,
    );
    const onchainSnapshot = onchainSnapshots.find(
      (snapshot) => snapshot.chainId === chainId,
    );

    if (!defaultSnapshot || !onchainSnapshot) {
      throw new Error(`Missing snapshots for chain ${chainId}.`);
    }

    const { summary, rows } = summarizeChain(
      chainId,
      defaultSnapshot,
      onchainSnapshot,
    );
    byChain[String(chainId)] = summary;
    mergeIntoTotals(totals, summary);
    reportRows.push(...rows);
  }

  return {
    generatedAt: new Date().toISOString(),
    chainIds,
    reportPrefix: REPORT_PREFIX,
    summary: {
      totals,
      byChain,
    },
    snapshots: {
      default: defaultSnapshots,
      onchain: onchainSnapshots,
    },
    vaults: reportRows,
  };
}

async function main() {
  if (process.env.INPUT_REPORT_JSON) {
    const inputPath = resolve(process.cwd(), process.env.INPUT_REPORT_JSON);
    const existing = JSON.parse(
      await readFile(inputPath, "utf8"),
    ) as SnapshotReuseInput;
    const report = buildReportFromSnapshots(
      existing.chainIds,
      existing.snapshots.default,
      existing.snapshots.onchain,
    );

    const jsonPath = resolve(ROOT, `${REPORT_PREFIX}.json`);
    const markdownPath = resolve(ROOT, `${REPORT_PREFIX}.md`);

    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    await writeFile(markdownPath, renderMarkdownReport(report));

    console.log(`[compare-fetch-all-vaults] rebuilt JSON report from snapshots: ${jsonPath}`);
    console.log(`[compare-fetch-all-vaults] rebuilt Markdown report from snapshots: ${markdownPath}`);
    return;
  }

  const rpcUrls = getRpcUrls();
  const chainIds = getChainIds(rpcUrls);
  const baseSdkOptions: BuildSDKOptions = {
    rpcUrls,
    ...(process.env.EULER_V3_API_KEY ? { v3ApiKey: process.env.EULER_V3_API_KEY } : {}),
  };

  if (chainIds.length === 0) {
    throw new Error(
      "No chain IDs available. Set CHAIN_IDS or provide RPC_URL_<chainId> entries in examples/.env.",
    );
  }

  for (const chainId of chainIds) {
    if (!rpcUrls[chainId]) {
      throw new Error(`Missing RPC URL for chain ${chainId}.`);
    }
  }

  const defaultSnapshots: ScenarioSnapshot[] = [];
  const onchainSnapshots: ScenarioSnapshot[] = [];

  for (const chainId of chainIds) {
    console.log(`[compare-fetch-all-vaults] chain ${chainId}: fetching default (V3) snapshot...`);
    const defaultSnapshot = await withRetries(
      `chain ${chainId} default-v3 snapshot`,
      () =>
        fetchScenarioSnapshot(
          "default-v3-adapters",
          baseSdkOptions,
          chainId,
        ),
    );
    defaultSnapshots.push(defaultSnapshot);

    console.log(`[compare-fetch-all-vaults] chain ${chainId}: fetching explicit onchain snapshot...`);
    const onchainSnapshot = await withRetries(
      `chain ${chainId} explicit-onchain snapshot`,
      () =>
        fetchScenarioSnapshot(
          "explicit-onchain-adapters",
          buildExplicitOnchainOptions(rpcUrls),
          chainId,
        ),
    );
    onchainSnapshots.push(onchainSnapshot);

    const { summary } = summarizeChain(chainId, defaultSnapshot, onchainSnapshot);

    console.log(
      `[compare-fetch-all-vaults] chain ${chainId}: default=${summary.defaultVaults}, onchain=${summary.onchainVaults}, diffs=${summary.vaultsWithDiffs}, missing_in_default=${summary.missingInDefault}, missing_in_onchain=${summary.missingInOnchain}`,
    );
  }

  const report = buildReportFromSnapshots(
    chainIds,
    defaultSnapshots,
    onchainSnapshots,
  );

  const jsonPath = resolve(ROOT, `${REPORT_PREFIX}.json`);
  const markdownPath = resolve(ROOT, `${REPORT_PREFIX}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(markdownPath, renderMarkdownReport(report));

  console.log(`[compare-fetch-all-vaults] wrote JSON report: ${jsonPath}`);
  console.log(`[compare-fetch-all-vaults] wrote Markdown report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
