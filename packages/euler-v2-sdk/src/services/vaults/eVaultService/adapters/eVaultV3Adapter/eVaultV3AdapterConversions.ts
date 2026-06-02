import { type Address, type Hex, getAddress } from "viem";
import type {
	OracleDetailedInfo,
	OracleInfo,
	OraclePrice,
} from "../../../../../utils/oracle.js";
import { decodeOracleRouteForPair } from "../../../../../utils/oracle.js";
import {
	dataIssueLocation,
	type DataIssue,
	type DataIssueOwnerRef,
	vaultCollateralDiagnosticOwner,
	vaultDiagnosticOwner,
} from "../../../../../utils/entityDiagnostics.js";
import {
	parseAddressField,
	parseBigIntField,
	parseBooleanField,
	type DiagnosticsParserParams,
	parseNumberField,
	parseOptionalAddressField,
	parseOptionalBooleanField,
	parseOptionalNumberField,
	parseOptionalStringField,
	parseRatio1e4,
	parseStringField,
	parseTimestampField,
	ZERO_ADDRESS,
} from "../../../../../utils/parsing.js";
import {
	type EVaultCollateralRamping,
	type IEVaultCollateral,
	type EVaultCaps,
	type EVaultFees,
	type EVaultHooks,
	type EVaultLiquidation,
	type EVaultHookedOperations,
	type IEVault,
	type InterestRateModel,
	type InterestRates,
	hasActiveBorrowableLtv,
} from "../../../../../entities/EVault.js";
import { type Token, VaultType } from "../../../../../utils/types.js";
import { InterestRateModelType } from "../eVaultOnchainAdapter/eVaultLensTypes.js";
import type {
	V3CollateralRow,
	V3OracleDetailedInfo,
	V3OraclePrice,
	V3Token,
	V3VaultDetail,
} from "./eVaultV3AdapterTypes.js";
import {
	normalizeIRMParams,
	decorateIRMParams,
	type KinkIRMInfo,
	type AdaptiveCurveIRMInfo,
	type KinkyIRMInfo,
	type FixedCyclicalBinaryIRMInfo,
	type FixedCyclicalBinaryMonthlyIRMInfo,
} from "../../../../../utils/irm.js";

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
	resolvedVaults: [],
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

const DEFAULT_INTEREST_RATES_BLOCK: NonNullable<
	V3VaultDetail["interestRates"]
> = {
	borrowSPY: "0",
	borrowAPY: "0",
	supplyAPY: "0",
};

function parseRate(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed * 100 : 0;
}

function parseV3TargetTimestamp(
	value: string | number | undefined,
	params: DiagnosticsParserParams,
): number {
	if (typeof value === "number") return parseNumberField(value, params);

	const trimmed = value?.trim();
	if (!trimmed) return parseTimestampField(undefined, params);

	if (/^\d+(\.\d+)?$/.test(trimmed)) {
		return parseNumberField(Number(trimmed), params);
	}

	return parseTimestampField(trimmed, params);
}

const DEFAULT_INTEREST_RATE_MODEL_BLOCK: NonNullable<
	V3VaultDetail["interestRateModel"]
> = {
	address: ZERO_ADDRESS,
	type: "unknown",
	data: null,
};

function normalizeUnitOfAccountToken(token: Token): Token | undefined {
	if (token.address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
		return undefined;
	}

	return {
		...token,
		decimals: token.decimals > 0 ? token.decimals : 18,
	};
}

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
		case "fixed_cyclical_binary_monthly":
		case "fixed-cyclical-binary-monthly":
			return InterestRateModelType.FIXED_CYCLICAL_BINARY_MONTHLY;
		default:
			return InterestRateModelType.UNKNOWN;
	}
}

