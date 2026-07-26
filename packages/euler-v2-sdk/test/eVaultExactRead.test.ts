import assert from "node:assert/strict";
import { test } from "vitest";
import {
	encodeAbiParameters,
	encodeFunctionResult,
	type Address,
	type Hash,
	type PublicClient,
	toFunctionSelector,
	zeroAddress,
} from "viem";
import { EVaultService } from "../src/services/vaults/eVaultService/eVaultService.js";
import { EVaultOnchainAdapter } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import type { VaultInfoFull } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultLensTypes.js";
import { vaultLensAbi } from "../src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/abis/vaultLensAbi.js";
import { EVaultV3Adapter } from "../src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.js";
import {
	EVaultExactReadUnsupportedError,
	readEVaultContractAtExactBlock,
	waitForEVaultRead,
	type EVaultExactReadContext,
} from "../src/services/vaults/eVaultService/eVaultReadContext.js";
import { createFallbackAdapter } from "../src/utils/fallbackAdapter.js";

const CHAIN_ID = 1;
const VAULT = "0x0000000000000000000000000000000000000abc" as Address;
const ASSET = "0x0000000000000000000000000000000000000def" as Address;
const LENS = "0x0000000000000000000000000000000000000123" as Address;
const BLOCK_NUMBER = 123n;
const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hash;
const OTHER_BLOCK_HASH = `0x${"22".repeat(32)}` as Hash;

const exactContext = (
	provider?: PublicClient,
	signal?: AbortSignal,
): EVaultExactReadContext => ({
	blockHash: BLOCK_HASH,
	blockNumber: BLOCK_NUMBER,
	mode: "exact",
	provider,
	requireCanonical: true,
	signal,
});

function makeVaultInfo(): VaultInfoFull {
	const price = {
		amountIn: 1n,
		amountOutAsk: 1n,
		amountOutBid: 1n,
		amountOutMid: 1n,
		asset: ASSET,
		oracle: zeroAddress,
		queryFailure: false,
		queryFailureReason: "0x" as const,
		timestamp: 1n,
		unitOfAccount: zeroAddress,
	};
	const oracleInfo = {
		name: "",
		oracle: zeroAddress,
		oracleInfo: "0x" as const,
	};
	return {
		accumulatedFeesAssets: 0n,
		accumulatedFeesShares: 0n,
		asset: ASSET,
		assetDecimals: 18n,
		assetName: "Asset",
		assetSymbol: "AST",
		backupAssetOracleInfo: oracleInfo,
		backupAssetPriceInfo: price,
		balanceTracker: zeroAddress,
		borrowCap: 321n,
		collateralLTVInfo: [],
		collateralPriceInfo: [],
		configFlags: 7n,
		creator: zeroAddress,
		dToken: zeroAddress,
		evc: zeroAddress,
		governorAdmin: zeroAddress,
		governorFeeReceiver: zeroAddress,
		hookedOperations: 9n,
		hookTarget: zeroAddress,
		interestFee: 0n,
		interestRateModel: zeroAddress,
		irmInfo: {
			interestRateInfo: [
				{
					borrowAPY: 0n,
					borrowSPY: 0n,
					borrows: 0n,
					cash: 0n,
					supplyAPY: 0n,
				},
			],
			interestRateModel: zeroAddress,
			interestRateModelInfo: {
				interestRateModel: zeroAddress,
				interestRateModelParams: "0x",
				interestRateModelType: 0,
			},
			queryFailure: false,
			queryFailureReason: "0x",
			vault: VAULT,
		},
		liabilityPriceInfo: price,
		liquidationCoolOffTime: 0n,
		maxLiquidationDiscount: 0n,
		oracle: zeroAddress,
		oracleInfo,
		permit2: zeroAddress,
		protocolConfig: zeroAddress,
		protocolFeeReceiver: zeroAddress,
		protocolFeeShare: 0n,
		supplyCap: 123n,
		timestamp: 1n,
		totalAssets: 0n,
		totalBorrowed: 0n,
		totalCash: 0n,
		totalShares: 0n,
		unitOfAccount: zeroAddress,
		unitOfAccountDecimals: 18n,
		unitOfAccountName: "",
		unitOfAccountSymbol: "",
		vault: VAULT,
		vaultDecimals: 18n,
		vaultName: "Vault",
		vaultSymbol: "eAST",
	};
}

