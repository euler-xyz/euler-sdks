import { useQuery } from "@tanstack/react-query";
import { useSDK } from "../context/SdkContext.tsx";
import type { TokenListItem } from "euler-v2-sdk";

function useSdkReady() {
  const ctx = useSDK();
  return { ...ctx, enabled: !!ctx.sdk };
}

export function useTokenlist() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["tokenlist", chainId],
    queryFn: () => sdk!.tokenlistService.loadTokenlist(chainId),
    enabled,
    staleTime: Infinity,
  });
}

export function useTokenMap() {
  const { data: tokens } = useTokenlist();
  const map = new Map<string, TokenListItem>();
  if (tokens) {
    for (const t of tokens) {
      map.set(t.address.toLowerCase(), t);
    }
  }
  return map;
}
