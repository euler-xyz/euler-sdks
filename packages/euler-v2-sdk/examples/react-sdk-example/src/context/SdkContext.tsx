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
  const [sdk, setSdk] = useState<EulerSDK | null>(null);
  const [chainId, setChainId] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    buildEulerSDK({
      rpcUrls: RPC_URLS,
      buildQuery: sdkBuildQuery,
      swapServiceConfig: {
        swapApiUrl: "http://localhost:3002",
      },
      rewardsServiceConfig: {
        fuulApiUrl: "https://api.fuul.xyz/api/v1",
        fuulTotalsUrl: "/api/fuul/totals",
        fuulClaimChecksUrl: "/api/fuul/claim-checks",
      },
      intrinsicApyServiceConfig: {
        stablewatchPoolsUrl: "/api/stablewatch-pools",
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
  }, []);

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
