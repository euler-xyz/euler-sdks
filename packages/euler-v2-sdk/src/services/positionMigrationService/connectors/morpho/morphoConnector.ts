import {
	encodeAbiParameters,
	encodeFunctionData,
	getAddress,
	keccak256,
	maxUint256,
	type Abi,
	type Address,
	type Hex,
} from "viem";
import type { IDeploymentService } from "../../../deploymentService/index.js";
import {
	eVaultAbi,
	type EVCBatchItem,
	type IExecutionService,
	swapperAbi,
	swapVerifierAbi,
} from "../../../executionService/index.js";
import type { IProviderService } from "../../../providerService/index.js";
import {
	applyBuffer,
	assertEulerSource,
	assertEulerTarget,
	assertSameAddress,
	assertSwapQuoteUsesSwapper,
	encodeGenericSwap,
	encodeSwapQuoteVerificationItem,
	encodeVerifyAmountMinAndDepositItem,
	encodeVerifyDebtMaxItem,
	getSwapperAddress,
	getSwapQuoteInputAmount,
	getSwapQuoteSwapCalls,
	getSwapVerifierAddress,
	resolveEulerSourceAmounts,
	splitPermitSignature,
} from "../shared.js";
import type {
	BuildConnectorMigrationBatchArgs,
	GetMigrationAuthorizationArgs,
	GetMigrationPositionArgs,
	ListMigrationPositionsArgs,
	ListMigrationTargetsArgs,
	MigrationTarget,
	MigrationAuthorizationRequest,
	PositionMigrationConnector,
	SignedMigrationAuthorization,
} from "../../positionMigrationServiceTypes.js";
import { morphoBlueAbi } from "./abis/morphoBlueAbi.js";
import type {
	MorphoAuthorization,
	MorphoAuthorizationTransactionRequest,
	MorphoAuthorizationTypedDataMessage,
	MorphoAuthorizationTypedDataRequest,
	MorphoMigrationAuthorizationRequest,
	MorphoMarketParams,
	MorphoMarketState,
	MorphoMigrationConnectorConfig,
	MorphoMigrationPosition,
	MorphoMigrationTargetRaw,
	MorphoPositionRaw,
	MorphoSignature,
} from "./morphoConnectorTypes.js";

export const MORPHO_CONNECTOR_ID = "morpho";
export const MORPHO_PROTOCOL = "Morpho";

const DEFAULT_MORPHO_ADDRESSES: Record<number, Address> = {
	1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
	10: "0xce95AfbB8EA029495c66020883F87aaE8864AF92",
	56: "0x01b0Bd309AA75547f7a37Ad7B1219A898E67a83a",
	130: "0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A",
	143: "0xD5D960E8C380B724a48AC59E2DfF1b2CB4a1eAee",
	146: "0xd6c916eB7542D0Ad3f18AEd0FCBD50C582cfa95f",
	239: "0x918B9F2E4B44E20c6423105BB6cCEB71473aD35c",
	480: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
	999: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
	8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
	42161: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
	57073: "0x857f3EefE8cbda3Bc49367C996cd664A880d3042",
};
const DEFAULT_MORPHO_GRAPHQL_URL = "https://api.morpho.org/graphql";
const DEFAULT_INTEREST_BUFFER_BPS = 100n;
const DEFAULT_MIN_LIQUIDITY = 0n;
const DEFAULT_OUTBOUND_INTEREST_BUFFER_BPS = 1n;
const DEFAULT_MORPHO_GRAPHQL_TIMEOUT_MS = 10_000;
const ZERO_BYTES = "0x" as const;

const MORPHO_MARKET_PARAMS_ABI = [
	{
		type: "tuple",
		components: [
			{ name: "loanToken", type: "address" },
			{ name: "collateralToken", type: "address" },
			{ name: "oracle", type: "address" },
			{ name: "irm", type: "address" },
			{ name: "lltv", type: "uint256" },
		],
	},
] as const;

const MORPHO_MARKETS_QUERY = `#graphql
query EulerMigrationMorphoMarkets($chainIds: [Int!], $loanAssets: [String!], $collateralAssets: [String!]) {
  markets(
    first: 100
    where: {
      chainId_in: $chainIds
      loanAssetAddress_in: $loanAssets
      collateralAssetAddress_in: $collateralAssets
      listed: true
    }
  ) {
    items {
      marketId
      listed
      lltv
      irmAddress
      oracle { address }
      loanAsset { address symbol decimals }
      collateralAsset { address symbol decimals }
      state {
        borrowApy
        netBorrowApy
        supplyApy
        liquidityAssets
        liquidityAssetsUsd
      }
    }
  }
}
`;

type MorphoApiAsset = {
	address?: string;
	symbol?: string;
	decimals?: number | string;
};

type MorphoApiMarket = {
	marketId?: string;
	listed?: boolean;
	lltv?: string | number;
	irmAddress?: string;
	oracle?: { address?: string } | null;
	loanAsset?: MorphoApiAsset | null;
	collateralAsset?: MorphoApiAsset | null;
	state?: {
		borrowApy?: string | number | null;
		netBorrowApy?: string | number | null;
		supplyApy?: string | number | null;
		liquidityAssets?: string | number | null;
		liquidityAssetsUsd?: string | number | null;
	} | null;
};

