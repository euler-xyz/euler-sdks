import { type Address, type Hex, getAddress } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../../utils/buildQuery.js";
import type {
	OracleAdapterEntry,
	OracleInfo,
	OraclePrice,
} from "../../../../../utils/oracle.js";
import {
	type DataIssue,
	compressDataIssues,
	prefixDataIssues,
	type ServiceResult,
} from "../../../../../utils/entityDiagnostics.js";
import type {
	EVaultCollateral,
	EVaultCollateralRamping,
	EVaultCaps,
	EVaultFees,
	EVaultHooks,
	EVaultLiquidation,
	EVaultHookedOperations,
	IEVault,
	InterestRateModel,
	InterestRates,
} from "../../../../../entities/EVault.js";
import { type Token, VaultType } from "../../../../../utils/types.js";
import { InterestRateModelType } from "../eVaultOnchainAdapter/eVaultLensTypes.js";
import type { EVaultV3AdapterConfig } from "../../eVaultServiceConfig.js";
import type { IEVaultAdapter } from "../../eVaultService.js";

type V3Envelope<T> = {
	data?: T;
};

type V3ListEnvelope<T> = {
	data?: T[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
	};
};

type V3VaultDetail = {
	chainId: number;
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	shares?: V3Token;
	asset?: V3Token;
	dToken: string;
	oracle?: {
		oracle: string;
		name: string;
		adapters: V3OracleAdapter[];
	};
	unitOfAccount?: V3Token;
	creator: string;
	governorAdmin: string;
	totalShares: string;
	totalAssets: string;
	totalBorrows: string;
	totalBorrowed: string;
	totalCash: string;
	balanceTracker: string;
	fees?: {
		interestFee: number;
		accumulatedFeesShares: string;
		accumulatedFeesAssets: string;
		governorFeeReceiver: string;
		protocolFeeReceiver: string;
		protocolFeeShare: number;
	};
	hooks?: {
		hookedOperations?: Partial<Record<keyof EVaultHookedOperations, boolean>>;
		hookTarget: string;
	};
	caps?: {
		supplyCap: string;
		borrowCap: string;
	};
	liquidation?: {
		maxLiquidationDiscount: number;
		liquidationCoolOffTime: number;
		socializeDebt: boolean;
	};
	interestRates?: {
		borrowSPY: string;
		borrowAPY: string;
		supplyAPY: string;
	};
	interestRateModel?: {
		address: string;
		type: string;
		data: unknown;
	};
	evcCompatibleAsset: boolean;
	oraclePriceRaw?: V3OraclePrice;
	timestamp: number;
};

type V3Token = {
	address: string;
	symbol: string;
	decimals: number;
	name: string;
};

type V3OracleAdapter = {
	oracle: string;
	name: string;
	base: string;
	quote: string;
	pythDetail?: OracleAdapterEntry["pythDetail"];
	chainlinkDetail?: { oracle: string };
};

type V3OraclePrice = {
	queryFailure: boolean;
	queryFailureReason: string;
	amountIn: string;
	amountOutMid: string;
	amountOutBid: string;
	amountOutAsk: string;
	timestamp: number;
};

type V3CollateralRow = {
	collateral: string;
	borrowLTV: string;
	liquidationLTV: string;
	initialLiquidationLTV: string;
	targetTimestamp: number;
	rampDuration: number;
	oraclePriceRaw?: V3OraclePrice;
};

type V3VaultListRow = {
	address: string;
};

