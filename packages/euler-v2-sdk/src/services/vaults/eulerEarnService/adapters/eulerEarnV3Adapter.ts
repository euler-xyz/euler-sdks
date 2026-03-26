import { type Address, getAddress } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import type {
	DataIssue,
	ServiceResult,
} from "../../../../utils/entityDiagnostics.js";
import {
	compressDataIssues,
	prefixDataIssues,
} from "../../../../utils/entityDiagnostics.js";
import {
	parseAddressField,
	parseBigIntField,
	parsePerformanceFee,
	parseTimestampField,
	ZERO_ADDRESS,
} from "../../../../utils/parsing.js";
import { VaultType, type Token } from "../../../../utils/types.js";
import type {
	EulerEarnAllocationCap,
	EulerEarnGovernance,
	EulerEarnStrategyInfo,
	IEulerEarn,
} from "../../../../entities/EulerEarn.js";
import type { EulerEarnV3AdapterConfig } from "../eulerEarnServiceConfig.js";
import type { IEulerEarnAdapter } from "../eulerEarnService.js";

type V3Envelope<T> = {
	data?: T;
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
	};
};

type V3ListEnvelope<T> = {
	data?: T[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
	};
};

type V3Token = {
	address: string;
	symbol?: string;
	decimals: number;
	name?: string;
};

type V3EulerEarnStrategy = {
	address: string;
	symbol?: string;
	name?: string;
	decimals?: number;
	suppliedAssets?: string;
	withdrawnAssets?: string;
	allocatedAssets?: string;
	availableAssets?: string;
	inSupplyQueue?: boolean;
	inWithdrawQueue?: boolean;
	supplyQueueIndex?: number;
	withdrawQueueIndex?: number;
	allocationCap?: {
		current?: string;
		pending?: string;
		pendingValidAt?: number;
	};
	removableAt?: number;
};

type V3EulerEarnDetail = {
	chainId: number;
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	asset: V3Token;
	totalAssets: string;
	totalShares: string;
	supplyApy: number;
	lostAssets?: string;
	availableAssets?: string;
	strategies?: V3EulerEarnStrategy[];
	governance?: {
		owner?: string;
		creator?: string;
		curator?: string;
		guardian?: string;
		feeReceiver?: string;
		timelock?: number;
		pendingTimelock?: number;
		pendingTimelockValidAt?: number;
		pendingGuardian?: string;
		pendingGuardianValidAt?: number;
	};
	management?: {
		owner?: string;
		guardian?: string;
		timelockSeconds?: number;
		performanceFee?: string;
	};
	snapshotTimestamp?: string;
};

type V3EulerEarnListRow = {
	address: string;
};

const unsupportedError = new Error("unsupported");

function convertToken(
	token: V3Token,
	fallbackAddress: Address,
	fallbackName: string,
	fallbackSymbol: string,
): Token {
	return {
		address: token.address ? getAddress(token.address) : fallbackAddress,
		name: token.name ?? fallbackName,
		symbol: token.symbol ?? fallbackSymbol,
		decimals: token.decimals,
	};
}

function convertGovernance(
	detail: V3EulerEarnDetail,
	entityId: Address,
	errors: DataIssue[],
): EulerEarnGovernance {
	return {
		owner: parseAddressField(
			detail.governance?.owner ?? detail.management?.owner,
			{ path: "$.governance.owner", entityId, errors, source: "eulerEarnV3" },
		),
		creator: parseAddressField(
			detail.governance?.creator,
			{ path: "$.governance.creator", entityId, errors, source: "eulerEarnV3" },
		),
		curator: parseAddressField(
			detail.governance?.curator,
			{ path: "$.governance.curator", entityId, errors, source: "eulerEarnV3" },
		),
		guardian: parseAddressField(
			detail.governance?.guardian ?? detail.management?.guardian,
			{ path: "$.governance.guardian", entityId, errors, source: "eulerEarnV3" },
		),
		feeReceiver: parseAddressField(
			detail.governance?.feeReceiver,
			{
				path: "$.governance.feeReceiver",
				entityId,
				errors,
				source: "eulerEarnV3",
			},
		),
		timelock:
			detail.governance?.timelock ?? detail.management?.timelockSeconds ?? 0,
		pendingTimelock: detail.governance?.pendingTimelock ?? 0,
		pendingTimelockValidAt: detail.governance?.pendingTimelockValidAt ?? 0,
		pendingGuardian: parseAddressField(
			detail.governance?.pendingGuardian,
			{
				path: "$.governance.pendingGuardian",
				entityId,
				errors,
				source: "eulerEarnV3",
			},
		),
		pendingGuardianValidAt: detail.governance?.pendingGuardianValidAt ?? 0,
	};
}