function makeProvider(
	blockHashes = [BLOCK_HASH, BLOCK_HASH],
	requestResult:
		| `0x${string}`
		| ((request: unknown) => `0x${string}`) = encodeAbiParameters(
		[{ type: "uint256" }],
		[42n],
	),
) {
	const calls: unknown[] = [];
	let header = 0;
	const provider = {
		chain: { id: CHAIN_ID },
		getBlock: async () => ({
			hash: blockHashes[Math.min(header++, blockHashes.length - 1)],
			number: BLOCK_NUMBER,
		}),
		getChainId: async () => CHAIN_ID,
		readContract: async () => makeVaultInfo(),
		request: async (request: unknown) => {
			calls.push(request);
			return typeof requestResult === "function"
				? requestResult(request)
				: requestResult;
		},
		transport: {},
	} as unknown as PublicClient;
	return { calls, provider };
}

test("exact contract reads use a canonical EIP-1898 block selector", async () => {
	const { calls, provider } = makeProvider();
	const value = await readEVaultContractAtExactBlock<bigint>(
		provider,
		exactContext(provider),
		{
			abi: [
				{
					inputs: [],
					name: "value",
					outputs: [{ type: "uint256" }],
					stateMutability: "view",
					type: "function",
				},
			],
			address: VAULT,
			functionName: "value",
		},
	);

	assert.equal(value, 42n);
	assert.equal(calls.length, 1);
	assert.deepEqual(
		(calls[0] as { params: unknown[] }).params[1],
		{ blockHash: BLOCK_HASH, requireCanonical: true },
	);
});

test("onchain exact reads use the injected provider and return raw evidence", async () => {
	const { calls, provider } = makeProvider(
		[BLOCK_HASH, BLOCK_HASH],
		(request) => {
			const data = (request as { params: [{ data: string }] }).params[0].data;
			if (data.startsWith(toFunctionSelector("caps()"))) {
				return encodeAbiParameters(
					[{ type: "uint16" }, { type: "uint16" }],
					[123, 321],
				);
			}
			return encodeFunctionResult({
				abi: vaultLensAbi,
				functionName: "getVaultInfoFull",
				result: makeVaultInfo(),
			});
		},
	);
	const configuredProvider = {
		getChainId: async () => {
			throw new Error("configured provider should not be used");
		},
	};
	const adapter = new EVaultOnchainAdapter(
		{ getProvider: () => configuredProvider } as never,
		{
			getDeployment: () => ({
				addresses: { lensAddrs: { vaultLens: LENS } },
			}),
		} as never,
	);

	const fetched = await adapter.fetchVaults(CHAIN_ID, [VAULT], exactContext(provider));

	assert.equal(calls.length, 2);
	for (const call of calls) {
		assert.deepEqual(
			(call as { params: unknown[] }).params[1],
			{ blockHash: BLOCK_HASH, requireCanonical: true },
		);
	}
	assert.deepEqual(fetched.read, {
		blockHash: BLOCK_HASH,
		blockNumber: BLOCK_NUMBER,
		canonical: true,
		mode: "exact",
		source: "onchain",
	});
	assert.deepEqual(fetched.result[0]?.rawConfig, {
		caps: { borrowCap: 321n, supplyCap: 123n },
		configFlags: 7n,
		hookConfig: { hookedOperations: 9n, hookTarget: zeroAddress },
		oracleInfo: { name: "", oracle: zeroAddress, oracleInfo: "0x" },
	});
});

test("exact cap evidence uses the overridable query path", async () => {
	const { provider } = makeProvider();
	const adapter = new EVaultOnchainAdapter(
		{ getProvider: () => provider } as never,
		{
			getDeployment: () => ({
				addresses: { lensAddrs: { vaultLens: LENS } },
			}),
		} as never,
	);
	let capQuery:
		| {
				chainId: number | undefined;
				context: EVaultExactReadContext;
				vault: Address;
		  }
		| undefined;
	adapter.setQueryEVaultInfoFull(async () => makeVaultInfo());
	adapter.setQueryEVaultCaps(async (_provider, vault, context, chainId) => {
		capQuery = { chainId, context, vault };
		return [111n, 222n];
	});

	const fetched = await adapter.fetchVaults(
		CHAIN_ID,
		[VAULT],
		exactContext(provider),
	);

	assert.equal(capQuery?.chainId, CHAIN_ID);
	assert.equal(capQuery?.context.blockHash, BLOCK_HASH);
	assert.equal(capQuery?.vault, VAULT);
	assert.deepEqual(fetched.result[0]?.rawConfig?.caps, {
		borrowCap: 222n,
		supplyCap: 111n,
	});
});

test("exact reads fail closed when the canonical hash changes", async () => {
	const { provider } = makeProvider([BLOCK_HASH, OTHER_BLOCK_HASH]);
	const adapter = new EVaultOnchainAdapter(
		{ getProvider: () => provider } as never,
		{
			getDeployment: () => ({
				addresses: { lensAddrs: { vaultLens: LENS } },
			}),
		} as never,
	);
	adapter.setQueryEVaultInfoFull(async () => makeVaultInfo());

	await assert.rejects(
		adapter.fetchVaults(CHAIN_ID, [VAULT], exactContext(provider)),
		/Canonical block mismatch/,
	);
});

