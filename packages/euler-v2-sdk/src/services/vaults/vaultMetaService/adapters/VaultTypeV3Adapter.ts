import { type Address, getAddress } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";
import { createCallBundler } from "../../../../utils/callBundler.js";
import { VaultType } from "../../../../utils/types.js";
import type {
  IVaultTypeAdapter,
  VaultFactoryResult,
  VaultResolvedTypeResult,
} from "./IVaultTypeAdapter.js";

type V3ResolveRequest = {
  chainId: number;
  addresses: string[];
};

type V3ResolveRow = {
  chainId: number;
  address: string;
  found: boolean;
  vaultType?: string | null;
  resource?: string | null;
};

type V3ResolveResponse = {
  data?: V3ResolveRow[];
};

export interface VaultTypeV3AdapterConfig {
  /** Base HTTP endpoint, for example `https://v3staging.eul.dev`. */
  endpoint: string;
  /** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
  apiKey?: string;
  /**
   * Optional map from V3 `vaultType` values to SDK vault type strings.
   * Defaults include `earn -> EulerEarn`, `evk -> EVault`, and `securitize -> SecuritizeCollateral`.
   */
  typeMap?: Record<string, string>;
}

const defaultTypeMap: Record<string, string> = {
  earn: VaultType.EulerEarn,
  eulerEarn: VaultType.EulerEarn,
  evault: VaultType.EVault,
  evk: VaultType.EVault,
  vault: VaultType.EVault,
  securitize: VaultType.SecuritizeCollateral,
  securitizeCollateral: VaultType.SecuritizeCollateral,
};

function normalizeTypeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export class VaultTypeV3Adapter implements IVaultTypeAdapter {
  constructor(
    private config: VaultTypeV3AdapterConfig,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  setConfig(config: VaultTypeV3AdapterConfig): void {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
    };
  }

  private resolveSdkVaultType(row: V3ResolveRow): string | undefined {
    const configuredTypeMap = Object.fromEntries(
      Object.entries(this.config.typeMap ?? {}).map(([key, value]) => [normalizeTypeKey(key), value]),
    );
    const mergedTypeMap = {
      ...defaultTypeMap,
      ...configuredTypeMap,
    };

    if (row.vaultType) {
      const mapped = mergedTypeMap[normalizeTypeKey(row.vaultType)];
      if (mapped) return mapped;
    }

    const resource = row.resource?.toLowerCase() ?? "";
    if (resource.startsWith("/v3/earn/vaults/")) return VaultType.EulerEarn;
    if (resource.startsWith("/v3/evk/vaults/")) return VaultType.EVault;
    return undefined;
  }

  queryV3VaultResolve = createCallBundler(
    async (keys: { address: Address; chainId: number }[]): Promise<(VaultResolvedTypeResult | undefined)[]> => {
      const byChain = new Map<number, Address[]>();
      for (const key of keys) {
        const addresses = byChain.get(key.chainId) ?? [];
        addresses.push(key.address);
        byChain.set(key.chainId, addresses);
      }

      const chainResults = new Map<number, Map<string, string>>();

      for (const [chainId, addresses] of byChain) {
        const uniqueAddresses = [...new Set(addresses.map((address) => getAddress(address)))];
        const requestBody: V3ResolveRequest = {
          chainId,
          addresses: uniqueAddresses,
        };
        const url = `${this.config.endpoint.replace(/\/+$/, "")}/v3/evk/vaults/resolve`;
        const response = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          throw new Error(`vaultTypeV3 resolve ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as V3ResolveResponse;
        const resolved = new Map<string, string>();
        for (const row of json.data ?? []) {
          if (!row.found) continue;
          const sdkVaultType = this.resolveSdkVaultType(row);
          if (!sdkVaultType) continue;
          resolved.set(getAddress(row.address).toLowerCase(), sdkVaultType);
        }
        chainResults.set(chainId, resolved);
      }

      return keys.map((key) => {
        const type = chainResults.get(key.chainId)?.get(getAddress(key.address).toLowerCase());
        return type ? { id: getAddress(key.address), type } : undefined;
      });
    },
  );

  setQueryV3VaultResolve(fn: typeof this.queryV3VaultResolve): void {
    this.queryV3VaultResolve = fn;
  }

  async fetchVaultTypes(
    chainId: number,
    vaultAddresses: Address[],
  ): Promise<VaultResolvedTypeResult[]> {
    if (vaultAddresses.length === 0) return [];

    const results = await Promise.all(
      vaultAddresses.map((address) =>
        this.queryV3VaultResolve({ address, chainId }),
      ),
    );

    return results.filter((result): result is VaultResolvedTypeResult => result != null);
  }

  async fetchVaultFactories(
    _chainId: number,
    _vaultAddresses: Address[],
  ): Promise<VaultFactoryResult[]> {
    return [];
  }
}
