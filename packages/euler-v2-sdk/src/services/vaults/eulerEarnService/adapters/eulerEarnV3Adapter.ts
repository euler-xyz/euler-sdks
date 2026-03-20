import { formatUnits, type Address, getAddress } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
import type { DataIssue, ServiceResult } from "../../../../utils/entityDiagnostics.js";
import { compressDataIssues, prefixDataIssues } from "../../../../utils/entityDiagnostics.js";
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
  inSupplyQueue?: boolean;
  supplyQueueIndex?: number;
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
  availableAssets?: string;
  strategies?: V3EulerEarnStrategy[];
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
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const parseBigIntField = (
  value: string | undefined,
  path: string,
  entityId: Address,
  errors: DataIssue[],
): bigint => {
  try {
    return BigInt(value ?? "0");
  } catch {
    errors.push({
      code: "DEFAULT_APPLIED",
      severity: "warning",
      message: `Failed to parse bigint at ${path}; defaulted to 0.`,
      paths: [path],
      entityId,
      source: "eulerEarnV3",
      originalValue: value,
      normalizedValue: "0",
    });
    return 0n;
  }
};

const parseTimestampField = (
  value: string | undefined,
  path: string,
  entityId: Address,
  errors: DataIssue[],
): number => {
  if (!value) {
    errors.push({
      code: "DEFAULT_APPLIED",
      severity: "warning",
      message: `Missing timestamp at ${path}; defaulted to 0.`,
      paths: [path],
      entityId,
      source: "eulerEarnV3",
      normalizedValue: 0,
    });
    return 0;
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);

  errors.push({
    code: "DEFAULT_APPLIED",
    severity: "warning",
    message: `Failed to parse timestamp at ${path}; defaulted to 0.`,
    paths: [path],
    entityId,
    source: "eulerEarnV3",
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
    source: "eulerEarnV3",
    originalValue: value,
    normalizedValue: ZERO_ADDRESS,
  });
  return ZERO_ADDRESS;
};

const parsePerformanceFee = (
  value: string | undefined,
  path: string,
  entityId: Address,
  errors: DataIssue[],
): number => {
  try {
    const parsed = Number(formatUnits(BigInt(value ?? "0"), 18));
    if (Number.isFinite(parsed)) return parsed;
  } catch {
    // handled below
  }

  errors.push({
    code: "DEFAULT_APPLIED",
    severity: "warning",
    message: `Failed to parse performance fee at ${path}; defaulted to 0.`,
    paths: [path],
    entityId,
    source: "eulerEarnV3",
    originalValue: value,
    normalizedValue: 0,
  });
  return 0;
};

function convertToken(token: V3Token, fallbackAddress: Address, fallbackName: string, fallbackSymbol: string): Token {
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
    owner: parseAddressField(detail.management?.owner, "$.governance.owner", entityId, errors),
    creator: parseAddressField(undefined, "$.governance.creator", entityId, errors),
    curator: parseAddressField(undefined, "$.governance.curator", entityId, errors),
    guardian: parseAddressField(detail.management?.guardian, "$.governance.guardian", entityId, errors),
    feeReceiver: parseAddressField(undefined, "$.governance.feeReceiver", entityId, errors),
    timelock: detail.management?.timelockSeconds ?? 0,
    pendingTimelock: 0,
    pendingTimelockValidAt: 0,
    pendingGuardian: ZERO_ADDRESS,
    pendingGuardianValidAt: 0,
  };
}

function buildSupplyQueue(strategies: V3EulerEarnStrategy[]): Address[] {
  return strategies
    .filter((strategy) => strategy.inSupplyQueue)
    .sort((a, b) => (a.supplyQueueIndex ?? Number.MAX_SAFE_INTEGER) - (b.supplyQueueIndex ?? Number.MAX_SAFE_INTEGER))
    .map((strategy) => getAddress(strategy.address));
}