function buildSupplyQueue(strategies: V3EulerEarnStrategy[]): Address[] {
	return strategies
		.filter((strategy) => strategy.inSupplyQueue)
		.sort(
			(a, b) =>
				(a.supplyQueueIndex ?? Number.MAX_SAFE_INTEGER) -
				(b.supplyQueueIndex ?? Number.MAX_SAFE_INTEGER),
		)
		.map((strategy) => getAddress(strategy.address));
}

function buildWithdrawQueue(strategies: V3EulerEarnStrategy[]): Address[] {
	return strategies
		.filter((strategy) => strategy.inWithdrawQueue)
		.sort(
			(a, b) =>
				(a.withdrawQueueIndex ?? Number.MAX_SAFE_INTEGER) -
				(b.withdrawQueueIndex ?? Number.MAX_SAFE_INTEGER),
		)
		.map((strategy) => getAddress(strategy.address));
}

function convertStrategies(
	detail: V3EulerEarnDetail,
	entityId: Address,
	errors: DataIssue[],
): EulerEarnStrategyInfo[] {
	const asset = convertToken(
		detail.asset,
		ZERO_ADDRESS,
		detail.asset.name ?? "Unknown Asset",
		detail.asset.symbol ?? "UNKNOWN",
	);

	return (detail.strategies ?? []).map((strategy, index) => {
		const strategyAddress = getAddress(strategy.address);
		const allocatedAssets = parseBigIntField(
			strategy.allocatedAssets ?? "0",
			{
				path: `$.strategies[${index}].allocatedAssets`,
				entityId: strategyAddress,
				errors,
				source: "eulerEarnV3",
			},
		);
		const availableAssets = parseBigIntField(
			strategy.availableAssets ?? "0",
			{
				path: `$.strategies[${index}].availableAssets`,
				entityId: strategyAddress,
				errors,
				source: "eulerEarnV3",
			},
		);

		const allocationCap: EulerEarnAllocationCap = {
			current: parseBigIntField(
				strategy.allocationCap?.current ?? "0",
				{
					path: `$.strategies[${index}].allocationCap.current`,
					entityId: strategyAddress,
					errors,
					source: "eulerEarnV3",
				},
			),
			pending: parseBigIntField(
				strategy.allocationCap?.pending ?? "0",
				{
					path: `$.strategies[${index}].allocationCap.pending`,
					entityId: strategyAddress,
					errors,
					source: "eulerEarnV3",
				},
			),
			pendingValidAt: strategy.allocationCap?.pendingValidAt ?? 0,
		};

		return {
			address: strategyAddress,
			vaultType: VaultType.EVault,
			allocatedAssets,
			availableAssets,
			allocationCap,
			removableAt: strategy.removableAt ?? 0,
		};
	});
}

function convertEulerEarn(
	detail: V3EulerEarnDetail,
	errors: DataIssue[],
): IEulerEarn {
	const entityId = getAddress(detail.address);

	return {
		type: VaultType.EulerEarn,
		chainId: detail.chainId,
		address: entityId,
		shares: {
			address: entityId,
			name: detail.name,
			symbol: detail.symbol,
			decimals: detail.decimals,
		},
		asset: convertToken(
			detail.asset,
			ZERO_ADDRESS,
			detail.asset.name ?? "Unknown Asset",
			detail.asset.symbol ?? "UNKNOWN",
		),
		supplyApy1h: detail.supplyApy,
		totalShares: parseBigIntField(
			detail.totalShares ?? "0",
			{ path: "$.totalShares", entityId, errors, source: "eulerEarnV3" },
		),
		totalAssets: parseBigIntField(
			detail.totalAssets ?? "0",
			{ path: "$.totalAssets", entityId, errors, source: "eulerEarnV3" },
		),
		lostAssets: parseBigIntField(
			detail.lostAssets ?? "0",
			{ path: "$.lostAssets", entityId, errors, source: "eulerEarnV3" },
		),
		availableAssets: parseBigIntField(
			detail.availableAssets ?? "0",
			{ path: "$.availableAssets", entityId, errors, source: "eulerEarnV3" },
		),
		performanceFee: parsePerformanceFee(
			detail.management?.performanceFee,
			{ path: "$.performanceFee", entityId, errors, source: "eulerEarnV3" },
		),
		governance: convertGovernance(detail, entityId, errors),
		supplyQueue: buildSupplyQueue(detail.strategies ?? []),
		withdrawQueue: buildWithdrawQueue(detail.strategies ?? []),
		strategies: convertStrategies(detail, entityId, errors),
		timestamp: parseTimestampField(
			detail.snapshotTimestamp,
			{ path: "$.timestamp", entityId, errors, source: "eulerEarnV3" },
		),
	};
}