type MorphoMarketsGraphqlResponse = {
	data?: { markets?: { items?: MorphoApiMarket[] } };
	errors?: { message?: string }[];
};

export const MORPHO_AUTHORIZATION_TYPES = {
	Authorization: [
		{ name: "authorizer", type: "address" },
		{ name: "authorized", type: "address" },
		{ name: "isAuthorized", type: "bool" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

export function getMorphoMarketId(marketParams: MorphoMarketParams): Hex {
	return keccak256(
		encodeAbiParameters(MORPHO_MARKET_PARAMS_ABI, [
			normalizeMarketParams(marketParams),
		]),
	);
}

export function splitMorphoAuthorizationSignature(
	signature: Hex,
): MorphoSignature {
	if (signature.length !== 132) {
		throw new Error("Morpho authorization signature must be 65 bytes");
	}

	return splitPermitSignature(signature);
}

export class MorphoPositionMigrationConnector
	implements
		PositionMigrationConnector<MorphoMarketParams, MorphoMigrationPosition>
{
	readonly id = MORPHO_CONNECTOR_ID;
	readonly protocol = MORPHO_PROTOCOL;
	readonly name = "Morpho";

	private readonly morphoAddresses: Record<number, Address>;
	private readonly defaultInterestBufferBps: bigint;
	private readonly morphoGraphqlUrl: string;
	private readonly morphoGraphqlTimeoutMs: number;
	private readonly fetchFn: typeof fetch;
	private readonly defaultMinLiquidity: bigint;

	constructor(
		private readonly deploymentService: IDeploymentService,
		private readonly providerService: IProviderService,
		private readonly executionService: IExecutionService,
		config: MorphoMigrationConnectorConfig = {},
	) {
		this.morphoAddresses = {
			...DEFAULT_MORPHO_ADDRESSES,
			...(config.morphoAddresses ?? {}),
		};
		this.defaultInterestBufferBps =
			config.defaultInterestBufferBps ?? DEFAULT_INTEREST_BUFFER_BPS;
		this.morphoGraphqlUrl =
			config.morphoGraphqlUrl ?? DEFAULT_MORPHO_GRAPHQL_URL;
		this.morphoGraphqlTimeoutMs =
			config.morphoGraphqlTimeoutMs ?? DEFAULT_MORPHO_GRAPHQL_TIMEOUT_MS;
		const configuredFetch = config.fetchFn ?? globalThis.fetch;
		this.fetchFn = ((input, init) =>
			configuredFetch.call(globalThis, input, init)) as typeof fetch;
		this.defaultMinLiquidity =
			config.defaultMinLiquidity ?? DEFAULT_MIN_LIQUIDITY;
	}

	listPositions(
		args: ListMigrationPositionsArgs<MorphoMarketParams>,
	): Promise<MorphoMigrationPosition[]> {
		return Promise.all(
			(args.positionRefs ?? []).map((positionRef) =>
				this.getPosition({
					connectorId: MORPHO_CONNECTOR_ID,
					chainId: args.chainId,
					owner: args.owner,
					positionRef,
				}),
			),
		).then((positions) =>
			positions.filter(
				(position) =>
					position.debt.amount > 0n || position.collateral.amount > 0n,
			),
		);
	}

	async listTargets(
		args: ListMigrationTargetsArgs,
	): Promise<MigrationTarget<MorphoMigrationTargetRaw, MorphoMarketParams>[]> {
		if ((args.direction ?? "euler-to-external") !== "euler-to-external") {
			return [];
		}

		const debtAsset = getAddress(args.debtAsset);
		const collateralAsset = getAddress(args.collateralAsset);
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			this.morphoGraphqlTimeoutMs,
		);
		let res: Response;
		try {
			res = await this.fetchFn(this.morphoGraphqlUrl, {
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					query: MORPHO_MARKETS_QUERY,
					variables: {
						chainIds: [args.chainId],
						loanAssets: [debtAsset],
						collateralAssets: [collateralAsset],
					},
				}),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}
		if (!res.ok) {
			throw new Error(`Morpho markets request failed: ${res.status}`);
		}

		const body = (await res.json()) as MorphoMarketsGraphqlResponse;
		if (body.errors?.length) {
			throw new Error(
				body.errors[0]?.message ?? "Morpho markets request failed",
			);
		}

		const minLiquidity = args.minLiquidity ?? this.defaultMinLiquidity;
		return (body.data?.markets?.items ?? [])
			.map((market) => toMorphoMigrationTarget(args.chainId, market))
			.filter(
				(
					target,
				): target is MigrationTarget<
					MorphoMigrationTargetRaw,
					MorphoMarketParams
				> =>
					!!target &&
					target.raw?.listed !== false &&
					(target.liquidity?.amount ?? 0n) >= minLiquidity &&
					(target.raw?.lltv ?? 0) > 0,
			)
			.sort((a, b) => {
				const aLiquidity = a.liquidity?.amount ?? 0n;
				const bLiquidity = b.liquidity?.amount ?? 0n;
				if (aLiquidity === bLiquidity) return 0;
				return aLiquidity > bLiquidity ? -1 : 1;
			});
	}

	async getPosition(
		args: GetMigrationPositionArgs<MorphoMarketParams>,
	): Promise<MorphoMigrationPosition> {
		const marketParams = normalizeMarketParams(args.positionRef);
		const marketId = getMorphoMarketId(marketParams);
		const owner = getAddress(args.owner);
		const morpho = this.getMorphoAddress(args.chainId);
		const provider = this.providerService.getProvider(args.chainId);

		const [positionResult, marketResult] = (await provider.multicall({
			contracts: [
				{
					address: morpho,
					abi: morphoBlueAbi,
					functionName: "position",
					args: [marketId, owner],
				},
				{
					address: morpho,
					abi: morphoBlueAbi,
					functionName: "market",
					args: [marketId],
				},
			],
			allowFailure: false,
		})) as unknown as [
			readonly [bigint, bigint, bigint],
			readonly [bigint, bigint, bigint, bigint, bigint, bigint],
		];

		const market = toMorphoMarketState(marketResult);
		const raw: MorphoPositionRaw = {
			marketId,
			owner,
			supplyShares: positionResult[0],
			borrowShares: positionResult[1],
			collateral: positionResult[2],
			borrowAssets: toAssetsUp(
				positionResult[1],
				market.totalBorrowAssets,
				market.totalBorrowShares,
			),
			market,
			marketParams,
		};

		return {
			connectorId: MORPHO_CONNECTOR_ID,
			protocol: MORPHO_PROTOCOL,
			id: marketId,
			chainId: args.chainId,
			owner,
			ref: marketParams,
			debt: {
				asset: marketParams.loanToken,
				amount: raw.borrowAssets,
				shares: raw.borrowShares,
			},
			collateral: {
				asset: marketParams.collateralToken,
				amount: raw.collateral,
			},
			raw,
		};
	}

	async getAuthorization(
		args: GetMigrationAuthorizationArgs<MorphoMigrationPosition> & {
			authorizationKind: "transaction";
		},
	): Promise<MorphoAuthorizationTransactionRequest | undefined>;
	async getAuthorization(
		args: GetMigrationAuthorizationArgs<MorphoMigrationPosition> & {
			authorizationKind?: "typedData";
		},
	): Promise<MorphoAuthorizationTypedDataRequest | undefined>;
	async getAuthorization(
		args: GetMigrationAuthorizationArgs<MorphoMigrationPosition>,
	): Promise<MorphoMigrationAuthorizationRequest | undefined>;
	async getAuthorization(
		args: GetMigrationAuthorizationArgs<MorphoMigrationPosition>,
	): Promise<MorphoMigrationAuthorizationRequest | undefined> {
		if (
			args.direction !== "external-to-euler" &&
			args.direction !== "euler-to-external"
		) {
			throw new Error(`Unsupported migration direction: ${args.direction}`);
		}

		const owner = getAddress(args.owner);
		// The standing Morpho authorization is granted to the SwapVerifier (which
		// runs the privileged borrow / withdrawCollateral legs as top-level EVC
		// items), not the Swapper. Pinning onBehalf to the caller prevents replay
		// abuse by a front-runner.
		const swapVerifier = getSwapVerifierAddress(
			this.deploymentService,
			args.chainId,
		);
		const alreadyAuthorized = await this.isAuthorized(
			args.chainId,
			owner,
			swapVerifier,
		);

		if (args.authorizationKind === "transaction") {
			// An authorization already standing is not ours to grant, and so not
			// ours to revoke either. `removeAuthorizationAfterMigration` does not
			// apply: the returned request always carries its own revocation.
			if (alreadyAuthorized) return undefined;
			return this.buildAuthorizationTransactionRequest({
				chainId: args.chainId,
				owner,
				morpho: this.getMorphoAddress(args.chainId),
				swapVerifier,
				positionId: args.position?.id,
			});
		}

		if (alreadyAuthorized && !args.removeAuthorizationAfterMigration)
			return undefined;

		const morpho = this.getMorphoAddress(args.chainId);
		const provider = this.providerService.getProvider(args.chainId);
		const nonce = (await provider.readContract({
			address: morpho,
			abi: morphoBlueAbi,
			functionName: "nonce",
			args: [owner],
		})) as bigint;

		const deadline =
			args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
		const enableRequest = alreadyAuthorized
			? undefined
			: this.buildAuthorizationRequest({
					chainId: args.chainId,
					owner,
					morpho,
					swapVerifier,
					nonce,
					deadline,
					isAuthorized: true,
					positionId: args.position?.id,
				});
		const disableRequest = args.removeAuthorizationAfterMigration
			? this.buildAuthorizationRequest({
					chainId: args.chainId,
					owner,
					morpho,
					swapVerifier,
					nonce: nonce + (enableRequest ? 1n : 0n),
					deadline,
					isAuthorized: false,
					positionId: args.position?.id,
				})
			: undefined;

		if (enableRequest && disableRequest) {
			enableRequest.postMigrationAuthorization = disableRequest;
		}
		return enableRequest ?? disableRequest;
	}

	async buildMigrationBatch(
		args: BuildConnectorMigrationBatchArgs<MorphoMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		if (args.position.connectorId !== MORPHO_CONNECTOR_ID) {
			throw new Error(
				`Morpho connector cannot build migration for ${args.position.connectorId}`,
			);
		}

		if (args.direction === "external-to-euler") {
			return this.buildExternalToEulerBatch(args);
		}
		if (args.direction === "euler-to-external") {
			return this.buildEulerToMorphoBatch(args);
		}
		throw new Error(`Unsupported migration direction: ${args.direction}`);
	}

	private async buildExternalToEulerBatch(
		args: BuildConnectorMigrationBatchArgs<MorphoMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		const target = assertEulerTarget(args.target);
		const owner = getAddress(args.owner);
		const eulerAccount = getAddress(target.eulerAccount);
		const targetBorrowVault = target.borrowVault
			? getAddress(target.borrowVault)
			: undefined;
		const targetCollateralVault = getAddress(target.collateralVault);
		const marketParams = normalizeMarketParams(args.position.raw.marketParams);
		const morpho = this.getMorphoAddress(args.chainId);
		const swapper = getSwapperAddress(
			this.deploymentService,
			args.chainId,
			target.swapper,
		);
		const swapVerifier = getSwapVerifierAddress(
			this.deploymentService,
			args.chainId,
		);
		const borrowShares = args.position.raw.borrowShares;
		const hasDebt = borrowShares > 0n;
		const collateralAmount = args.position.raw.collateral;
		const collateralWithdrawAmount = collateralAmount;
		const collateralMinAmount = target.minCollateralAssets ?? collateralAmount;
		const verifierDeadline =
			args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
		const collateralSwapQuote = args.collateralSwapQuote;
		const debtSwapQuote = args.debtSwapQuote;
		const baseDebtRepayAmount = applyBuffer(
			args.position.raw.borrowAssets,
			target.interestBufferBps ?? this.defaultInterestBufferBps,
		);
		const borrowAmount =
			target.borrowAmount ??
			(debtSwapQuote
				? getSwapQuoteInputAmount(debtSwapQuote)
				: baseDebtRepayAmount);

		if (collateralAmount <= 0n) {
			throw new Error("Morpho source position has no collateral to migrate");
		}
		if (hasDebt && !targetBorrowVault) {
			throw new Error("Target Euler borrow vault is required");
		}
		if (!hasDebt && debtSwapQuote) {
			throw new Error("Morpho debt swap quote requires source debt");
		}
		if (hasDebt && borrowAmount <= 0n) {
			throw new Error("Euler borrow amount must be greater than zero");
		}
		if (debtSwapQuote) {
			assertSwapQuoteUsesSwapper(
				debtSwapQuote,
				swapper,
				"Morpho debt migration",
			);
		}
		if (collateralSwapQuote) {
			assertSwapQuoteUsesSwapper(
				collateralSwapQuote,
				swapper,
				"Morpho collateral migration",
			);
		}

		const items: EVCBatchItem[] = [];
		const hasSimulatedTransactionGrant =
			args.skipAuthorizationCheck &&
			args.authorizationRequest?.kind === "transaction"
				? this.validateSimulatedAuthorization({
						request: args.authorizationRequest,
						owner,
						swapVerifier,
						morpho,
					})
				: false;
		const alreadyAuthorized = hasSimulatedTransactionGrant
			? true
			: args.skipAuthorizationCheck && args.authorization
				? false
				: await this.isAuthorized(args.chainId, owner, swapVerifier);
		if (!alreadyAuthorized) {
			if (!args.authorization) {
				throw new Error(
					"Morpho authorization for the Euler SwapVerifier is required",
				);
			}
			items.push(
				this.encodeSetAuthorizationWithSigItem({
					chainId: args.chainId,
					owner,
					swapVerifier,
					authorization: args.authorization,
					isAuthorized: true,
				}),
			);
		}

		if (hasDebt && targetBorrowVault && (target.enableController ?? true)) {
			items.push(
				this.executionService.encodeEnableController(
					args.chainId,
					eulerAccount,
					targetBorrowVault,
				),
			);
		}
		if (hasDebt && (target.enableCollateral ?? true)) {
			items.push(
				this.executionService.encodeEnableCollateral(
					args.chainId,
					eulerAccount,
					targetCollateralVault,
				),
			);
		}

		if (hasDebt && targetBorrowVault) {
			items.push({
				targetContract: targetBorrowVault,
				onBehalfOfAccount: eulerAccount,
				value: 0n,
				data: encodeFunctionData({
					abi: eVaultAbi,
					functionName: "borrow",
					args: [borrowAmount, swapper],
				}),
			});
		}

		// Multicall #1: repay the Morpho debt (and run the debt swap if present)
		// before withdrawing collateral. Only emitted when there is source debt.
		if (hasDebt) {
			const preWithdrawCalls: Hex[] = [];
			if (debtSwapQuote) {
				preWithdrawCalls.push(
					...getSwapQuoteSwapCalls(debtSwapQuote, "Morpho debt migration"),
				);
			}
			preWithdrawCalls.push(
				encodeGenericSwap({
					target: morpho,
					tokenIn: marketParams.loanToken,
					tokenOut: marketParams.loanToken,
					payload: encodeFunctionData({
						abi: morphoBlueAbi,
						functionName: "repay",
						args: [marketParams, 0n, borrowShares, owner, ZERO_BYTES],
					}),
				}),
			);
			if (debtSwapQuote) {
				preWithdrawCalls.push(
					encodeFunctionData({
						abi: swapperAbi,
						functionName: "sweep",
						args: [marketParams.loanToken, 0n, owner],
					}),
				);
			}

			items.push({
				targetContract: swapper,
				onBehalfOfAccount: owner,
				value: 0n,
				data: encodeFunctionData({
					abi: swapperAbi,
					functionName: "multicall",
					args: [preWithdrawCalls],
				}),
			});
		}

		// Top-level EVC item: withdraw Morpho collateral on behalf of the owner
		// through the SwapVerifier (the standing authorization is granted to it).
		// No-swap migrations forward the collateral to the verifier so the
		// verified deposit helper can perform the final Euler deposit.
		items.push({
			targetContract: swapVerifier,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "morphoWithdrawCollateralForSender",
				args: [
					morpho,
					marketParams,
					collateralWithdrawAmount,
					collateralSwapQuote ? swapper : swapVerifier,
				],
			}),
		});

		// Multicall #2: run the collateral swap, if present, and repay any excess
		// debt. No-swap collateral deposits are handled by SwapVerifier below.
		const postDepositRepayCall =
			hasDebt && targetBorrowVault
				? encodeFunctionData({
						abi: swapperAbi,
						functionName: "repay",
						args: [
							debtSwapQuote
								? getAddress(debtSwapQuote.tokenIn.address)
								: marketParams.loanToken,
							targetBorrowVault,
							borrowAmount,
							eulerAccount,
						],
					})
				: undefined;
		const postWithdrawCalls: Hex[] = [];
		if (collateralSwapQuote) {
			postWithdrawCalls.push(collateralSwapQuote.swap.swapperData);
			if (postDepositRepayCall) postWithdrawCalls.push(postDepositRepayCall);
		}

		if (postWithdrawCalls.length > 0) {
			items.push({
				targetContract: swapper,
				onBehalfOfAccount: owner,
				value: 0n,
				data: encodeFunctionData({
					abi: swapperAbi,
					functionName: "multicall",
					args: [postWithdrawCalls],
				}),
			});
		}

		if (collateralSwapQuote) {
			items.push(
				encodeSwapQuoteVerificationItem({
					quote: collateralSwapQuote,
					swapVerifier,
					vault: targetCollateralVault,
					account: eulerAccount,
					deadline:
						args.deadline ?? BigInt(collateralSwapQuote.verify.deadline ?? 0),
					label: "Morpho collateral migration",
				}),
			);
		} else {
			items.push(
				encodeVerifyAmountMinAndDepositItem({
					swapVerifier,
					onBehalfOfAccount: owner,
					vault: targetCollateralVault,
					receiver: eulerAccount,
					amountMin: collateralMinAmount,
					deadline: verifierDeadline,
				}),
			);
			if (postDepositRepayCall) {
				items.push({
					targetContract: swapper,
					onBehalfOfAccount: owner,
					value: 0n,
					data: postDepositRepayCall,
				});
			}
		}
		if (args.removeAuthorizationAfterMigration) {
			items.push(
				this.encodeRemoveAuthorizationItem({
					chainId: args.chainId,
					owner,
					swapVerifier,
					authorization: args.authorization,
				}),
			);
		}

		return items;
	}

	private async buildEulerToMorphoBatch(
		args: BuildConnectorMigrationBatchArgs<MorphoMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		if (args.collateralSwapQuote || args.debtSwapQuote) {
			throw new Error(
				"Morpho Euler to Morpho migration does not support swaps",
			);
		}
		const source = assertEulerSource(args.source);
		const owner = getAddress(args.owner);
		const eulerAccount = getAddress(source.eulerAccount);
		const sourceBorrowVault = getAddress(source.borrowVault);
		const sourceCollateralVault = getAddress(source.collateralVault);
		const marketParams = normalizeMarketParams(args.position.raw.marketParams);
		const morpho = this.getMorphoAddress(args.chainId);
		const swapper = getSwapperAddress(
			this.deploymentService,
			args.chainId,
			source.swapper,
		);
		const swapVerifier = getSwapVerifierAddress(
			this.deploymentService,
			args.chainId,
		);
		const verifierDeadline =
			args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
		const sourceAmounts = await resolveEulerSourceAmounts(source, args.account);
		const externalTarget = args.externalTarget ?? {};
		const collateralAmount =
			externalTarget.collateralAmount ?? sourceAmounts.collateralAmount;
		const sourceCollateralAmount = collateralAmount;
		const redeemCollateralShares =
			externalTarget.collateralAmount === undefined
				? sourceAmounts.collateralShares
				: undefined;
		const morphoBorrowAmount =
			externalTarget.borrowAmount ??
			applyBuffer(
				sourceAmounts.debtAmount,
				externalTarget.interestBufferBps ??
					DEFAULT_OUTBOUND_INTEREST_BUFFER_BPS,
			);
		const eulerRepayAmount = externalTarget.repayAmount ?? maxUint256;

		if (sourceAmounts.debtAmount <= 0n) {
			throw new Error("Euler source position has no debt to migrate");
		}
		if (sourceCollateralAmount <= 0n || collateralAmount <= 0n) {
			throw new Error("Euler source position has no collateral to migrate");
		}
		if (morphoBorrowAmount <= 0n) {
			throw new Error("Morpho borrow amount must be greater than zero");
		}

		const items: EVCBatchItem[] = [];
		const hasSimulatedTransactionGrant =
			args.skipAuthorizationCheck &&
			args.authorizationRequest?.kind === "transaction"
				? this.validateSimulatedAuthorization({
						request: args.authorizationRequest,
						owner,
						swapVerifier,
						morpho,
					})
				: false;
		const alreadyAuthorized = hasSimulatedTransactionGrant
			? true
			: args.skipAuthorizationCheck && args.authorization
				? false
				: await this.isAuthorized(args.chainId, owner, swapVerifier);
		if (!alreadyAuthorized) {
			if (!args.authorization) {
				throw new Error(
					"Morpho authorization for the Euler SwapVerifier is required",
				);
			}
			items.push(
				this.encodeSetAuthorizationWithSigItem({
					chainId: args.chainId,
					owner,
					swapVerifier,
					authorization: args.authorization,
					isAuthorized: true,
				}),
			);
		}

		items.push({
			targetContract: sourceCollateralVault,
			onBehalfOfAccount: eulerAccount,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: redeemCollateralShares ? "redeem" : "withdraw",
				args: redeemCollateralShares
					? [redeemCollateralShares, swapper, eulerAccount]
					: [sourceCollateralAmount, swapper, eulerAccount],
			}),
		});

		// Multicall #1: supply exact Morpho collateral before borrowing.
		const preBorrowCalls: Hex[] = [
			encodeGenericSwap({
				target: morpho,
				tokenIn: marketParams.collateralToken,
				tokenOut: marketParams.collateralToken,
				payload: encodeFunctionData({
					abi: morphoBlueAbi,
					functionName: "supplyCollateral",
					args: [marketParams, collateralAmount, owner, ZERO_BYTES],
				}),
			}),
		];

		items.push({
			targetContract: swapper,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [preBorrowCalls],
			}),
		});

		// Top-level EVC item: borrow from Morpho on behalf of the owner through the
		// SwapVerifier (the standing authorization is granted to it), forwarding the
		// borrowed loan token to the Swapper.
		items.push({
			targetContract: swapVerifier,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "morphoBorrowForSender",
				args: [morpho, marketParams, morphoBorrowAmount, swapper],
			}),
		});

		// Multicall #2: repay the Euler source borrow vault and sweep any
		// remainders back to the owner.
		const postBorrowCalls: Hex[] = [
			encodeFunctionData({
				abi: swapperAbi,
				functionName: "repay",
				args: [
					marketParams.loanToken,
					sourceBorrowVault,
					eulerRepayAmount,
					eulerAccount,
				],
			}),
		];
		postBorrowCalls.push(
			encodeFunctionData({
				abi: swapperAbi,
				functionName: "sweep",
				args: [marketParams.loanToken, 0n, owner],
			}),
		);
		// Return collateral remainders from yield-bearing source-vault share drift
		// to the owner rather than stranding them.
		postBorrowCalls.push(
			encodeFunctionData({
				abi: swapperAbi,
				functionName: "sweep",
				args: [marketParams.collateralToken, 0n, owner],
			}),
		);

		items.push({
			targetContract: swapper,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [postBorrowCalls],
			}),
		});
		items.push(
			encodeVerifyDebtMaxItem({
				swapVerifier,
				onBehalfOfAccount: owner,
				vault: sourceBorrowVault,
				account: eulerAccount,
				amountMax: 0n,
				deadline: verifierDeadline,
			}),
		);
		if (args.removeAuthorizationAfterMigration) {
			items.push(
				this.encodeRemoveAuthorizationItem({
					chainId: args.chainId,
					owner,
					swapVerifier,
					authorization: args.authorization,
				}),
			);
		}

		return items;
	}

	getProtocolAddress(chainId: number): Address | undefined {
		const morpho = this.morphoAddresses[chainId];
		return morpho ? getAddress(morpho) : undefined;
	}

	getMorphoAddress(chainId: number): Address {
		const morpho = this.getProtocolAddress(chainId);
		if (!morpho) {
			throw new Error(
				`Morpho connector is not configured for chainId ${chainId}`,
			);
		}
		return morpho;
	}

	private async isAuthorized(
		chainId: number,
		authorizer: Address,
		authorized: Address,
	): Promise<boolean> {
		const provider = this.providerService.getProvider(chainId);
		return provider.readContract({
			address: this.getMorphoAddress(chainId),
			abi: morphoBlueAbi,
			functionName: "isAuthorized",
			args: [getAddress(authorizer), getAddress(authorized)],
		});
	}

	private validateSimulatedAuthorization(args: {
		request: MigrationAuthorizationRequest;
		owner: Address;
		swapVerifier: Address;
		morpho: Address;
	}): true {
		const request = args.request as MorphoMigrationAuthorizationRequest;
		if (
			request.kind !== "transaction" ||
			request.connectorId !== MORPHO_CONNECTOR_ID ||
			request.authorizationType !== "morphoAuthorization"
		) {
			throw new Error("Expected a Morpho transaction authorization request");
		}
		assertSameAddress(
			request.owner,
			args.owner,
			"Morpho authorization owner mismatch",
		);
		assertSameAddress(
			request.call.to,
			args.morpho,
			"Morpho authorization call target mismatch",
		);
		if (request.call.functionName !== "setAuthorization") {
			throw new Error(
				"Morpho transaction authorization must call setAuthorization",
			);
		}
		const [authorized, isAuthorized] = request.call.args;
		if (typeof authorized !== "string") {
			throw new Error("Morpho transaction authorization target is required");
		}
		assertSameAddress(
			authorized as Address,
			args.swapVerifier,
			"Morpho authorization target must be the Euler SwapVerifier",
		);
		if (isAuthorized !== true) {
			throw new Error("Morpho transaction authorization must enable access");
		}
		return true;
	}

	private encodeSetAuthorizationWithSigItem(args: {
		chainId: number;
		owner: Address;
		swapVerifier: Address;
		authorization: SignedMigrationAuthorization;
		isAuthorized: boolean;
	}): EVCBatchItem {
		const request = assertMorphoAuthorizationRequest(
			args.authorization.request,
		);
		if (!args.authorization.signature) {
			throw new Error("Morpho authorization signature is required");
		}

		const authorization = toMorphoAuthorization(request.typedData.message);
		assertSameAddress(
			authorization.authorizer,
			args.owner,
			"Morpho authorization authorizer must match migration owner",
		);
		assertSameAddress(
			authorization.authorized,
			args.swapVerifier,
			"Morpho authorization target must be the Euler SwapVerifier",
		);
		if (authorization.isAuthorized !== args.isAuthorized) {
			throw new Error(
				`Morpho authorization must set isAuthorized=${args.isAuthorized}`,
			);
		}

		return {
			targetContract: this.getMorphoAddress(args.chainId),
			onBehalfOfAccount: args.owner,
			value: 0n,
			data: encodeFunctionData({
				abi: morphoBlueAbi,
				functionName: "setAuthorizationWithSig",
				args: [
					authorization,
					splitMorphoAuthorizationSignature(args.authorization.signature),
				],
			}),
		};
	}

	private encodeRemoveAuthorizationItem(args: {
		chainId: number;
		owner: Address;
		swapVerifier: Address;
		authorization?: SignedMigrationAuthorization;
	}): EVCBatchItem {
		const authorization =
			args.authorization?.postMigrationAuthorization ?? args.authorization;
		if (!authorization) {
			throw new Error("Morpho authorization removal signature is required");
		}

		return this.encodeSetAuthorizationWithSigItem({
			chainId: args.chainId,
			owner: args.owner,
			swapVerifier: args.swapVerifier,
			authorization,
			isAuthorized: false,
		});
	}

	/**
	 * `morpho.setAuthorization` — the signature-free form.
	 *
	 * Synchronous: unlike `setAuthorizationWithSig` there is no nonce to read,
	 * so the grant needs no RPC round-trip.
	 */
	private buildAuthorizationTransactionRequest(args: {
		chainId: number;
		owner: Address;
		morpho: Address;
		swapVerifier: Address;
		positionId?: string;
	}): MorphoAuthorizationTransactionRequest {
		const setAuthorization = (isAuthorized: boolean) => ({
			to: args.morpho,
			abi: morphoBlueAbi as Abi,
			functionName: "setAuthorization",
			args: [args.swapVerifier, isAuthorized] as const,
		});
		return {
			kind: "transaction",
			authorizationType: "morphoAuthorization",
			connectorId: MORPHO_CONNECTOR_ID,
			protocol: MORPHO_PROTOCOL,
			chainId: args.chainId,
			owner: args.owner,
			positionId: args.positionId,
			call: setAuthorization(true),
			revocation: setAuthorization(false),
		};
	}

	private buildAuthorizationRequest(args: {
		chainId: number;
		owner: Address;
		morpho: Address;
		swapVerifier: Address;
		nonce: bigint;
		deadline: bigint;
		isAuthorized: boolean;
		positionId?: string;
	}): MorphoAuthorizationTypedDataRequest {
		const message: MorphoAuthorizationTypedDataMessage = {
			authorizer: args.owner,
			authorized: args.swapVerifier,
			isAuthorized: args.isAuthorized,
			nonce: args.nonce,
			deadline: args.deadline,
		};

		return {
			kind: "typedData",
			connectorId: MORPHO_CONNECTOR_ID,
			protocol: MORPHO_PROTOCOL,
			chainId: args.chainId,
			owner: args.owner,
			positionId: args.positionId,
			typedData: {
				domain: {
					chainId: args.chainId,
					verifyingContract: args.morpho,
				},
				types: MORPHO_AUTHORIZATION_TYPES,
				primaryType: "Authorization",
				message,
			},
		};
	}
}

