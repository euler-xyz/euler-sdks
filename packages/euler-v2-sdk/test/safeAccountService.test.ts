import assert from "node:assert/strict";
import { test } from "vitest";
import {
	AbiDecodingDataSizeTooSmallError,
	type BaseError,
	ContractFunctionExecutionError,
	decodeFunctionResult,
	getAddress,
	type Address,
	type Hex,
} from "viem";

import {
	getSafeSingletonVersion,
	SafeAccountService,
	safeAccountAbi,
} from "../src/services/safeAccountService/index.js";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";

const SAFE = getAddress("0x00000000000000000000000000000000000000aa");
const SAFE_141_SINGLETON = getAddress(
	"0x41675C099F32341bf84BFc5382aF534df5C7461a",
);
const SAFE_111_SINGLETON = getAddress(
	"0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F",
);
const UNKNOWN_SINGLETON = getAddress(
	"0x1111111111111111111111111111111111111111",
);
const OWNERS: Address[] = [
	getAddress("0x00000000000000000000000000000000000000a1"),
	getAddress("0x00000000000000000000000000000000000000a2"),
	getAddress("0x00000000000000000000000000000000000000a3"),
];

type ReadContractCall = { address: Address; functionName: string };

function createProviderService(handlers: {
	masterCopy?: () => Promise<Address>;
	getThreshold?: () => Promise<bigint>;
	getOwners?: () => Promise<Address[]>;
}) {
	const calls: ReadContractCall[] = [];
	const providerService = {
		getProvider: () => ({
			readContract: async ({ address, functionName }: ReadContractCall) => {
				calls.push({ address, functionName });
				const handler = handlers[functionName as keyof typeof handlers];
				if (!handler) throw new Error(`unexpected function ${functionName}`);
				return handler();
			},
		}),
		getSupportedChainIds: () => [1],
	};
	return { providerService, calls };
}

function createSafeProviderService(
	singleton: Address = SAFE_141_SINGLETON,
	threshold = 2n,
	owners: Address[] = OWNERS,
) {
	return createProviderService({
		masterCopy: async () => singleton,
		getThreshold: async () => threshold,
		getOwners: async () => owners,
	});
}

test("fetchSafeAccount resolves a canonical Safe with its signer configuration", async () => {
	const { providerService, calls } = createSafeProviderService();
	const service = new SafeAccountService(providerService as never);

	const info = await service.fetchSafeAccount({ chainId: 1, account: SAFE });

	assert.deepEqual(info, {
		address: SAFE,
		singleton: SAFE_141_SINGLETON,
		version: "1.4.1",
		threshold: 2,
		owners: OWNERS,
	});
	assert.deepEqual(calls.map((call) => call.functionName).sort(), [
		"getOwners",
		"getThreshold",
		"masterCopy",
	]);
});

test("fetchSafeAccount returns null for proxies of unknown singletons", async () => {
	const { providerService } = createSafeProviderService(UNKNOWN_SINGLETON);
	const service = new SafeAccountService(providerService as never);

	assert.equal(
		await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);
});

test("fetchSafeAccount returns null for EOAs and non-Safe contracts", async () => {
	const zeroData = async (): Promise<never> => {
		throw new Error('The contract function returned no data ("0x").');
	};
	const { providerService } = createProviderService({
		masterCopy: zeroData,
		getThreshold: zeroData,
		getOwners: zeroData,
	});
	const service = new SafeAccountService(providerService as never);

	assert.equal(
		await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);
});

test("fetchSafeAccount resolves null for malformed non-Safe fallback data", async () => {
	// A contract whose fallback returns `0x01` makes viem reject with an
	// ABI-decoding error wrapped in ContractFunctionExecutionError — a
	// definitive contract-level negative, not a transport outage.
	const malformedData = async (): Promise<never> => {
		const cause = new AbiDecodingDataSizeTooSmallError({
			data: "0x01",
			params: [{ name: "masterCopy", type: "address" }],
			size: 1,
		});
		throw new ContractFunctionExecutionError(cause as never, {
			abi: [],
			args: [],
			contractAddress: SAFE,
			functionName: "masterCopy",
		});
	};
	const { providerService, calls } = createProviderService({
		masterCopy: malformedData,
		getThreshold: malformedData,
		getOwners: malformedData,
	});
	const service = new SafeAccountService(providerService as never);

	assert.equal(
		await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);
	// The definitive negative is cached: a second call performs no reads.
	assert.equal(
		await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);
	assert.equal(calls.length, 3);
});

