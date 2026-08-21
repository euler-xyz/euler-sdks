import {
	decodeFunctionData,
	encodeAbiParameters,
	encodeFunctionData,
	getAddress,
	keccak256,
	type Hash,
	type Hex,
} from "viem";
import type {
	EncodeMigrationAuthorizationCallArgs,
	EVCBatchItem,
} from "./executionServiceTypes.js";
import {
	aaveATokenAbi,
	aaveDebtTokenAbi,
} from "../positionMigrationService/connectors/aave/abis/aaveV3Abi.js";
import { metamorphoAbi } from "../positionMigrationService/connectors/metamorpho/abis/metamorphoAbi.js";
import { morphoBlueAbi } from "../positionMigrationService/connectors/morpho/abis/morphoBlueAbi.js";

type MigrationSignatureKind =
	| "aave-permit"
	| "aave-delegation"
	| "metamorpho-permit"
	| "morpho-authorization";

const EXPECTED_ARGUMENT_PATHS: Record<
	MigrationSignatureKind,
	readonly number[]
> = {
	"aave-permit": [4, 5, 6],
	"aave-delegation": [4, 5, 6],
	"metamorpho-permit": [4, 5, 6],
	"morpho-authorization": [1, 0, 1, 2],
};

export function hashMigrationAuthorizationItem(item: EVCBatchItem): Hash {
	return keccak256(
		encodeAbiParameters(
			[
				{ type: "address" },
				{ type: "address" },
				{ type: "uint256" },
				{ type: "bytes" },
			],
			[
				getAddress(item.targetContract),
				getAddress(item.onBehalfOfAccount),
				item.value,
				item.data,
			],
		),
	);
}

function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
	if (signature.length !== 132) {
		throw new Error("Migration authorization signature must be 65 bytes");
	}
	const recoveryId = Number.parseInt(signature.slice(130, 132), 16);
	const v = recoveryId === 0 || recoveryId === 1 ? recoveryId + 27 : recoveryId;
	if (v !== 27 && v !== 28) {
		throw new Error("Migration authorization signature recovery ID is invalid");
	}
	return {
		v,
		r: signature.slice(0, 66) as Hex,
		s: `0x${signature.slice(66, 130)}` as Hex,
	};
}

function parsePath(
	args: EncodeMigrationAuthorizationCallArgs,
): MigrationSignatureKind {
	const [
		version,
		rawKind,
		sealedTypedDataHash,
		sealedReviewedItemHash,
		...argumentPath
	] = args.abiArgumentPath;
	if (version !== "migration-signature-v2") {
		throw new Error("Unsupported migration authorization insertion version");
	}
	if (
		rawKind !== "aave-permit" &&
		rawKind !== "aave-delegation" &&
		rawKind !== "metamorpho-permit" &&
		rawKind !== "morpho-authorization"
	) {
		throw new Error("Unsupported migration authorization insertion kind");
	}
	if (sealedTypedDataHash !== args.typedDataHash) {
		throw new Error("Migration authorization typed-data hash changed");
	}
	if (
		sealedReviewedItemHash !== hashMigrationAuthorizationItem(args.reviewedItem)
	) {
		throw new Error("Migration authorization reviewed item changed");
	}
	const expected = EXPECTED_ARGUMENT_PATHS[rawKind];
	if (
		argumentPath.length !== expected.length ||
		argumentPath.some((value, index) => value !== expected[index])
	) {
		throw new Error("Migration authorization ABI argument path changed");
	}
	return rawKind;
}

function assertReviewedBinding(
	args: EncodeMigrationAuthorizationCallArgs,
): void {
	if (args.chainId <= 0 || !Number.isSafeInteger(args.chainId)) {
		throw new Error("Migration authorization chain ID is invalid");
	}
	if (
		getAddress(args.reviewedItem.onBehalfOfAccount) !== getAddress(args.signer)
	) {
		throw new Error("Migration authorization signer changed");
	}
	if (args.reviewedItem.value !== 0n) {
		throw new Error(
			"Migration authorization item must not transfer native value",
		);
	}
}

/**
 * Replace only the declared signature fields in a reviewed built-in migration
 * authorization item. The versioned path seals the EIP-712 hash and the
 * complete stub-signed batch item.
 */
export function encodeMigrationAuthorizationCall(
	args: EncodeMigrationAuthorizationCallArgs,
): EVCBatchItem {
	assertReviewedBinding(args);
	const kind = parsePath(args);
	const signature = splitSignature(args.signature);
	let data: Hex;

	if (kind === "aave-permit" || kind === "metamorpho-permit") {
		const abi = kind === "aave-permit" ? aaveATokenAbi : metamorphoAbi;
		const decoded = decodeFunctionData({ abi, data: args.reviewedItem.data });
		if (decoded.functionName !== "permit") {
			throw new Error("Reviewed migration authorization is not permit()");
		}
		data = encodeFunctionData({
			abi,
			functionName: "permit",
			args: [
				decoded.args[0],
				decoded.args[1],
				decoded.args[2],
				decoded.args[3],
				signature.v,
				signature.r,
				signature.s,
			],
		});
	} else if (kind === "aave-delegation") {
		const decoded = decodeFunctionData({
			abi: aaveDebtTokenAbi,
			data: args.reviewedItem.data,
		});
		if (decoded.functionName !== "delegationWithSig") {
			throw new Error(
				"Reviewed migration authorization is not delegationWithSig()",
			);
		}
		data = encodeFunctionData({
			abi: aaveDebtTokenAbi,
			functionName: "delegationWithSig",
			args: [
				decoded.args[0],
				decoded.args[1],
				decoded.args[2],
				decoded.args[3],
				signature.v,
				signature.r,
				signature.s,
			],
		});
	} else {
		const decoded = decodeFunctionData({
			abi: morphoBlueAbi,
			data: args.reviewedItem.data,
		});
		if (decoded.functionName !== "setAuthorizationWithSig") {
			throw new Error(
				"Reviewed migration authorization is not setAuthorizationWithSig()",
			);
		}
		data = encodeFunctionData({
			abi: morphoBlueAbi,
			functionName: "setAuthorizationWithSig",
			args: [decoded.args[0], signature],
		});
	}

	return { ...args.reviewedItem, data };
}
