import {
  isEulerEarn,
  isEVault,
  StandardEulerEarnPerspectives,
  StandardEVaultPerspectives,
  type VaultMetaPerspective,
} from "euler-v2-sdk";
import { CHAIN_NAMES } from "../config/chains";
import { formatAPY, formatBigInt, formatPriceUsd } from "../utils/format";
import { getServerSdk } from "./sdk";

const ALL_PERSPECTIVES: VaultMetaPerspective[] = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
];

export interface EVaultRow {
  address: string;
  name: string;
  assetSymbol: string;
  totalSupply: string;
  totalBorrows: string;
  supplyApy: string;
  borrowApy: string;
  marketPriceUsd: string;
  collateralCount: number;
}

export interface EulerEarnRow {
  address: string;
  name: string;
  assetSymbol: string;
  totalAssets: string;
  marketPriceUsd: string;
  strategyCount: number;
  performanceFee: string;
}

export interface VaultTableData {
  chainId: number;
  chainName: string;
  eVaults: EVaultRow[];
  earnVaults: EulerEarnRow[];
}

export async function getVaultTableData(
  chainId: number,
): Promise<VaultTableData> {
  const sdk = await getServerSdk();
  const allVaults = await sdk.vaultMetaService.fetchVerifiedVaults(
    chainId,
    ALL_PERSPECTIVES,
    {
      fetchMarketPrices: true,
    },
  );

  const eVaults = allVaults.filter(isEVault).map((vault) => ({
    address: vault.address,
    name: vault.shares.name || "-",
    assetSymbol: vault.asset.symbol,
    totalSupply: formatBigInt(vault.totalAssets, vault.asset.decimals),
    totalBorrows: formatBigInt(vault.totalBorrowed, vault.asset.decimals),
    supplyApy: formatAPY(vault.interestRates.supplyAPY),
    borrowApy: formatAPY(vault.interestRates.borrowAPY),
    marketPriceUsd: formatPriceUsd(vault.marketPriceUsd),
    collateralCount: vault.collaterals.length,
  }));

  const earnVaults = allVaults.filter(isEulerEarn).map((vault) => ({
    address: vault.address,
    name: vault.shares.name || "-",
    assetSymbol: vault.asset.symbol,
    totalAssets: formatBigInt(vault.totalAssets, vault.asset.decimals),
    marketPriceUsd: formatPriceUsd(vault.marketPriceUsd),
    strategyCount: vault.strategies.length,
    performanceFee: `${(vault.performanceFee * 100).toFixed(1)}%`,
  }));

  return {
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    eVaults,
    earnVaults,
  };
}
