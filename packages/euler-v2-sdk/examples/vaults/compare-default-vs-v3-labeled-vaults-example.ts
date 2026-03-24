/**
 * COMPARE DEFAULT VS EXPLICIT ONCHAIN LABELED VAULT FETCHES
 *
 * Fetches all vault addresses referenced by Euler label products on mainnet,
 * then compares `vaultMetaService.fetchVaults(..., { populateAll: true })`
 * across:
 * - the SDK's default built-in adapter set
 * - an SDK configured with explicit onchain adapters
 *
 * The script:
 * 1. Builds the default SDK
 * 2. Loads all vault addresses from label products
 * 3. Fetches fully populated vaults and records the result
 * 4. Builds an SDK with explicit onchain adapters
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
  type ServiceResult,
  type VaultEntity,
} from "euler-v2-sdk";

const CHAIN_ID = mainnet.id;
const NUMERIC_TOLERANCE = 0.01;
const BIGINT_TOLERANCE_BPS = 100n;
const DIFF_PREVIEW_LIMIT = 200;

type ScenarioName = "default-adapter-set" | "explicit-onchain-adapters";

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
  result: ComparableValue;
};

type Difference = {
  path: string;
  reason: string;
  default: ComparableValue;
  onchain: ComparableValue;
};

function buildExplicitOnchainOptions(
  rpcUrls: Record<number, string>,
): BuildSDKOptions {
  return {
    rpcUrls,
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
  differences: Difference[],
) {
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
    if (bigIntsDifferWithinTolerance(BigInt(left.value), BigInt(right.value))) {
      differences.push({
        path,
        reason: "bigint values differ by more than 1%",
        default: left,
        onchain: right,
      });
    }
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
        differences.push({
          path: `${path}.${key}`,
          reason: "missing on default",
          default: { __type: "undefined" },
          onchain: right[key]!,
        });
        continue;
      }
      if (!(key in right)) {
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

function printDiffSummary(
  left: SnapshotRecord,
  right: SnapshotRecord,
  differences: Difference[],
) {
  console.log(`Fetched ${left.vaultAddresses.length} labeled vault addresses from label products.`);
  console.log(
    `${left.scenario}: ${left.resolvedVaultCount}/${left.vaultAddresses.length} resolved`,
  );
  console.log(
    `${right.scenario}: ${right.resolvedVaultCount}/${right.vaultAddresses.length} resolved`,
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
    console.log(`  ${left.scenario}: ${JSON.stringify(difference.default)}`);
    console.log(`  ${right.scenario}: ${JSON.stringify(difference.onchain)}`);
  }

  if (differences.length > DIFF_PREVIEW_LIMIT) {
    console.log();
    console.log(`Showing first ${DIFF_PREVIEW_LIMIT} differences.`);
  }
}

async function writeArtifacts(
  defaultSnapshot: SnapshotRecord,
  explicitOnchainSnapshot: SnapshotRecord,
  differences: Difference[],
) {
  const outputDir = await mkdtemp(join(tmpdir(), "euler-sdk-vault-compare-"));

  const defaultPath = join(outputDir, "default-adapter-set.json");
  const onchainPath = join(outputDir, "explicit-onchain-adapters.json");
  const diffPath = join(outputDir, "diff.json");

  await writeFile(defaultPath, JSON.stringify(defaultSnapshot, null, 2));
  await writeFile(onchainPath, JSON.stringify(explicitOnchainSnapshot, null, 2));
  await writeFile(diffPath, JSON.stringify(differences, null, 2));

  console.log();
  console.log(`Artifacts written to ${outputDir}`);
  console.log(`  default snapshot: ${defaultPath}`);
  console.log(`  explicit onchain snapshot: ${onchainPath}`);
  console.log(`  diff report: ${diffPath}`);
}

async function compareDefaultVsExplicitOnchainLabeledVaultsExample() {
  const rpcUrls = getRpcUrls();
  const vaultAddresses = await fetchVaultAddressesFromLabelProducts();

  console.log("Fetching labeled vaults with the default SDK adapter set...");
  const defaultSnapshot = await fetchSnapshot(
    "default-adapter-set",
    { rpcUrls },
    vaultAddresses,
  );

  console.log("Fetching the same labeled vaults with explicit onchain adapters...");
  const explicitOnchainSnapshot = await fetchSnapshot(
    "explicit-onchain-adapters",
    buildExplicitOnchainOptions(rpcUrls),
    vaultAddresses,
  );

  const differences: Difference[] = [];
  compareValues(
    defaultSnapshot.result,
    explicitOnchainSnapshot.result,
    "$.result",
    differences,
  );
  compareValues(
    toComparableValue(defaultSnapshot.unresolvedVaults),
    toComparableValue(explicitOnchainSnapshot.unresolvedVaults),
    "$.unresolvedVaults",
    differences,
  );

  printDiffSummary(defaultSnapshot, explicitOnchainSnapshot, differences);
  await writeArtifacts(defaultSnapshot, explicitOnchainSnapshot, differences);
}

compareDefaultVsExplicitOnchainLabeledVaultsExample().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
