import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import { getAddress, type Address } from "viem";

import { buildEulerSDK } from "../../dist/src/sdk/buildSDK.js";
import { createPythPlugin } from "../../dist/src/plugins/pyth/pythPlugin.js";

dotenv.config({ path: resolve(import.meta.dirname, "../../examples/.env") });

const CHAIN_ID = 1;
const BATCH_SIZES = [10, 50, 100, 200, 500] as const;
const V3_API_ENDPOINT =
  process.env.VITE_EULER_V3_ENDPOINT ?? "https://v3.eul.dev";
const OUTPUT_DIR = resolve(import.meta.dirname, "results");
const OUTPUT_PREFIX = resolve(
  OUTPUT_DIR,
  "fetch-vaults-mainnet-react-population-v3-batches-convergence",
);
const ROUND_DELAY_MS = Number.parseInt(process.env.ROUND_DELAY_MS ?? "5000", 10);
const MAX_ROUNDS = Number.parseInt(process.env.MAX_ROUNDS ?? "100", 10);

type PopulationOptions = {
  populateMarketPrices: true;
  populateRewards: true;
  populateIntrinsicApy: true;
  populateLabels: true;
};

type Attempt = {
  round: number;
  batchSize: number;
  elapsedMs: number;
  fetchedCount: number;
  missingCount: number;
  warningCount: number;
  errorCount: number;
  resultHash: string;
};

type Report = {
  generatedAt: string;
  chainId: number;
  endpoint: string;
  vaultCount: number;
  populationOptions: PopulationOptions;
  batchSizes: number[];
  maxRounds: number;
  roundDelayMs: number;
  converged: boolean;
  convergedRound?: number;
  attempts: Attempt[];
};

const populationOptions: PopulationOptions = {
  populateMarketPrices: true,
  populateRewards: true,
  populateIntrinsicApy: true,
  populateLabels: true,
};

const noCacheBuildQuery = <T extends (...args: any[]) => Promise<any>>(
  _queryName: string,
  fn: T,
): T => fn;

function getRpcUrls(): Record<number, string> {
  const rpcUrls: Record<number, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("RPC_URL_") || !value) continue;
    const chainId = Number.parseInt(key.replace("RPC_URL_", ""), 10);
    if (!Number.isNaN(chainId)) rpcUrls[chainId] = value;
  }

  return rpcUrls;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (typeof current === "bigint") return { __type: "bigint", value: current.toString() };
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return current;
  });
}

function hashResult(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function countIssues(
  issues: Array<{ severity?: string }>,
): { warnings: number; errors: number } {
  let warnings = 0;
  let errors = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { warnings, errors };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function buildV3Sdk(batchSize?: number) {
  return buildEulerSDK({
    rpcUrls: getRpcUrls(),
    v3ApiKey: process.env.VITE_EULER_V3_API_KEY,
    buildQuery: noCacheBuildQuery,
    accountServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
      },
    },
    eVaultServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
        ...(batchSize ? { batchSize } : {}),
      },
    },
    eulerEarnServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
      },
    },
    intrinsicApyServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
      },
    },
    rewardsServiceConfig: {
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
      },
    },
    backendConfig: {
      endpoint: V3_API_ENDPOINT,
    },
    vaultTypeAdapterConfig: {
      endpoint: V3_API_ENDPOINT,
    },
    plugins: [createPythPlugin({ buildQuery: noCacheBuildQuery })],
  });
}

async function fetchVaultAddressesFromLabelProducts(): Promise<Address[]> {
  const sdk = await buildV3Sdk();
  const products = await sdk.eulerLabelsService.fetchEulerLabelsProducts(CHAIN_ID);
  const seen = new Set<string>();
  const addresses: Address[] = [];

  for (const product of Object.values(products) as Array<{ vaults?: string[] }>) {
    for (const vault of product.vaults ?? []) {
      try {
        const normalized = getAddress(vault);
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(normalized);
      } catch {}
    }
  }

  return addresses;
}