function assertMorphoAuthorizationRequest(
	request: MigrationAuthorizationRequest,
): MorphoAuthorizationTypedDataRequest {
	if (
		request.kind !== "typedData" ||
		request.connectorId !== MORPHO_CONNECTOR_ID
	) {
		throw new Error("Expected a Morpho typed-data authorization request");
	}
	return request as MorphoAuthorizationTypedDataRequest;
}

function toMorphoAuthorization(
	message: MorphoAuthorizationTypedDataMessage,
): MorphoAuthorization {
	return {
		authorizer: getAddress(message.authorizer),
		authorized: getAddress(message.authorized),
		isAuthorized: message.isAuthorized,
		nonce: BigInt(message.nonce),
		deadline: BigInt(message.deadline),
	};
}

function toMorphoMigrationTarget(
	chainId: number,
	market: MorphoApiMarket,
): MigrationTarget<MorphoMigrationTargetRaw, MorphoMarketParams> | null {
	const loanAsset = parseMorphoApiAsset(market.loanAsset);
	const collateralAsset = parseMorphoApiAsset(market.collateralAsset);
	if (
		!market.marketId ||
		!loanAsset ||
		!collateralAsset ||
		!market.oracle?.address ||
		!market.irmAddress
	) {
		return null;
	}

	const lltvRaw = parseBigIntAmount(market.lltv);
	const liquidityAssets = parseBigIntAmount(market.state?.liquidityAssets);
	const ref: MorphoMarketParams = {
		loanToken: loanAsset.asset,
		collateralToken: collateralAsset.asset,
		oracle: getAddress(market.oracle.address),
		irm: getAddress(market.irmAddress),
		lltv: lltvRaw,
	};
	const marketId = getMorphoMarketId(ref);
	return {
		connectorId: MORPHO_CONNECTOR_ID,
		protocol: MORPHO_PROTOCOL,
		id: marketId,
		chainId,
		ref,
		debt: loanAsset,
		collateral: collateralAsset,
		liquidity: {
			asset: loanAsset.asset,
			amount: liquidityAssets,
		},
		raw: {
			marketId,
			listed: market.listed !== false,
			borrowApy: parseNumberOrNull(market.state?.borrowApy),
			netBorrowApy: parseNumberOrNull(market.state?.netBorrowApy),
			supplyApy: parseNumberOrNull(market.state?.supplyApy),
			lltv: lltvRaw > 0n ? Number(lltvRaw) / 1e16 : null,
			liquidityAssets,
			liquidityAssetsUsd: parseNumberOrNull(market.state?.liquidityAssetsUsd),
		},
	};
}

