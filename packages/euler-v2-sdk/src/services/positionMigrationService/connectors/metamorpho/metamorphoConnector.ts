import {
	encodeFunctionData,
	getAddress,
	type Address,
	type Hex,
	type TypedDataDomain,
} from "viem";
import type { IDeploymentService } from "../../../deploymentService/index.js";
import {
	type EVCBatchItem,
	type IExecutionService,
	swapperAbi,
	swapVerifierAbi,
} from "../../../executionService/index.js";
import type { IProviderService } from "../../../providerService/index.js";
import type {
	BuildConnectorMigrationBatchArgs,
	EulerMigrationTarget,
	GetMigrationAuthorizationArgs,
	GetMigrationPositionArgs,
	ListMigrationPositionsArgs,
	MigrationAuthorizationRequest,
	PositionMigrationConnector,
	SignedMigrationAuthorization,
} from "../../positionMigrationServiceTypes.js";
import {
	assertSameAddress,
	assertSwapQuoteUsesSwapper,
	encodeDepositVerifiedSwapQuoteItem,
	encodeGenericSwap,
	encodeSwapQuoteVerificationItem,
	encodeVerifyAmountMinAndDepositItem,
	splitPermitSignature,
} from "../shared.js";
import { metamorphoAbi } from "./abis/metamorphoAbi.js";
import type {
	MetamorphoMigrationConnectorConfig,
	MetamorphoMigrationPosition,
	MetamorphoPermitTypedDataMessage,
	MetamorphoPermitTypedDataRequest,
	MetamorphoPositionRaw,
	MetamorphoPositionRef,
	MetamorphoVaultVersion,
} from "./metamorphoConnectorTypes.js";

export const METAMORPHO_CONNECTOR_ID = "metamorpho";
export const METAMORPHO_PROTOCOL = "Morpho Vaults";
/** OZ ERC-20 `_allowances` mapping slot — MetaMorpho v1 and v1.1. */
export const METAMORPHO_V1_ALLOWANCE_SLOT_INDEX = 1n;
/** VaultV2 allowance mapping slot. */
export const METAMORPHO_V2_ALLOWANCE_SLOT_INDEX = 13n;