test("caller cancellation stops waiting for an exact read", async () => {
	const controller = new AbortController();
	const pending = waitForEVaultRead(new Promise<never>(() => {}), controller.signal);
	const reason = new Error("review changed");
	controller.abort(reason);
	await assert.rejects(pending, reason);
});

test("V3 rejects exact reads before issuing an indexed request", async () => {
	const adapter = new EVaultV3Adapter({ endpoint: "https://example.invalid" });
	let calls = 0;
	adapter.setQueryV3EVaultDetail(async () => {
		calls += 1;
		return undefined;
	});

	await assert.rejects(
		adapter.fetchVaults(CHAIN_ID, [VAULT], exactContext()),
		EVaultExactReadUnsupportedError,
	);
	assert.equal(calls, 0);
});

test("fallback preserves exact provenance from the onchain adapter", async () => {
	const primary = {
		fetchVaults: async () => {
			throw new EVaultExactReadUnsupportedError("indexed only");
		},
	};
	const secondary = {
		fetchVaults: async () => ({
			errors: [],
			read: {
				blockHash: BLOCK_HASH,
				blockNumber: BLOCK_NUMBER,
				canonical: true,
				mode: "exact" as const,
				source: "onchain" as const,
			},
			result: [],
		}),
	};
	const fallback = createFallbackAdapter(primary, secondary, {
		adapterNames: { primary: "v3", secondary: "onchain" },
		methods: ["fetchVaults"],
	});

	const fetched = await fallback.fetchVaults();
	assert.equal(fetched.read.blockHash, BLOCK_HASH);
	assert.equal(fetched.errors[0]?.code, "FALLBACK_USED");
});

test("exact query cache keys normalize block identity and disable signal sharing", () => {
	const { provider } = makeProvider();
	const adapter = new EVaultOnchainAdapter(
		{ getProvider: () => provider } as never,
		{} as never,
	);
	const first = adapter.getQueryKeyEVaultInfoFull(
		provider as never,
		LENS,
		VAULT,
		exactContext(),
		CHAIN_ID,
	);
	const second = adapter.getQueryKeyEVaultInfoFull(
		provider as never,
		LENS,
		VAULT,
		{ ...exactContext(), blockHash: OTHER_BLOCK_HASH },
		CHAIN_ID,
	);
	const otherChain = adapter.getQueryKeyEVaultInfoFull(
		provider as never,
		LENS,
		VAULT,
		exactContext(),
		8453,
	);
	const upperCaseHash = adapter.getQueryKeyEVaultInfoFull(
		provider as never,
		LENS,
		VAULT,
		{
			...exactContext(),
			blockHash: `0x${BLOCK_HASH.slice(2).toUpperCase()}` as Hash,
		},
		CHAIN_ID,
	);
	const caps = adapter.getQueryKeyEVaultCaps(
		provider as never,
		VAULT,
		exactContext(),
		CHAIN_ID,
	);

	assert.notEqual(first, second);
	assert.notEqual(first, otherChain);
	assert.equal(first, upperCaseHash);
	assert.match(first ?? "", /123/);
	assert.match(caps ?? "", /123/);
	assert.equal(
		adapter.getQueryKeyEVaultInfoFull(
			provider as never,
			LENS,
			VAULT,
			exactContext(undefined, new AbortController().signal),
			CHAIN_ID,
		),
		null,
	);
	assert.equal(
		adapter.getQueryKeyEVaultCaps(
			provider as never,
			VAULT,
			exactContext(undefined, new AbortController().signal),
			CHAIN_ID,
		),
		null,
	);
});

test("service preserves current custom adapters and rejects unproven exact data", async () => {
	const adapter = {
		fetchAllVaults: async () => ({ errors: [], result: [] }),
		fetchVaults: async () => ({ errors: [], result: [] }),
		fetchVerifiedVaultsAddresses: async () => [],
	};
	const service = new EVaultService(adapter, {} as never);

	const current = await service.fetchVaults(CHAIN_ID, []);
	assert.deepEqual(current.read, {
		blockHash: null,
		blockNumber: null,
		canonical: false,
		mode: "current",
		source: "custom",
	});
	await assert.rejects(
		service.fetchVaults(CHAIN_ID, [], { readContext: exactContext() }),
		/missing matching canonical read provenance/,
	);
	await assert.rejects(
		service.fetchVaults(CHAIN_ID, [], {
			populateLabels: true,
			readContext: exactContext(),
		}),
		/cannot run current-head populate/,
	);
	await assert.rejects(
		service.fetchAllVaults(CHAIN_ID, {
			options: { readContext: exactContext() },
		}),
		/require explicit vault addresses/,
	);
});
