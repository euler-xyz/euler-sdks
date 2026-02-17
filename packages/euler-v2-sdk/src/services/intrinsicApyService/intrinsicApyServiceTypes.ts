import type { Address } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IntrinsicApyInfo {
  /** APY as a percentage (e.g. 5.5 = 5.5%). */
  apy: number;
  /** Human-readable provider name (e.g. "Lido via DefiLlama", "Pendle"). */
  provider: string;
  /** Optional URL to the data source. */
  source?: string;
}

export type IntrinsicApySourceConfig =
  | { provider: "defillama"; address: string; chainId: number; poolId: string; useSpotApy?: boolean }
  | { provider: "pendle"; address: string; chainId: number; pendleMarket: string; crossChainSourceChainId?: number };

export interface IntrinsicApyServiceConfig {
  defillamaYieldsUrl?: string;
  pendleApiUrl?: string;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface IIntrinsicApyService {
  getIntrinsicApy(chainId: number, assetAddress: Address): Promise<IntrinsicApyInfo | undefined>;
  getChainIntrinsicApys(chainId: number): Promise<Map<string, IntrinsicApyInfo>>;
  populateIntrinsicApy(vaults: ERC4626Vault[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal: API response types
// ---------------------------------------------------------------------------

export interface DefiLlamaPool {
  pool?: string;
  project?: string;
  apy?: number | null;
  apyMean30d?: number | null;
}

export interface PendleMarketData {
  impliedApy?: number;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Internal: result type used during fetching
// ---------------------------------------------------------------------------

export interface IntrinsicApyResult {
  address: string;
  info: IntrinsicApyInfo;
}