export const METAMORPHO_PERMIT_TYPES = {
	Permit: [
		{ name: "owner", type: "address" },
		{ name: "spender", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

const EIP712_DOMAIN_FIELD_NAME = 1;
const EIP712_DOMAIN_FIELD_VERSION = 2;
const EIP712_DOMAIN_FIELD_CHAIN_ID = 4;
const EIP712_DOMAIN_FIELD_VERIFYING_CONTRACT = 8;
const EIP712_DOMAIN_FIELD_SALT = 16;

export function getMetamorphoAllowanceSlotIndex(
	version: MetamorphoVaultVersion,
): bigint {
	return version === "v2"
		? METAMORPHO_V2_ALLOWANCE_SLOT_INDEX
		: METAMORPHO_V1_ALLOWANCE_SLOT_INDEX;
}

export function getMetamorphoPositionId(
	positionRef: MetamorphoPositionRef,
): string {
	return [
		METAMORPHO_CONNECTOR_ID,
		getAddress(positionRef.vault),
		"supply",
	].join(":");
}

export class MetamorphoPositionMigrationConnector
	implements
		PositionMigrationConnector<
			MetamorphoPositionRef,
			MetamorphoMigrationPosition
		>
{
	readonly id = METAMORPHO_CONNECTOR_ID;
	readonly protocol = METAMORPHO_PROTOCOL;
	readonly name = "Morpho Vaults";

	constructor(
		private readonly deploymentService: IDeploymentService,
		private readonly providerService: IProviderService,
		_executionService: IExecutionService,
		_config: MetamorphoMigrationConnectorConfig = {},
	) {}

	listPositions(
		args: ListMigrationPositionsArgs<MetamorphoPositionRef>,
	): Promise<MetamorphoMigrationPosition[]> {
		return Promise.all(
			(args.positionRefs ?? []).map((positionRef) =>
				this.getPosition({
					connectorId: METAMORPHO_CONNECTOR_ID,
					chainId: args.chainId,
					owner: args.owner,
					positionRef,
				}),
			),
		).then((positions) =>
			positions.filter((position) => position.collateral.amount > 0n),
		);
	}

	async getPosition(
		args: GetMigrationPositionArgs<MetamorphoPositionRef>,
	): Promise<MetamorphoMigrationPosition> {
		const owner = getAddress(args.owner);
		const ref = normalizeMetamorphoPositionRef(args.positionRef);
		const provider = this.providerService.getProvider(args.chainId);

		const [shareBalance, underlying] = (await provider.multicall({
			contracts: [
				{
					address: ref.vault,
					abi: metamorphoAbi,
					functionName: "balanceOf",
					args: [owner],
				},
				{
					address: ref.vault,
					abi: metamorphoAbi,
					functionName: "asset",
				},
			] as Parameters<typeof provider.multicall>[0]["contracts"],
			allowFailure: false,
		})) as unknown as [bigint, Address];

		const underlyingAddress = getAddress(underlying);
		const [assets, underlyingSymbol, underlyingDecimals] =
			(await provider.multicall({
				contracts: [
					{
						address: ref.vault,
						abi: metamorphoAbi,
						functionName: "convertToAssets",
						args: [shareBalance],
					},
					{
						address: underlyingAddress,
						abi: metamorphoAbi,
						functionName: "symbol",
					},
					{
						address: underlyingAddress,
						abi: metamorphoAbi,
						functionName: "decimals",
					},
				] as Parameters<typeof provider.multicall>[0]["contracts"],
				allowFailure: false,
			})) as unknown as [bigint, string, number];

		const raw: MetamorphoPositionRaw = {
			id: getMetamorphoPositionId(ref),
			owner,
			vault: ref.vault,
			version: ref.version,
			shareBalance,
			assets,
			underlying: underlyingAddress,
			underlyingSymbol,
			underlyingDecimals: Number(underlyingDecimals),
		};

		return {
			connectorId: METAMORPHO_CONNECTOR_ID,
			protocol: METAMORPHO_PROTOCOL,
			id: raw.id,
			chainId: args.chainId,
			owner,
			ref,
			debt: {
				asset: underlyingAddress,
				amount: 0n,
			},
			collateral: {
				asset: underlyingAddress,
				amount: assets,
				shares: shareBalance,
			},
			raw,
		};
	}

	async getAuthorization(
		args: GetMigrationAuthorizationArgs<MetamorphoMigrationPosition>,
	): Promise<MetamorphoPermitTypedDataRequest | undefined> {
		if (args.direction !== "external-to-euler") {
			throw new Error(
				`Metamorpho migration does not support direction: ${args.direction}`,
			);
		}

		const position = assertMetamorphoPosition(args.position);
		const owner = getAddress(args.owner);
		const swapVerifier = this.getSwapVerifierAddress(args.chainId);
		const vault = position.raw.vault;
		const shareBalance = position.raw.shareBalance;
		if (shareBalance <= 0n) return undefined;
		if (
			await this.hasShareAllowance(
				args.chainId,
				vault,
				owner,
				swapVerifier,
				shareBalance,
			)
		) {
			return undefined;
		}

		return this.buildSharePermitRequest({
			chainId: args.chainId,
			owner,
			spender: swapVerifier,
			vault,
			version: position.raw.version,
			value: shareBalance,
			positionId: position.id,
			deadline: args.deadline,
		});
	}

	async buildMigrationBatch(
		args: BuildConnectorMigrationBatchArgs<MetamorphoMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		if (args.position.connectorId !== METAMORPHO_CONNECTOR_ID) {
			throw new Error(
				`Metamorpho connector cannot build migration for ${args.position.connectorId}`,
			);
		}
		if (args.direction !== "external-to-euler") {
			throw new Error(
				`Metamorpho migration does not support direction: ${args.direction}`,
			);
		}

		const target = assertEulerTarget(args.target);
		const owner = getAddress(args.owner);
		const eulerAccount = getAddress(target.eulerAccount);
		const targetCollateralVault = getAddress(target.collateralVault);
		const swapper = this.getSwapperAddress(args.chainId, target.swapper);
		const swapVerifier = this.getSwapVerifierAddress(args.chainId);
		const vault = args.position.raw.vault;
		const underlying = args.position.raw.underlying;
		const shareBalance = args.position.raw.shareBalance;
		const assets = args.position.collateral.amount;
		const collateralSwapQuote = args.collateralSwapQuote;
		const useDepositSwapVerification =
			target.collateralSwapVerification === "deposit";
		const verifierDeadline =
			args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60);

		if (shareBalance <= 0n) {
			throw new Error("Metamorpho source position has no shares to migrate");
		}
		if (args.debtSwapQuote) {
			throw new Error("Metamorpho migration has no debt to swap");
		}
		if (target.borrowVault) {
			throw new Error("Metamorpho migration does not support a borrow vault");
		}
		if (useDepositSwapVerification && !collateralSwapQuote) {
			throw new Error(
				"Deposit-verified collateral swaps require a collateral swap quote",
			);
		}
		if (collateralSwapQuote) {
			assertSwapQuoteUsesSwapper(
				collateralSwapQuote,
				swapper,
				"Metamorpho collateral migration",
			);
		}

		const items: EVCBatchItem[] = [];
		if (
			!(await this.hasShareAllowance(
				args.chainId,
				vault,
				owner,
				swapVerifier,
				shareBalance,
			))
		) {
			if (!args.authorization) {
				throw new Error(
					"Metamorpho share permit for the Euler SwapVerifier is required",
				);
			}
			items.push(
				this.encodeSharePermitItem({
					owner,
					swapVerifier,
					vault,
					shareBalance,
					authorization: args.authorization,
				}),
			);
		}

		items.push({
			targetContract: swapVerifier,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "transferBalanceFromSender",
				args: [vault, shareBalance, swapper],
			}),
		});

		const swapperCalls: Hex[] = [
			encodeGenericSwap({
				target: vault,
				tokenIn: vault,
				tokenOut: underlying,
				payload: encodeFunctionData({
					abi: metamorphoAbi,
					functionName: "redeem",
					args: [
						shareBalance,
						collateralSwapQuote ? swapper : swapVerifier,
						swapper,
					],
				}),
			}),
		];
		if (collateralSwapQuote) {
			swapperCalls.push(collateralSwapQuote.swap.swapperData);
		}
		items.push({
			targetContract: swapper,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [swapperCalls],
			}),
		});

		if (collateralSwapQuote && useDepositSwapVerification) {
			items.push(
				encodeDepositVerifiedSwapQuoteItem({
					quote: collateralSwapQuote,
					swapVerifier,
					vault: targetCollateralVault,
					account: eulerAccount,
					onBehalfOfAccount: owner,
					deadline: verifierDeadline,
					label: "Metamorpho collateral migration",
				}),
			);
		} else if (collateralSwapQuote) {
			items.push(
				encodeSwapQuoteVerificationItem({
					quote: collateralSwapQuote,
					swapVerifier,
					vault: targetCollateralVault,
					account: eulerAccount,
					deadline:
						args.deadline ?? BigInt(collateralSwapQuote.verify.deadline ?? 0),
					label: "Metamorpho collateral migration",
				}),
			);
		} else {
			items.push(
				encodeVerifyAmountMinAndDepositItem({
					swapVerifier,
					onBehalfOfAccount: owner,
					vault: targetCollateralVault,
					receiver: eulerAccount,
					amountMin: target.minCollateralAssets ?? assets,
					deadline: verifierDeadline,
				}),
			);
		}

		return items;
	}

	private async buildSharePermitRequest(args: {
		chainId: number;
		owner: Address;
		spender: Address;
		vault: Address;
		version: MetamorphoVaultVersion;
		value: bigint;
		positionId: string;
		deadline?: bigint;
	}): Promise<MetamorphoPermitTypedDataRequest> {
		const provider = this.providerService.getProvider(args.chainId);
		const nonce = (await provider.readContract({
			address: args.vault,
			abi: metamorphoAbi,
			functionName: "nonces",
			args: [args.owner],
		})) as bigint;
		const domain = await this.resolvePermitDomain(
			args.chainId,
			args.vault,
			args.version,
		);

		const message: MetamorphoPermitTypedDataMessage = {
			owner: args.owner,
			spender: args.spender,
			value: args.value,
			nonce,
			deadline:
				args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
		};

		return {
			kind: "typedData",
			authorizationType: "metamorphoPermit",
			connectorId: METAMORPHO_CONNECTOR_ID,
			protocol: METAMORPHO_PROTOCOL,
			chainId: args.chainId,
			owner: args.owner,
			positionId: args.positionId,
			token: args.vault,
			allowanceSlotIndex: getMetamorphoAllowanceSlotIndex(args.version),
			typedData: {
				domain,
				types: METAMORPHO_PERMIT_TYPES,
				primaryType: "Permit",
				message,
			},
		};
	}

	/**
	 * MetaMorpho v1/v1.1 are OZ ERC20Permit — the domain must be read via
	 * EIP-5267 `eip712Domain()` because v1.1 vaults may carry an empty domain
	 * name that differs from `name()` (the token name is settable post-deploy,
	 * the EIP-712 domain is fixed at construction). Vaults V2 does not
	 * implement `eip712Domain()` and uses a minimal
	 * `EIP712Domain(uint256 chainId,address verifyingContract)` domain.
	 */
	private async resolvePermitDomain(
		chainId: number,
		vault: Address,
		version: MetamorphoVaultVersion,
	): Promise<TypedDataDomain> {
		if (version === "v2") {
			return { chainId, verifyingContract: vault };
		}

		const provider = this.providerService.getProvider(chainId);
		const [fields, name, domainVersion, domainChainId, verifyingContract] =
			(await provider.readContract({
				address: vault,
				abi: metamorphoAbi,
				functionName: "eip712Domain",
			})) as unknown as [Hex, string, string, bigint, Address, Hex, bigint[]];

		const fieldBits = Number.parseInt(fields.slice(2, 4) || "0", 16);
		if (fieldBits & EIP712_DOMAIN_FIELD_SALT) {
			throw new Error(
				"Metamorpho vault EIP-712 domains with salt are not supported",
			);
		}
		const domain: TypedDataDomain = {};
		if (fieldBits & EIP712_DOMAIN_FIELD_NAME) domain.name = name;
		if (fieldBits & EIP712_DOMAIN_FIELD_VERSION) domain.version = domainVersion;
		if (fieldBits & EIP712_DOMAIN_FIELD_CHAIN_ID) {
			domain.chainId = Number(domainChainId);
		}
		if (fieldBits & EIP712_DOMAIN_FIELD_VERIFYING_CONTRACT) {
			domain.verifyingContract = getAddress(verifyingContract);
		}
		return domain;
	}

	private encodeSharePermitItem(args: {
		owner: Address;
		swapVerifier: Address;
		vault: Address;
		shareBalance: bigint;
		authorization: SignedMigrationAuthorization;
	}): EVCBatchItem {
		const request = assertMetamorphoAuthorizationRequest(
			args.authorization.request,
		);
		if (!args.authorization.signature) {
			throw new Error("Metamorpho share permit signature is required");
		}

		const message = toMetamorphoPermitMessage(request.typedData.message);
		assertSameAddress(
			message.owner,
			args.owner,
			"Metamorpho permit owner mismatch",
		);
		assertSameAddress(
			message.spender,
			args.swapVerifier,
			"Metamorpho permit spender must be the Euler SwapVerifier",
		);
		assertSameAddress(
			request.token,
			args.vault,
			"Metamorpho permit token mismatch",
		);
		if (message.value < args.shareBalance) {
			throw new Error("Metamorpho permit value is below the share balance");
		}

		const signature = splitPermitSignature(args.authorization.signature);
		return {
			targetContract: args.vault,
			onBehalfOfAccount: args.owner,
			value: 0n,
			data: encodeFunctionData({
				abi: metamorphoAbi,
				functionName: "permit",
				args: [
					message.owner,
					message.spender,
					message.value,
					message.deadline,
					signature.v,
					signature.r,
					signature.s,
				],
			}),
		};
	}

	private async hasShareAllowance(
		chainId: number,
		vault: Address,
		owner: Address,
		spender: Address,
		amount: bigint,
	): Promise<boolean> {
		const provider = this.providerService.getProvider(chainId);
		const allowance = (await provider.readContract({
			address: vault,
			abi: metamorphoAbi,
			functionName: "allowance",
			args: [owner, spender],
		})) as bigint;
		return allowance >= amount;
	}

	private getSwapperAddress(chainId: number, override?: Address): Address {
		if (override) return getAddress(override);
		const swapper =
			this.deploymentService.getDeployment(chainId).addresses.peripheryAddrs
				?.swapper;
		if (!swapper) {
			throw new Error(`Euler Swapper is not configured for chainId ${chainId}`);
		}
		return getAddress(swapper);
	}

	private getSwapVerifierAddress(chainId: number): Address {
		const swapVerifier =
			this.deploymentService.getDeployment(chainId).addresses.peripheryAddrs
				?.swapVerifier;
		if (!swapVerifier) {
			throw new Error(
				`Euler SwapVerifier is not configured for chainId ${chainId}`,
			);
		}
		return getAddress(swapVerifier);
	}
}

