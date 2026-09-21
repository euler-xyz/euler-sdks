import assert from "node:assert/strict";
import {
	type Abi,
	type AbiParameter,
	type Address,
	type Hex,
	createPublicClient,
	custom,
	encodeFunctionData,
	encodeFunctionResult,
	getAddress,
	zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { test } from "vitest";

import { pinClientToBlock } from "../src/utils/blockPin.js";
import {
	type LensRead,
	defineLensRead,
	irmLens,
	irmLensAbi,
	oracleLens,
	oracleLensAbi,
	vaultLens,
} from "../src/utils/lens/index.js";
import { vaultLensAbi } from "../src/services/vaults/eVaultService/index.js";

const LENS = "0x00000000000000000000000000000000000000ab" as const;
const ORACLE = "0x00000000000000000000000000000000000000c1" as const;
const BASE = "0x00000000000000000000000000000000000000b1" as const;
const QUOTE = "0x00000000000000000000000000000000000000b2" as const;
const CALLER = "0x00000000000000000000000000000000000000ca" as const;
const HASH =
	"0x3333333333333333333333333333333333333333333333333333333333333333" as const;

/** The zero value viem decodes for an ABI parameter: the shape a fixture needs. */
function zeroValue(param: AbiParameter): unknown {
	const arrayMatch = param.type.match(/^(.*)\[\]$/);
	if (arrayMatch) return [];
	if (param.type === "tuple") {
		const components = (param as { components: readonly AbiParameter[] }).components;
		return Object.fromEntries(components.map((c) => [c.name, zeroValue(c)]));
	}
	if (param.type === "address") return zeroAddress;
	if (param.type === "bool") return false;
	if (param.type === "string") return "";
	if (param.type === "bytes") return "0x";
	const fixedBytes = param.type.match(/^bytes(\d+)$/);
	if (fixedBytes) return `0x${"00".repeat(Number(fixedBytes[1]))}`;
	const integer = param.type.match(/^u?int(\d+)$/);
	if (integer) return Number(integer[1]) <= 48 ? 0 : 0n;
	throw new Error(`no zero value for ${param.type}`);
}

function zeroResult(abi: Abi, functionName: string): unknown {
	const fn = abi.find((e) => e.type === "function" && e.name === functionName);
	if (!fn || fn.type !== "function") throw new Error(`${functionName} not in abi`);
	const values = fn.outputs.map(zeroValue);
	return values.length === 1 ? values[0] : values;
}

const reads: Array<{ label: string; read: LensRead<Abi, string>; args: readonly unknown[] }> = [
	{ label: "oracleLens.getOracleInfo", read: oracleLens.getOracleInfo as never, args: [ORACLE, [BASE], [QUOTE]] },
	{ label: "oracleLens.getValidAdapters", read: oracleLens.getValidAdapters as never, args: [BASE, QUOTE] },
	{ label: "oracleLens.isStalePullOracle", read: oracleLens.isStalePullOracle as never, args: [ORACLE, "0x1234"] },
	{ label: "irmLens.getInterestRateModelInfo", read: irmLens.getInterestRateModelInfo as never, args: [ORACLE] },
	{ label: "vaultLens.getVaultInfoStatic", read: vaultLens.getVaultInfoStatic as never, args: [ORACLE] },
	{ label: "vaultLens.getVaultInfoDynamic", read: vaultLens.getVaultInfoDynamic as never, args: [ORACLE] },
	{ label: "vaultLens.getRecognizedCollateralsLTVInfo", read: vaultLens.getRecognizedCollateralsLTVInfo as never, args: [ORACLE] },
	{ label: "vaultLens.getVaultInterestRateModelInfo", read: vaultLens.getVaultInterestRateModelInfo as never, args: [ORACLE, [0n, 1n], [0n, 1n]] },
	{ label: "vaultLens.getVaultInfoFull", read: vaultLens.getVaultInfoFull as never, args: [ORACLE] },
];

test("every lens read builds the calldata viem would build", () => {
	for (const { label, read, args } of reads) {
		const item = read.batchItem(LENS, args as never);
		assert.equal(item.targetContract, LENS, label);
		assert.equal(item.onBehalfOfAccount, zeroAddress, label);
		assert.equal(item.value, 0n, label);
		assert.equal(
			item.data,
			encodeFunctionData({ abi: read.abi, functionName: read.functionName, args } as never),
			label,
		);
	}
	assert.equal(
		oracleLens.getValidAdapters.batchItem(LENS, [BASE, QUOTE], CALLER).onBehalfOfAccount,
		CALLER,
	);
});

test("every lens read decodes what its function encodes", () => {
	for (const { label, read } of reads) {
		const expected = zeroResult(read.abi, read.functionName);
		const data = encodeFunctionResult({
			abi: read.abi,
			functionName: read.functionName,
			result: expected as never,
		} as never);
		assert.deepEqual(read.decode(data), expected, label);
	}
});

test("read() goes through the client and answers at its pin", async () => {
	const seen: unknown[][] = [];
	const client = createPublicClient({
		chain: mainnet,
		transport: custom({
			request: async ({ method, params }: { method: string; params?: unknown[] }) => {
				if (method !== "eth_call") throw new Error(`unexpected ${method}`);
				seen.push(params ?? []);
				return encodeFunctionResult({
					abi: oracleLensAbi,
					functionName: "getValidAdapters",
					result: [getAddress(ORACLE)],
				});
			},
		}),
	});
	const pinned = pinClientToBlock(client, { blockHash: HASH, requireCanonical: true });

	const adapters = await oracleLens.getValidAdapters.read(pinned, LENS, [BASE, QUOTE]);

	assert.deepEqual(adapters, [getAddress(ORACLE)]);
	const [request, block] = seen[0] as [{ to: string; data: Hex }, unknown];
	assert.equal(request.to.toLowerCase(), LENS);
	assert.equal(
		request.data,
		encodeFunctionData({ abi: oracleLensAbi, functionName: "getValidAdapters", args: [BASE, QUOTE] }),
	);
	assert.deepEqual(block, { blockHash: HASH, requireCanonical: true });
});

test("the read sets cover the requested functions and carry their ABIs", () => {
	assert.deepEqual(Object.keys(oracleLens).sort(), ["getOracleInfo", "getValidAdapters", "isStalePullOracle"]);
	assert.deepEqual(Object.keys(irmLens), ["getInterestRateModelInfo"]);
	assert.deepEqual(Object.keys(vaultLens).sort(), [
		"getRecognizedCollateralsLTVInfo",
		"getVaultInfoDynamic",
		"getVaultInfoFull",
		"getVaultInfoStatic",
		"getVaultInterestRateModelInfo",
	]);
	assert.equal(vaultLens.getVaultInfoStatic.abi, vaultLensAbi);
	assert.equal(irmLens.getInterestRateModelInfo.abi, irmLensAbi);
	// a consumer can define a read over any ABI the same way
	const custom = defineLensRead(oracleLensAbi, "adapterRegistry");
	assert.equal(custom.batchItem(LENS, []).data, encodeFunctionData({ abi: oracleLensAbi, functionName: "adapterRegistry" }));
});

void ((_: Address) => _);
