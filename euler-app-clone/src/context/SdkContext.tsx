import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { buildSDK, type EulerSDK } from "euler-v2-sdk";
import { sdkBuildQuery } from "../queries/queryClient.ts";
import { CHAINS } from "../utils/chains.ts";

const RPC_URLS: Record<number, string> = {};
const CHAIN_NAMES: Record<number, string> = {};
for (const [id, meta] of Object.entries(CHAINS)) {
  RPC_URLS[Number(id)] = meta.rpc;
  CHAIN_NAMES[Number(id)] = meta.name;
}

const STORAGE_KEY = "euler-chain-id";
const DEFAULT_CHAIN = 1;

function getInitialChain(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CHAIN_NAMES[Number(stored)]) return Number(stored);
  } catch {}
  return DEFAULT_CHAIN;
}

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
  const [chainId, setChainId] = useState(getInitialChain);
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
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {}
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
