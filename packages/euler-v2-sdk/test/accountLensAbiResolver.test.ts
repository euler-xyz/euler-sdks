import assert from "node:assert/strict";
import { test } from "vitest";
import {
	decodeFunctionResult,
	encodeFunctionResult,
	type Abi,
	type Address,
} from "viem";
import type { IABIService } from "../src/services/abiService/index.js";
import type { Deployment } from "../src/services/deploymentService/index.js";
import { accountLensAbi } from "../src/services/accountService/adapters/accountOnchainAdapter/abis/accountLensAbi.js";
import { resolveAccountLensAbi } from "../src/services/accountService/adapters/accountOnchainAdapter/accountLensAbiResolver.js";

const currentAccountLensAbi = [
	{
		type: "function",
		name: "getVaultAccountInfo",
		inputs: [],
		outputs: [],
	},
] as const satisfies Abi;

function makeABIService() {
	const calls: Array<{ chainId: number; contract: string }> = [];
	const service: IABIService = {
		fetchABI: async (chainId, contract) => {
			calls.push({ chainId, contract });
			return currentAccountLensAbi;
		},
	};
	return { calls, service };
}

function makeDeployment(
	accountLens: Address,
	accountLensAbiRef?: string,
): Deployment {
	return {
		chainId: 1,
		abiRefs: accountLensAbiRef
			? { accountLens: accountLensAbiRef }
			: undefined,
		addresses: { lensAddrs: { accountLens } },
	} as Deployment;
}

test("Account Lens ABI resolver keeps the bundled ABI without a deployment ABI reference", async () => {
	const { calls, service } = makeABIService();
	const accountLens =
		"0xA60c4257c809353039A71527dfe701B577e34bc7" as Address;

	const abi = await resolveAccountLensAbi(
		service,
		makeDeployment(accountLens),
		accountLens,
	);

	assert.equal(abi, accountLensAbi);
	assert.deepEqual(calls, []);
});

test("Account Lens ABI resolver fetches the versioned ABI bound to the deployment", async () => {
	const { calls, service } = makeABIService();
	const accountLens =
		"0x31EB94fDd5A1f254d2865a89Cd3e118B5d84907D" as Address;

	const abi = await resolveAccountLensAbi(
		service,
		makeDeployment(accountLens, "AccountLensV2"),
		accountLens,
	);

	assert.equal(abi, currentAccountLensAbi);
	assert.deepEqual(calls, [
		{
			chainId: 1,
			contract: "AccountLensV2",
		},
	]);
});

test("Account Lens ABI resolver does not apply a deployment ABI reference to an override address", async () => {
	const { calls, service } = makeABIService();
	const accountLens =
		"0x31EB94fDd5A1f254d2865a89Cd3e118B5d84907D" as Address;

	const abi = await resolveAccountLensAbi(
		service,
		makeDeployment(accountLens, "AccountLensV2"),
		"0xA60c4257c809353039A71527dfe701B577e34bc7" as Address,
	);

	assert.equal(abi, accountLensAbi);
	assert.deepEqual(calls, []);
});

test("Account Lens ABI resolver uses the ABI reference supplied with an override address", async () => {
	const { calls, service } = makeABIService();
	const deploymentAccountLens =
		"0x31EB94fDd5A1f254d2865a89Cd3e118B5d84907D" as Address;
	const overrideAccountLens =
		"0xA60c4257c809353039A71527dfe701B577e34bc7" as Address;

	const abi = await resolveAccountLensAbi(
		service,
		makeDeployment(deploymentAccountLens, "AccountLensV2"),
		overrideAccountLens,
		"CustomAccountLensV2",
	);

	assert.equal(abi, currentAccountLensAbi);
	assert.deepEqual(calls, [
		{
			chainId: 1,
			contract: "CustomAccountLensV2",
		},
	]);
});

test("resolved V2 ABI decodes the query-failure prefix before legacy fields", async () => {
	const v2Abi = [
		{
			type: "function",
			name: "getVaultAccountInfo",
			stateMutability: "view",
			inputs: [
				{ name: "account", type: "address" },
				{ name: "vault", type: "address" },
			],
			outputs: [
				{
					name: "",
					type: "tuple",
					components: [
						{ name: "queryFailure", type: "bool" },
						{ name: "queryFailureReason", type: "bytes" },
						{ name: "timestamp", type: "uint256" },
					],
				},
			],
		},
	] as const satisfies Abi;
	const accountLens =
		"0x31EB94fDd5A1f254d2865a89Cd3e118B5d84907D" as Address;
	const encoded = encodeFunctionResult({
		abi: v2Abi,
		functionName: "getVaultAccountInfo",
		result: {
			queryFailure: true,
			queryFailureReason: "0x1234",
			timestamp: 42n,
		},
	});
	const service: IABIService = {
		fetchABI: async () => v2Abi,
	};
	const resolved = await resolveAccountLensAbi(
		service,
		makeDeployment(accountLens, "AccountLensV2"),
		accountLens,
	);
	const decoded = decodeFunctionResult({
		abi: resolved,
		functionName: "getVaultAccountInfo",
		data: encoded,
	}) as {
		queryFailure: boolean;
		queryFailureReason: `0x${string}`;
		timestamp: bigint;
	};

	assert.deepEqual(decoded, {
		queryFailure: true,
		queryFailureReason: "0x1234",
		timestamp: 42n,
	});
});
