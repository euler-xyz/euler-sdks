import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, type Address, type PublicClient } from "viem";
import { Account } from "../src/entities/Account.js";
import type { EVault } from "../src/entities/EVault.js";
import { createKeyringPlugin } from "../src/plugins/keyring/keyringPlugin.js";
import { prependToBatch } from "../src/plugins/types.js";
import { EulerSDK } from "../src/sdk/sdk.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../src/services/executionService/index.js";
import {
	ExecutionService,
	flattenBatchEntries,
} from "../src/services/executionService/index.js";

const ACCOUNT = getAddress("0x00000000000000000000000000000000000000aA");
const HOOK_TARGET = getAddress("0x00000000000000000000000000000000000000bB");
const KEYRING = getAddress("0x00000000000000000000000000000000000000cC");
const TARGET_A = getAddress("0x00000000000000000000000000000000000000dD");
const TARGET_B = getAddress("0x00000000000000000000000000000000000000Ee");
const CONTRACT_CALL_TARGET = getAddress(
	"0x00000000000000000000000000000000000000Ff",
);
const ASSET = getAddress("0x0000000000000000000000000000000000000011");

test("plugin prepends stay inside the first named operation", () => {
	const setupItem: EVCBatchItem = {
		targetContract: KEYRING,
		onBehalfOfAccount: ACCOUNT,
		value: 1n,
		data: "0xaaaa",
	};
	const operationItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xbbbb",
	};
	const processed = prependToBatch(
		[
			{
				type: "evcBatch",
				items: [
					{ type: "operation", name: "deposit", items: [operationItem] },
				],
			},
		],
		[setupItem],
	);

	assert.equal(processed[0]?.type, "evcBatch");
	if (processed[0]?.type !== "evcBatch") throw new Error("expected evcBatch");
	assert.equal(processed[0].items.length, 1);
	const operation = processed[0].items[0];
	assert.equal(operation?.type, "operation");
	if (!operation || !("items" in operation)) throw new Error("expected operation");
	assert.deepEqual(operation.items, [setupItem, operationItem]);
});

function createVault(hookTarget: Address, address: Address = TARGET_A): EVault {
	return {
		address,
		hooks: {
			hookTarget,
		},
	} as EVault;
}

test("Keyring plugin prepends one credential call to the earliest EVC batch", async () => {
	const plugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async () => ({
			trader: ACCOUNT,
			policyId: 7,
			chainId: 1,
			validUntil: 123,
			cost: 456,
			key: "0x01",
			signature: "0x02",
			backdoor: "0x03",
		}),
	});

	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") return false;
			if (functionName === "policyId") return 7;
			if (functionName === "keyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	const sdk = {
		providerService: {
			getProvider: () => provider,
		},
		vaultMetaService: {
			fetchVaults: async () => ({
				result: [createVault(HOOK_TARGET)],
				errors: [],
			}),
		},
	} as never;

	const firstBatchItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};
	const secondBatchItem: EVCBatchItem = {
		targetContract: TARGET_B,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xbbbb",
	};
	const plan: TransactionPlan = [
		{ type: "evcBatch", items: [firstBatchItem] },
		{
			type: "contractCall",
			chainId: 1,
			to: CONTRACT_CALL_TARGET,
			abi: [],
			functionName: "noop",
			args: [],
			value: 0n,
		},
		{ type: "evcBatch", items: [secondBatchItem] },
	];

	const processed = await plugin.processPlan?.(plan, ACCOUNT, 1, sdk);

	assert.ok(processed);
	const [first, middle, second] = processed;
	assert.equal(first.type, "evcBatch");
	assert.equal(middle.type, "contractCall");
	assert.equal(second.type, "evcBatch");

	if (first.type !== "evcBatch" || second.type !== "evcBatch") {
		throw new Error("expected evcBatch entries");
	}

	const firstItems = flattenBatchEntries(first.items);
	const secondItems = flattenBatchEntries(second.items);
	assert.equal(firstItems.length, 2);
	assert.equal(secondItems.length, 1);
	assert.equal(firstItems[0]?.targetContract, KEYRING);
	assert.equal(firstItems[0]?.onBehalfOfAccount, ACCOUNT);
	assert.equal(firstItems[0]?.value, 456n);
	assert.deepEqual(firstItems[1], firstBatchItem);
	assert.deepEqual(secondItems[0], secondBatchItem);
	assert.equal(
		[...firstItems, ...secondItems].filter(
			(item) => item.targetContract === KEYRING,
		).length,
		1,
	);
});

