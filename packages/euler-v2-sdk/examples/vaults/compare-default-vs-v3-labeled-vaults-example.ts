/**
 * COMPARE DEFAULT VS EXPLICIT V3 LABELED VAULT FETCHES
 *
 * Fetches all vault addresses referenced by Euler label products on mainnet,
 * then compares `vaultMetaService.fetchVaults(..., { populateAll: true })`
 * across:
 * - the SDK's default built-in adapter set
 * - an SDK configured with explicit V3 adapters
 *
 * The script:
 * 1. Builds the default SDK
 * 2. Loads all vault addresses from label products
 * 3. Fetches fully populated vaults and records the result
 * 4. Builds an SDK with explicit V3 adapters
 * 5. Fetches the same vault set again
 * 6. Prints a diff, allowing numeric values to differ by up to 1%
 *
 * USAGE:
 *   Set RPC_URL_1 in examples/.env for mainnet access, then run:
 *   npx tsx examples/vaults/compare-default-vs-v3-labeled-vaults-example.ts
 */

import "dotenv/config";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAddress, type Address } from "viem";
import { mainnet } from "viem/chains";

import { getRpcUrls } from "../utils/config.js";
import {
  buildEulerSDK,
  type BuildSDKOptions,
  type DataIssue,
  type ServiceResult,
  type VaultEntity,
} from "euler-v2-sdk";

const CHAIN_ID = mainnet.id;
const NUMERIC_TOLERANCE = 0.01;
const BIGINT_TOLERANCE_BPS = 100n;
const DIFF_PREVIEW_LIMIT = 200;
const V3_DEFAULT_ENDPOINT = "https://v3staging.eul.dev";

type ScenarioName = "default-adapter-set" | "explicit-v3-adapters";

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

type SnapshotRecord = {
  scenario: ScenarioName;
  chainId: number;
  vaultAddresses: Address[];
  unresolvedVaults: Address[];
  resolvedVaultCount: number;
  errorCount: number;
  errorSummary: string;
  errors: ComparableValue;
  result: ComparableValue;
};

type Difference = {
  path: string;
  reason: string;
  left: ComparableValue;
  right: ComparableValue;
};

function getV3Endpoint(envVarName: string): string {
  return process.env[envVarName] || V3_DEFAULT_ENDPOINT;
}

function buildExplicitV3Options(rpcUrls: Record<number, string>): BuildSDKOptions {
  const v3ApiKey = process.env.EULER_V3_API_KEY;

  return {
    rpcUrls,
    ...(v3ApiKey ? { v3ApiKey } : {}),
    accountServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: getV3Endpoint("EULER_ACCOUNT_V3_API_URL"),
      },
    },
    eVaultServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: getV3Endpoint("EULER_EVAULT_V3_API_URL"),
      },
    },
    eulerEarnServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: getV3Endpoint("EULER_EULER_EARN_V3_API_URL"),
      },
    },
    vaultTypeAdapterConfig: {
      endpoint: getV3Endpoint("EULER_VAULT_TYPE_V3_API_URL"),
      ...(v3ApiKey ? { apiKey: v3ApiKey } : {}),
    },
  };
}

async function fetchVaultAddressesFromLabelProducts(): Promise<Address[]> {
  const sdk = await buildEulerSDK({ rpcUrls: getRpcUrls() });
  const products = await sdk.eulerLabelsService.fetchEulerLabelsProducts(CHAIN_ID);
  const seen = new Set<string>();
  const addresses: Address[] = [];

  for (const product of Object.values(products)) {
    for (const vaultAddress of product.vaults ?? []) {
      try {
        const normalized = getAddress(vaultAddress);
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(normalized);
      } catch {
        continue;
      }
    }
  }

  return addresses;
}

async function fetchSnapshot(
  scenario: ScenarioName,
  sdkOptions: BuildSDKOptions,
  vaultAddresses: Address[],
): Promise<SnapshotRecord> {
  const sdk = await buildEulerSDK(sdkOptions);
  const response = await sdk.vaultMetaService.fetchVaults(CHAIN_ID, vaultAddresses, {
    populateAll: true,
  });

  const unresolvedVaults = collectUnresolvedVaults(vaultAddresses, response);

  return {
    scenario,
    chainId: CHAIN_ID,
    vaultAddresses,
    unresolvedVaults,
    resolvedVaultCount: vaultAddresses.length - unresolvedVaults.length,
    errorCount: response.errors.length,
    errorSummary: formatIssueSummary(response.errors),
    errors: toComparableValue(response.errors),
    result: toComparableValue(response.result),
  };
}

function collectUnresolvedVaults(
  vaultAddresses: Address[],
  response: ServiceResult<(VaultEntity | undefined)[]>,
): Address[] {
  const unresolved: Address[] = [];

  for (const [index, vault] of response.result.entries()) {
    if (vault === undefined) {
      unresolved.push(vaultAddresses[index]!);
    }
  }

  return unresolved;
}

function toComparableValue(
  input: unknown,
  seen = new WeakSet<object>(),
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
    return input.map((value) => toComparableValue(value, seen));
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input && inputType === "object") {
    if (seen.has(input as object)) {
      return "[circular]";
    }
    seen.add(input as object);

    const output: Record<string, ComparableValue> = {};
    const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [key, value] of entries) {
      if (typeof value === "function") continue;
      output[key] = toComparableValue(value, seen);
    }

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