function convertStrategies(
  detail: V3EulerEarnDetail,
  entityId: Address,
  errors: DataIssue[],
): EulerEarnStrategyInfo[] {
  const asset = convertToken(detail.asset, ZERO_ADDRESS, detail.asset.name ?? "Unknown Asset", detail.asset.symbol ?? "UNKNOWN");

  return (detail.strategies ?? []).map((strategy, index) => {
    const strategyAddress = getAddress(strategy.address);
    const allocatedAssets = parseBigIntField(
      strategy.allocatedAssets,
      `$.strategies[${index}].allocatedAssets`,
      strategyAddress,
      errors,
    );

    const allocationCap: EulerEarnAllocationCap = {
      current: 0n,
      pending: 0n,
      pendingValidAt: 0,
    };

    return {
      address: strategyAddress,
      vaultType: VaultType.EVault,
      allocatedAssets,
      availableAssets: 0n,
      allocationCap,
      removableAt: 0,
      shares: {
        address: strategyAddress,
        name: strategy.name ?? strategy.symbol ?? getAddress(strategy.address),
        symbol: strategy.symbol ?? "",
        decimals: strategy.decimals ?? detail.decimals,
      },
      asset,
      totalShares: 0n,
      totalAssets: allocatedAssets,
    };
  });
}

function convertEulerEarn(detail: V3EulerEarnDetail, errors: DataIssue[]): IEulerEarn {
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
    totalShares: parseBigIntField(detail.totalShares, "$.totalShares", entityId, errors),
    totalAssets: parseBigIntField(detail.totalAssets, "$.totalAssets", entityId, errors),
    lostAssets: 0n,
    availableAssets: parseBigIntField(detail.availableAssets, "$.availableAssets", entityId, errors),
    performanceFee: parsePerformanceFee(
      detail.management?.performanceFee,
      "$.performanceFee",
      entityId,
      errors,
    ),
    governance: convertGovernance(detail, entityId, errors),
    supplyQueue: buildSupplyQueue(detail.strategies ?? []),
    strategies: convertStrategies(detail, entityId, errors),
    timestamp: parseTimestampField(detail.snapshotTimestamp, "$.timestamp", entityId, errors),
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

  queryV3EulerEarnDetail = async (
    endpoint: string,
    chainId: number,
    vault: Address,
  ): Promise<V3Envelope<V3EulerEarnDetail>> => {
    const url = `${endpoint.replace(/\/+$/, "")}/v3/earn/vaults/${chainId}/${vault}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error(`eulerEarnV3 detail ${response.status} ${response.statusText}`);
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
    const url = new URL(`${endpoint.replace(/\/+$/, "")}/v3/earn/vaults`);
    url.searchParams.set("chainId", String(chainId));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error(`eulerEarnV3 list ${response.status} ${response.statusText}`);
    return response.json() as Promise<V3ListEnvelope<V3EulerEarnListRow>>;
  };

  setQueryV3EulerEarnList(fn: typeof this.queryV3EulerEarnList): void {
    this.queryV3EulerEarnList = fn;
  }

  async fetchVaults(chainId: number, vaults: Address[]): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
    const results: Array<{ result: IEulerEarn | undefined; errors: DataIssue[] }> = await Promise.all(
      vaults.map(async (vault, index) => {
        const errors: DataIssue[] = [];
        try {
          const response = await this.queryV3EulerEarnDetail(this.config.endpoint, chainId, vault);
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
            errors: prefixDataIssues(errors, `$.vaults[${index}]`).map((issue) => ({
              ...issue,
              entityId: issue.entityId ?? getAddress(vault),
            })),
          };
        } catch (error) {
          return {
            result: undefined,
            errors: [{
              code: "SOURCE_UNAVAILABLE",
              severity: "warning",
              message: `Failed to fetch EulerEarn vault ${getAddress(vault)}.`,
              paths: [`$.vaults[${index}]`],
              entityId: getAddress(vault),
              source: "eulerEarnV3",
              originalValue: error instanceof Error ? error.message : String(error),
            }],
          };
        }
      }),
    );

    return {
      result: results.map((entry) => entry.result),
      errors: compressDataIssues(results.flatMap((entry) => entry.errors)),
    };
  }

  async fetchVerifiedVaultsAddresses(_chainId: number, _perspectives: Address[]): Promise<Address[]> {
    throw unsupportedError;
  }

  async fetchAllVaults(chainId: number): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
    const limit = 200;
    let offset = 0;
    const addresses: Address[] = [];

    while (true) {
      const response = await this.queryV3EulerEarnList(this.config.endpoint, chainId, offset, limit);
      const rows = response.data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        addresses.push(getAddress(row.address));
      }

      if (rows.length < limit) break;
      offset += rows.length;
    }

    return this.fetchVaults(chainId, addresses);
  }
}