test("Keyring plugin uses Account vaults without fetching vaults", async () => {
	const plugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async () => ({
			trader: ACCOUNT,
			policyId: 7,
			chainId: 1,
			validUntil: 123,
			cost: 456,
			key: "0x01",
			signature: "0x02",
			backdoor: "0x03",
		}),
	});
	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") return false;
			if (functionName === "policyId") return 7;
			if (functionName === "keyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	const sdk = {
		providerService: {
			getProvider: () => provider,
		},
		vaultMetaService: {
			fetchVaults: async () => {
				throw new Error("fetchVaults should not be called");
			},
		},
	} as never;
	const account = new Account({
		chainId: 1,
		owner: ACCOUNT,
		populated: { vaults: true },
		subAccounts: {
			[ACCOUNT]: {
				timestamp: 0,
				account: ACCOUNT,
				owner: ACCOUNT,
				lastAccountStatusCheckTimestamp: 0,
				enabledControllers: [],
				enabledCollaterals: [],
				positions: [
					{
						account: ACCOUNT,
						vaultAddress: TARGET_A,
						vault: createVault(HOOK_TARGET, TARGET_A),
						asset: ASSET,
						shares: 1n,
						assets: 1n,
						borrowed: 0n,
						isController: false,
						isCollateral: true,
						balanceForwarderEnabled: false,
					},
				],
			},
		},
	});
	const batchItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};

	const processed = await plugin.processPlan?.(
		[{ type: "evcBatch", items: [batchItem] }],
		account,
		1,
		sdk,
	);

	assert.ok(processed);
	const [entry] = processed;
	assert.equal(entry.type, "evcBatch");
	if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
	const items = flattenBatchEntries(entry.items);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.targetContract, KEYRING);
	assert.deepEqual(items[1], batchItem);
});

test("Keyring plugin resolves integrator hook targets via getPolicyId/getKeyring", async () => {
	const plugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async ({ policyId }) => {
			// The plugin must resolve the policy id via getPolicyId() (uint32 on the
			// verified integrator ABI) and pass it through here.
			assert.equal(policyId, 7);
			return {
				trader: ACCOUNT,
				policyId,
				chainId: 1,
				validUntil: 123,
				cost: 456,
				key: "0x01",
				signature: "0x02",
				backdoor: "0x03",
			};
		},
	});

	// Integrator hook target (HookTargetAccessControlKeyringUnwind): the native
	// policyId()/keyring() getters revert; only the get-prefixed ones resolve.
	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") return false;
			if (functionName === "policyId" || functionName === "keyring") {
				throw new Error("execution reverted");
			}
			if (functionName === "getPolicyId") return 7;
			if (functionName === "getKeyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	const sdk = {
		providerService: {
			getProvider: () => provider,
		},
		vaultMetaService: {
			fetchVaults: async () => ({
				result: [createVault(HOOK_TARGET)],
				errors: [],
			}),
		},
	} as never;

	const batchItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};

	const processed = await plugin.processPlan?.(
		[{ type: "evcBatch", items: [batchItem] }],
		ACCOUNT,
		1,
		sdk,
	);

	assert.ok(processed);
	const [entry] = processed;
	assert.equal(entry.type, "evcBatch");
	if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
	const items = flattenBatchEntries(entry.items);
	assert.equal(items.length, 2);
	// createCredential injected, targeting the keyring contract from getKeyring().
	assert.equal(items[0]?.targetContract, KEYRING);
	assert.equal(items[0]?.value, 456n);
	assert.deepEqual(items[1], batchItem);
});