function isPlainObject(value: ComparableValue): value is Record<string, ComparableValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function compareValues(
  left: ComparableValue,
  right: ComparableValue,
  path: string,
  differences: Difference[],
) {
  if (typeof left === "number" && typeof right === "number") {
    if (valuesDifferWithinTolerance(left, right)) {
      differences.push({
        path,
        reason: "numeric values differ by more than 1%",
        left,
        right,
      });
    }
    return;
  }

  if (isBigIntSnapshot(left) && isBigIntSnapshot(right)) {
    if (bigIntsDifferWithinTolerance(BigInt(left.value), BigInt(right.value))) {
      differences.push({
        path,
        reason: "bigint values differ by more than 1%",
        left,
        right,
      });
    }
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      differences.push({
        path,
        reason: "array length mismatch",
        left: left.length,
        right: right.length,
      });
    }

    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= left.length) {
        differences.push({
          path: `${path}[${index}]`,
          reason: "missing on left",
          left: { __type: "undefined" },
          right: right[index]!,
        });
        continue;
      }
      if (index >= right.length) {
        differences.push({
          path: `${path}[${index}]`,
          reason: "missing on right",
          left: left[index]!,
          right: { __type: "undefined" },
        });
        continue;
      }

      compareValues(left[index]!, right[index]!, `${path}[${index}]`, differences);
    }
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of Array.from(keys).sort()) {
      if (!(key in left)) {
        differences.push({
          path: `${path}.${key}`,
          reason: "missing on left",
          left: { __type: "undefined" },
          right: right[key]!,
        });
        continue;
      }
      if (!(key in right)) {
        differences.push({
          path: `${path}.${key}`,
          reason: "missing on right",
          left: left[key]!,
          right: { __type: "undefined" },
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
      left,
      right,
    });
  }
}

function formatIssueSummary(errors: DataIssue[]): string {
  if (errors.length === 0) return "none";

  const byCode = new Map<string, number>();
  for (const error of errors) {
    byCode.set(error.code, (byCode.get(error.code) ?? 0) + 1);
  }

  return Array.from(byCode.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}=${count}`)
    .join(", ");
}

function printDiffSummary(
  left: SnapshotRecord,
  right: SnapshotRecord,
  differences: Difference[],
) {
  console.log(`Fetched ${left.vaultAddresses.length} labeled vault addresses from label products.`);
  console.log(
    `${left.scenario}: ${left.resolvedVaultCount}/${left.vaultAddresses.length} resolved, ${left.errorCount} diagnostics (${left.errorSummary})`,
  );
  console.log(
    `${right.scenario}: ${right.resolvedVaultCount}/${right.vaultAddresses.length} resolved, ${right.errorCount} diagnostics (${right.errorSummary})`,
  );
  console.log();

  if (differences.length === 0) {
    console.log("No differences found outside the 1% numeric tolerance.");
    return;
  }

  console.log(`Found ${differences.length} differences outside the 1% numeric tolerance.`);
  console.log();

  for (const difference of differences.slice(0, DIFF_PREVIEW_LIMIT)) {
    console.log(`${difference.path}: ${difference.reason}`);
    console.log(`  left:  ${JSON.stringify(difference.left)}`);
    console.log(`  right: ${JSON.stringify(difference.right)}`);
  }

  if (differences.length > DIFF_PREVIEW_LIMIT) {
    console.log();
    console.log(`Showing first ${DIFF_PREVIEW_LIMIT} differences.`);
  }
}

async function writeArtifacts(
  defaultSnapshot: SnapshotRecord,
  explicitV3Snapshot: SnapshotRecord,
  differences: Difference[],
) {
  const outputDir = await mkdtemp(join(tmpdir(), "euler-sdk-vault-compare-"));

  const defaultPath = join(outputDir, "default-adapter-set.json");
  const v3Path = join(outputDir, "explicit-v3-adapters.json");
  const diffPath = join(outputDir, "diff.json");

  await writeFile(defaultPath, JSON.stringify(defaultSnapshot, null, 2));
  await writeFile(v3Path, JSON.stringify(explicitV3Snapshot, null, 2));
  await writeFile(diffPath, JSON.stringify(differences, null, 2));

  console.log();
  console.log(`Artifacts written to ${outputDir}`);
  console.log(`  default snapshot: ${defaultPath}`);
  console.log(`  explicit V3 snapshot: ${v3Path}`);
  console.log(`  diff report: ${diffPath}`);
}

async function compareDefaultVsExplicitV3LabeledVaultsExample() {
  const rpcUrls = getRpcUrls();
  const vaultAddresses = await fetchVaultAddressesFromLabelProducts();

  console.log("Fetching labeled vaults with the default SDK adapter set...");
  const defaultSnapshot = await fetchSnapshot(
    "default-adapter-set",
    { rpcUrls },
    vaultAddresses,
  );

  console.log("Fetching the same labeled vaults with explicit V3 adapters...");
  const explicitV3Snapshot = await fetchSnapshot(
    "explicit-v3-adapters",
    buildExplicitV3Options(rpcUrls),
    vaultAddresses,
  );

  const differences: Difference[] = [];
  compareValues(defaultSnapshot.result, explicitV3Snapshot.result, "$.result", differences);
  compareValues(defaultSnapshot.errors, explicitV3Snapshot.errors, "$.errors", differences);
  compareValues(
    toComparableValue(defaultSnapshot.unresolvedVaults),
    toComparableValue(explicitV3Snapshot.unresolvedVaults),
    "$.unresolvedVaults",
    differences,
  );

  printDiffSummary(defaultSnapshot, explicitV3Snapshot, differences);
  await writeArtifacts(defaultSnapshot, explicitV3Snapshot, differences);
}

compareDefaultVsExplicitV3LabeledVaultsExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
