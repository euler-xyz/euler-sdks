import type { Address } from "viem";

export interface ERC4626Data {
  shares: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;
}

export interface Token {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

export enum VaultType {
  EVault = 'EVault',
  EulerEarn = 'EulerEarn',
  SecuritizeCollateral = 'SecuritizeCollateral',
  Unknown = 'Unknown',
}