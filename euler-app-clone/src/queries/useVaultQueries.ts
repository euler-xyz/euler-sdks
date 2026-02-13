import { useQuery } from "@tanstack/react-query";
import {
  StandardEVaultPerspectives,
} from "euler-v2-sdk";
import type { Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";
import { useMemo } from "react";

function useSdkReady() {
  const ctx = useSDK();
  return { ...ctx, enabled: !!ctx.sdk };
}

export function useGovernedVaults() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["vaults", "governed", chainId],
    queryFn: () =>
      sdk!.eVaultService.fetchVerifiedVaults(chainId, [
        StandardEVaultPerspectives.GOVERNED,
      ]),
    enabled,
    staleTime: 30_000,
  });
}

export function useEscrowVaults() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["vaults", "escrow", chainId],
    queryFn: () =>
      sdk!.eVaultService.fetchVerifiedVaults(chainId, [
        StandardEVaultPerspectives.ESCROW,
      ]),
    enabled,
    staleTime: 30_000,
  });
}

export function useAllEVaults() {
  const governed = useGovernedVaults();
  const escrow = useEscrowVaults();

  const data = useMemo(() => {
    const all = [...(governed.data ?? []), ...(escrow.data ?? [])];
    const seen = new Set<string>();
    return all.filter((v) => {
      const key = v.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [governed.data, escrow.data]);

  return {
    data,
    isLoading: governed.isLoading || escrow.isLoading,
    error: governed.error || escrow.error,
  };
}

export function useVaultDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["vault", chainId, address],
    queryFn: () =>
      sdk!.eVaultService.fetchVault(chainId, address as Address, {
        resolveCollaterals: true,
        fetchMarketPrices: true,
      }),
    enabled: enabled && !!address,
    staleTime: 30_000,
  });
}