function convertToken(
	token: V3Token,
	path: string,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
	optionalFields: {
		name?: boolean;
		symbol?: boolean;
		decimals?: boolean;
	} = {},
): Token {
	return {
		address: parseAddressField(token.address, {
			path: `${path}.address`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		name: optionalFields.name
			? parseOptionalStringField(token.name, {
					path: `${path}.name`,
					owner,
					errors,
					source: "eVaultV3",
				})
			: parseStringField(token.name ?? undefined, {
					path: `${path}.name`,
					owner,
					errors,
					source: "eVaultV3",
				}),
		symbol: optionalFields.symbol
			? parseOptionalStringField(token.symbol, {
					path: `${path}.symbol`,
					owner,
					errors,
					source: "eVaultV3",
				})
			: parseStringField(token.symbol ?? undefined, {
					path: `${path}.symbol`,
					owner,
					errors,
					source: "eVaultV3",
				}),
		decimals: optionalFields.decimals
			? parseOptionalNumberField(token.decimals, {
					path: `${path}.decimals`,
					owner,
					errors,
					source: "eVaultV3",
				})
			: parseNumberField(token.decimals ?? undefined, {
					path: `${path}.decimals`,
					owner,
					errors,
					source: "eVaultV3",
				}),
	};
}

function convertOraclePrice(
	price: V3OraclePrice,
	errors: DataIssue[],
	path: string,
	owner: DataIssueOwnerRef,
): OraclePrice {
	const converted = {
		queryFailure: parseBooleanField(price.queryFailure, {
			path: `${path}.queryFailure`,
			owner,
			errors,
			source: "eVaultV3",
			fallback: true,
		}),
		queryFailureReason: parseStringField(price.queryFailureReason, {
			path: `${path}.queryFailureReason`,
			owner,
			errors,
			source: "eVaultV3",
			fallback: "0x",
		}) as Hex,
		amountIn: parseBigIntField(price.amountIn, {
			path: `${path}.amountIn`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		amountOutMid: parseBigIntField(price.amountOutMid, {
			path: `${path}.amountOutMid`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		amountOutBid: parseBigIntField(price.amountOutBid, {
			path: `${path}.amountOutBid`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		amountOutAsk: parseBigIntField(price.amountOutAsk, {
			path: `${path}.amountOutAsk`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		timestamp: parseTimestampField(price.timestamp, {
			path: `${path}.timestamp`,
			owner,
			errors,
			source: "eVaultV3",
		}),
	};

	if (converted.queryFailure) {
		errors.push({
			code: "SOURCE_UNAVAILABLE",
			severity: "warning",
			message: "Oracle price query reported failure.",
			locations: [dataIssueLocation(owner, path)],
			source: "eVaultV3",
			originalValue: converted.queryFailureReason,
			normalizedValue: "queryFailure:true",
		});
	}

	return converted;
}

function convertOracleDetailedInfo(
	info: V3OracleDetailedInfo | null | undefined,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
	path: string,
): OracleDetailedInfo | undefined {
	if (!info) return undefined;

	return {
		oracle: parseAddressField(info.oracle, {
			path: `${path}.oracle`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		name: parseStringField(info.name, {
			path: `${path}.name`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		oracleInfo: parseStringField(info.oracleInfo, {
			path: `${path}.oracleInfo`,
			owner,
			errors,
			source: "eVaultV3",
			fallback: "0x",
		}) as Hex,
	};
}

function convertCollaterals(
	rows: V3CollateralRow[],
	vaultTimestamp: number,
	vaultEntityId: Address,
	chainId: number,
	errors: DataIssue[],
	oracleDetailedInfo?: OracleDetailedInfo,
	unitOfAccount?: Address,
): IEVaultCollateral[] {
	const collaterals: IEVaultCollateral[] = [];
	const vaultOwner = vaultDiagnosticOwner(chainId, vaultEntityId);

	for (const [index, row] of rows.entries()) {
		const collateralAddress = parseAddressField(row.collateral, {
			path: `$.collaterals[${index}].collateral`,
			owner: vaultOwner,
			errors,
			source: "eVaultV3",
		});
		const collateralOwner = vaultCollateralDiagnosticOwner(
			chainId,
			vaultEntityId,
			collateralAddress,
		);
		const borrowLTV = parseRatio1e4(row.borrowLTV, {
			path: "$.borrowLTV",
			owner: collateralOwner,
			errors,
			source: "eVaultV3",
		});
		const liquidationLTV = parseRatio1e4(row.liquidationLTV, {
			path: "$.liquidationLTV",
			owner: collateralOwner,
			errors,
			source: "eVaultV3",
		});
		const targetTimestamp = parseV3TargetTimestamp(row.targetTimestamp, {
			path: "$.targetTimestamp",
			owner: collateralOwner,
			errors,
			source: "eVaultV3",
		});
		const isRemovedCollateral =
			borrowLTV === 0 &&
			liquidationLTV === 0 &&
			targetTimestamp < vaultTimestamp;

		if (isRemovedCollateral) continue;
		const oracleRoute =
			oracleDetailedInfo && unitOfAccount
				? decodeOracleRouteForPair(
						oracleDetailedInfo,
						collateralAddress,
						unitOfAccount,
					)
				: undefined;

		const collateral: IEVaultCollateral = {
			address: collateralAddress,
			borrowLTV,
			liquidationLTV,
			oraclePriceRaw: row.oraclePriceRaw
				? convertOraclePrice(
						row.oraclePriceRaw,
						errors,
						"$.oraclePriceRaw",
						collateralOwner,
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
			...(oracleRoute ? { oracleRoute } : {}),
		};

		if (targetTimestamp > vaultTimestamp) {
			const ramping: EVaultCollateralRamping = {
				initialLiquidationLTV: parseRatio1e4(row.initialLiquidationLTV, {
					path: "$.ramping.initialLiquidationLTV",
					owner: collateralOwner,
					errors,
					source: "eVaultV3",
				}),
				targetTimestamp,
				rampDuration: parseBigIntField(String(row.rampDuration ?? 0), {
					path: "$.ramping.rampDuration",
					owner: collateralOwner,
					errors,
					source: "eVaultV3",
				}),
			};
			collateral.ramping = ramping;
		}

		collaterals.push(collateral);
	}

	return collaterals;
}

export function convertVault(
	detail: V3VaultDetail,
	collateralRows: V3CollateralRow[],
	errors: DataIssue[],
	fallbackAddress: Address,
): IEVault {
	const hasZeroOracleAddress =
		detail.oracle?.oracle !== undefined &&
		(() => {
			try {
				return getAddress(detail.oracle.oracle) === ZERO_ADDRESS;
			} catch {
				return false;
			}
		})();
	const vaultAddress = parseAddressField(detail.address, {
		path: "$.address",
		owner: vaultDiagnosticOwner(detail.chainId, fallbackAddress),
		errors,
		source: "eVaultV3",
		fallback: fallbackAddress,
		fallbackLabel: "requested vault address",
	});
	const owner = vaultDiagnosticOwner(detail.chainId, vaultAddress);

	if (!detail.oracle) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing oracle block; defaulted all oracle fields to 0/empty.",
			locations: [dataIssueLocation(owner, "$.oracle")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_ORACLE_BLOCK,
		});
	}
	const oracleData = detail.oracle ?? DEFAULT_ORACLE_BLOCK;
	const oracleDetailedInfo = convertOracleDetailedInfo(
		oracleData.detailedInfo,
		owner,
		errors,
		"$.oracle.detailedInfo",
	);
	const oracle: OracleInfo = {
		oracle: parseAddressField(oracleData.oracle, {
			path: "$.oracle.oracle",
			owner,
			errors,
			source: "eVaultV3",
		}),
		name: parseStringField(oracleData.name, {
			path: "$.oracle.name",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};
	const suppressUnitOfAccountDiagnostics = hasZeroOracleAddress;

	if (!detail.shares) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing shares block; defaulted all share token fields to 0/empty.",
			locations: [dataIssueLocation(owner, "$.shares")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_TOKEN_BLOCK,
		});
	}
	const sharesData = detail.shares ?? DEFAULT_TOKEN_BLOCK;

	if (!detail.asset) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing asset block; defaulted all asset token fields to 0/empty.",
			locations: [dataIssueLocation(owner, "$.asset")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_TOKEN_BLOCK,
		});
	}
	const assetData = detail.asset ?? DEFAULT_TOKEN_BLOCK;

	if (!detail.unitOfAccount && !suppressUnitOfAccountDiagnostics) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing unitOfAccount block; defaulted all unit-of-account fields to 0/empty.",
			locations: [dataIssueLocation(owner, "$.unitOfAccount")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_TOKEN_BLOCK,
		});
	}
	const unitOfAccountData = detail.unitOfAccount ?? DEFAULT_TOKEN_BLOCK;
	const unitOfAccountErrors = suppressUnitOfAccountDiagnostics ? [] : errors;

	const feeData = detail.fees ?? {
		interestFee: 0,
		accumulatedFeesShares: "0",
		accumulatedFeesAssets: "0",
		governorFeeReceiver: ZERO_ADDRESS,
		protocolFeeReceiver: ZERO_ADDRESS,
		protocolFeeShare: 0,
	};

	const fees: EVaultFees = {
		interestFee: parseOptionalNumberField(feeData.interestFee, {
			path: "$.fees.interestFee",
			owner,
			errors,
			source: "eVaultV3",
		}),
		accumulatedFeesShares: parseBigIntField(
			feeData.accumulatedFeesShares ?? "0",
			{
				path: "$.fees.accumulatedFeesShares",
				owner,
				errors,
				source: "eVaultV3",
			},
		),
		accumulatedFeesAssets: parseBigIntField(
			feeData.accumulatedFeesAssets ?? "0",
			{
				path: "$.fees.accumulatedFeesAssets",
				owner,
				errors,
				source: "eVaultV3",
			},
		),
		governorFeeReceiver: parseOptionalAddressField(
			feeData.governorFeeReceiver,
			{
				path: "$.fees.governorFeeReceiver",
				owner,
				errors,
				source: "eVaultV3",
			},
		),
		protocolFeeReceiver: parseOptionalAddressField(
			feeData.protocolFeeReceiver,
			{
				path: "$.fees.protocolFeeReceiver",
				owner,
				errors,
				source: "eVaultV3",
			},
		),
		protocolFeeShare: parseOptionalNumberField(feeData.protocolFeeShare, {
			path: "$.fees.protocolFeeShare",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};

	const hooks: EVaultHooks = {
		hookedOperations: {
			...DEFAULT_HOOKED_OPERATIONS,
			...(detail.hooks?.hookedOperations ?? {}),
		},
		hookTarget: parseOptionalAddressField(detail.hooks?.hookTarget, {
			path: "$.hooks.hookTarget",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};
	const capsData = detail.caps ?? DEFAULT_CAPS_BLOCK;
	const caps: EVaultCaps = {
		supplyCap: parseBigIntField(capsData.supplyCap ?? "0", {
			path: "$.caps.supplyCap",
			owner,
			errors,
			source: "eVaultV3",
		}),
		borrowCap: parseBigIntField(capsData.borrowCap ?? "0", {
			path: "$.caps.borrowCap",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};

	const liquidationData = detail.liquidation ?? DEFAULT_LIQUIDATION_BLOCK;
	const liquidation: EVaultLiquidation = {
		maxLiquidationDiscount: parseOptionalNumberField(
			liquidationData.maxLiquidationDiscount,
			{
				path: "$.liquidation.maxLiquidationDiscount",
				owner,
				errors,
				source: "eVaultV3",
			},
		),
		liquidationCoolOffTime: parseOptionalNumberField(
			liquidationData.liquidationCoolOffTime,
			{
				path: "$.liquidation.liquidationCoolOffTime",
				owner,
				errors,
				source: "eVaultV3",
			},
		),
		socializeDebt: parseOptionalBooleanField(liquidationData.socializeDebt, {
			path: "$.liquidation.socializeDebt",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};

	const interestRatesData =
		detail.interestRates ?? DEFAULT_INTEREST_RATES_BLOCK;
	const interestRates: InterestRates = {
		borrowSPY: parseRate(
			parseOptionalStringField(interestRatesData.borrowSPY, {
				path: "$.interestRates.borrowSPY",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0",
			}),
		),
		borrowAPY: parseRate(
			parseOptionalStringField(interestRatesData.borrowAPY, {
				path: "$.interestRates.borrowAPY",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0",
			}),
		),
		supplyAPY: parseRate(
			parseOptionalStringField(interestRatesData.supplyAPY, {
				path: "$.interestRates.supplyAPY",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0",
			}),
		),
	};

	const interestRateModelData =
		detail.interestRateModel ?? DEFAULT_INTEREST_RATE_MODEL_BLOCK;
	const interestRateModelType = mapInterestRateModelType(
		parseOptionalStringField(interestRateModelData.type, {
			path: "$.interestRateModel.type",
			owner,
			errors,
			source: "eVaultV3",
			fallback: "unknown",
		}),
	);
	const normalizedIRMData = normalizeIRMParams(
		interestRateModelType,
		interestRateModelData.data,
	);
	const interestRateModelAddress = parseAddressField(
		interestRateModelData.address ?? ZERO_ADDRESS,
		{
			path: "$.interestRateModel.address",
			owner,
			errors,
			source: "eVaultV3",
		},
	);
	const interestRateModel: InterestRateModel =
		interestRateModelType === InterestRateModelType.KINK
			? {
					address: interestRateModelAddress,
					type: InterestRateModelType.KINK,
					data: normalizedIRMData as KinkIRMInfo | null,
					params: decorateIRMParams(
						interestRateModelType,
						normalizedIRMData as KinkIRMInfo | null,
						fees.interestFee,
					),
				}
			: interestRateModelType === InterestRateModelType.ADAPTIVE_CURVE
				? {
						address: interestRateModelAddress,
						type: InterestRateModelType.ADAPTIVE_CURVE,
						data: normalizedIRMData as AdaptiveCurveIRMInfo | null,
						params: decorateIRMParams(
							interestRateModelType,
							normalizedIRMData as AdaptiveCurveIRMInfo | null,
							fees.interestFee,
						),
					}
				: interestRateModelType === InterestRateModelType.KINKY
					? {
							address: interestRateModelAddress,
							type: InterestRateModelType.KINKY,
							data: normalizedIRMData as KinkyIRMInfo | null,
							params: decorateIRMParams(
								interestRateModelType,
								normalizedIRMData as KinkyIRMInfo | null,
								fees.interestFee,
							),
						}
					: interestRateModelType ===
							InterestRateModelType.FIXED_CYCLICAL_BINARY
						? {
								address: interestRateModelAddress,
								type: InterestRateModelType.FIXED_CYCLICAL_BINARY,
								data: normalizedIRMData as FixedCyclicalBinaryIRMInfo | null,
								params: decorateIRMParams(
									interestRateModelType,
									normalizedIRMData as FixedCyclicalBinaryIRMInfo | null,
									fees.interestFee,
								),
							}
						: interestRateModelType ===
								InterestRateModelType.FIXED_CYCLICAL_BINARY_MONTHLY
							? {
									address: interestRateModelAddress,
									type: InterestRateModelType.FIXED_CYCLICAL_BINARY_MONTHLY,
									data: normalizedIRMData as FixedCyclicalBinaryMonthlyIRMInfo | null,
									params: decorateIRMParams(
										interestRateModelType,
										normalizedIRMData as FixedCyclicalBinaryMonthlyIRMInfo | null,
										fees.interestFee,
									),
								}
							: {
									address: interestRateModelAddress,
									type: InterestRateModelType.UNKNOWN,
									data: null,
									params: null,
								};

	const oraclePriceRaw = detail.oraclePriceRaw
		? convertOraclePrice(
				detail.oraclePriceRaw,
				errors,
				"$.oraclePriceRaw",
				owner,
			)
		: {
				queryFailure: true,
				queryFailureReason: "0x" as Hex,
				amountIn: 0n,
				amountOutMid: 0n,
				amountOutBid: 0n,
				amountOutAsk: 0n,
				timestamp: 0,
			};
	const timestamp = parseTimestampField(detail.timestamp, {
		path: "$.timestamp",
		owner,
		errors,
		source: "eVaultV3",
	});
	const unitOfAccount = normalizeUnitOfAccountToken(
		convertToken(
			unitOfAccountData,
			"$.unitOfAccount",
			owner,
			unitOfAccountErrors,
			{ name: true, symbol: true, decimals: true },
		),
	);
	const shares = convertToken(sharesData, "$.shares", owner, errors, {
		name: true,
		symbol: true,
		decimals: true,
	});
	const asset = convertToken(assetData, "$.asset", owner, errors, {
		name: true,
		symbol: true,
	});
	const collaterals = convertCollaterals(
		collateralRows,
		timestamp,
		vaultAddress,
		detail.chainId,
		errors,
		oracleDetailedInfo,
		unitOfAccount?.address,
	);
	const isBorrowable = hasActiveBorrowableLtv(collaterals, timestamp);
	const debtPricingOracleRoute =
		unitOfAccount && oracleDetailedInfo
			? decodeOracleRouteForPair(
					oracleDetailedInfo,
					asset.address,
					unitOfAccount.address,
				)
			: undefined;

	return {
		type: VaultType.EVault,
		chainId: detail.chainId,
		address: vaultAddress,
		shares,
		asset,
		unitOfAccount,
		totalShares: parseBigIntField(detail.totalShares, {
			path: "$.totalShares",
			owner,
			errors,
			source: "eVaultV3",
		}),
		totalAssets: parseBigIntField(detail.totalAssets, {
			path: "$.totalAssets",
			owner,
			errors,
			source: "eVaultV3",
		}),
		totalCash: parseBigIntField(detail.totalCash, {
			path: "$.totalCash",
			owner,
			errors,
			source: "eVaultV3",
		}),
		totalBorrowed: parseBigIntField(detail.totalBorrowed, {
			path: "$.totalBorrowed",
			owner,
			errors,
			source: "eVaultV3",
		}),
		creator: parseAddressField(detail.creator, {
			path: "$.creator",
			owner,
			errors,
			source: "eVaultV3",
		}),
		governorAdmin: parseAddressField(detail.governorAdmin, {
			path: "$.governorAdmin",
			owner,
			errors,
			source: "eVaultV3",
		}),
		dToken: parseAddressField(detail.dToken, {
			path: "$.dToken",
			owner,
			errors,
			source: "eVaultV3",
		}),
		balanceTracker: parseOptionalAddressField(detail.balanceTracker, {
			path: "$.balanceTracker",
			owner,
			errors,
			source: "eVaultV3",
		}),
		fees,
		hooks,
		caps,
		liquidation,
		oracle,
		interestRates,
		interestRateModel,
		collaterals,
		debtPricingOracleRoute,
		isBorrowable,
		evcCompatibleAsset: parseOptionalBooleanField(detail.evcCompatibleAsset, {
			path: "$.evcCompatibleAsset",
			owner,
			errors,
			source: "eVaultV3",
		}),
		oraclePriceRaw,
		timestamp,
	};
}