test("fetchSafeAccount resolves null for dynamic ABI boundary failures", async () => {
	// Produce the REAL errors viem raises for hostile getOwners() output, so
	// the classifier is tested against viem's actual class names.
	const word = (value: bigint) => value.toString(16).padStart(64, "0");
	// Offset 0x20, claimed length 2, but only one element present.
	const truncatedArray = `0x${word(0x20n)}${word(2n)}${word(0xa1n)}` as Hex;
	// Dynamic offset far outside addressable data.
	const hugeOffset = `0x${word(2n ** 200n)}` as Hex;

	for (const raw of [truncatedArray, hugeOffset]) {
		let decodeError: unknown;
		try {
			decodeFunctionResult({
				abi: safeAccountAbi,
				functionName: "getOwners",
				data: raw,
			});
			assert.fail("expected decoding to fail");
		} catch (error) {
			decodeError = error;
		}

		const { providerService, calls } = createProviderService({
			masterCopy: async () => SAFE_141_SINGLETON,
			getThreshold: async () => 2n,
			getOwners: async () => {
				throw new ContractFunctionExecutionError(decodeError as BaseError, {
					abi: safeAccountAbi,
					args: [],
					contractAddress: SAFE,
					functionName: "getOwners",
				});
			},
		});
		const service = new SafeAccountService(providerService as never);

		assert.equal(
			await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
			null,
		);
		// The definitive negative is cached: one three-read probe total.
		assert.equal(
			await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
			null,
		);
		assert.equal(calls.length, 3);
	}
});

test("fetchSafeAccount rethrows transport failures and does not cache them", async () => {
	let failFirstProbe = true;
	const { providerService, calls } = createProviderService({
		masterCopy: async () => {
			if (failFirstProbe) throw new Error("HTTP request failed.");
			return SAFE_141_SINGLETON;
		},
		getThreshold: async () => 2n,
		getOwners: async () => OWNERS,
	});
	const service = new SafeAccountService(providerService as never);

	await assert.rejects(
		service.fetchSafeAccount({ chainId: 1, account: SAFE }),
		/HTTP request failed/,
	);

	failFirstProbe = false;
	const info = await service.fetchSafeAccount({ chainId: 1, account: SAFE });
	assert.equal(info?.threshold, 2);
	assert.equal(calls.length, 6);
});

test("fetchSafeAccount rejects owner lists a Safe cannot have", async () => {
	const cases: Address[][] = [
		[...OWNERS, "0x0000000000000000000000000000000000000000" as Address],
		[...OWNERS, "0x0000000000000000000000000000000000000001" as Address],
		[OWNERS[0] as Address, OWNERS[0] as Address],
		// Self-ownership: OwnerManager enforces owner != address(this) (GS203).
		[SAFE],
		[...OWNERS, SAFE],
	];
	for (const owners of cases) {
		const { providerService } = createSafeProviderService(
			SAFE_141_SINGLETON,
			1n,
			owners,
		);
		const service = new SafeAccountService(providerService as never);
		assert.equal(
			await service.fetchSafeAccount({ chainId: 1, account: SAFE }),
			null,
		);
	}
});

test("fetchSafeAccount rejects lookalikes violating Safe invariants", async () => {
	const zeroThreshold = createSafeProviderService(SAFE_141_SINGLETON, 0n);
	assert.equal(
		await new SafeAccountService(
			zeroThreshold.providerService as never,
		).fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);

	const impossibleThreshold = createSafeProviderService(
		SAFE_141_SINGLETON,
		4n,
	);
	assert.equal(
		await new SafeAccountService(
			impossibleThreshold.providerService as never,
		).fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);
});

