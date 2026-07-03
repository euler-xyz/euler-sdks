import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  buildEulerSDK,
  createPythPlugin,
  type BuildSDKOptions,
  type EulerSDK,
} from "@eulerxyz/euler-v2-sdk";
import { queryClient, sdkBuildQuery } from "../queries/sdkQueries.ts";
import {
  clearFallbackLog,
  recordFallback,
} from "../queries/fallbackLogStore.ts";
import {
  useProxyV3Calls,
  useSdkAdapterMode,
  useSimulateV3Failure,
} from "../queries/queryOptionsStore.ts";
import { installV3FailureSimulator } from "../utils/v3FailureSimulator.ts";
import { resetQueryProfile } from "../queries/queryProfileStore.ts";
import {
  CHAIN_NAMES,
  DEFAULT_CHAIN,
  RPC_URLS,
} from "../config/chains.ts";
import { getV3ApiEndpoint } from "../config/endpoints.ts";

const SWAP_PROXY_ENDPOINT = "/api/swap";

interface SdkContextValue {
  sdk: EulerSDK | null;
  chainId: number;
  setChainId: (id: number) => void;
  chainNames: Record<number, string>;
  loading: boolean;
  error: string | null;
}

const SdkContext = createContext<SdkContextValue | null>(null);

installV3FailureSimulator();

export function SdkProvider({ children }: { children: ReactNode }) {
  const adapterMode = useSdkAdapterMode();
  const proxyV3Calls = useProxyV3Calls();
  const simulateV3Failure = useSimulateV3Failure();
  const [sdk, setSdk] = useState<EulerSDK | null>(null);
  const [chainId, setChainId] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queryClient.clear();
    clearFallbackLog();
    const v3ApiEndpoint = getV3ApiEndpoint(proxyV3Calls);
    const eVaultAdapter =
      adapterMode === "v3"
        ? "v3"
        : adapterMode === "onchain"
          ? "onchain"
          : "fallback";
    const rewardsAdapter =
      adapterMode === "v3"
        ? "v3"
        : adapterMode === "onchain"
          ? "direct"
          : "fallback";
    const vaultTypeAdapter =
      adapterMode === "v3"
        ? "v3"
        : adapterMode === "onchain"
          ? "subgraph"
          : "fallback";

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setSdk(null);
    });

    resetQueryProfile();

    const sdkConfig: BuildSDKOptions = {
      config: {
        v3ApiUrl: v3ApiEndpoint,
        v3ApiKey: import.meta.env.EULER_SDK_V3_API_KEY,
        rpcUrls: RPC_URLS,
        swapApiUrl: SWAP_PROXY_ENDPOINT,
        vaultTypeAdapter,
      },
      buildQuery: sdkBuildQuery,
      accountServiceConfig: { adapter: eVaultAdapter },
      eVaultServiceConfig: { adapter: eVaultAdapter },
      eulerEarnServiceConfig: { adapter: eVaultAdapter },
      rewardsServiceConfig: { adapter: rewardsAdapter },
      plugins: [createPythPlugin({ buildQuery: sdkBuildQuery })],
      onFallback: recordFallback,
    };

    buildEulerSDK(sdkConfig)
      .then((instance) => {
        if (!cancelled) {
          setSdk(instance);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adapterMode, proxyV3Calls, simulateV3Failure]);

  const handleSetChainId = useCallback((id: number) => {
    setChainId(id);
  }, []);

  return (
    <SdkContext.Provider
      value={{
        sdk,
        chainId,
        setChainId: handleSetChainId,
        chainNames: CHAIN_NAMES,
        loading,
        error,
      }}
    >
      {children}
    </SdkContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSDK() {
  const ctx = useContext(SdkContext);
  if (!ctx) throw new Error("useSDK must be used within SdkProvider");
  return ctx;
}
