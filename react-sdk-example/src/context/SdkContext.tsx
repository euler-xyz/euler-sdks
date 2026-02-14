import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { buildSDK, type EulerSDK } from "euler-v2-sdk";
import { sdkBuildQuery } from "../queries/sdkQueries.ts";

// Only chains supported by the SDK's ProviderService (viem chain definitions)
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BSC",
  130: "Unichain",
  146: "Sonic",
  239: "TAC",
  1923: "Swell",
  8453: "Base",
  9745: "Plasma",
  42161: "Arbitrum",
  43114: "Avalanche",
  60808: "Bob",
  80094: "Berachain",
};

const DEFAULT_CHAIN = 1;

// Free public RPCs - users should replace with their own for production
const RPC_URLS: Record<number, string> = {
  1: "https://eth.drpc.org",
  56: "https://bsc.drpc.org",
  130: "https://unichain.drpc.org",
  146: "https://sonic.drpc.org",
  239: "https://turin.rpc.tac.build",
  1923: "https://swell-mainnet.g.alchemy.com/public",
  8453: "https://base.drpc.org",
  9745: "https://rpc.plasma.cloud",
  42161: "https://arbitrum.drpc.org",
  43114: "https://avalanche.drpc.org",
  60808: "https://bob.drpc.org",
  80094: "https://berachain.drpc.org",
};

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

    buildSDK({ rpcUrls: RPC_URLS, buildQuery: sdkBuildQuery })
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