function normalizeMetamorphoPositionRef(
	positionRef: MetamorphoPositionRef,
): MetamorphoPositionRef {
	if (positionRef.version !== "v1" && positionRef.version !== "v2") {
		throw new Error(
			`Unsupported Metamorpho vault version: ${String(positionRef.version)}`,
		);
	}
	return {
		vault: getAddress(positionRef.vault),
		version: positionRef.version,
	};
}

function assertMetamorphoPosition(
	position: MetamorphoMigrationPosition | undefined,
): MetamorphoMigrationPosition {
	if (!position || position.connectorId !== METAMORPHO_CONNECTOR_ID) {
		throw new Error("Metamorpho migration position is required");
	}
	return position;
}

function assertMetamorphoAuthorizationRequest(
	request: MigrationAuthorizationRequest,
): MetamorphoPermitTypedDataRequest {
	const metamorphoRequest = request as MetamorphoPermitTypedDataRequest;
	if (
		request.kind !== "typedData" ||
		request.connectorId !== METAMORPHO_CONNECTOR_ID ||
		metamorphoRequest.authorizationType !== "metamorphoPermit"
	) {
		throw new Error("Expected a Metamorpho share permit authorization request");
	}
	return metamorphoRequest;
}

function assertEulerTarget(
	target: EulerMigrationTarget | undefined,
): EulerMigrationTarget {
	if (!target) {
		throw new Error("Euler migration target is required");
	}
	return target;
}

function toMetamorphoPermitMessage(
	message: MetamorphoPermitTypedDataMessage,
): MetamorphoPermitTypedDataMessage {
	return {
		owner: getAddress(message.owner),
		spender: getAddress(message.spender),
		value: BigInt(message.value),
		nonce: BigInt(message.nonce),
		deadline: BigInt(message.deadline),
	};
}
