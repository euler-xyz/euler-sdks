import { useQuery } from "@tanstack/react-query";
import { StandardEulerEarnPerspectives } from "euler-v2-sdk";
import type { Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";

function useSdkReady() {
  const ctx = useSDK();
  return { ...ctx, enabled: !!ctx.sdk };
}

export function useEulerEarnVaults() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["vaults", "eulerEarn", chainId],
    queryFn: () =>
      sdk!.eulerEarnService.fetchVerifiedVaults(chainId, [
        StandardEulerEarnPerspectives.GOVERNED,
      ]),
    enabled,
    staleTime: 30_000,
  });
}

export function useEarnVaultDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["earnVault", chainId, address],
    queryFn: () =>
      sdk!.eulerEarnService.fetchVault(chainId, address as Address),
    enabled: enabled && !!address,
    staleTime: 30_000,
  });
}
