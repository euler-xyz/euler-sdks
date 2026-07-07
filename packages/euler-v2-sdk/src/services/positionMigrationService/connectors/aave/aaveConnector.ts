import {
	encodeFunctionData,
	getAddress,
	maxUint256,
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
	assertSameAddress,
	assertSwapQuoteUsesSwapper,
	encodeDepositVerifiedSwapQuoteItem,
	encodeGenericSwap,
	encodeSwapQuoteVerificationItem,
	encodeVerifyAmountMinAndDepositItem,
	encodeVerifyDebtMaxItem,
	getSwapQuoteInputAmount,
	getSwapQuoteSwapCalls,
	splitPermitSignature,
} from "../shared.js";
import type {
	BuildConnectorMigrationBatchArgs,
	EulerMigrationSource,
	EulerMigrationTarget,
	GetMigrationAuthorizationArgs,
	GetMigrationPositionArgs,
	ListMigrationPositionsArgs,
	ListMigrationTargetsArgs,
	MigrationTarget,
	MigrationAuthorizationRequest,
	PositionMigrationConnector,
	SignedMigrationAuthorization,
} from "../../positionMigrationServiceTypes.js";
import type { Account, IHasVaultAddress } from "../../../../entities/Account.js";
import {
	aaveATokenAbi,
	aaveDebtTokenAbi,
	aaveV3PoolAbi,
} from "./abis/aaveV3Abi.js";
import type {
	AaveDelegationTypedDataMessage,
	AaveDelegationTypedDataRequest,
	AaveMigrationAuthorizationRequest,
	AaveMigrationConnectorConfig,
	AaveMarketDeploymentConfig,
	AaveMigrationPosition,
	AaveMigrationTargetExtraData,
	AaveMigrationTargetRaw,
	AavePermitTypedDataMessage,
	AavePermitTypedDataRequest,
	AavePositionRaw,
	AavePositionRef,
	AaveReserveData,
	AaveReserveTokens,
	AaveSignature,
} from "./aaveConnectorTypes.js";

export const AAVE_CONNECTOR_ID = "aave";
export const AAVE_PROTOCOL = "Aave V3";
const DEFAULT_AAVE_GRAPHQL_ENDPOINT = "https://api.v3.aave.com/graphql";

