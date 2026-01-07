import { Address } from "viem";
export interface Token {
  address: Address;
  name: string;
  symbol: string;
  decimals: bigint;
  logoURI?: string;
}

export interface BigFraction {
  numerator: bigint;
  denominator: bigint;
}
