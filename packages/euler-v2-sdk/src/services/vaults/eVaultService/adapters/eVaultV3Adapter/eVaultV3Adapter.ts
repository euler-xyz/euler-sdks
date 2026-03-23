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
	shares: V3Token;
	asset: V3Token;
	dToken: string;
	oracle: {
		oracle: string;
		name: string;
		adapters: V3OracleAdapter[];
	};
	unitOfAccount: V3Token;
	creator: string;
	governorAdmin: string;
	totalShares: string;
	totalAssets: string;
	totalBorrows: string;
	totalBorrowed: string;
	totalCash: string;
	balanceTracker: string;
	fees: {
		interestFee: number;
		accumulatedFeesShares: string;
		accumulatedFeesAssets: string;
		governorFeeReceiver: string;
		protocolFeeReceiver: string;
		protocolFeeShare: number;
	};
	hooks: {
		hookedOperations: Record<keyof EVaultHookedOperations, boolean>;
		hookTarget: string;
	};
	caps: {
		supplyCap: string;
		borrowCap: string;
	};
	liquidation: {
		maxLiquidationDiscount: number;
		liquidationCoolOffTime: number;
		socializeDebt: boolean;
	};
	interestRates: {
		borrowSPY: string;
		borrowAPY: string;
		supplyAPY: string;
	};
	interestRateModel: {
		address: string;
		type: string;
		data: unknown;
	};
	evcCompatibleAsset: boolean;
	oraclePriceRaw: V3OraclePrice;
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

function convertToken(token: V3Token): Token {
	return {
		address: getAddress(token.address),
		name: token.name,
		symbol: token.symbol,
		decimals: token.decimals,
	};
}

function convertOraclePrice(
	price: V3OraclePrice,
	errors: DataIssue[],
	path: string,
	entityId: Address,
): OraclePrice {
	const converted = {
		queryFailure: price.queryFailure,
		queryFailureReason: (price.queryFailureReason || "0x") as Hex,
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
		timestamp: price.timestamp,
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
	errors: DataIssue[],
): EVaultCollateral[] {
	const collaterals: EVaultCollateral[] = [];

	for (const [index, row] of rows.entries()) {
		const collateralAddress = getAddress(row.collateral);
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
		const targetTimestamp = Number(row.targetTimestamp);
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
				rampDuration: BigInt(row.rampDuration),
			};
			collateral.ramping = ramping;
		}

		collaterals.push(collateral);
	}

	return collaterals;
}

function convertVault(
	detail: V3VaultDetail,
	collateralRows: V3CollateralRow[],
	errors: DataIssue[],
): IEVault {
	const entityId = getAddress(detail.address);
	const oracle: OracleInfo = {
		oracle: getAddress(detail.oracle.oracle),
		name: detail.oracle.name,
		adapters: detail.oracle.adapters.map((adapter) => ({
			oracle: getAddress(adapter.oracle),
			name: adapter.name,
			base: getAddress(adapter.base),
			quote: getAddress(adapter.quote),
			pythDetail: adapter.pythDetail,
			chainlinkDetail: adapter.chainlinkDetail
				? { oracle: getAddress(adapter.chainlinkDetail.oracle) }
				: undefined,
		})),
	};

	const fees: EVaultFees = {
		interestFee: detail.fees.interestFee,
		accumulatedFeesShares: parseBigIntField(
			detail.fees.accumulatedFeesShares,
			"$.fees.accumulatedFeesShares",
			entityId,
			errors,
		),
		accumulatedFeesAssets: parseBigIntField(
			detail.fees.accumulatedFeesAssets,
			"$.fees.accumulatedFeesAssets",
			entityId,
			errors,
		),
		governorFeeReceiver: getAddress(detail.fees.governorFeeReceiver),
		protocolFeeReceiver: getAddress(detail.fees.protocolFeeReceiver),
		protocolFeeShare: detail.fees.protocolFeeShare,
	};

	const hooks: EVaultHooks = {
		hookedOperations: detail.hooks.hookedOperations,
		hookTarget: getAddress(detail.hooks.hookTarget),
	};

	const caps: EVaultCaps = {
		supplyCap: parseBigIntField(
			detail.caps.supplyCap,
			"$.caps.supplyCap",
			entityId,
			errors,
		),
		borrowCap: parseBigIntField(
			detail.caps.borrowCap,
			"$.caps.borrowCap",
			entityId,
			errors,
		),
	};

	const liquidation: EVaultLiquidation = {
		maxLiquidationDiscount: detail.liquidation.maxLiquidationDiscount,
		liquidationCoolOffTime: detail.liquidation.liquidationCoolOffTime,
		socializeDebt: detail.liquidation.socializeDebt,
	};

	const interestRates: InterestRates = {
		borrowSPY: detail.interestRates.borrowSPY,
		borrowAPY: detail.interestRates.borrowAPY,
		supplyAPY: detail.interestRates.supplyAPY,
	};

	const interestRateModel: InterestRateModel = {
		address: getAddress(detail.interestRateModel.address),
		type: mapInterestRateModelType(detail.interestRateModel.type),
		data: detail.interestRateModel.data as InterestRateModel["data"],
	};

	return {
		type: VaultType.EVault,
		chainId: detail.chainId,
		address: entityId,
		shares: convertToken(detail.shares),
		asset: convertToken(detail.asset),
		unitOfAccount: convertToken(detail.unitOfAccount),
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
		creator: getAddress(detail.creator),
		governorAdmin: getAddress(detail.governorAdmin),
		dToken: getAddress(detail.dToken),
		balanceTracker: getAddress(detail.balanceTracker),
		fees,
		hooks,
		caps,
		liquidation,
		oracle,
		interestRates,
		interestRateModel,
		collaterals: convertCollaterals(collateralRows, detail.timestamp, errors),
		evcCompatibleAsset: detail.evcCompatibleAsset,
		oraclePriceRaw: convertOraclePrice(
			detail.oraclePriceRaw,
			errors,
			"$.oraclePriceRaw",
			entityId,
		),
		timestamp: detail.timestamp,
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
    console.time("EVaultV3Adapter.fetchVaults");
		const results: Array<{ result: IEVault | undefined; errors: DataIssue[] }> =
			await Promise.all(
				vaults.map(async (vault, index) => {
					const errors: DataIssue[] = [];
					try {
						const [detailResponse, collateralsResponse] = await Promise.all([
							this.queryV3EVaultDetail(this.config.endpoint, chainId, vault),
							this.queryV3EVaultCollaterals(
								this.config.endpoint,
								chainId,
								vault,
							),
						]);

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

						const converted = convertVault(
							detail,
							collateralsResponse.data ?? [],
							errors,
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
				}),
			);
    console.timeEnd("EVaultV3Adapter.fetchVaults");
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