export class EulerEarnV3Adapter implements IEulerEarnAdapter {
	constructor(
		private config: EulerEarnV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: EulerEarnV3AdapterConfig): void {
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

	queryV3EulerEarnDetail = async (
		endpoint: string,
		chainId: number,
		vault: Address,
	): Promise<V3Envelope<V3EulerEarnDetail>> => {
		const url = this.buildUrl(endpoint, `/v3/earn/vaults/${chainId}/${vault}`);
		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok)
			throw new Error(
				`eulerEarnV3 detail ${response.status} ${response.statusText}`,
			);
		return response.json() as Promise<V3Envelope<V3EulerEarnDetail>>;
	};

	setQueryV3EulerEarnDetail(fn: typeof this.queryV3EulerEarnDetail): void {
		this.queryV3EulerEarnDetail = fn;
	}

	queryV3EulerEarnList = async (
		endpoint: string,
		chainId: number,
		offset: number,
		limit: number,
	): Promise<V3ListEnvelope<V3EulerEarnListRow>> => {
		const url = this.buildUrl(endpoint, "/v3/earn/vaults", {
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
				`eulerEarnV3 list ${response.status} ${response.statusText}`,
			);
		return response.json() as Promise<V3ListEnvelope<V3EulerEarnListRow>>;
	};

	setQueryV3EulerEarnList(fn: typeof this.queryV3EulerEarnList): void {
		this.queryV3EulerEarnList = fn;
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
	): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
		const results: Array<{
			result: IEulerEarn | undefined;
			errors: DataIssue[];
		}> = await Promise.all(
			vaults.map(async (vault, index) => {
				const errors: DataIssue[] = [];
				try {
					const response = await this.queryV3EulerEarnDetail(
						this.config.endpoint,
						chainId,
						vault,
					);
					const detail = response.data;
					if (!detail) {
						errors.push({
							code: "SOURCE_UNAVAILABLE",
							severity: "warning",
							message: `EulerEarn detail missing for ${getAddress(vault)}.`,
							paths: [`$.vaults[${index}]`],
							entityId: getAddress(vault),
							source: "eulerEarnV3",
						});
						return { result: undefined, errors };
					}

					const converted = convertEulerEarn(detail, errors);
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
					return {
						result: undefined,
						errors: [
							{
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: `Failed to fetch EulerEarn vault ${getAddress(vault)}.`,
								paths: [`$.vaults[${index}]`],
								entityId: getAddress(vault),
								source: "eulerEarnV3",
								originalValue:
									error instanceof Error ? error.message : String(error),
							},
						],
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
	): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
		const limit = 200;
		let offset = 0;
		const addresses: Address[] = [];

		while (true) {
			const response = await this.queryV3EulerEarnList(
				this.config.endpoint,
				chainId,
				offset,
				limit,
			);
			const rows = response.data ?? [];
			const effectiveLimit = response.meta?.limit ?? limit;
			if (rows.length === 0) break;

			for (const row of rows) {
				addresses.push(getAddress(row.address));
			}

			if (effectiveLimit === 0 || rows.length < effectiveLimit) break;
			offset += rows.length;
			if (response.meta?.total !== undefined && offset >= response.meta.total)
				break;
		}

		return this.fetchVaults(chainId, addresses);
	}
}
