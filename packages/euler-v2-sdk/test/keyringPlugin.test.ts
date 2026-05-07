import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, type Address, type PublicClient } from "viem";
import { Account } from "../src/entities/Account.js";
import type { EVault } from "../src/entities/EVault.js";
import { createKeyringPlugin } from "../src/plugins/keyring/keyringPlugin.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../src/services/executionService/index.js";
import { flattenBatchEntries } from "../src/services/executionService/index.js";

const ACCOUNT = getAddress("0x00000000000000000000000000000000000000aA");
const HOOK_TARGET = getAddress("0x00000000000000000000000000000000000000bB");
const KEYRING = getAddress("0x00000000000000000000000000000000000000cC");
const TARGET_A = getAddress("0x00000000000000000000000000000000000000dD");
const TARGET_B = getAddress("0x00000000000000000000000000000000000000Ee");
const CONTRACT_CALL_TARGET = getAddress(
	"0x00000000000000000000000000000000000000Ff",
);
const ASSET = getAddress("0x0000000000000000000000000000000000000011");

function createVault(hookTarget: Address, address: Address = TARGET_A): EVault {
	return {
		address,
		hooks: {
			hookTarget,
		},
	} as EVault;
}

test("Keyring plugin prepends credential calls to every EVC batch", async () => {
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
	assert.equal(secondItems.length, 2);
	assert.equal(firstItems[0]?.targetContract, KEYRING);
	assert.equal(secondItems[0]?.targetContract, KEYRING);
	assert.equal(firstItems[0]?.onBehalfOfAccount, ACCOUNT);
	assert.equal(secondItems[0]?.onBehalfOfAccount, ACCOUNT);
	assert.equal(firstItems[0]?.value, 456n);
	assert.equal(secondItems[0]?.value, 456n);
	assert.deepEqual(firstItems[1], firstBatchItem);
	assert.deepEqual(secondItems[1], secondBatchItem);
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
