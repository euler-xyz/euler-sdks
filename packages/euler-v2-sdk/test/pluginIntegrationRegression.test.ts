import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeFunctionResult, erc20Abi, type PublicClient } from "viem";
import { executeBatchSimulation } from "../src/plugins/batchSimulation.js";
import { PythPluginAdapter } from "../src/plugins/pyth/pythPlugin.js";
import { ethereumVaultConnectorAbi } from "../src/services/executionService/abis/ethereumVaultConnectorAbi.js";
import { IntrinsicApyService } from "../src/services/intrinsicApyService/intrinsicApyService.js";
import { createQueryCacheBuildQuery } from "../src/utils/buildQuery.js";

const address = "0x0000000000000000000000000000000000000001" as const;

test.each(["success", "prepend-revert", "missing-result"] as const)(
 "read enrichment requires every prepend and the lens to succeed: %s", async (scenario) => {
  const lensResult = { success: true, result: encodeFunctionResult({ abi: erc20Abi, functionName: "totalSupply", result: 10n }) };
  const results = scenario === "missing-result" ? [lensResult] : [{ success: scenario === "success", result: "0x" as const }, lensResult];
  const provider = { call: async () => ({ data: encodeFunctionResult({ abi: ethereumVaultConnectorAbi, functionName: "batchSimulation", result: [results, [], []] }) }) } as unknown as PublicClient;
  const result = await executeBatchSimulation<bigint>({ provider, evcAddress: address, prependItems: [{ targetContract: address, onBehalfOfAccount: address, value: 0n, data: "0x" }], totalValue: 0n, lensAddress: address, lensAbi: erc20Abi, lensFunctionName: "totalSupply", lensArgs: [] });
  assert.equal(result, scenario === "success" ? 10n : undefined);
 });

test("Pyth fee cache preserves update-data multiplicity", async () => {
 let calls = 0;
 const provider = { chain: { id: 1 }, readContract: async ({ args }: { args: [string[]] }) => { calls++; return BigInt(args[0].length); } } as unknown as PublicClient;
 const adapter = new PythPluginAdapter("https://example.com", createQueryCacheBuildQuery());
 assert.equal(await adapter.queryPythUpdateFee(provider, address, ["0xab"]), 1n);
 assert.equal(await adapter.queryPythUpdateFee(provider, address, ["0xab", "0xab"]), 2n);
 assert.equal(calls, 2);
});

test("refreshing intrinsic APY removes a value that the source no longer supplies", async () => {
 const service = new IntrinsicApyService({ fetchIntrinsicApy: async () => undefined, fetchChainIntrinsicApys: async () => new Map() });
 const vault = { chainId: 1, asset: { address }, intrinsicApy: { apy: 0.1, provider: "old" }, populated: {} };
 await service.populateIntrinsicApy([vault] as never);
 assert.equal(vault.intrinsicApy, undefined);
});

test("labels are resolved on each vault's chain and removed on refresh", async () => {
 const { EulerLabelsService } = await import("../src/services/eulerLabelsService/eulerLabelsService.js");
 let empty = false;
 const service = new EulerLabelsService({ fetchEulerLabelsEntities: async () => ({}), fetchEulerLabelsPoints: async () => [], fetchEulerLabelsProducts: async (chainId) => empty ? {} : ({ product: { name: `Chain ${chainId}`, vaults: [address] } } as never) });
 const vaults = [1, 10].map((chainId) => ({ chainId, address, populated: {}, eulerLabel: undefined as { products: Array<{ name: string }> } | undefined }));
 await service.populateLabels(vaults as never);
 assert.equal(vaults[0]?.eulerLabel?.products[0]?.name, "Chain 1");
 assert.equal(vaults[1]?.eulerLabel?.products[0]?.name, "Chain 10");
 empty = true;
 await service.populateLabels(vaults as never);
 assert.equal(vaults[0]?.eulerLabel, undefined);
 assert.equal(vaults[1]?.eulerLabel, undefined);
});