test("Keyring plugin fetches a planned vault missing from Account positions", async () => {
	const plugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async ({ policyId }) => ({
			trader: ACCOUNT,
			policyId,
			chainId: 1,
			validUntil: 123,
			cost: 456,
			key: "0x01",
			signature: "0x02",
			backdoor: "0x03",
		}),
	});
	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") return false;
			if (functionName === "policyId" || functionName === "keyring") {
				throw new Error("execution reverted");
			}
			if (functionName === "getPolicyId") return 7;
			if (functionName === "getKeyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	let fetchCount = 0;
	const sdk = {
		providerService: { getProvider: () => provider },
		vaultMetaService: {
			fetchVaults: async () => {
				fetchCount += 1;
				return { result: [createVault(HOOK_TARGET)], errors: [] };
			},
		},
	} as never;
	const account = new Account({
		chainId: 1,
		owner: ACCOUNT,
		populated: { vaults: true },
		subAccounts: {
			[ACCOUNT]: {
				timestamp: 0,
				account: ACCOUNT,
				owner: ACCOUNT,
				lastAccountStatusCheckTimestamp: 0,
				enabledControllers: [],
				enabledCollaterals: [],
				positions: [],
			},
		},
	});
	const batchItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};

	const processed = await plugin.processPlan?.(
		[{ type: "evcBatch", items: [batchItem] }],
		account,
		1,
		sdk,
	);

	assert.ok(processed);
	assert.equal(fetchCount, 1);
	const [entry] = processed;
	assert.equal(entry.type, "evcBatch");
	if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
	const items = flattenBatchEntries(entry.items);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.targetContract, KEYRING);
	assert.deepEqual(items[1], batchItem);
});

test("Keyring plugin consumes public prefetch without refetching vault metadata", async () => {
	let credentialCalls = 0;
	const plugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async ({ policyId }) => {
			credentialCalls += 1;
			return {
				trader: ACCOUNT,
				policyId,
				chainId: 1,
				validUntil: 123,
				cost: 456,
				key: "0x01",
				signature: "0x02",
				backdoor: "0x03",
			};
		},
	});
	let gateCount = 0;
	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") {
				gateCount += 1;
				return false;
			}
			if (functionName === "policyId") return 7;
			if (functionName === "keyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	let fetchCount = 0;
	let metadataAvailable = true;
	const vaultMetaService = {
		fetchVaults: async () => {
			fetchCount += 1;
			if (!metadataAvailable) throw new Error("metadata unavailable");
			return { result: [createVault(HOOK_TARGET)], errors: [] };
		},
	};
	const executionService = new ExecutionService({} as never);
	const sdk = new EulerSDK({
		executionService,
		providerService: { getProvider: () => provider },
		vaultMetaService,
		plugins: [plugin],
	} as never);
	executionService.setPluginPrefetcher((plan, account, chainId) =>
		sdk.prefetchPluginData(plan, account, chainId),
	);
	executionService.setPluginProcessor((plan, account, chainId, prefetch) =>
		sdk.processPlugins(plan, account, chainId, prefetch),
	);
	const account = new Account({
		chainId: 1,
		owner: ACCOUNT,
		populated: { vaults: true },
		subAccounts: {
			[ACCOUNT]: {
				timestamp: 0,
				account: ACCOUNT,
				owner: ACCOUNT,
				lastAccountStatusCheckTimestamp: 0,
				enabledControllers: [],
				enabledCollaterals: [],
				positions: [],
			},
		},
	});
	const batchItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};
	const plan: TransactionPlan = [{ type: "evcBatch", items: [batchItem] }];

	const prefetch = await executionService.prefetchPluginDataForPlan(
		plan,
		account,
		1,
	);
	assert.equal(fetchCount, 1);
	metadataAvailable = false;

	const processed = await executionService.processPlanPlugins(
		plan,
		account,
		1,
		prefetch,
	);

	assert.equal(fetchCount, 1);
	assert.equal(gateCount, 1);
	assert.equal(credentialCalls, 1);
	const [entry] = processed;
	assert.equal(entry.type, "evcBatch");
	if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
	const items = flattenBatchEntries(entry.items);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.targetContract, KEYRING);
	assert.deepEqual(items[1], batchItem);
});