test("fetchSafeAccount rejects self-ownership on legacy singletons too (documented limitation)", async () => {
	// Safe v1.1.1/v1.2.0 permitted a Safe to list itself as an owner (the
	// GS203 restriction arrived in v1.3.0), but the probe applies the strict
	// rule to every allowlisted version — a canonical legacy Safe configured
	// with self-ownership deliberately reads as null.
	const legacySelfOwned = createSafeProviderService(SAFE_111_SINGLETON, 1n, [
		OWNERS[0],
		SAFE,
	]);
	assert.equal(
		await new SafeAccountService(
			legacySelfOwned.providerService as never,
		).fetchSafeAccount({ chainId: 1, account: SAFE }),
		null,
	);

	// Positive control: the same legacy singleton without self-ownership
	// resolves, so the null above comes from the owner set, not the version.
	const legacyProper = createSafeProviderService(SAFE_111_SINGLETON, 1n, [
		OWNERS[0],
	]);
	const info = await new SafeAccountService(
		legacyProper.providerService as never,
	).fetchSafeAccount({ chainId: 1, account: SAFE });
	assert.equal(info?.version, "1.1.1");
});

test("fetchSafeAccount caches per chain and account within the TTL", async () => {
	const { providerService, calls } = createSafeProviderService();
	const service = new SafeAccountService(providerService as never);

	await service.fetchSafeAccount({ chainId: 1, account: SAFE });
	await service.fetchSafeAccount({
		chainId: 1,
		account: SAFE.toLowerCase() as Address,
	});

	assert.equal(calls.length, 3);
});

test("fetchSafeAccount shares one probe between concurrent callers", async () => {
	let release!: (value: Address) => void;
	const gate = new Promise<Address>((resolve) => {
		release = resolve;
	});
	const { providerService, calls } = createProviderService({
		masterCopy: () => gate,
		getThreshold: async () => 2n,
		getOwners: async () => OWNERS,
	});
	const service = new SafeAccountService(providerService as never);

	const first = service.fetchSafeAccount({ chainId: 1, account: SAFE });
	const second = service.fetchSafeAccount({ chainId: 1, account: SAFE });
	release(SAFE_141_SINGLETON);

	assert.deepEqual((await first)?.threshold, 2);
	assert.equal(await second, await first);
	assert.equal(calls.length, 3);
});

test("fetchSafeAccount re-probes after the TTL expires", async () => {
	const { providerService, calls } = createSafeProviderService();
	const service = new SafeAccountService(providerService as never, {
		cacheMs: 0,
	});

	await service.fetchSafeAccount({ chainId: 1, account: SAFE });
	await service.fetchSafeAccount({ chainId: 1, account: SAFE });

	assert.equal(calls.length, 6);
});

test("getSafeSingletonVersion recognizes singletons regardless of casing", () => {
	assert.equal(getSafeSingletonVersion(SAFE_141_SINGLETON), "1.4.1");
	assert.equal(
		getSafeSingletonVersion(SAFE_141_SINGLETON.toLowerCase()),
		"1.4.1",
	);
	assert.equal(getSafeSingletonVersion(UNKNOWN_SINGLETON), undefined);
	assert.equal(getSafeSingletonVersion(null), undefined);
});

test("buildEulerSDK exposes safeAccountService and allows overrides", async () => {
	const override = new SafeAccountService({
		getProvider: () => undefined,
		getSupportedChainIds: () => [1],
	} as never);

	const sdk = await buildEulerSDK({
		rpcUrls: {},
		servicesOverrides: {
			deploymentService: {
				getDeploymentChainIds: () => [1],
				getDeployment: () => ({
					chainId: 1,
					addresses: { coreAddrs: {}, tokenAddrs: {} },
				}),
				addDeployment: () => undefined,
			} as never,
			providerService: {
				getProvider: () => undefined,
				getSupportedChainIds: () => [1],
			} as never,
			safeAccountService: override,
		},
	});

	assert.equal(sdk.safeAccountService, override);
});
