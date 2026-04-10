import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import { getAddress, type Address } from "viem";

import { buildEulerSDK } from "../../dist/src/sdk/buildSDK.js";
import { createPythPlugin } from "../../dist/src/plugins/pyth/pythPlugin.js";
import type { DataIssue } from "../../dist/src/utils/entityDiagnostics.js";

const CHAIN_ID = 1;
const ITERATIONS = 20;
const BATCH_SIZES = [10, 50, 100, 200, 500] as const;
const V3_API_ENDPOINT =
  process.env.VITE_EULER_V3_ENDPOINT ?? "https://v3staging.eul.dev";
const OUTPUT_DIR = resolve(import.meta.dirname, "results");
const OUTPUT_PREFIX = resolve(
  OUTPUT_DIR,
  "fetch-vaults-mainnet-react-population-v3-batches",
);

dotenv.config({ path: resolve(import.meta.dirname, "../../examples/.env") });

type RunSummary = {
  iteration: number;
  elapsedMs: number;
  fetchedCount: number;
  missingCount: number;
  errorCount: number;
  warningCount: number;
};

type BatchSummary = {
  batchSize: number;
  iterations: number;
  vaultCount: number;
  runs: RunSummary[];
  minMs: number;
  maxMs: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  totalWarnings: number;
  totalErrors: number;
};

type Report = {
  generatedAt: string;
  chainId: number;
  endpoint: string;
  populationOptions: {
    populateMarketPrices: true;
    populateRewards: true;
    populateIntrinsicApy: true;
    populateLabels: true;
  };
  addressSource: string;
  iterationsPerBatchSize: number;
  batchSizes: number[];
  vaultCount: number;
  results: BatchSummary[];
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function summarizeIssues(issues: DataIssue[]): {
  warnings: number;
  errors: number;
} {
  let warnings = 0;
  let errors = 0;

  for (const issue of issues) {
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }

  return { warnings, errors };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function getRpcUrls(): Record<number, string> {
  const rpcUrls: Record<number, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("RPC_URL_") || !value) continue;
    const chainId = Number.parseInt(key.replace("RPC_URL_", ""), 10);
    if (!Number.isNaN(chainId)) {
      rpcUrls[chainId] = value;
    }
  }

  return rpcUrls;
}

async function fetchVaultAddressesFromLabelProducts(): Promise<Address[]> {
  const sdk = await buildEulerSDK({
    rpcUrls: getRpcUrls(),
    v3ApiKey: process.env.VITE_EULER_V3_API_KEY,
    eVaultServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
      },
    },
    eulerEarnServiceConfig: {
      adapter: "v3",
      v3AdapterConfig: {
        endpoint: V3_API_ENDPOINT,
      },
    },
    accountServiceConfig: {
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
    plugins: [createPythPlugin()],
  });

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
      } catch {
        continue;
      }
    }
  }

  return addresses;
}

async function runBatchSizeBenchmark(
  batchSize: number,
  addresses: Address[],
): Promise<BatchSummary> {
  const runs: RunSummary[] = [];

  for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
    const sdk = await buildEulerSDK({
      rpcUrls: getRpcUrls(),
      v3ApiKey: process.env.VITE_EULER_V3_API_KEY,
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
          batchSize,
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
      plugins: [createPythPlugin()],
    });

    const start = performance.now();
    const { result, errors } = await sdk.eVaultService.fetchVaults(
      CHAIN_ID,
      addresses,
      {
        populateMarketPrices: true,
        populateRewards: true,
        populateIntrinsicApy: true,
        populateLabels: true,
      },
    );
    const elapsedMs = performance.now() - start;
    const fetchedCount = result.filter(
      (vault): vault is NonNullable<(typeof result)[number]> => vault !== undefined,
    ).length;
    const missingCount = result.length - fetchedCount;
    const issueSummary = summarizeIssues(errors);

    runs.push({
      iteration,
      elapsedMs: round(elapsedMs),
      fetchedCount,
      missingCount,
      errorCount: issueSummary.errors,
      warningCount: issueSummary.warnings,
    });

    console.log(
      [
        `batchSize=${batchSize}`,
        `iteration=${iteration}/${ITERATIONS}`,
        `elapsedMs=${round(elapsedMs)}`,
        `fetched=${fetchedCount}/${result.length}`,
        `warnings=${issueSummary.warnings}`,
        `errors=${issueSummary.errors}`,
      ].join(" "),
    );
  }

  const elapsedValues = runs.map((run) => run.elapsedMs);
  return {
    batchSize,
    iterations: ITERATIONS,
    vaultCount: addresses.length,
    runs,
    minMs: round(Math.min(...elapsedValues)),
    maxMs: round(Math.max(...elapsedValues)),
    avgMs: round(
      elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length,
    ),
    medianMs: round(percentile(elapsedValues, 50)),
    p95Ms: round(percentile(elapsedValues, 95)),
    totalWarnings: runs.reduce((sum, run) => sum + run.warningCount, 0),
    totalErrors: runs.reduce((sum, run) => sum + run.errorCount, 0),
  };
}

function buildMarkdown(report: Report): string {
  const lines = [
    "# fetchVaults Mainnet V3 Batch Size Benchmark",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Chain ID: ${report.chainId}`,
    `- V3 endpoint: ${report.endpoint}`,
    `- Address source: ${report.addressSource}`,
    `- Vault count: ${report.vaultCount}`,
    `- Iterations per batch size: ${report.iterationsPerBatchSize}`,
    `- Population options: ${Object.keys(report.populationOptions).join(", ")}`,
    "",
    "| Batch size | Avg ms | Median ms | P95 ms | Min ms | Max ms | Warnings | Errors |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.results.map(
      (summary) =>
        `| ${summary.batchSize} | ${summary.avgMs} | ${summary.medianMs} | ${summary.p95Ms} | ${summary.minMs} | ${summary.maxMs} | ${summary.totalWarnings} | ${summary.totalErrors} |`,
    ),
    "",
  ];

  return lines.join("\n");
}

async function main() {
  const addresses = await fetchVaultAddressesFromLabelProducts();
  console.log(`Resolved ${addresses.length} labeled mainnet vault addresses`);

  const results: BatchSummary[] = [];
  for (const batchSize of BATCH_SIZES) {
    results.push(await runBatchSizeBenchmark(batchSize, addresses));
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    endpoint: V3_API_ENDPOINT,
    populationOptions: {
      populateMarketPrices: true,
      populateRewards: true,
      populateIntrinsicApy: true,
      populateLabels: true,
    },
    addressSource: "eulerLabelsService.fetchEulerLabelsProducts(1)",
    iterationsPerBatchSize: ITERATIONS,
    batchSizes: [...BATCH_SIZES],
    vaultCount: addresses.length,
    results,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(`${OUTPUT_PREFIX}.json`, JSON.stringify(report, null, 2));
  await writeFile(`${OUTPUT_PREFIX}.md`, buildMarkdown(report));

  console.log("\nSummary");
  for (const result of results) {
    console.log(
      `batchSize=${result.batchSize} avgMs=${result.avgMs} medianMs=${result.medianMs} p95Ms=${result.p95Ms} minMs=${result.minMs} maxMs=${result.maxMs} warnings=${result.totalWarnings} errors=${result.totalErrors}`,
    );
  }
  console.log(`\nWrote ${OUTPUT_PREFIX}.json`);
  console.log(`Wrote ${OUTPUT_PREFIX}.md`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
