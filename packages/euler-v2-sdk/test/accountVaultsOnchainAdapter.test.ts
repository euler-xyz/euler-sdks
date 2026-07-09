import assert from "node:assert/strict";
import {
	type Address,
	type Hex,
	decodeAbiParameters,
	encodeAbiParameters,
	getAddress,
	parseAbiParameters,
} from "viem";
import { test } from "vitest";
import { AccountVaultsOnchainAdapter } from "../src/services/accountService/adapters/accountVaultsOnchainAdapter/index.js";
import { ACCOUNT_DISCOVERY_LENS_BYTECODE } from "../src/services/accountService/adapters/accountVaultsOnchainAdapter/generated/accountDiscoveryLens.js";
import type { ProviderService } from "../src/services/providerService/index.js";
import type { DeploymentService } from "../src/services/deploymentService/index.js";

const OWNER = getAddress("0x8a54c278d117854486db0f6460d901a180fff517");
const EVC = getAddress("0x0c9a3dd6b8f28529d72d7f9ce918d493519ee383");
const VAULT_A = getAddress("0x00000000000000000000000000000000000000aa");
const VAULT_B = getAddress("0x00000000000000000000000000000000000000bb");
const VAULT_C = getAddress("0x00000000000000000000000000000000000000cc");
const VAULTS = [VAULT_A, VAULT_B, VAULT_C];

const CTOR_PARAMS = parseAbiParameters(
	"address owner, uint256[] subAccountIds, address[] vaults, address evc",
);
const RETURN_PARAMS = parseAbiParameters(
	"address[][] deposits, address[][] borrows",
);

const subAccountOf = (id: number): Address =>
	getAddress(
		`0x${(BigInt(OWNER) ^ BigInt(id)).toString(16).padStart(40, "0")}` as Hex,
	);

// Fixed discovery answer keyed by sub-account id, used by the mock lens.
const FIXTURE: Record<number, { deposits: Address[]; borrows: Address[] }> = {
	0: { deposits: [VAULT_A], borrows: [] },
	2: { deposits: [VAULT_B], borrows: [VAULT_C] },
	5: { deposits: [], borrows: [VAULT_A] },
};

// Decodes the deployless calldata back into its constructor args and returns the
// fixture answer for exactly the sub-accounts in that chunk — so the mock stays
// correct no matter how the adapter chunks the workload.
function mockLens(deployData: Hex): Hex {
	const argsHex = (`0x${deployData.slice(
		ACCOUNT_DISCOVERY_LENS_BYTECODE.length,
	)}`) as Hex;
	const [, subAccountIds, chunkVaults] = decodeAbiParameters(
		CTOR_PARAMS,
		argsHex,
	);
	const inChunk = new Set(
		(chunkVaults as readonly Address[]).map((v) => v.toLowerCase()),
	);
	const keep = (list: Address[]) =>
		list.filter((v) => inChunk.has(v.toLowerCase()));
	const deposits: Address[][] = [];
	const borrows: Address[][] = [];
	for (const id of subAccountIds as readonly bigint[]) {
		const answer = FIXTURE[Number(id)] ?? { deposits: [], borrows: [] };
		// The lens only probes the vaults in this chunk, so only those can hit.
		deposits.push(keep(answer.deposits));
		borrows.push(keep(answer.borrows));
	}
	return encodeAbiParameters(RETURN_PARAMS, [deposits, borrows]);
}

function makeAdapter(maxProbesPerCall: number) {
	const providerService = {
		getProvider: () => ({ transport: { url: undefined } }),
	} as unknown as ProviderService;
	const deploymentService = {
		getDeployment: () => ({ addresses: { coreAddrs: { evc: EVC } } }),
	} as unknown as DeploymentService;

	const adapter = new AccountVaultsOnchainAdapter(
		providerService,
		deploymentService,
		{
			resolveVaults: async () => VAULTS,
			subAccountRange: { start: 0, end: 7 },
			maxProbesPerCall,
			concurrency: 4,
		},
	);
	adapter.setQueryDiscoveryChunk(async (_client, deployData) =>
		mockLens(deployData),
	);
	return adapter;
}

test("caps sub-account chunks independently from probe count", async () => {
	const providerService = {
		getProvider: () => ({ transport: { url: undefined } }),
	} as unknown as ProviderService;
	const deploymentService = {
		getDeployment: () => ({ addresses: { coreAddrs: { evc: EVC } } }),
	} as unknown as DeploymentService;

	const adapter = new AccountVaultsOnchainAdapter(
		providerService,
		deploymentService,
		{
			resolveVaults: async () => [VAULT_A],
			subAccountRange: { start: 0, end: 129 },
			maxProbesPerCall: 10_000,
			concurrency: 4,
		},
	);
	const chunkSizes: number[] = [];
	adapter.setQueryDiscoveryChunk(async (_client, deployData) => {
		const argsHex = (`0x${deployData.slice(
			ACCOUNT_DISCOVERY_LENS_BYTECODE.length,
		)}`) as Hex;
		const [, subAccountIds] = decodeAbiParameters(CTOR_PARAMS, argsHex);
		chunkSizes.push(subAccountIds.length);
		return mockLens(deployData);
	});

	await adapter.fetchAccountVaults(1, OWNER);

	assert.deepEqual(chunkSizes, [64, 64, 2]);
});

test("discovers deposits and borrows in a single chunk", async () => {
	const adapter = makeAdapter(1_000);
	const result = await adapter.fetchAccountVaults(1, OWNER);

	assert.deepEqual(Object.keys(result).sort(), [
		subAccountOf(0),
		subAccountOf(2),
		subAccountOf(5),
	].sort());
	assert.deepEqual(result[subAccountOf(0)], {
		deposits: [VAULT_A],
		borrows: [],
	});
	assert.deepEqual(result[subAccountOf(2)], {
		deposits: [VAULT_B],
		borrows: [VAULT_C],
	});
	assert.deepEqual(result[subAccountOf(5)], {
		deposits: [],
		borrows: [VAULT_A],
	});
});

test("merges results across many small chunks", async () => {
	// maxProbes=2 with 3 vaults forces both sub-account and vault splitting, so a
	// sub-account's deposits arrive from several chunks and must be unioned.
	const adapter = makeAdapter(2);
	const result = await adapter.fetchAccountVaults(1, OWNER);

	assert.deepEqual(Object.keys(result).sort(), [
		subAccountOf(0),
		subAccountOf(2),
		subAccountOf(5),
	].sort());
	assert.deepEqual(result[subAccountOf(2)], {
		deposits: [VAULT_B],
		borrows: [VAULT_C],
	});
});

test("returns empty when no vaults resolve", async () => {
	const providerService = {
		getProvider: () => ({ transport: { url: undefined } }),
	} as unknown as ProviderService;
	const deploymentService = {
		getDeployment: () => ({ addresses: { coreAddrs: { evc: EVC } } }),
	} as unknown as DeploymentService;
	const adapter = new AccountVaultsOnchainAdapter(
		providerService,
		deploymentService,
		{ resolveVaults: async () => [] },
	);
	const result = await adapter.fetchAccountVaults(1, OWNER);
	assert.deepEqual(result, {});
});