function parseMorphoApiAsset(
	asset: MorphoApiAsset | null | undefined,
): { asset: Address; symbol?: string; decimals?: number } | null {
	if (!asset?.address) return null;
	const parsed = Number(asset.decimals);
	return {
		asset: getAddress(asset.address),
		...(asset.symbol ? { symbol: asset.symbol } : {}),
		...(Number.isInteger(parsed) && parsed >= 0 ? { decimals: parsed } : {}),
	};
}

function parseBigIntAmount(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return BigInt(Math.trunc(value));
	}
	if (typeof value !== "string") return 0n;
	const trimmed = value.trim();
	if (!trimmed) return 0n;
	try {
		return BigInt(trimmed);
	} catch {
		return 0n;
	}
}

function parseNumberOrNull(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarketParams(
	marketParams: MorphoMarketParams,
): MorphoMarketParams {
	return {
		loanToken: getAddress(marketParams.loanToken),
		collateralToken: getAddress(marketParams.collateralToken),
		oracle: getAddress(marketParams.oracle),
		irm: getAddress(marketParams.irm),
		lltv: BigInt(marketParams.lltv),
	};
}

function toMorphoMarketState(
	market: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
): MorphoMarketState {
	return {
		totalSupplyAssets: market[0],
		totalSupplyShares: market[1],
		totalBorrowAssets: market[2],
		totalBorrowShares: market[3],
		lastUpdate: market[4],
		fee: market[5],
	};
}

function toAssetsUp(
	shares: bigint,
	totalAssets: bigint,
	totalShares: bigint,
): bigint {
	if (shares === 0n || totalAssets === 0n || totalShares === 0n) return 0n;
	return (shares * totalAssets + totalShares - 1n) / totalShares;
}
