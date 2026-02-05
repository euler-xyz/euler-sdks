import { Address } from "viem";

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

export interface BigFraction {
  numerator: bigint;
  denominator: bigint;
}

export enum VaultType {
  EVault = 'EVault',
  Earn = 'Earn',
  SecuritizeCollateral = 'SecuritizeCollateral',
  Unknown = 'Unknown',
}