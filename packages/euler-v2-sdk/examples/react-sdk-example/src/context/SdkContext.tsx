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

const VAULT_TYPE_SUBGRAPH_URLS: Record<number, string> = {
  1: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-mainnet/latest/gn",
  56: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-bsc/latest/gn",
  130: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-unichain/latest/gn",
  146: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-sonic/latest/gn",
  239: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-tac/latest/gn",
  1923: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-swell/latest/gn",
  8453: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-base/latest/gn",
  9745: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-plasma/latest/gn",
  42161: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-arbitrum/latest/gn",
  43114: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-avalanche/latest/gn",
  60808: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-bob/latest/gn",
  80094: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-berachain/latest/gn",
};

export function SdkProvider({ children }: { children: ReactNode }) {
  const adapterMode = useSdkAdapterMode();
  const [sdk, setSdk] = useState<EulerSDK | null>(null);
  const [chainId, setChainId] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSdk(null);
    resetQueryProfile();

    buildEulerSDK({
      rpcUrls: RPC_URLS,
      v3ApiKey: import.meta.env.VITE_EULER_V3_API_KEY,
      buildQuery: sdkBuildQuery,
      accountServiceConfig: {
        adapter: adapterMode,
        v3AdapterConfig: {
          endpoint: "/api/euler-v3",
        },
      },
      eVaultServiceConfig: {
        adapter: adapterMode,
        v3AdapterConfig: {
          endpoint: "/api/euler-v3",
        },
      },
      eulerEarnServiceConfig: {
        adapter: adapterMode,
        v3AdapterConfig: {
          endpoint: "/api/euler-v3",
        },
      },
      vaultTypeAdapterConfig: {
        subgraphURLs: VAULT_TYPE_SUBGRAPH_URLS,
      },
      swapServiceConfig: {
        swapApiUrl: "http://localhost:3002",
      },
      rewardsServiceConfig: {
        brevisApiUrl: "/api/brevis-campaigns",
        brevisProofsApiUrl: "/api/brevis-proofs",
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
