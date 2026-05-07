import { type Address, type Hex, getAddress } from "viem";
import type {
	OracleAdapterEntry,
	OracleInfo,
	OraclePrice,
} from "../../../../../utils/oracle.js";
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
	parseNumberField,
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
	V3OraclePrice,
	V3OracleAdapter,
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
	timestamp: "",
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
		default:
			return InterestRateModelType.UNKNOWN;
	}
}

function convertToken(
	token: V3Token,
	path: string,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): Token {
	return {
		address: parseAddressField(token.address, {
			path: `${path}.address`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		name: parseStringField(token.name, {
			path: `${path}.name`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		symbol: parseStringField(token.symbol, {
			path: `${path}.symbol`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		decimals: parseNumberField(token.decimals, {
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

function convertOracleAdapter(
	adapter: V3OracleAdapter,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): OracleAdapterEntry {
	const converted: OracleAdapterEntry = {
		oracle: parseAddressField(adapter.oracle, {
			path: "$.oracle.adapters[].oracle",
			owner,
			errors,
			source: "eVaultV3",
		}),
		name: parseStringField(adapter.name, {
			path: "$.oracle.adapters[].name",
			owner,
			errors,
			source: "eVaultV3",
		}),
		base: parseAddressField(adapter.base, {
			path: "$.oracle.adapters[].base",
			owner,
			errors,
			source: "eVaultV3",
		}),
		quote: parseAddressField(adapter.quote, {
			path: "$.oracle.adapters[].quote",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};

	if (adapter.pythDetail) {
		converted.pythDetail = {
			pyth: parseAddressField(adapter.pythDetail.pyth, {
				path: "$.oracle.adapters[].pythDetail.pyth",
				owner,
				errors,
				source: "eVaultV3",
			}),
			base: parseAddressField(adapter.pythDetail.base, {
				path: "$.oracle.adapters[].pythDetail.base",
				owner,
				errors,
				source: "eVaultV3",
			}),
			quote: parseAddressField(adapter.pythDetail.quote, {
				path: "$.oracle.adapters[].pythDetail.quote",
				owner,
				errors,
				source: "eVaultV3",
			}),
			feedId: parseStringField(adapter.pythDetail.feedId, {
				path: "$.oracle.adapters[].pythDetail.feedId",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0x",
			}) as Hex,
			maxStaleness: parseBigIntField(String(adapter.pythDetail.maxStaleness), {
				path: "$.oracle.adapters[].pythDetail.maxStaleness",
				owner,
				errors,
				source: "eVaultV3",
			}),
			maxConfWidth: parseBigIntField(String(adapter.pythDetail.maxConfWidth), {
				path: "$.oracle.adapters[].pythDetail.maxConfWidth",
				owner,
				errors,
				source: "eVaultV3",
			}),
		};
	}

	if (adapter.chainlinkDetail) {
		converted.chainlinkDetail = {
			oracle: parseAddressField(adapter.chainlinkDetail.oracle, {
				path: "$.oracle.adapters[].chainlinkDetail.oracle",
				owner,
				errors,
				source: "eVaultV3",
			}),
		};
	}

	return converted;
}

function convertOracleResolvedVaults(
	resolvedVaults: NonNullable<V3VaultDetail["oracle"]>["resolvedVaults"],
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): OracleInfo["resolvedVaults"] {
	return (resolvedVaults ?? []).map((resolvedVault, index) => ({
		vault: parseAddressField(resolvedVault.vault, {
			path: `$.oracle.resolvedVaults[${index}].vault`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		quote: parseAddressField(resolvedVault.quote, {
			path: `$.oracle.resolvedVaults[${index}].quote`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		asset: parseAddressField(resolvedVault.asset, {
			path: `$.oracle.resolvedVaults[${index}].asset`,
			owner,
			errors,
			source: "eVaultV3",
		}),
		resolvedAssets: (resolvedVault.resolvedAssets ?? []).map(
			(asset, assetIndex) =>
				parseAddressField(asset, {
					path: `$.oracle.resolvedVaults[${index}].resolvedAssets[${assetIndex}]`,
					owner,
					errors,
					source: "eVaultV3",
				}),
		),
	}));
}

function convertCollaterals(
	rows: V3CollateralRow[],
	vaultTimestamp: number,
	vaultEntityId: Address,
	chainId: number,
	errors: DataIssue[],
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
		const targetTimestamp = parseNumberField(
			typeof row.targetTimestamp === "number"
				? row.targetTimestamp
				: Number(row.targetTimestamp),
			{
				path: "$.targetTimestamp",
				owner: collateralOwner,
				errors,
				source: "eVaultV3",
			},
		);
		const isRemovedCollateral =
			borrowLTV === 0 &&
			liquidationLTV === 0 &&
			targetTimestamp < vaultTimestamp;

		if (isRemovedCollateral) continue;

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
		};

		if (!row.oraclePriceRaw) {
			errors.push({
				code: "DEFAULT_APPLIED",
				severity: "warning",
				message:
					"Missing collateral oraclePriceRaw; default zero-price placeholder applied.",
				locations: [dataIssueLocation(collateralOwner, "$.oraclePriceRaw")],
				source: "eVaultV3",
				normalizedValue: "queryFailure:true",
			});
		}

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
		adapters: (oracleData.adapters ?? []).map((adapter) =>
			convertOracleAdapter(adapter, owner, errors),
		),
		resolvedVaults: convertOracleResolvedVaults(
			oracleData.resolvedVaults,
			owner,
			errors,
		),
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

	if (!detail.fees) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing fees object; defaulted all fee fields to 0.",
			locations: [dataIssueLocation(owner, "$.fees")],
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
		governorFeeReceiver: parseAddressField(feeData.governorFeeReceiver, {
			path: "$.fees.governorFeeReceiver",
			owner,
			errors,
			source: "eVaultV3",
		}),
		protocolFeeReceiver: parseAddressField(feeData.protocolFeeReceiver, {
			path: "$.fees.protocolFeeReceiver",
			owner,
			errors,
			source: "eVaultV3",
		}),
		protocolFeeShare: feeData.protocolFeeShare ?? 0,
	};

	const hooks: EVaultHooks = {
		hookedOperations: {
			...DEFAULT_HOOKED_OPERATIONS,
			...(detail.hooks?.hookedOperations ?? {}),
		},
		hookTarget: parseAddressField(detail.hooks?.hookTarget, {
			path: "$.hooks.hookTarget",
			owner,
			errors,
			source: "eVaultV3",
		}),
	};
	if (!detail.hooks?.hookedOperations) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing hookedOperations; defaulted all operations to false.",
			locations: [dataIssueLocation(owner, "$.hooks.hookedOperations")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_HOOKED_OPERATIONS,
		});
	}

	if (!detail.caps) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: "Missing caps block; defaulted all cap fields to 0.",
			locations: [dataIssueLocation(owner, "$.caps")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_CAPS_BLOCK,
		});
	}
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

	if (!detail.liquidation) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing liquidation block; defaulted all liquidation fields to 0/false.",
			locations: [dataIssueLocation(owner, "$.liquidation")],
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
			locations: [dataIssueLocation(owner, "$.interestRates")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_INTEREST_RATES_BLOCK,
		});
	}
	const interestRatesData =
		detail.interestRates ?? DEFAULT_INTEREST_RATES_BLOCK;
	const interestRates: InterestRates = {
		borrowSPY: parseRate(
			parseStringField(interestRatesData.borrowSPY, {
				path: "$.interestRates.borrowSPY",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0",
			}),
		),
		borrowAPY: parseRate(
			parseStringField(interestRatesData.borrowAPY, {
				path: "$.interestRates.borrowAPY",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0",
			}),
		),
		supplyAPY: parseRate(
			parseStringField(interestRatesData.supplyAPY, {
				path: "$.interestRates.supplyAPY",
				owner,
				errors,
				source: "eVaultV3",
				fallback: "0",
			}),
		),
	};

	if (!detail.interestRateModel) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing interestRateModel block; defaulted all model fields to 0/unknown.",
			locations: [dataIssueLocation(owner, "$.interestRateModel")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_INTEREST_RATE_MODEL_BLOCK,
		});
	}
	const interestRateModelData =
		detail.interestRateModel ?? DEFAULT_INTEREST_RATE_MODEL_BLOCK;
	const interestRateModelType = mapInterestRateModelType(
		parseStringField(interestRateModelData.type, {
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
		interestRateModelData.address,
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
						: {
								address: interestRateModelAddress,
								type: InterestRateModelType.UNKNOWN,
								data: null,
								params: null,
							};

	if (!detail.oraclePriceRaw) {
		errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message:
				"Missing oraclePriceRaw block; defaulted all oracle price fields to 0.",
			locations: [dataIssueLocation(owner, "$.oraclePriceRaw")],
			source: "eVaultV3",
			normalizedValue: DEFAULT_ORACLE_PRICE_BLOCK,
		});
	}
	const oraclePriceData = detail.oraclePriceRaw ?? DEFAULT_ORACLE_PRICE_BLOCK;
	const timestamp = parseTimestampField(detail.timestamp, {
		path: "$.timestamp",
		owner,
		errors,
		source: "eVaultV3",
	});
	const collaterals = convertCollaterals(
		collateralRows,
		timestamp,
		vaultAddress,
		detail.chainId,
		errors,
	);
	const unitOfAccount = normalizeUnitOfAccountToken(
		convertToken(
			unitOfAccountData,
			"$.unitOfAccount",
			owner,
			unitOfAccountErrors,
		),
	);

	return {
		type: VaultType.EVault,
		chainId: detail.chainId,
		address: vaultAddress,
		shares: convertToken(sharesData, "$.shares", owner, errors),
		asset: convertToken(assetData, "$.asset", owner, errors),
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
		balanceTracker: parseAddressField(detail.balanceTracker, {
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
		isBorrowable: hasActiveBorrowableLtv(collaterals, timestamp),
		evcCompatibleAsset: parseBooleanField(detail.evcCompatibleAsset, {
			path: "$.evcCompatibleAsset",
			owner,
			errors,
			source: "eVaultV3",
		}),
		oraclePriceRaw: convertOraclePrice(
			oraclePriceData,
			errors,
			"$.oraclePriceRaw",
			owner,
		),
		timestamp,
	};
}