const DEFAULT_AAVE_POOL_ADDRESSES: Record<number, Address> = {
	1: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
	10: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
	56: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
	100: "0xb50201558B00496A145fE76f7424749556E326D8",
	143: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
	146: "0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3",
	5000: "0x458F293454fE0d67EC0655f3672301301DD51422",
	8453: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
	9745: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
	42161: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
	43114: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
	57073: "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA",
};
const DEFAULT_INTEREST_BUFFER_BPS = 100n;
const DEFAULT_ATOKEN_TRANSFER_BUFFER_BPS = 1n;
const DEFAULT_OUTBOUND_INTEREST_BUFFER_BPS = 1n;
const AAVE_VARIABLE_INTEREST_RATE_MODE = 2n;
const AAVE_ACTIVE_BIT = 56n;
const AAVE_FROZEN_BIT = 57n;
const AAVE_BORROWING_BIT = 58n;
const AAVE_PAUSED_BIT = 60n;
const AAVE_LTV_MASK = (1n << 16n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

type ResolvedAavePositionRef = AavePositionRef & { pool: Address };
type AaveProvider = ReturnType<IProviderService["getProvider"]>;

type AaveGraphqlCurrency = {
	address: Address;
	symbol: string;
	decimals: number;
};

type AaveGraphqlDecimalValue = {
	raw: string;
	decimals: number;
	value: string;
};

type AaveGraphqlTokenAmount = {
	amount: AaveGraphqlDecimalValue;
};

type AaveGraphqlReserve = {
	underlyingToken: AaveGraphqlCurrency;
	aToken: AaveGraphqlCurrency;
	vToken: AaveGraphqlCurrency;
	isFrozen: boolean;
	isPaused: boolean;
	supplyInfo: {
		canBeCollateral: boolean;
		maxLTV: AaveGraphqlDecimalValue;
		total: AaveGraphqlDecimalValue;
	};
	borrowInfo?: {
		borrowingState: "ENABLED" | "DISABLED" | "USER_EMODE_DISABLED_BORROW";
		availableLiquidity: AaveGraphqlTokenAmount;
		total: AaveGraphqlTokenAmount;
	} | null;
};

type AaveGraphqlMarket = {
	name: string;
	address: Address;
	chain: { chainId: number };
	totalAvailableLiquidity: string;
	totalMarketSize: string;
	reserves: AaveGraphqlReserve[];
};

type AaveGraphqlResponse<TData> = {
	data?: TData;
	errors?: Array<{ message?: string }>;
};

const AAVE_MARKETS_QUERY = `
	query AaveMigrationMarkets($request: MarketsRequest!) {
		markets(request: $request) {
			name
			address
			chain { chainId }
			totalAvailableLiquidity
			totalMarketSize
			reserves {
				underlyingToken { address symbol decimals }
				aToken { address symbol decimals }
				vToken { address symbol decimals }
				isFrozen
				isPaused
				supplyInfo {
					canBeCollateral
					maxLTV { raw decimals value }
					total { raw decimals value }
				}
				borrowInfo {
					borrowingState
					availableLiquidity { amount { raw decimals value } }
					total { amount { raw decimals value } }
				}
			}
		}
	}
`;

export const AAVE_PERMIT_TYPES = {
	Permit: [
		{ name: "owner", type: "address" },
		{ name: "spender", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

export const AAVE_DELEGATION_TYPES = {
	DelegationWithSig: [
		{ name: "delegatee", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

export function getAavePositionId(positionRef: AavePositionRef): string {
	if (!positionRef.pool) {
		throw new Error("Aave position id requires a resolved pool address");
	}

	if (!positionRef.debtAsset) {
		return [
			AAVE_CONNECTOR_ID,
			getAddress(positionRef.pool),
			getAddress(positionRef.collateralAsset),
			"supply",
		].join(":");
	}

	return [
		AAVE_CONNECTOR_ID,
		getAddress(positionRef.pool),
		getAddress(positionRef.collateralAsset),
		getAddress(positionRef.debtAsset),
		"variable",
	].join(":");
}

export function splitAaveSignature(signature: Hex): AaveSignature {
	return splitPermitSignature(signature);
}

export class AavePositionMigrationConnector
	implements PositionMigrationConnector<AavePositionRef, AaveMigrationPosition>
{
	readonly id = AAVE_CONNECTOR_ID;
	readonly protocol = AAVE_PROTOCOL;
	readonly name = "Aave V3";

	private readonly deployments: AaveMarketDeploymentConfig[];
	private readonly graphqlEndpoint?: string;
	private readonly marketCache = new Map<
		number,
		Promise<AaveGraphqlMarket[]>
	>();
	private readonly defaultInterestBufferBps: bigint;
	private readonly defaultOutboundInterestBufferBps: bigint;
	private readonly referralCode: number;

	constructor(
		private readonly deploymentService: IDeploymentService,
		private readonly providerService: IProviderService,
		private readonly executionService: IExecutionService,
		config: AaveMigrationConnectorConfig = {},
	) {
		this.deployments = normalizeAaveDeployments([
			...Object.entries({
				...DEFAULT_AAVE_POOL_ADDRESSES,
				...(config.poolAddresses ?? {}),
			}).map(([chainId, pool]) => ({
				chainId: Number(chainId),
				pool,
			})),
			...(config.deployments ?? []),
		]);
		this.graphqlEndpoint =
			config.graphqlEndpoint === null
				? undefined
				: (config.graphqlEndpoint ?? DEFAULT_AAVE_GRAPHQL_ENDPOINT);
		this.defaultInterestBufferBps =
			config.defaultInterestBufferBps ?? DEFAULT_INTEREST_BUFFER_BPS;
		this.defaultOutboundInterestBufferBps =
			config.defaultOutboundInterestBufferBps ??
			DEFAULT_OUTBOUND_INTEREST_BUFFER_BPS;
		this.referralCode = config.referralCode ?? 0;
	}

	listPositions(
		args: ListMigrationPositionsArgs<AavePositionRef>,
	): Promise<AaveMigrationPosition[]> {
		return Promise.all(
			(args.positionRefs ?? []).map((positionRef) =>
				this.getPosition({
					connectorId: AAVE_CONNECTOR_ID,
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
	): Promise<
		MigrationTarget<
			AaveMigrationTargetRaw,
			AavePositionRef,
			AaveMigrationTargetExtraData
		>[]
	> {
		if ((args.direction ?? "euler-to-external") !== "euler-to-external") {
			return [];
		}

		const collateralAsset = getAddress(args.collateralAsset);
		const debtAsset = getAddress(args.debtAsset);
		if (this.graphqlEndpoint) {
			try {
				return await this.listGraphqlTargets({
					chainId: args.chainId,
					collateralAsset,
					debtAsset,
					minLiquidity: args.minLiquidity,
				});
			} catch {
				this.marketCache.delete(args.chainId);
			}
		}

		return this.listConfiguredDeploymentTargets({
			chainId: args.chainId,
			collateralAsset,
			debtAsset,
			minLiquidity: args.minLiquidity,
		});
	}

	async getPosition(
		args: GetMigrationPositionArgs<AavePositionRef>,
	): Promise<AaveMigrationPosition> {
		const owner = getAddress(args.owner);
		const market = await this.resolveAaveMarket(args.chainId, args.positionRef);
		const ref = normalizeAavePositionRef(
			args.positionRef,
			market?.address ??
				this.getPoolAddress(args.chainId, args.positionRef.pool),
		);
		const provider = this.providerService.getProvider(args.chainId);

		const reserveContracts = [
			{
				address: ref.pool,
				abi: aaveV3PoolAbi,
				functionName: "getReserveData",
				args: [ref.collateralAsset],
			},
			...(ref.debtAsset
				? [
						{
							address: ref.pool,
							abi: aaveV3PoolAbi,
							functionName: "getReserveData",
							args: [ref.debtAsset],
						},
					]
				: []),
		];
		const [collateralReserveResult, debtReserveResult] =
			(await provider.multicall({
				contracts: reserveContracts as Parameters<
					typeof provider.multicall
				>[0]["contracts"],
				allowFailure: false,
			})) as unknown as [unknown, unknown | undefined];

		const collateralReserve = toReserveTokens(collateralReserveResult);
		const debtReserve = debtReserveResult
			? toReserveTokens(debtReserveResult)
			: undefined;
		const balanceContracts = [
			{
				address: collateralReserve.aTokenAddress,
				abi: aaveATokenAbi,
				functionName: "balanceOf",
				args: [owner],
			},
			...(debtReserve
				? [
						{
							address: debtReserve.variableDebtTokenAddress,
							abi: aaveDebtTokenAbi,
							functionName: "balanceOf",
							args: [owner],
						},
						{
							address: debtReserve.stableDebtTokenAddress,
							abi: aaveDebtTokenAbi,
							functionName: "balanceOf",
							args: [owner],
						},
					]
				: []),
		];
		const [aTokenBalance, variableDebtResult, stableDebtResult] =
			(await provider.multicall({
				contracts: balanceContracts as Parameters<
					typeof provider.multicall
				>[0]["contracts"],
				allowFailure: false,
			})) as unknown as [bigint, bigint | undefined, bigint | undefined];
		const variableDebt = variableDebtResult ?? 0n;
		const stableDebt = stableDebtResult ?? 0n;

		const raw: AavePositionRaw = {
			id: getAavePositionId(ref),
			owner,
			pool: ref.pool,
			marketName: market?.name,
			collateralAsset: ref.collateralAsset,
			debtAsset: ref.debtAsset,
			collateralReserve,
			debtReserve,
			aTokenBalance,
			stableDebt,
			variableDebt,
		};

		return {
			connectorId: AAVE_CONNECTOR_ID,
			protocol: AAVE_PROTOCOL,
			id: raw.id,
			chainId: args.chainId,
			owner,
			ref,
			debt: {
				asset: ref.debtAsset ?? ref.collateralAsset,
				amount: variableDebt + stableDebt,
			},
			collateral: {
				asset: ref.collateralAsset,
				amount: aTokenBalance,
			},
			raw,
		};
	}

	async getAuthorization(
		args: GetMigrationAuthorizationArgs<AaveMigrationPosition>,
	): Promise<AaveMigrationAuthorizationRequest | undefined> {
		if (
			args.direction !== "external-to-euler" &&
			args.direction !== "euler-to-external"
		) {
			throw new Error(`Unsupported migration direction: ${args.direction}`);
		}

		const position = assertAavePosition(args.position);
		const owner = getAddress(args.owner);
		if (args.direction === "external-to-euler") {
			const swapVerifier = this.getSwapVerifierAddress(args.chainId);
			const token = position.raw.collateralReserve.aTokenAddress;
			const collateralAmount = position.raw.aTokenBalance;
			if (collateralAmount <= 0n) return undefined;
			const collateralTransferMaxAmount = applyBuffer(
				collateralAmount,
				DEFAULT_ATOKEN_TRANSFER_BUFFER_BPS,
			);
			if (
				await this.hasATokenAllowance(
					args.chainId,
					token,
					owner,
					swapVerifier,
					collateralTransferMaxAmount,
				)
			) {
				return undefined;
			}

			return this.buildATokenPermitRequest({
				chainId: args.chainId,
				owner,
				spender: swapVerifier,
				token,
				value: collateralTransferMaxAmount,
				positionId: position.id,
				deadline: args.deadline,
			});
		}

		const source = assertEulerSource(args.source);
		const swapVerifier = this.getSwapVerifierAddress(args.chainId);
		const sourceAmounts = await this.resolveEulerSourceAmounts(
			source,
			args.account,
		);
		const value =
			args.externalTarget?.borrowAmount ??
			applyBuffer(
				sourceAmounts.debtAmount,
				args.externalTarget?.interestBufferBps ??
					this.defaultOutboundInterestBufferBps,
			);
		if (!position.raw.debtReserve) {
			throw new Error(
				"Aave debt reserve is required for Euler to Aave migration",
			);
		}
		const token = position.raw.debtReserve.variableDebtTokenAddress;
		if (value <= 0n) return undefined;
		if (
			await this.hasBorrowAllowance(
				args.chainId,
				token,
				owner,
				swapVerifier,
				value,
			)
		) {
			return undefined;
		}

		return this.buildDebtDelegationRequest({
			chainId: args.chainId,
			delegator: owner,
			delegatee: swapVerifier,
			token,
			value,
			positionId: position.id,
			deadline: args.deadline,
		});
	}

	async buildMigrationBatch(
		args: BuildConnectorMigrationBatchArgs<AaveMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		if (args.position.connectorId !== AAVE_CONNECTOR_ID) {
			throw new Error(
				`Aave connector cannot build migration for ${args.position.connectorId}`,
			);
		}

		if (args.direction === "external-to-euler") {
			return this.buildExternalToEulerBatch(args);
		}
		if (args.direction === "euler-to-external") {
			return this.buildEulerToAaveBatch(args);
		}
		throw new Error(`Unsupported migration direction: ${args.direction}`);
	}

	getProtocolAddress(chainId: number): Address | undefined {
		return this.getProtocolAddresses(chainId)[0];
	}

	getProtocolAddresses(chainId: number): Address[] {
		return this.deployments
			.filter((deployment) => deployment.chainId === chainId)
			.map((deployment) => getAddress(deployment.pool));
	}

	getPoolAddress(chainId: number, override?: Address): Address {
		if (override) return getAddress(override);
		const pool = this.getProtocolAddresses(chainId)[0];
		if (!pool) {
			throw new Error(
				`Aave connector is not configured for chainId ${chainId}`,
			);
		}
		return pool;
	}

	private async listGraphqlTargets(args: {
		chainId: number;
		collateralAsset: Address;
		debtAsset: Address;
		minLiquidity?: bigint;
	}): Promise<
		MigrationTarget<
			AaveMigrationTargetRaw,
			AavePositionRef,
			AaveMigrationTargetExtraData
		>[]
	> {
		const markets = await this.fetchAaveMarkets(args.chainId);
		const targets: MigrationTarget<
			AaveMigrationTargetRaw,
			AavePositionRef,
			AaveMigrationTargetExtraData
		>[] = [];

		for (const market of markets) {
			const target = toAaveGraphqlTarget({
				chainId: args.chainId,
				market,
				collateralAsset: args.collateralAsset,
				debtAsset: args.debtAsset,
				minLiquidity: args.minLiquidity,
			});
			if (target) targets.push(target);
		}

		return targets;
	}

	private async listConfiguredDeploymentTargets(args: {
		chainId: number;
		collateralAsset: Address;
		debtAsset: Address;
		minLiquidity?: bigint;
	}): Promise<
		MigrationTarget<
			AaveMigrationTargetRaw,
			AavePositionRef,
			AaveMigrationTargetExtraData
		>[]
	> {
		const deployments = this.deployments.filter(
			(deployment) => deployment.chainId === args.chainId,
		);
		if (deployments.length === 0) return [];

		const targets = await Promise.all(
			deployments.map((deployment) =>
				this.getConfiguredDeploymentTarget({ ...args, deployment }),
			),
		);

		return targets.filter(
			(
				target,
			): target is MigrationTarget<
				AaveMigrationTargetRaw,
				AavePositionRef,
				AaveMigrationTargetExtraData
			> => target !== null,
		);
	}

	private async getConfiguredDeploymentTarget(args: {
		chainId: number;
		collateralAsset: Address;
		debtAsset: Address;
		minLiquidity?: bigint;
		deployment: AaveMarketDeploymentConfig;
	}): Promise<MigrationTarget<
		AaveMigrationTargetRaw,
		AavePositionRef,
		AaveMigrationTargetExtraData
	> | null> {
		const pool = getAddress(args.deployment.pool);
		const provider = this.providerService.getProvider(args.chainId);
		const [collateralReserveResult, debtReserveResult] =
			(await provider.multicall({
				contracts: [
					{
						address: pool,
						abi: aaveV3PoolAbi,
						functionName: "getReserveData",
						args: [args.collateralAsset],
					},
					{
						address: pool,
						abi: aaveV3PoolAbi,
						functionName: "getReserveData",
						args: [args.debtAsset],
					},
				],
				allowFailure: true,
			})) as [
				{ status: "success"; result: unknown } | { status: "failure" },
				{ status: "success"; result: unknown } | { status: "failure" },
			];

		if (
			collateralReserveResult.status !== "success" ||
			debtReserveResult.status !== "success"
		) {
			return null;
		}

		const collateralReserve = toReserveData(collateralReserveResult.result);
		const debtReserve = toReserveData(debtReserveResult.result);
		if (
			!isUsableCollateralReserve(collateralReserve) ||
			!isUsableBorrowReserve(debtReserve)
		) {
			return null;
		}

		const availableLiquidity = await readAaveAvailableLiquidity(
			provider,
			args.debtAsset,
			debtReserve.aTokenAddress,
		);
		if (
			args.minLiquidity !== undefined &&
			availableLiquidity !== undefined &&
			availableLiquidity < args.minLiquidity
		) {
			return null;
		}

		const totalSupplied = await readAaveTotalSupplied(
			provider,
			debtReserve.aTokenAddress,
		);
		const ref: AavePositionRef = {
			pool,
			collateralAsset: args.collateralAsset,
			debtAsset: args.debtAsset,
		};
		const extraData: AaveMigrationTargetExtraData = {
			marketName: args.deployment.marketName,
			pool,
			availableLiquidity,
			totalSupplied,
		};
		return {
			connectorId: AAVE_CONNECTOR_ID,
			protocol: AAVE_PROTOCOL,
			id: getAavePositionId(ref),
			chainId: args.chainId,
			ref,
			debt: { asset: args.debtAsset },
			collateral: { asset: args.collateralAsset },
			...(availableLiquidity !== undefined
				? { liquidity: { asset: args.debtAsset, amount: availableLiquidity } }
				: {}),
			raw: {
				pool,
				marketName: args.deployment.marketName,
				collateralReserve,
				debtReserve,
				availableLiquidity,
				totalSupplied,
			},
			extraData,
		};
	}

	private async resolveAaveMarket(
		chainId: number,
		positionRef: AavePositionRef,
	): Promise<AaveGraphqlMarket | undefined> {
		if (positionRef.pool || !this.graphqlEndpoint) return undefined;
		try {
			const collateralAsset = getAddress(positionRef.collateralAsset);
			const debtAsset = positionRef.debtAsset
				? getAddress(positionRef.debtAsset)
				: undefined;
			return (await this.fetchAaveMarkets(chainId)).find((market) => {
				const hasCollateral = market.reserves.some((reserve) =>
					sameAddress(reserve.underlyingToken.address, collateralAsset),
				);
				const hasDebt =
					!debtAsset ||
					market.reserves.some((reserve) =>
						sameAddress(reserve.underlyingToken.address, debtAsset),
					);
				return hasCollateral && hasDebt;
			});
		} catch {
			this.marketCache.delete(chainId);
			return undefined;
		}
	}

	private fetchAaveMarkets(chainId: number): Promise<AaveGraphqlMarket[]> {
		const cached = this.marketCache.get(chainId);
		if (cached) return cached;

		const request = this.fetchAaveMarketsUncached(chainId);
		this.marketCache.set(chainId, request);
		return request;
	}

	private async fetchAaveMarketsUncached(
		chainId: number,
	): Promise<AaveGraphqlMarket[]> {
		if (!this.graphqlEndpoint) return [];
		const response = await fetch(this.graphqlEndpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				query: AAVE_MARKETS_QUERY,
				variables: { request: { chainIds: [chainId] } },
			}),
		});
		if (!response.ok) {
			throw new Error(`Aave GraphQL request failed: ${response.status}`);
		}

		const body = (await response.json()) as AaveGraphqlResponse<{
			markets?: AaveGraphqlMarket[];
		}>;
		if (body.errors?.length) {
			throw new Error(
				body.errors[0]?.message ?? "Aave GraphQL returned an error",
			);
		}

		return (body.data?.markets ?? []).filter(
			(market) => Number(market.chain.chainId) === chainId,
		);
	}

	private async buildExternalToEulerBatch(
		args: BuildConnectorMigrationBatchArgs<AaveMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		const target = assertEulerTarget(args.target);
		const owner = getAddress(args.owner);
		const eulerAccount = getAddress(target.eulerAccount);
		const targetBorrowVault = target.borrowVault
			? getAddress(target.borrowVault)
			: undefined;
		const targetCollateralVault = getAddress(target.collateralVault);
		const pool = args.position.raw.pool;
		const swapper = this.getSwapperAddress(args.chainId, target.swapper);
		const swapVerifier = this.getSwapVerifierAddress(args.chainId);
		const aToken = args.position.raw.collateralReserve.aTokenAddress;
		const collateralAmount = args.position.raw.aTokenBalance;
		const collateralMinAmount = target.minCollateralAssets ?? collateralAmount;
		const collateralTransferMaxAmount = applyBuffer(
			collateralAmount,
			DEFAULT_ATOKEN_TRANSFER_BUFFER_BPS,
		);
		const verifierDeadline =
			args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
		const variableDebt = args.position.raw.variableDebt;
		const stableDebt = args.position.raw.stableDebt;
		const hasDebt = variableDebt > 0n;
		const debtAsset = args.position.raw.debtAsset;
		const collateralSwapQuote = args.collateralSwapQuote;
		const debtSwapQuote = args.debtSwapQuote;
		const baseDebtRepayAmount = applyBuffer(
			variableDebt,
			target.interestBufferBps ?? this.defaultInterestBufferBps,
		);
		const borrowAmount =
			target.borrowAmount ??
			(debtSwapQuote
				? getSwapQuoteInputAmount(debtSwapQuote)
				: baseDebtRepayAmount);
		const externalDebtRepayAmount = debtSwapQuote
			? baseDebtRepayAmount
			: borrowAmount;

		if (stableDebt > 0n) {
			throw new Error("Aave stable debt migration is not supported");
		}
		if (collateralAmount <= 0n) {
			throw new Error("Aave source position has no collateral to migrate");
		}
		if (hasDebt && !targetBorrowVault) {
			throw new Error("Target Euler borrow vault is required");
		}
		if (hasDebt && !debtAsset) {
			throw new Error(
				"Aave debt asset is required when source debt is present",
			);
		}
		if (!hasDebt && debtSwapQuote) {
			throw new Error("Aave debt swap quote requires source debt");
		}
		if (hasDebt && borrowAmount <= 0n) {
			throw new Error("Euler borrow amount must be greater than zero");
		}
		if (hasDebt && externalDebtRepayAmount <= 0n) {
			throw new Error("Aave repay amount must be greater than zero");
		}
		if (debtSwapQuote) {
			assertSwapQuoteUsesSwapper(debtSwapQuote, swapper, "Aave debt migration");
		}
		if (collateralSwapQuote) {
			assertSwapQuoteUsesSwapper(
				collateralSwapQuote,
				swapper,
				"Aave collateral migration",
			);
		}
		const useDepositSwapVerification =
			target.collateralSwapVerification === "deposit";
		if (useDepositSwapVerification && hasDebt) {
			throw new Error(
				"Deposit-verified collateral swaps are only supported for supply-only migrations",
			);
		}
		if (useDepositSwapVerification && !collateralSwapQuote) {
			throw new Error(
				"Deposit-verified collateral swaps require a collateral swap quote",
			);
		}

		const items: EVCBatchItem[] = [];
		if (
			!(await this.hasATokenAllowance(
				args.chainId,
				aToken,
				owner,
				swapVerifier,
				collateralTransferMaxAmount,
			))
		) {
			if (!args.authorization) {
				throw new Error(
					"Aave aToken permit for the Euler SwapVerifier is required",
				);
			}
			items.push(
				this.encodeATokenPermitItem({
					owner,
					swapVerifier,
					aToken,
					maxAmount: collateralTransferMaxAmount,
					authorization: args.authorization,
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

		const preTransferSwapperCalls: Hex[] = [];
		if (hasDebt && debtSwapQuote) {
			preTransferSwapperCalls.push(
				...getSwapQuoteSwapCalls(debtSwapQuote, "Aave debt migration"),
			);
		}
		if (hasDebt) {
			if (!debtAsset) {
				throw new Error(
					"Aave debt asset is required when source debt is present",
				);
			}
			preTransferSwapperCalls.push(
				encodeGenericSwap({
					target: pool,
					tokenIn: debtAsset,
					tokenOut: debtAsset,
					payload: encodeFunctionData({
						abi: aaveV3PoolAbi,
						functionName: "repay",
						args: [
							debtAsset,
							externalDebtRepayAmount,
							AAVE_VARIABLE_INTEREST_RATE_MODE,
							owner,
						],
					}),
				}),
			);
			if (debtSwapQuote) {
				preTransferSwapperCalls.push(
					encodeFunctionData({
						abi: swapperAbi,
						functionName: "sweep",
						args: [debtAsset, 0n, owner],
					}),
				);
			}
		}

		if (preTransferSwapperCalls.length > 0) {
			items.push({
				targetContract: swapper,
				onBehalfOfAccount: owner,
				value: 0n,
				data: encodeFunctionData({
					abi: swapperAbi,
					functionName: "multicall",
					args: [preTransferSwapperCalls],
				}),
			});
		}

		items.push({
			targetContract: swapVerifier,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "transferBalanceFromSender",
				args: [aToken, collateralTransferMaxAmount, swapper],
			}),
		});

		const postDepositRepayCall =
			hasDebt && targetBorrowVault
				? encodeFunctionData({
						abi: swapperAbi,
						functionName: "repay",
						args: [
							debtSwapQuote
								? getAddress(debtSwapQuote.tokenIn.address)
								: debtAsset!,
							targetBorrowVault,
							borrowAmount,
							eulerAccount,
						],
					})
				: undefined;
		const postTransferSwapperCalls: Hex[] = [];
		postTransferSwapperCalls.push(
			encodeGenericSwap({
				target: pool,
				tokenIn: aToken,
				tokenOut: args.position.raw.collateralAsset,
				payload: encodeFunctionData({
					abi: aaveV3PoolAbi,
					functionName: "withdraw",
					args: [
						args.position.raw.collateralAsset,
						maxUint256,
						collateralSwapQuote ? swapper : swapVerifier,
					],
				}),
			}),
		);
		if (collateralSwapQuote) {
			postTransferSwapperCalls.push(collateralSwapQuote.swap.swapperData);
			if (postDepositRepayCall)
				postTransferSwapperCalls.push(postDepositRepayCall);
		}

		items.push({
			targetContract: swapper,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapperAbi,
				functionName: "multicall",
				args: [postTransferSwapperCalls],
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
					label: "Aave collateral migration",
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
					label: "Aave collateral migration",
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

		return items;
	}

	private async buildEulerToAaveBatch(
		args: BuildConnectorMigrationBatchArgs<AaveMigrationPosition>,
	): Promise<EVCBatchItem[]> {
		if (args.collateralSwapQuote || args.debtSwapQuote) {
			throw new Error("Aave Euler to Aave migration does not support swaps");
		}
		const source = assertEulerSource(args.source);
		const owner = getAddress(args.owner);
		const eulerAccount = getAddress(source.eulerAccount);
		const sourceBorrowVault = getAddress(source.borrowVault);
		const sourceCollateralVault = getAddress(source.collateralVault);
		const pool = args.position.raw.pool;
		const swapper = this.getSwapperAddress(args.chainId, source.swapper);
		const sourceAmounts = await this.resolveEulerSourceAmounts(
			source,
			args.account,
		);
		const externalTarget = args.externalTarget ?? {};
		const collateralAmount =
			externalTarget.collateralAmount ?? sourceAmounts.collateralAmount;
		const sourceCollateralAmount = collateralAmount;
		const redeemCollateralShares =
			externalTarget.collateralAmount === undefined
				? sourceAmounts.collateralShares
				: undefined;
		const aaveBorrowAmount =
			externalTarget.borrowAmount ??
			applyBuffer(
				sourceAmounts.debtAmount,
				externalTarget.interestBufferBps ??
					this.defaultOutboundInterestBufferBps,
			);
		const eulerRepayAmount = externalTarget.repayAmount ?? maxUint256;
		const debtAsset = args.position.raw.debtAsset;
		const debtReserve = args.position.raw.debtReserve;
		if (!debtAsset || !debtReserve) {
			throw new Error(
				"Aave debt reserve is required for Euler to Aave migration",
			);
		}
		const variableDebtToken = debtReserve.variableDebtTokenAddress;

		if (sourceAmounts.debtAmount <= 0n) {
			throw new Error("Euler source position has no debt to migrate");
		}
		if (sourceCollateralAmount <= 0n || collateralAmount <= 0n) {
			throw new Error("Euler source position has no collateral to migrate");
		}
		if (aaveBorrowAmount <= 0n) {
			throw new Error("Aave borrow amount must be greater than zero");
		}

		const swapVerifier = this.getSwapVerifierAddress(args.chainId);
		const verifierDeadline =
			args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60);

		const items: EVCBatchItem[] = [];
		if (
			!(await this.hasBorrowAllowance(
				args.chainId,
				variableDebtToken,
				owner,
				swapVerifier,
				aaveBorrowAmount,
			))
		) {
			if (!args.authorization) {
				throw new Error(
					"Aave variable debt delegation for the Euler SwapVerifier is required",
				);
			}
			items.push(
				this.encodeDebtDelegationItem({
					owner,
					swapVerifier,
					variableDebtToken,
					borrowAmount: aaveBorrowAmount,
					authorization: args.authorization,
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

		const collateralAsset = args.position.raw.collateralAsset;

		// Multicall #1: supply exact Aave collateral before borrowing.
		const preBorrowCalls: Hex[] = [
			encodeGenericSwap({
				target: pool,
				tokenIn: collateralAsset,
				tokenOut: collateralAsset,
				payload: encodeFunctionData({
					abi: aaveV3PoolAbi,
					functionName: "supply",
					args: [collateralAsset, collateralAmount, owner, this.referralCode],
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

		// Top-level EVC item: borrow from Aave on behalf of the owner through the
		// SwapVerifier (the standing credit delegation is granted to it), forwarding
		// the borrowed debt asset to the Swapper.
		items.push({
			targetContract: swapVerifier,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "aaveBorrowForSender",
				args: [pool, debtAsset, aaveBorrowAmount, swapper],
			}),
		});

		// Multicall #2: repay the Euler source borrow vault and sweep any
		// remainders back to the owner.
		const postBorrowCalls: Hex[] = [
			encodeFunctionData({
				abi: swapperAbi,
				functionName: "repay",
				args: [debtAsset, sourceBorrowVault, eulerRepayAmount, eulerAccount],
			}),
		];
		postBorrowCalls.push(
			encodeFunctionData({
				abi: swapperAbi,
				functionName: "sweep",
				args: [debtAsset, 0n, owner],
			}),
		);
		// Return collateral remainders from yield-bearing source-vault share drift
		// to the owner rather than stranding them.
		postBorrowCalls.push(
			encodeFunctionData({
				abi: swapperAbi,
				functionName: "sweep",
				args: [collateralAsset, 0n, owner],
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

		return items;
	}

	private async buildATokenPermitRequest(args: {
		chainId: number;
		owner: Address;
		spender: Address;
		token: Address;
		value: bigint;
		positionId: string;
		deadline?: bigint;
	}): Promise<AavePermitTypedDataRequest> {
		const provider = this.providerService.getProvider(args.chainId);
		const [name, nonce] = (await provider.multicall({
			contracts: [
				{
					address: args.token,
					abi: aaveATokenAbi,
					functionName: "name",
				},
				{
					address: args.token,
					abi: aaveATokenAbi,
					functionName: "nonces",
					args: [args.owner],
				},
			],
			allowFailure: false,
		})) as [string, bigint];

		const message: AavePermitTypedDataMessage = {
			owner: args.owner,
			spender: args.spender,
			value: args.value,
			nonce,
			deadline:
				args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
		};

		return {
			kind: "typedData",
			authorizationType: "aTokenPermit",
			connectorId: AAVE_CONNECTOR_ID,
			protocol: AAVE_PROTOCOL,
			chainId: args.chainId,
			owner: args.owner,
			positionId: args.positionId,
			token: args.token,
			typedData: {
				domain: {
					name,
					version: "1",
					chainId: args.chainId,
					verifyingContract: args.token,
				},
				types: AAVE_PERMIT_TYPES,
				primaryType: "Permit",
				message,
			},
		};
	}

	private async buildDebtDelegationRequest(args: {
		chainId: number;
		delegator: Address;
		delegatee: Address;
		token: Address;
		value: bigint;
		positionId: string;
		deadline?: bigint;
	}): Promise<AaveDelegationTypedDataRequest> {
		const provider = this.providerService.getProvider(args.chainId);
		const [name, nonce] = (await provider.multicall({
			contracts: [
				{
					address: args.token,
					abi: aaveDebtTokenAbi,
					functionName: "name",
				},
				{
					address: args.token,
					abi: aaveDebtTokenAbi,
					functionName: "nonces",
					args: [args.delegator],
				},
			],
			allowFailure: false,
		})) as [string, bigint];

		const message: AaveDelegationTypedDataMessage = {
			delegatee: args.delegatee,
			value: args.value,
			nonce,
			deadline:
				args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
		};

		return {
			kind: "typedData",
			authorizationType: "variableDebtDelegation",
			connectorId: AAVE_CONNECTOR_ID,
			protocol: AAVE_PROTOCOL,
			chainId: args.chainId,
			owner: args.delegator,
			positionId: args.positionId,
			token: args.token,
			delegator: args.delegator,
			typedData: {
				domain: {
					name,
					version: "1",
					chainId: args.chainId,
					verifyingContract: args.token,
				},
				types: AAVE_DELEGATION_TYPES,
				primaryType: "DelegationWithSig",
				message,
			},
		};
	}

	private encodeATokenPermitItem(args: {
		owner: Address;
		swapVerifier: Address;
		aToken: Address;
		maxAmount: bigint;
		authorization: SignedMigrationAuthorization;
	}): EVCBatchItem {
		const request = assertAaveAuthorizationRequest(
			args.authorization.request,
			"aTokenPermit",
		);
		if (!args.authorization.signature) {
			throw new Error("Aave aToken permit signature is required");
		}

		const message = toAavePermitMessage(request.typedData.message);
		assertSameAddress(message.owner, args.owner, "Aave permit owner mismatch");
		assertSameAddress(
			message.spender,
			args.swapVerifier,
			"Aave permit spender must be the Euler SwapVerifier",
		);
		assertSameAddress(request.token, args.aToken, "Aave permit token mismatch");
		if (message.value < args.maxAmount) {
			throw new Error("Aave permit value is below the capped transfer amount");
		}

		const signature = splitAaveSignature(args.authorization.signature);
		return {
			targetContract: args.aToken,
			onBehalfOfAccount: args.owner,
			value: 0n,
			data: encodeFunctionData({
				abi: aaveATokenAbi,
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

	private encodeDebtDelegationItem(args: {
		owner: Address;
		swapVerifier: Address;
		variableDebtToken: Address;
		borrowAmount: bigint;
		authorization: SignedMigrationAuthorization;
	}): EVCBatchItem {
		const request = assertAaveAuthorizationRequest(
			args.authorization.request,
			"variableDebtDelegation",
		);
		if (!args.authorization.signature) {
			throw new Error("Aave debt delegation signature is required");
		}

		const message = toAaveDelegationMessage(request.typedData.message);
		assertSameAddress(
			request.delegator,
			args.owner,
			"Aave delegation owner mismatch",
		);
		assertSameAddress(
			message.delegatee,
			args.swapVerifier,
			"Aave delegation delegatee must be the Euler SwapVerifier",
		);
		assertSameAddress(
			request.token,
			args.variableDebtToken,
			"Aave delegation token mismatch",
		);
		if (message.value < args.borrowAmount) {
			throw new Error("Aave delegation value is below the borrow amount");
		}

		const signature = splitAaveSignature(args.authorization.signature);
		return {
			targetContract: args.variableDebtToken,
			onBehalfOfAccount: args.owner,
			value: 0n,
			data: encodeFunctionData({
				abi: aaveDebtTokenAbi,
				functionName: "delegationWithSig",
				args: [
					args.owner,
					message.delegatee,
					message.value,
					message.deadline,
					signature.v,
					signature.r,
					signature.s,
				],
			}),
		};
	}

	private async hasATokenAllowance(
		chainId: number,
		aToken: Address,
		owner: Address,
		spender: Address,
		amount: bigint,
	): Promise<boolean> {
		const provider = this.providerService.getProvider(chainId);
		const allowance = (await provider.readContract({
			address: aToken,
			abi: aaveATokenAbi,
			functionName: "allowance",
			args: [owner, spender],
		})) as bigint;
		return allowance >= amount;
	}

	private async hasBorrowAllowance(
		chainId: number,
		debtToken: Address,
		owner: Address,
		delegatee: Address,
		amount: bigint,
	): Promise<boolean> {
		const provider = this.providerService.getProvider(chainId);
		const allowance = (await provider.readContract({
			address: debtToken,
			abi: aaveDebtTokenAbi,
			functionName: "borrowAllowance",
			args: [owner, delegatee],
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

	private resolveEulerSourceAmounts(
		source: EulerMigrationSource,
		account?: Account<IHasVaultAddress>,
	): {
		debtAmount: bigint;
		collateralAmount: bigint;
		collateralShares?: bigint;
	} {
		const eulerAccount = getAddress(source.eulerAccount);
		const borrowVault = getAddress(source.borrowVault);
		const collateralVault = getAddress(source.collateralVault);
		const subAccount = account?.getSubAccount(eulerAccount);
		const borrowPosition = subAccount?.positions.find(
			(position) => getAddress(position.vaultAddress) === borrowVault,
		);
		const collateralPosition = subAccount?.positions.find(
			(position) => getAddress(position.vaultAddress) === collateralVault,
		);
		const debtAmount =
			source.debtAmount ??
			borrowPosition?.borrowed;
		if (debtAmount === undefined) {
			throw new Error(
				"Euler source debt amount requires source.debtAmount or an account snapshot with the source borrow position",
			);
		}

		if (source.collateralAmount !== undefined) {
			return {
				debtAmount,
				collateralAmount: source.collateralAmount,
				collateralShares: source.collateralShares,
			};
		}

		if (!collateralPosition) {
			throw new Error(
				"Euler source collateral amount requires source.collateralAmount or an account snapshot with the source collateral position",
			);
		}

		return {
			debtAmount,
			collateralAmount: collateralPosition.assets,
			collateralShares: collateralPosition.shares,
		};
	}
}

function normalizeAavePositionRef(
	positionRef: AavePositionRef,
	pool: Address,
): ResolvedAavePositionRef {
	return {
		pool: getAddress(pool),
		collateralAsset: getAddress(positionRef.collateralAsset),
		...(positionRef.debtAsset
			? { debtAsset: getAddress(positionRef.debtAsset) }
			: {}),
	};
}

function toAaveGraphqlTarget(args: {
	chainId: number;
	market: AaveGraphqlMarket;
	collateralAsset: Address;
	debtAsset: Address;
	minLiquidity?: bigint;
}): MigrationTarget<
	AaveMigrationTargetRaw,
	AavePositionRef,
	AaveMigrationTargetExtraData
> | null {
	const pool = getAddress(args.market.address);
	const collateralReserveRow = args.market.reserves.find((reserve) =>
		sameAddress(reserve.underlyingToken.address, args.collateralAsset),
	);
	const debtReserveRow = args.market.reserves.find((reserve) =>
		sameAddress(reserve.underlyingToken.address, args.debtAsset),
	);
	if (!collateralReserveRow || !debtReserveRow) return null;
	if (
		!isUsableGraphqlCollateralReserve(collateralReserveRow) ||
		!isUsableGraphqlBorrowReserve(debtReserveRow)
	) {
		return null;
	}

	const availableLiquidity = BigInt(
		debtReserveRow.borrowInfo?.availableLiquidity.amount.raw ?? "0",
	);
	if (
		args.minLiquidity !== undefined &&
		availableLiquidity < args.minLiquidity
	) {
		return null;
	}

	const totalSupplied = BigInt(debtReserveRow.supplyInfo.total.raw);
	const ref: AavePositionRef = {
		pool,
		collateralAsset: args.collateralAsset,
		debtAsset: args.debtAsset,
	};
	const raw: AaveMigrationTargetRaw = {
		pool,
		marketName: args.market.name,
		collateralReserve: toReserveDataFromGraphql(collateralReserveRow),
		debtReserve: toReserveDataFromGraphql(debtReserveRow),
		availableLiquidity,
		totalSupplied,
		totalMarketSizeUsd: args.market.totalMarketSize,
		totalAvailableLiquidityUsd: args.market.totalAvailableLiquidity,
	};
	const extraData: AaveMigrationTargetExtraData = {
		marketName: args.market.name,
		pool,
		availableLiquidity,
		totalSupplied,
		totalMarketSizeUsd: args.market.totalMarketSize,
		totalAvailableLiquidityUsd: args.market.totalAvailableLiquidity,
	};

	return {
		connectorId: AAVE_CONNECTOR_ID,
		protocol: AAVE_PROTOCOL,
		id: getAavePositionId(ref),
		chainId: args.chainId,
		ref,
		debt: {
			asset: args.debtAsset,
			symbol: debtReserveRow.underlyingToken.symbol,
			decimals: debtReserveRow.underlyingToken.decimals,
		},
		collateral: {
			asset: args.collateralAsset,
			symbol: collateralReserveRow.underlyingToken.symbol,
			decimals: collateralReserveRow.underlyingToken.decimals,
		},
		liquidity: { asset: args.debtAsset, amount: availableLiquidity },
		raw,
		extraData,
	};
}

function toReserveDataFromGraphql(
	reserve: AaveGraphqlReserve,
): AaveReserveData {
	return {
		aTokenAddress: getAddress(reserve.aToken.address),
		stableDebtTokenAddress: ZERO_ADDRESS,
		variableDebtTokenAddress: getAddress(reserve.vToken.address),
		configurationData: toReserveConfigurationDataFromGraphql(reserve),
	};
}

function toReserveConfigurationDataFromGraphql(
	reserve: AaveGraphqlReserve,
): bigint {
	let data = BigInt(reserve.supplyInfo.maxLTV.raw) & AAVE_LTV_MASK;
	data |= 1n << AAVE_ACTIVE_BIT;
	if (reserve.isFrozen) data |= 1n << AAVE_FROZEN_BIT;
	if (reserve.isPaused) data |= 1n << AAVE_PAUSED_BIT;
	if (reserve.borrowInfo?.borrowingState === "ENABLED") {
		data |= 1n << AAVE_BORROWING_BIT;
	}
	return data;
}

function isUsableGraphqlCollateralReserve(
	reserve: AaveGraphqlReserve,
): boolean {
	return (
		isNonZeroAddress(getAddress(reserve.aToken.address)) &&
		!reserve.isFrozen &&
		!reserve.isPaused &&
		reserve.supplyInfo.canBeCollateral &&
		BigInt(reserve.supplyInfo.maxLTV.raw) > 0n
	);
}

function isUsableGraphqlBorrowReserve(reserve: AaveGraphqlReserve): boolean {
	return (
		isNonZeroAddress(getAddress(reserve.vToken.address)) &&
		!reserve.isFrozen &&
		!reserve.isPaused &&
		reserve.borrowInfo?.borrowingState === "ENABLED"
	);
}

async function readAaveAvailableLiquidity(
	provider: AaveProvider,
	debtAsset: Address,
	debtAToken: Address,
): Promise<bigint | undefined> {
	try {
		const value = await provider.readContract({
			address: debtAsset,
			abi: aaveATokenAbi,
			functionName: "balanceOf",
			args: [debtAToken],
		});
		return typeof value === "bigint" ? value : undefined;
	} catch {
		return undefined;
	}
}

async function readAaveTotalSupplied(
	provider: AaveProvider,
	debtAToken: Address,
): Promise<bigint | undefined> {
	try {
		const value = await provider.readContract({
			address: debtAToken,
			abi: aaveATokenAbi,
			functionName: "totalSupply",
		});
		return typeof value === "bigint" ? value : undefined;
	} catch {
		return undefined;
	}
}

function toReserveTokens(result: unknown): AaveReserveTokens {
	const reserve = result as {
		configuration?: { data?: bigint | number | string };
		aTokenAddress?: Address;
		stableDebtTokenAddress?: Address;
		variableDebtTokenAddress?: Address;
		[index: number]: unknown;
	};

	return {
		aTokenAddress: getAddress((reserve.aTokenAddress ?? reserve[8]) as Address),
		stableDebtTokenAddress: getAddress(
			(reserve.stableDebtTokenAddress ?? reserve[9]) as Address,
		),
		variableDebtTokenAddress: getAddress(
			(reserve.variableDebtTokenAddress ?? reserve[10]) as Address,
		),
	};
}

function toReserveData(result: unknown): AaveReserveData {
	return {
		...toReserveTokens(result),
		configurationData: toReserveConfigurationData(result),
	};
}

function toReserveConfigurationData(result: unknown): bigint {
	const reserve = result as {
		configuration?: { data?: bigint | number | string };
		[index: number]: unknown;
	};
	const configuration = reserve.configuration ?? reserve[0];
	const data =
		configuration &&
		typeof configuration === "object" &&
		"data" in configuration
			? (configuration as { data?: bigint | number | string }).data
			: configuration;
	return data === undefined || data === null
		? 0n
		: BigInt(data as bigint | number | string);
}

function isUsableCollateralReserve(reserve: AaveReserveData): boolean {
	return (
		isNonZeroAddress(reserve.aTokenAddress) &&
		isReserveActive(reserve.configurationData) &&
		!isReserveFrozen(reserve.configurationData) &&
		!isReservePaused(reserve.configurationData) &&
		getReserveLtv(reserve.configurationData) > 0n
	);
}

function isUsableBorrowReserve(reserve: AaveReserveData): boolean {
	return (
		isNonZeroAddress(reserve.variableDebtTokenAddress) &&
		isReserveActive(reserve.configurationData) &&
		!isReserveFrozen(reserve.configurationData) &&
		!isReservePaused(reserve.configurationData) &&
		isReserveBorrowingEnabled(reserve.configurationData)
	);
}

function getReserveLtv(configurationData: bigint): bigint {
	return configurationData & AAVE_LTV_MASK;
}

function isReserveActive(configurationData: bigint): boolean {
	return isBitSet(configurationData, AAVE_ACTIVE_BIT);
}

function isReserveFrozen(configurationData: bigint): boolean {
	return isBitSet(configurationData, AAVE_FROZEN_BIT);
}

function isReserveBorrowingEnabled(configurationData: bigint): boolean {
	return isBitSet(configurationData, AAVE_BORROWING_BIT);
}

function isReservePaused(configurationData: bigint): boolean {
	return isBitSet(configurationData, AAVE_PAUSED_BIT);
}

function isBitSet(value: bigint, bit: bigint): boolean {
	return ((value >> bit) & 1n) === 1n;
}

function isNonZeroAddress(address: Address): boolean {
	return getAddress(address) !== ZERO_ADDRESS;
}

function sameAddress(a: Address | string, b: Address | string): boolean {
	return getAddress(a) === getAddress(b);
}

function normalizeAaveDeployments(
	deployments: AaveMarketDeploymentConfig[],
): AaveMarketDeploymentConfig[] {
	const seen = new Set<string>();
	const normalized: AaveMarketDeploymentConfig[] = [];
	for (const deployment of deployments) {
		const chainId = Number(deployment.chainId);
		const pool = getAddress(deployment.pool);
		const key = `${chainId}:${pool.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push({
			chainId,
			pool,
			...(deployment.marketName ? { marketName: deployment.marketName } : {}),
		});
	}
	return normalized;
}

function assertAavePosition(
	position: AaveMigrationPosition | undefined,
): AaveMigrationPosition {
	if (!position || position.connectorId !== AAVE_CONNECTOR_ID) {
		throw new Error("Aave migration position is required");
	}
	return position;
}

function assertAaveAuthorizationRequest<
	TType extends AaveMigrationAuthorizationRequest["authorizationType"],
>(
	request: MigrationAuthorizationRequest,
	authorizationType: TType,
): Extract<AaveMigrationAuthorizationRequest, { authorizationType: TType }> {
	const aaveRequest = request as AaveMigrationAuthorizationRequest;
	if (
		request.kind !== "typedData" ||
		request.connectorId !== AAVE_CONNECTOR_ID ||
		aaveRequest.authorizationType !== authorizationType
	) {
		throw new Error(
			`Expected an Aave ${authorizationType} authorization request`,
		);
	}
	return aaveRequest as Extract<
		AaveMigrationAuthorizationRequest,
		{ authorizationType: TType }
	>;
}

function assertEulerTarget(
	target: EulerMigrationTarget | undefined,
): EulerMigrationTarget {
	if (!target) {
		throw new Error("Euler migration target is required");
	}
	return target;
}

function assertEulerSource(
	source: EulerMigrationSource | undefined,
): EulerMigrationSource {
	if (!source) {
		throw new Error("Euler migration source is required");
	}
	return source;
}

function toAavePermitMessage(
	message: AavePermitTypedDataMessage,
): AavePermitTypedDataMessage {
	return {
		owner: getAddress(message.owner),
		spender: getAddress(message.spender),
		value: BigInt(message.value),
		nonce: BigInt(message.nonce),
		deadline: BigInt(message.deadline),
	};
}

function toAaveDelegationMessage(
	message: AaveDelegationTypedDataMessage,
): AaveDelegationTypedDataMessage {
	return {
		delegatee: getAddress(message.delegatee),
		value: BigInt(message.value),
		nonce: BigInt(message.nonce),
		deadline: BigInt(message.deadline),
	};
}