async function runAttempt(round: number, batchSize: number, addresses: Address[]): Promise<Attempt> {
  const sdk = await buildV3Sdk(batchSize);
  const start = performance.now();
  const { result, errors } = await sdk.eVaultService.fetchVaults(
    CHAIN_ID,
    addresses,
    populationOptions,
  );
  const elapsedMs = Number((performance.now() - start).toFixed(2));
  const fetchedCount = result.filter((value) => value !== undefined).length;
  const missingCount = result.length - fetchedCount;
  const issueCounts = countIssues(errors);
  const resultHash = hashResult(result);

  const attempt = {
    round,
    batchSize,
    elapsedMs,
    fetchedCount,
    missingCount,
    warningCount: issueCounts.warnings,
    errorCount: issueCounts.errors,
    resultHash,
  };

  console.log(
    [
      `round=${round}`,
      `batchSize=${batchSize}`,
      `elapsedMs=${elapsedMs}`,
      `fetched=${fetchedCount}/${result.length}`,
      `warnings=${attempt.warningCount}`,
      `errors=${attempt.errorCount}`,
      `hash=${resultHash.slice(0, 12)}`,
    ].join(" "),
  );

  return attempt;
}

function isConvergedRound(attempts: Attempt[], vaultCount: number): boolean {
  if (attempts.length !== BATCH_SIZES.length) return false;
  if (attempts.some((attempt) => attempt.fetchedCount !== vaultCount)) return false;
  if (attempts.some((attempt) => attempt.missingCount !== 0)) return false;
  const hashes = new Set(attempts.map((attempt) => attempt.resultHash));
  return hashes.size === 1;
}

function buildMarkdown(report: Report): string {
  const lines = [
    "# fetchVaults Mainnet V3 Batch Size Convergence",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Chain ID: ${report.chainId}`,
    `- V3 endpoint: ${report.endpoint}`,
    `- Vault count: ${report.vaultCount}`,
    `- Max rounds: ${report.maxRounds}`,
    `- Round delay ms: ${report.roundDelayMs}`,
    `- Converged: ${report.converged}`,
    `- Converged round: ${report.convergedRound ?? "n/a"}`,
    "",
    "| Round | Batch size | Elapsed ms | Fetched | Missing | Warnings | Errors | Result hash |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...report.attempts.map(
      (attempt) =>
        `| ${attempt.round} | ${attempt.batchSize} | ${attempt.elapsedMs} | ${attempt.fetchedCount} | ${attempt.missingCount} | ${attempt.warningCount} | ${attempt.errorCount} | ${attempt.resultHash} |`,
    ),
    "",
  ];

  return lines.join("\n");
}

async function main() {
  const addresses = await fetchVaultAddressesFromLabelProducts();
  console.log(`Resolved ${addresses.length} labeled mainnet vault addresses`);

  const attempts: Attempt[] = [];
  let convergedRound: number | undefined;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const roundAttempts: Attempt[] = [];
    for (const batchSize of BATCH_SIZES) {
      roundAttempts.push(await runAttempt(round, batchSize, addresses));
    }
    attempts.push(...roundAttempts);

    if (isConvergedRound(roundAttempts, addresses.length)) {
      convergedRound = round;
      break;
    }

    if (round < MAX_ROUNDS) {
      console.log(`No convergence in round ${round}; waiting ${ROUND_DELAY_MS}ms`);
      await delay(ROUND_DELAY_MS);
    }
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    endpoint: V3_API_ENDPOINT,
    vaultCount: addresses.length,
    populationOptions,
    batchSizes: [...BATCH_SIZES],
    maxRounds: MAX_ROUNDS,
    roundDelayMs: ROUND_DELAY_MS,
    converged: convergedRound !== undefined,
    ...(convergedRound !== undefined ? { convergedRound } : {}),
    attempts,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(`${OUTPUT_PREFIX}.json`, JSON.stringify(report, null, 2));
  await writeFile(`${OUTPUT_PREFIX}.md`, buildMarkdown(report));

  console.log(`Wrote ${OUTPUT_PREFIX}.json`);
  console.log(`Wrote ${OUTPUT_PREFIX}.md`);

  if (convergedRound === undefined) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