const unsupportedError = new Error("unsupported");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const DEFAULT_HOOKED_OPERATIONS: EVaultHookedOperations = {
	deposit: false,
	mint: false,
	withdraw: false,
	redeem: false,
	transfer: false,
	skim: false,
	borrow: false,
	repay: false,
	repayWithShares: false,
	pullDebt: false,
	convertFees: false,
	liquidate: false,
	flashloan: false,
	touch: false,
	vaultStatusCheck: false,
};
const DEFAULT_TOKEN_BLOCK: V3Token = {
	address: ZERO_ADDRESS,
	symbol: "",
	decimals: 0,
	name: "",
};
const DEFAULT_ORACLE_BLOCK: NonNullable<V3VaultDetail["oracle"]> = {
	oracle: ZERO_ADDRESS,
	name: "",
	adapters: [],
};
const DEFAULT_CAPS_BLOCK: NonNullable<V3VaultDetail["caps"]> = {
	supplyCap: "0",
	borrowCap: "0",
};
const DEFAULT_LIQUIDATION_BLOCK: NonNullable<V3VaultDetail["liquidation"]> = {
	maxLiquidationDiscount: 0,
	liquidationCoolOffTime: 0,
	socializeDebt: false,
};
const DEFAULT_INTEREST_RATES_BLOCK: NonNullable<V3VaultDetail["interestRates"]> =
	{
		borrowSPY: "0",
		borrowAPY: "0",
		supplyAPY: "0",
	};
const DEFAULT_INTEREST_RATE_MODEL_BLOCK: NonNullable<
	V3VaultDetail["interestRateModel"]
> = {
	address: ZERO_ADDRESS,
	type: "unknown",
	data: null,
};
const DEFAULT_ORACLE_PRICE_BLOCK: V3OraclePrice = {
	queryFailure: true,
	queryFailureReason: "0x",
	amountIn: "0",
	amountOutMid: "0",
	amountOutBid: "0",
	amountOutAsk: "0",
	timestamp: 0,
};

const parseBigIntField = (
	value: string,
	path: string,
	entityId: Address,
	errors: DataIssue[],
): bigint => {
	try {
		return BigInt(value);
	} catch {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: `Failed to parse bigint at ${path}; defaulted to 0.`,
			paths: [path],
			entityId,
			source: "eVaultV3",
			originalValue: value,
			normalizedValue: "0",
		});
		return 0n;
	}
};

const parseRatio1e4 = (
	value: string,
	path: string,
	entityId: Address,
	errors: DataIssue[],
): number => {
	const parsed = Number(value);
	if (Number.isFinite(parsed)) return parsed / 1e4;
	errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Failed to parse ratio at ${path}; defaulted to 0.`,
		paths: [path],
		entityId,
		source: "eVaultV3",
		originalValue: value,
		normalizedValue: 0,
	});
	return 0;
};

const parseAddressField = (
	value: string | undefined,
	path: string,
	entityId: Address,
	errors: DataIssue[],
	fallback: Address = ZERO_ADDRESS,
): Address => {
	if (value) {
		try {
			return getAddress(value);
		} catch {
			// handled below
		}
	}

	errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing or invalid address at ${path}; defaulted to zero address.`,
		paths: [path],
		entityId,
		source: "eVaultV3",
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
};

const parseStringField = (
	value: string | undefined,
	path: string,
	entityId: Address,
	errors: DataIssue[],
	fallback = "",
): string => {
	if (typeof value === "string") return value;
	errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing string at ${path}; defaulted to ${JSON.stringify(fallback)}.`,
		paths: [path],
		entityId,
		source: "eVaultV3",
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
};

const parseNumberField = (
	value: number | undefined,
	path: string,
	entityId: Address,
	errors: DataIssue[],
	fallback = 0,
): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing or invalid number at ${path}; defaulted to ${fallback}.`,
		paths: [path],
		entityId,
		source: "eVaultV3",
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
};

