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
  defaultVaultTypeSubgraphAdapterConfig,
  type BuildSDKOptions,
  type EulerSDK,
} from "@eulerxyz/euler-v2-sdk";
import { sdkBuildQuery } from "../queries/sdkQueries.ts";
import {
  useProxyV3Calls,
  useSdkAdapterMode,
} from "../queries/queryOptionsStore.ts";
import { resetQueryProfile } from "../queries/queryProfileStore.ts";
import {
  CHAIN_NAMES,
  DEFAULT_CHAIN,
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

export function SdkProvider({ children }: { children: ReactNode }) {
  const adapterMode = useSdkAdapterMode();
  const proxyV3Calls = useProxyV3Calls();
  const [sdk, setSdk] = useState<EulerSDK | null>(null);
  const [chainId, setChainId] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const useV3Adapters = adapterMode === "v3";
    const v3ApiEndpoint = getV3ApiEndpoint(proxyV3Calls);

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
        swapApiUrl: SWAP_PROXY_ENDPOINT,
      },
      buildQuery: sdkBuildQuery,
      accountServiceConfig: {
        adapter: useV3Adapters ? "v3" : "onchain",
      },
      eVaultServiceConfig: {
        adapter: useV3Adapters ? "v3" : "onchain",
      },
      eulerEarnServiceConfig: {
        adapter: useV3Adapters ? "v3" : "onchain",
      },
      rewardsServiceConfig: {
        adapter: useV3Adapters ? "v3" : "direct",
      },
      vaultTypeAdapterConfig: useV3Adapters ? undefined : defaultVaultTypeSubgraphAdapterConfig,
      plugins: [createPythPlugin({ buildQuery: sdkBuildQuery })],
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
  }, [adapterMode, proxyV3Calls]);

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
