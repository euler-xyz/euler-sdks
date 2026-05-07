import { type Address, getAddress } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import {
	compressDataIssues,
	dataIssueLocation,
	type DataIssue,
	type DataIssueOwnerRef,
	type ServiceResult,
	vaultDiagnosticOwner,
	vaultStrategyDiagnosticOwner,
} from "../../../../utils/entityDiagnostics.js";
import {
	parseAddressField,
	parseBigIntField,
	parseNumberField,
	parsePerformanceFee,
	parseStringField,
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
	vaultType?: string;
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

function normalizeEulerEarnApy(value: number): number {
	return value;
}

function getWithdrawQueueStrategies(
	strategies: V3EulerEarnStrategy[],
): V3EulerEarnStrategy[] {
	return [...strategies]
		.filter((strategy) => strategy.inWithdrawQueue)
		.sort(
			(a, b) =>
				(a.withdrawQueueIndex ?? Number.MAX_SAFE_INTEGER) -
				(b.withdrawQueueIndex ?? Number.MAX_SAFE_INTEGER),
		);
}

function convertToken(
	token: V3Token,
	path: string,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
	fallbackAddress: Address,
	fallbackName: string,
	fallbackSymbol: string,
): Token {
	return {
		address: parseAddressField(token.address, {
			path: `${path}.address`,
			owner,
			errors,
			source: "eulerEarnV3",
			fallback: fallbackAddress,
			fallbackLabel: "fallback token address",
		}),
		name: parseStringField(token.name, {
			path: `${path}.name`,
			owner,
			errors,
			source: "eulerEarnV3",
			fallback: fallbackName,
		}),
		symbol: parseStringField(token.symbol, {
			path: `${path}.symbol`,
			owner,
			errors,
			source: "eulerEarnV3",
			fallback: fallbackSymbol,
		}),
		decimals: parseNumberField(token.decimals, {
			path: `${path}.decimals`,
			owner,
			errors,
			source: "eulerEarnV3",
		}),
	};
}

function convertGovernance(
	detail: V3EulerEarnDetail,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): EulerEarnGovernance {
	return {
		owner: parseAddressField(
			detail.governance?.owner ?? detail.management?.owner,
			{ path: "$.governance.owner", owner, errors, source: "eulerEarnV3" },
		),
		creator: parseAddressField(detail.governance?.creator, {
			path: "$.governance.creator",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		curator: parseAddressField(detail.governance?.curator, {
			path: "$.governance.curator",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		guardian: parseAddressField(
			detail.governance?.guardian ?? detail.management?.guardian,
			{ path: "$.governance.guardian", owner, errors, source: "eulerEarnV3" },
		),
		feeReceiver: parseAddressField(detail.governance?.feeReceiver, {
			path: "$.governance.feeReceiver",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		timelock: parseNumberField(
			detail.governance?.timelock ?? detail.management?.timelockSeconds,
			{ path: "$.governance.timelock", owner, errors, source: "eulerEarnV3" },
		),
		pendingTimelock: parseNumberField(detail.governance?.pendingTimelock, {
			path: "$.governance.pendingTimelock",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		pendingTimelockValidAt: parseNumberField(
			detail.governance?.pendingTimelockValidAt,
			{
				path: "$.governance.pendingTimelockValidAt",
				owner,
				errors,
				source: "eulerEarnV3",
			},
		),
		pendingGuardian: parseAddressField(detail.governance?.pendingGuardian, {
			path: "$.governance.pendingGuardian",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		pendingGuardianValidAt: parseNumberField(
			detail.governance?.pendingGuardianValidAt,
			{
				path: "$.governance.pendingGuardianValidAt",
				owner,
				errors,
				source: "eulerEarnV3",
			},
		),
	};
}

function buildSupplyQueue(
	strategies: V3EulerEarnStrategy[],
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): Address[] {
	return strategies
		.filter((strategy) => strategy.inSupplyQueue)
		.sort(
			(a, b) =>
				(a.supplyQueueIndex ?? Number.MAX_SAFE_INTEGER) -
				(b.supplyQueueIndex ?? Number.MAX_SAFE_INTEGER),
		)
		.map((strategy, index) =>
			parseAddressField(strategy.address, {
				path: `$.supplyQueue[${index}]`,
				owner,
				errors,
				source: "eulerEarnV3",
			}),
		);
}

function buildWithdrawQueue(
	strategies: V3EulerEarnStrategy[],
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): Address[] {
	return getWithdrawQueueStrategies(strategies).map((strategy, index) =>
		parseAddressField(strategy.address, {
			path: `$.withdrawQueue[${index}]`,
			owner,
			errors,
			source: "eulerEarnV3",
		}),
	);
}

function convertStrategies(
	detail: V3EulerEarnDetail,
	vaultAddress: Address,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
): EulerEarnStrategyInfo[] {
	function normalizeStrategyVaultType(
		value: string | undefined,
		strategyAddress: Address,
	): VaultType {
		switch (value?.toLowerCase()) {
			case "evault":
			case "evk":
				return VaultType.EVault;
			case "eulerearn":
			case "earn":
				return VaultType.EulerEarn;
			case "securitizecollateral":
			case "securitize":
				return VaultType.SecuritizeCollateral;
			case "unknown":
			case undefined:
				return VaultType.Unknown;
			default:
				errors.push({
					code: "DEFAULT_APPLIED",
					severity: "warning",
					message: `Unsupported strategy vaultType '${value}'; defaulted to Unknown.`,
					locations: [
						dataIssueLocation(
							vaultStrategyDiagnosticOwner(
								detail.chainId,
								vaultAddress,
								strategyAddress,
							),
							"$.vaultType",
						),
					],
					source: "eulerEarnV3",
					originalValue: value,
					normalizedValue: VaultType.Unknown,
				});
				return VaultType.Unknown;
		}
	}

	return getWithdrawQueueStrategies(detail.strategies ?? []).map(
		(strategy, index) => {
			const strategyAddress = parseAddressField(strategy.address, {
				path: `$.strategies[${index}].address`,
				owner,
				errors,
				source: "eulerEarnV3",
			});
			const strategyOwner = vaultStrategyDiagnosticOwner(
				detail.chainId,
				vaultAddress,
				strategyAddress,
			);
			const allocatedAssets = parseBigIntField(
				strategy.allocatedAssets ?? "0",
				{
					path: "$.allocatedAssets",
					owner: strategyOwner,
					errors,
					source: "eulerEarnV3",
				},
			);
			const availableAssets = parseBigIntField(
				strategy.availableAssets ?? "0",
				{
					path: "$.availableAssets",
					owner: strategyOwner,
					errors,
					source: "eulerEarnV3",
				},
			);

			const allocationCap: EulerEarnAllocationCap = {
				current: parseBigIntField(strategy.allocationCap?.current ?? "0", {
					path: "$.allocationCap.current",
					owner: strategyOwner,
					errors,
					source: "eulerEarnV3",
				}),
				pending: parseBigIntField(strategy.allocationCap?.pending ?? "0", {
					path: "$.allocationCap.pending",
					owner: strategyOwner,
					errors,
					source: "eulerEarnV3",
				}),
				pendingValidAt: parseNumberField(
					strategy.allocationCap?.pendingValidAt,
					{
						path: "$.allocationCap.pendingValidAt",
						owner: strategyOwner,
						errors,
						source: "eulerEarnV3",
					},
				),
			};

			return {
				address: strategyAddress,
				vaultType: normalizeStrategyVaultType(
					strategy.vaultType,
					strategyAddress,
				),
				allocatedAssets,
				availableAssets,
				allocationCap,
				removableAt: parseNumberField(strategy.removableAt, {
					path: "$.removableAt",
					owner: strategyOwner,
					errors,
					source: "eulerEarnV3",
				}),
			};
		},
	);
}

function convertEulerEarn(
	detail: V3EulerEarnDetail,
	errors: DataIssue[],
): IEulerEarn {
	const vaultAddress = parseAddressField(detail.address, {
		path: "$.address",
		owner: vaultDiagnosticOwner(detail.chainId, ZERO_ADDRESS),
		errors,
		source: "eulerEarnV3",
	});
	const owner = vaultDiagnosticOwner(detail.chainId, vaultAddress);

	return {
		type: VaultType.EulerEarn,
		chainId: detail.chainId,
		address: vaultAddress,
		isBorrowable: false,
		shares: {
			address: vaultAddress,
			name: parseStringField(detail.name, {
				path: "$.shares.name",
				owner,
				errors,
				source: "eulerEarnV3",
			}),
			symbol: parseStringField(detail.symbol, {
				path: "$.shares.symbol",
				owner,
				errors,
				source: "eulerEarnV3",
			}),
			decimals: parseNumberField(detail.decimals, {
				path: "$.shares.decimals",
				owner,
				errors,
				source: "eulerEarnV3",
			}),
		},
		asset: convertToken(
			detail.asset,
			"$.asset",
			owner,
			errors,
			ZERO_ADDRESS,
			detail.asset.name ?? "Unknown Asset",
			detail.asset.symbol ?? "UNKNOWN",
		),
		supplyApy1h: normalizeEulerEarnApy(
			parseNumberField(detail.supplyApy, {
				path: "$.supplyApy1h",
				owner,
				errors,
				source: "eulerEarnV3",
			}),
		),
		totalShares: parseBigIntField(detail.totalShares ?? "0", {
			path: "$.totalShares",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		totalAssets: parseBigIntField(detail.totalAssets ?? "0", {
			path: "$.totalAssets",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		lostAssets: parseBigIntField(detail.lostAssets ?? "0", {
			path: "$.lostAssets",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		availableAssets: parseBigIntField(detail.availableAssets ?? "0", {
			path: "$.availableAssets",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		performanceFee: parsePerformanceFee(detail.management?.performanceFee, {
			path: "$.performanceFee",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
		governance: convertGovernance(detail, owner, errors),
		supplyQueue: buildSupplyQueue(detail.strategies ?? [], owner, errors),
		withdrawQueue: buildWithdrawQueue(detail.strategies ?? [], owner, errors),
		strategies: convertStrategies(detail, vaultAddress, owner, errors),
		timestamp: parseTimestampField(detail.snapshotTimestamp, {
			path: "$.timestamp",
			owner,
			errors,
			source: "eulerEarnV3",
		}),
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
			vaults.map(async (vault) => {
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
							locations: [
								dataIssueLocation(
									vaultDiagnosticOwner(chainId, getAddress(vault)),
								),
							],
							source: "eulerEarnV3",
						});
						return { result: undefined, errors };
					}

					const converted = convertEulerEarn(detail, errors);
					return {
						result: converted,
						errors,
					};
				} catch (error) {
					return {
						result: undefined,
						errors: [
							{
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message: `Failed to fetch EulerEarn vault ${getAddress(vault)}.`,
								locations: [
									dataIssueLocation(
										vaultDiagnosticOwner(chainId, getAddress(vault)),
									),
								],
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