const parseBooleanField = (
	value: boolean | undefined,
	path: string,
	entityId: Address,
	errors: DataIssue[],
	fallback = false,
): boolean => {
	if (typeof value === "boolean") return value;
	errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing boolean at ${path}; defaulted to ${fallback}.`,
		paths: [path],
		entityId,
		source: "eVaultV3",
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
};

function mapInterestRateModelType(type: string): InterestRateModelType {
	switch (type.toLowerCase()) {
		case "kink":
			return InterestRateModelType.KINK;
		case "adaptive_curve":
		case "adaptive-curve":
			return InterestRateModelType.ADAPTIVE_CURVE;
		case "kinky":
			return InterestRateModelType.KINKY;
		case "fixed_cyclical_binary":
		case "fixed-cyclical-binary":
			return InterestRateModelType.FIXED_CYCLICAL_BINARY;
		default:
			return InterestRateModelType.UNKNOWN;
	}
}

function convertToken(
	token: V3Token,
	path: string,
	entityId: Address,
	errors: DataIssue[],
): Token {
	return {
		address: parseAddressField(token.address, `${path}.address`, entityId, errors),
		name: parseStringField(token.name, `${path}.name`, entityId, errors),
		symbol: parseStringField(token.symbol, `${path}.symbol`, entityId, errors),
		decimals: parseNumberField(
			token.decimals,
			`${path}.decimals`,
			entityId,
			errors,
		),
	};
}

function convertOraclePrice(
	price: V3OraclePrice,
	errors: DataIssue[],
	path: string,
	entityId: Address,
): OraclePrice {
	const converted = {
		queryFailure: parseBooleanField(
			price.queryFailure,
			`${path}.queryFailure`,
			entityId,
			errors,
			true,
		),
		queryFailureReason: parseStringField(
			price.queryFailureReason,
			`${path}.queryFailureReason`,
			entityId,
			errors,
			"0x",
		) as Hex,
		amountIn: parseBigIntField(
			price.amountIn,
			`${path}.amountIn`,
			entityId,
			errors,
		),
		amountOutMid: parseBigIntField(
			price.amountOutMid,
			`${path}.amountOutMid`,
			entityId,
			errors,
		),
		amountOutBid: parseBigIntField(
			price.amountOutBid,
			`${path}.amountOutBid`,
			entityId,
			errors,
		),
		amountOutAsk: parseBigIntField(
			price.amountOutAsk,
			`${path}.amountOutAsk`,
			entityId,
			errors,
		),
		timestamp: parseNumberField(
			price.timestamp,
			`${path}.timestamp`,
			entityId,
			errors,
		),
	};

	if (converted.queryFailure) {
		errors.push({
			code: "SOURCE_UNAVAILABLE",
			severity: "warning",
			message: "Oracle price query reported failure.",
			paths: [path],
			entityId,
			source: "eVaultV3",
			originalValue: converted.queryFailureReason,
			normalizedValue: "queryFailure:true",
		});
	}

	return converted;
}

function convertCollaterals(
	rows: V3CollateralRow[],
	vaultTimestamp: number,
	vaultEntityId: Address,
	errors: DataIssue[],
): EVaultCollateral[] {
	const collaterals: EVaultCollateral[] = [];

	for (const [index, row] of rows.entries()) {
		const collateralAddress = parseAddressField(
			row.collateral,
			`$.collaterals[${index}].collateral`,
			vaultEntityId,
			errors,
		);
		const borrowLTV = parseRatio1e4(
			row.borrowLTV,
			`$.collaterals[${index}].borrowLTV`,
			collateralAddress,
			errors,
		);
		const liquidationLTV = parseRatio1e4(
			row.liquidationLTV,
			`$.collaterals[${index}].liquidationLTV`,
			collateralAddress,
			errors,
		);
		const targetTimestamp = parseNumberField(
			typeof row.targetTimestamp === "number"
				? row.targetTimestamp
				: Number(row.targetTimestamp),
			`$.collaterals[${index}].targetTimestamp`,
			collateralAddress,
			errors,
		);
		const isRemovedCollateral =
			borrowLTV === 0 &&
			liquidationLTV === 0 &&
			targetTimestamp < vaultTimestamp;

		if (isRemovedCollateral) continue;

		const collateral: EVaultCollateral = {
			address: collateralAddress,
			borrowLTV,
			liquidationLTV,
			oraclePriceRaw: row.oraclePriceRaw
				? convertOraclePrice(
						row.oraclePriceRaw,
						errors,
						`$.collaterals[${collaterals.length}].oraclePriceRaw`,
						collateralAddress,
					)
				: {
						queryFailure: true,
						queryFailureReason: "0x",
						amountIn: 0n,
						amountOutMid: 0n,
						amountOutBid: 0n,
						amountOutAsk: 0n,
						timestamp: 0,
					},
		};

		if (!row.oraclePriceRaw) {
			errors.push({
				code: "DEFAULT_APPLIED",
				severity: "warning",
				message:
					"Missing collateral oraclePriceRaw; default zero-price placeholder applied.",
				paths: [`$.collaterals[${collaterals.length}].oraclePriceRaw`],
				entityId: collateralAddress,
				source: "eVaultV3",
				normalizedValue: "queryFailure:true",
			});
		}

		if (targetTimestamp > vaultTimestamp) {
			const ramping: EVaultCollateralRamping = {
				initialLiquidationLTV: parseRatio1e4(
					row.initialLiquidationLTV,
					`$.collaterals[${collaterals.length}].ramping.initialLiquidationLTV`,
					collateralAddress,
					errors,
				),
				targetTimestamp,
				rampDuration: parseBigIntField(
					String(row.rampDuration ?? 0),
					`$.collaterals[${collaterals.length}].ramping.rampDuration`,
					collateralAddress,
					errors,
				),
			};
			collateral.ramping = ramping;
		}

		collaterals.push(collateral);
	}

	return collaterals;
}

function logMissingDetailBlocks(
	detail: V3VaultDetail,
	detailUrl: string,
	entityId: Address,
): void {
	const missingBlocks: string[] = [];

	if (!detail.oracle) missingBlocks.push("$.oracle");
	if (!detail.shares) missingBlocks.push("$.shares");
	if (!detail.asset) missingBlocks.push("$.asset");
	if (!detail.unitOfAccount) missingBlocks.push("$.unitOfAccount");
	if (!detail.fees) missingBlocks.push("$.fees");
	if (!detail.hooks) missingBlocks.push("$.hooks");
	if (!detail.hooks?.hookedOperations) {
		missingBlocks.push("$.hooks.hookedOperations");
	}
	if (!detail.caps) missingBlocks.push("$.caps");
	if (!detail.liquidation) missingBlocks.push("$.liquidation");
	if (!detail.interestRates) missingBlocks.push("$.interestRates");
	if (!detail.interestRateModel) missingBlocks.push("$.interestRateModel");
	if (!detail.oraclePriceRaw) missingBlocks.push("$.oraclePriceRaw");

	if (missingBlocks.length === 0) return;

	console.warn("[eVaultV3] Missing blocks in detail response", {
		vault: entityId,
		url: detailUrl,
		missingBlocks,
		response: detail,
	});
}

function convertVault(
	detail: V3VaultDetail,
	collateralRows: V3CollateralRow[],
	errors: DataIssue[],
	fallbackAddress: Address,
	detailUrl: string,
): IEVault {
	const entityId = parseAddressField(
		detail.address,
		"$.address",
		fallbackAddress,
		errors,
		fallbackAddress,
	);
	logMissingDetailBlocks(detail, detailUrl, entityId);

	if (!detail.oracle) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing oracle block; defaulted all oracle fields to 0/empty.",
			paths: ["$.oracle"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_ORACLE_BLOCK,
		});
	}
	const oracleData = detail.oracle ?? DEFAULT_ORACLE_BLOCK;
	const oracle: OracleInfo = {
		oracle: parseAddressField(
			oracleData.oracle,
			"$.oracle.oracle",
			entityId,
			errors,
		),
		name: parseStringField(oracleData.name, "$.oracle.name", entityId, errors),
		adapters: oracleData.adapters.map((adapter) => ({
			oracle: parseAddressField(
				adapter.oracle,
				"$.oracle.adapters[].oracle",
				entityId,
				errors,
			),
			name: parseStringField(
				adapter.name,
				"$.oracle.adapters[].name",
				entityId,
				errors,
			),
			base: parseAddressField(
				adapter.base,
				"$.oracle.adapters[].base",
				entityId,
				errors,
			),
			quote: parseAddressField(
				adapter.quote,
				"$.oracle.adapters[].quote",
				entityId,
				errors,
			),
			pythDetail: adapter.pythDetail,
			chainlinkDetail: adapter.chainlinkDetail
				? {
						oracle: parseAddressField(
							adapter.chainlinkDetail.oracle,
							"$.oracle.adapters[].chainlinkDetail.oracle",
							entityId,
							errors,
						),
					}
				: undefined,
		})),
	};

	if (!detail.shares) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing shares block; defaulted all share token fields to 0/empty.",
			paths: ["$.shares"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_TOKEN_BLOCK,
		});
	}
	const sharesData = detail.shares ?? DEFAULT_TOKEN_BLOCK;

	if (!detail.asset) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing asset block; defaulted all asset token fields to 0/empty.",
			paths: ["$.asset"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_TOKEN_BLOCK,
		});
	}
	const assetData = detail.asset ?? DEFAULT_TOKEN_BLOCK;

	if (!detail.unitOfAccount) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing unitOfAccount block; defaulted all unit-of-account fields to 0/empty.",
			paths: ["$.unitOfAccount"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_TOKEN_BLOCK,
		});
	}
	const unitOfAccountData = detail.unitOfAccount ?? DEFAULT_TOKEN_BLOCK;

	if (!detail.fees) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing fees object; defaulted all fee fields to 0.",
			paths: ["$.fees"],
			entityId,
			source: "eVaultV3",
			normalizedValue: {
				interestFee: 0,
				accumulatedFeesShares: "0",
				accumulatedFeesAssets: "0",
				governorFeeReceiver: ZERO_ADDRESS,
				protocolFeeReceiver: ZERO_ADDRESS,
				protocolFeeShare: 0,
			},
		});
	}

	const feeData = detail.fees ?? {
		interestFee: 0,
		accumulatedFeesShares: "0",
		accumulatedFeesAssets: "0",
		governorFeeReceiver: ZERO_ADDRESS,
		protocolFeeReceiver: ZERO_ADDRESS,
		protocolFeeShare: 0,
	};

	const fees: EVaultFees = {
		interestFee: feeData.interestFee ?? 0,
		accumulatedFeesShares: parseBigIntField(
			feeData.accumulatedFeesShares ?? "0",
			"$.fees.accumulatedFeesShares",
			entityId,
			errors,
		),
		accumulatedFeesAssets: parseBigIntField(
			feeData.accumulatedFeesAssets ?? "0",
			"$.fees.accumulatedFeesAssets",
			entityId,
			errors,
		),
		governorFeeReceiver: parseAddressField(
			feeData.governorFeeReceiver,
			"$.fees.governorFeeReceiver",
			entityId,
			errors,
		),
		protocolFeeReceiver: parseAddressField(
			feeData.protocolFeeReceiver,
			"$.fees.protocolFeeReceiver",
			entityId,
			errors,
		),
		protocolFeeShare: feeData.protocolFeeShare ?? 0,
	};

	const hooks: EVaultHooks = {
		hookedOperations: {
			...DEFAULT_HOOKED_OPERATIONS,
			...(detail.hooks?.hookedOperations ?? {}),
		},
		hookTarget: parseAddressField(
			detail.hooks?.hookTarget,
			"$.hooks.hookTarget",
			entityId,
			errors,
		),
	};
	if (!detail.hooks?.hookedOperations) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing hookedOperations; defaulted all operations to false.",
			paths: ["$.hooks.hookedOperations"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_HOOKED_OPERATIONS,
		});
	}

	if (!detail.caps) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing caps block; defaulted all cap fields to 0.",
			paths: ["$.caps"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_CAPS_BLOCK,
		});
	}
	const capsData = detail.caps ?? DEFAULT_CAPS_BLOCK;
	const caps: EVaultCaps = {
		supplyCap: parseBigIntField(
			capsData.supplyCap ?? "0",
			"$.caps.supplyCap",
			entityId,
			errors,
		),
		borrowCap: parseBigIntField(
			capsData.borrowCap ?? "0",
			"$.caps.borrowCap",
			entityId,
			errors,
		),
	};

	if (!detail.liquidation) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing liquidation block; defaulted all liquidation fields to 0/false.",
			paths: ["$.liquidation"],
			entityId,
			source: "eVaultV3",
			normalizedValue: {
				maxLiquidationDiscount: 0,
				liquidationCoolOffTime: 0,
				socializeDebt: false,
			},
		});
	}
	const liquidationData = detail.liquidation ?? DEFAULT_LIQUIDATION_BLOCK;
	const liquidation: EVaultLiquidation = {
		maxLiquidationDiscount: liquidationData.maxLiquidationDiscount ?? 0,
		liquidationCoolOffTime: liquidationData.liquidationCoolOffTime ?? 0,
		socializeDebt: liquidationData.socializeDebt ?? false,
	};

	if (!detail.interestRates) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing interestRates block; defaulted all rate fields to 0.",
			paths: ["$.interestRates"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_INTEREST_RATES_BLOCK,
		});
	}
	const interestRatesData =
		detail.interestRates ?? DEFAULT_INTEREST_RATES_BLOCK;
	const interestRates: InterestRates = {
		borrowSPY: parseStringField(
			interestRatesData.borrowSPY,
			"$.interestRates.borrowSPY",
			entityId,
			errors,
			"0",
		),
		borrowAPY: parseStringField(
			interestRatesData.borrowAPY,
			"$.interestRates.borrowAPY",
			entityId,
			errors,
			"0",
		),
		supplyAPY: parseStringField(
			interestRatesData.supplyAPY,
			"$.interestRates.supplyAPY",
			entityId,
			errors,
			"0",
		),
	};

	if (!detail.interestRateModel) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing interestRateModel block; defaulted all model fields to 0/unknown.",
			paths: ["$.interestRateModel"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_INTEREST_RATE_MODEL_BLOCK,
		});
	}
	const interestRateModelData =
		detail.interestRateModel ?? DEFAULT_INTEREST_RATE_MODEL_BLOCK;
	const interestRateModel: InterestRateModel = {
		address: parseAddressField(
			interestRateModelData.address,
			"$.interestRateModel.address",
			entityId,
			errors,
		),
		type: mapInterestRateModelType(
			parseStringField(
				interestRateModelData.type,
				"$.interestRateModel.type",
				entityId,
				errors,
				"unknown",
			),
		),
		data: interestRateModelData.data as InterestRateModel["data"],
	};

	if (!detail.oraclePriceRaw) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing oraclePriceRaw block; defaulted all oracle price fields to 0.",
			paths: ["$.oraclePriceRaw"],
			entityId,
			source: "eVaultV3",
			normalizedValue: DEFAULT_ORACLE_PRICE_BLOCK,
		});
	}
	const oraclePriceData = detail.oraclePriceRaw ?? DEFAULT_ORACLE_PRICE_BLOCK;

	return {
		type: VaultType.EVault,
		chainId: detail.chainId,
		address: entityId,
		shares: convertToken(sharesData, "$.shares", entityId, errors),
		asset: convertToken(assetData, "$.asset", entityId, errors),
		unitOfAccount: convertToken(
			unitOfAccountData,
			"$.unitOfAccount",
			entityId,
			errors,
		),
		totalShares: parseBigIntField(
			detail.totalShares,
			"$.totalShares",
			entityId,
			errors,
		),
		totalAssets: parseBigIntField(
			detail.totalAssets,
			"$.totalAssets",
			entityId,
			errors,
		),
		totalCash: parseBigIntField(
			detail.totalCash,
			"$.totalCash",
			entityId,
			errors,
		),
		totalBorrowed: parseBigIntField(
			detail.totalBorrowed,
			"$.totalBorrowed",
			entityId,
			errors,
		),
		creator: parseAddressField(
			detail.creator,
			"$.creator",
			entityId,
			errors,
		),
		governorAdmin: parseAddressField(
			detail.governorAdmin,
			"$.governorAdmin",
			entityId,
			errors,
		),
		dToken: parseAddressField(detail.dToken, "$.dToken", entityId, errors),
		balanceTracker: parseAddressField(
			detail.balanceTracker,
			"$.balanceTracker",
			entityId,
			errors,
		),
		fees,
		hooks,
		caps,
		liquidation,
		oracle,
		interestRates,
		interestRateModel,
		collaterals: convertCollaterals(
			collateralRows,
			detail.timestamp,
			entityId,
			errors,
		),
		evcCompatibleAsset: parseBooleanField(
			detail.evcCompatibleAsset,
			"$.evcCompatibleAsset",
			entityId,
			errors,
		),
		oraclePriceRaw: convertOraclePrice(
			oraclePriceData,
			errors,
			"$.oraclePriceRaw",
			entityId,
		),
		timestamp: parseNumberField(
			detail.timestamp,
			"$.timestamp",
			entityId,
			errors,
		),
	};
}

export class EVaultV3Adapter implements IEVaultAdapter {
	constructor(
		private config: EVaultV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: EVaultV3AdapterConfig): void {
		this.config = config;
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private buildUrl(
		endpoint: string,
		path: string,
		search?: Record<string, string>,
	): string {
		const normalizedEndpoint = endpoint.replace(/\/+$/, "");
		const joined =
			normalizedEndpoint.startsWith("http://") ||
			normalizedEndpoint.startsWith("https://")
				? new URL(path, `${normalizedEndpoint}/`).toString()
				: `${normalizedEndpoint}${path}`;

		if (!search || Object.keys(search).length === 0) return joined;

		const params = new URLSearchParams(search);
		return `${joined}?${params.toString()}`;
	}

	queryV3EVaultDetail = async (
		endpoint: string,
		chainId: number,
		vault: Address,
	): Promise<V3Envelope<V3VaultDetail>> => {
		const url = this.buildUrl(endpoint, `/v3/evk/vaults/${chainId}/${vault}`);
		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok)
			throw new Error(
				`eVaultV3 detail ${response.status} ${response.statusText}`,
			);
		return response.json() as Promise<V3Envelope<V3VaultDetail>>;
	};

	setQueryV3EVaultDetail(fn: typeof this.queryV3EVaultDetail): void {
		this.queryV3EVaultDetail = fn;
	}

	queryV3EVaultCollaterals = async (
		endpoint: string,
		chainId: number,
		vault: Address,
	): Promise<V3ListEnvelope<V3CollateralRow>> => {
		const url = this.buildUrl(
			endpoint,
			`/v3/evk/vaults/${chainId}/${vault}/collaterals`,
		);
		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok)
			throw new Error(
				`eVaultV3 collaterals ${response.status} ${response.statusText}`,
			);
		return response.json() as Promise<V3ListEnvelope<V3CollateralRow>>;
	};

	setQueryV3EVaultCollaterals(fn: typeof this.queryV3EVaultCollaterals): void {
		this.queryV3EVaultCollaterals = fn;
	}

	queryV3EVaultList = async (
		endpoint: string,
		chainId: number,
		offset: number,
		limit: number,
	): Promise<V3ListEnvelope<V3VaultListRow> | V3VaultListRow[]> => {
		const url = this.buildUrl(endpoint, "/v3/evk/vaults", {
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
		});

		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok)
			throw new Error(
				`eVaultV3 list ${response.status} ${response.statusText}`,
			);
		return response.json() as Promise<
			V3ListEnvelope<V3VaultListRow> | V3VaultListRow[]
		>;
	};

	setQueryV3EVaultList(fn: typeof this.queryV3EVaultList): void {
		this.queryV3EVaultList = fn;
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
	): Promise<ServiceResult<(IEVault | undefined)[]>> {
		const results: Array<{ result: IEVault | undefined; errors: DataIssue[] }> =
			await Promise.all(
				vaults.map(async (vault, index) => {
					const errors: DataIssue[] = [];
					let detailResponse: V3Envelope<V3VaultDetail>;
					let collateralsResponse: V3ListEnvelope<V3CollateralRow>;
					const detailUrl = this.buildUrl(
						this.config.endpoint,
						`/v3/evk/vaults/${chainId}/${vault}`,
					);

					try {
						[detailResponse, collateralsResponse] = await Promise.all([
							this.queryV3EVaultDetail(this.config.endpoint, chainId, vault),
							this.queryV3EVaultCollaterals(
								this.config.endpoint,
								chainId,
								vault,
							),
						]);
					} catch (error) {
						const fetchErrors: DataIssue[] = [
							{
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: `Failed to fetch eVault ${getAddress(vault)}.`,
								paths: [`$.vaults[${index}]`],
								entityId: getAddress(vault),
								source: "eVaultV3",
								originalValue:
									error instanceof Error ? error.message : String(error),
							},
						];
						return {
							result: undefined,
							errors: fetchErrors,
						};
					}

						const detail = detailResponse.data;
						if (!detail) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: `Vault detail missing for ${getAddress(vault)}.`,
								paths: [`$.vaults[${index}]`],
								entityId: getAddress(vault),
								source: "eVaultV3",
							});
							return { result: undefined, errors };
						}

					try {
						const converted = convertVault(
							detail,
							collateralsResponse.data ?? [],
							errors,
							vault,
							detailUrl,
						);
						return {
							result: converted,
							errors: prefixDataIssues(errors, `$.vaults[${index}]`).map(
								(issue) => ({
									...issue,
									entityId: issue.entityId ?? getAddress(vault),
									}),
								),
						};
					} catch (error) {
						const decodeErrors: DataIssue[] = [
							{
								code: "DECODE_FAILED",
								severity: "warning",
								message: `Failed to decode eVault ${getAddress(vault)}.`,
								paths: [`$.vaults[${index}]`],
								entityId: getAddress(vault),
								source: "eVaultV3",
								originalValue:
									error instanceof Error ? error.message : String(error),
							},
						];
						return {
							result: undefined,
							errors: decodeErrors,
						};
					}
				}),
			);
		return {
			result: results.map((entry) => entry.result),
			errors: compressDataIssues(results.flatMap((entry) => entry.errors)),
		};
	}

	async fetchVerifiedVaultsAddresses(
		_chainId: number,
		_perspectives: Address[],
	): Promise<Address[]> {
		throw unsupportedError;
	}

	async fetchAllVaults(
		chainId: number,
	): Promise<ServiceResult<(IEVault | undefined)[]>> {
		const limit = 200;
		let offset = 0;
		const addresses: Address[] = [];

		while (true) {
			const response = await this.queryV3EVaultList(
				this.config.endpoint,
				chainId,
				offset,
				limit,
			);
			const rows = Array.isArray(response) ? response : (response.data ?? []);

			addresses.push(
				...rows
					.map((row) => row.address)
					.filter((address): address is Address => typeof address === "string")
					.map((address) => getAddress(address)),
			);

			if (Array.isArray(response)) {
				if (rows.length < limit) break;
				offset += rows.length;
				continue;
			}

			const total = response.meta?.total;
			const batchSize = rows.length;
			const effectiveLimit = response.meta?.limit ?? limit;
			if (batchSize === 0) break;
			offset += batchSize;
			if (total !== undefined && offset >= total) break;
			if (effectiveLimit === 0 || batchSize < effectiveLimit) break;
		}

		return this.fetchVaults(chainId, [...new Set(addresses)]);
	}
}
