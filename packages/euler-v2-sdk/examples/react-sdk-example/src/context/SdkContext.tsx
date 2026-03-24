import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { buildEulerSDK, createPythPlugin, type EulerSDK } from "euler-v2-sdk";
import { sdkBuildQuery } from "../queries/sdkQueries.ts";
import { useSdkAdapterMode } from "../queries/queryOptionsStore.ts";
import { resetQueryProfile } from "../queries/queryProfileStore.ts";
import {
  CHAIN_NAMES,
  DEFAULT_CHAIN,
  RPC_URLS,
} from "../config/chains.ts";


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
  const [sdk, setSdk] = useState<EulerSDK | null>(null);
  const [chainId, setChainId] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const useV3Adapters = adapterMode === "v3";
    setLoading(true);
    setError(null);
    setSdk(null);
    resetQueryProfile();

    buildEulerSDK({
      rpcUrls: RPC_URLS,
      v3ApiKey: import.meta.env.VITE_EULER_V3_API_KEY,
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
      vaultTypeAdapterConfig: useV3Adapters
        ? {
            endpoint: "https://v3staging.eul.dev",
          }
        : null,
      swapServiceConfig: {
        swapApiUrl: "http://localhost:3002",
      },
      plugins: [createPythPlugin({ buildQuery: sdkBuildQuery })],
    })
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
  }, [adapterMode]);

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

export function useSDK() {
  const ctx = useContext(SdkContext);
  if (!ctx) throw new Error("useSDK must be used within SdkProvider");
  return ctx;
}