test("Keyring plugin resolves gated targets introduced after prefetch", async () => {
	let credentialCalls = 0;
	const keyringPlugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async ({ policyId }) => {
			credentialCalls += 1;
			return {
				trader: ACCOUNT,
				policyId,
				chainId: 1,
				validUntil: 123,
				cost: 456,
				key: "0x01",
				signature: "0x02",
				backdoor: "0x03",
			};
		},
	});
	const introducedItem: EVCBatchItem = {
		targetContract: TARGET_B,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xbbbb",
	};
	const introducingPlugin = {
		name: "introducer",
		processPlan: async (plan: TransactionPlan): Promise<TransactionPlan> =>
			plan.map((entry) =>
				entry.type === "evcBatch"
					? { ...entry, items: [...entry.items, introducedItem] }
					: entry,
			),
	};
	let gateCount = 0;
	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") {
				gateCount += 1;
				return false;
			}
			if (functionName === "policyId") return 7;
			if (functionName === "keyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	const fetchRequests: Address[][] = [];
	const vaultMetaService = {
		fetchVaults: async (_chainId: number, addresses: Address[]) => {
			fetchRequests.push([...addresses]);
			return {
				result: addresses.map((address) =>
					address === TARGET_B
						? createVault(HOOK_TARGET, TARGET_B)
						: undefined,
				),
				errors: [],
			};
		},
	};
	const executionService = new ExecutionService({} as never);
	const sdk = new EulerSDK({
		executionService,
		providerService: { getProvider: () => provider },
		vaultMetaService,
		plugins: [introducingPlugin, keyringPlugin],
	} as never);
	executionService.setPluginPrefetcher((plan, account, chainId) =>
		sdk.prefetchPluginData(plan, account, chainId),
	);
	executionService.setPluginProcessor((plan, account, chainId, prefetch) =>
		sdk.processPlugins(plan, account, chainId, prefetch),
	);
	const originalItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};
	const plan: TransactionPlan = [{ type: "evcBatch", items: [originalItem] }];

	const prefetch = await executionService.prefetchPluginDataForPlan(
		plan,
		ACCOUNT,
		1,
	);
	assert.deepEqual(fetchRequests, [[TARGET_A]]);
	assert.ok(prefetch.keyring?.targetAddresses?.has(TARGET_A));
	assert.ok(!prefetch.keyring?.targetAddresses?.has(TARGET_B));

	const processed = await executionService.processPlanPlugins(
		plan,
		ACCOUNT,
		1,
		prefetch,
	);

	assert.deepEqual(fetchRequests, [[TARGET_A], [TARGET_B]]);
	assert.equal(gateCount, 1);
	assert.equal(credentialCalls, 1);
	const [entry] = processed;
	assert.equal(entry.type, "evcBatch");
	if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
	const items = flattenBatchEntries(entry.items);
	assert.equal(items.length, 3);
	assert.equal(items[0]?.targetContract, KEYRING);
	assert.deepEqual(items.slice(1), [originalItem, introducedItem]);
});

test("Keyring plugin injects one credential for vaults sharing a gate", async () => {
	let credentialCalls = 0;
	const plugin = createKeyringPlugin({
		hookTargets: { 1: [HOOK_TARGET] },
		getCredentialData: async ({ policyId }) => {
			credentialCalls += 1;
			return {
				trader: ACCOUNT,
				policyId,
				chainId: 1,
				validUntil: 123,
				cost: 456,
				key: "0x01",
				signature: "0x02",
				backdoor: "0x03",
			};
		},
	});
	let gateCount = 0;
	const provider = {
		readContract: async ({ functionName }: { functionName: string }) => {
			if (functionName === "checkKeyringCredentialOrWildCard") {
				gateCount += 1;
				return false;
			}
			if (functionName === "policyId") return 7;
			if (functionName === "keyring") return KEYRING;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
	} as unknown as PublicClient;
	const sdk = {
		providerService: { getProvider: () => provider },
		vaultMetaService: {
			fetchVaults: async () => ({
				result: [
					createVault(HOOK_TARGET, TARGET_A),
					createVault(HOOK_TARGET, TARGET_B),
				],
				errors: [],
			}),
		},
	} as never;
	const firstItem: EVCBatchItem = {
		targetContract: TARGET_A,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xaaaa",
	};
	const secondItem: EVCBatchItem = {
		targetContract: TARGET_B,
		onBehalfOfAccount: ACCOUNT,
		value: 0n,
		data: "0xbbbb",
	};

	const processed = await plugin.processPlan?.(
		[{ type: "evcBatch", items: [firstItem, secondItem] }],
		ACCOUNT,
		1,
		sdk,
	);

	assert.ok(processed);
	assert.equal(gateCount, 1);
	assert.equal(credentialCalls, 1);
	const [entry] = processed;
	assert.equal(entry.type, "evcBatch");
	if (entry.type !== "evcBatch") throw new Error("expected evcBatch");
	const items = flattenBatchEntries(entry.items);
	assert.equal(items.length, 3);
	assert.equal(
		items.filter((item) => item.targetContract === KEYRING).length,
		1,
	);
	assert.equal(items[0]?.value, 456n);
	assert.deepEqual(items.slice(1), [firstItem, secondItem]);
});
