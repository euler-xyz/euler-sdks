import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";

function useSdkReady() {
  const ctx = useSDK();
  return { ...ctx, enabled: !!ctx.sdk };
}

export function useAccount(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["account", chainId, address],
    queryFn: () =>
      sdk!.accountService.fetchAccount(chainId, address as Address, {
        resolveVaults: true,
      }),
    enabled: enabled && !!address && address.length === 42,
    staleTime: 30_000,
  });
}
