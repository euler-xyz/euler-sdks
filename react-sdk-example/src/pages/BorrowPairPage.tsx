import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  StandardEVaultPerspectives,
  getSubAccountAddress,
  getMaxMultiplier,
  getMaxRoe,
  type SimulationInsufficientRequirement,
  type EVault,
  type SwapQuote,
} from "euler-v2-sdk";
import { formatUnits, getAddress, parseUnits, type Address } from "viem";
import {
  useAccount as useWagmiAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { useSDK } from "../context/SdkContext.tsx";
import {
  queryClient,
  unwrapServiceResult,
  useAccount as useSdkAccount,
  useVaultDetail,
  useWalletBalance,
} from "../queries/sdkQueries.ts";
import {
  formatAPY,
  formatBigInt,
  formatPercent,
  formatPriceUsd,
  formatWad,
} from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";
import { RoeCell } from "../components/RoeCell.tsx";
import { executePlanWithProgress, type PlanProgress } from "../utils/txExecutor.ts";

type FormTab = "borrow" | "multiply";
type QuoteCard = { provider: string; quote: SwapQuote };
type DiffKind = "added" | "removed" | "changed";
type AccountDiffEntry = {
  path: string;
  before: string;
  after: string;
  kind: DiffKind;
};
type TokenMeta = { symbol: string; decimals: number };
type FailedBatchItem = {
  index: number;
  item: {
    functionName: string;
    targetContract: Address;
    onBehalfOfAccount: Address;
    args: Record<string, unknown>;
  };
  error: `0x${string}`;
  decodedError: Array<{ signature: string; params: unknown[] }>;
};

function formatFailedBatchItems(items: FailedBatchItem[]): string {
  const lines = ["Simulation failed:"];
  for (const failed of items) {
    const decoded = failed.decodedError
      .map((entry) => {
        if (entry.signature === "Error(string)" && entry.params.length > 0) {
          return String(entry.params[0]);
        }
        return entry.signature;
      })
      .join(" ; ");
    const details = decoded || failed.error;
    lines.push(
      `- Batch ${failed.index + 1} (${failed.item.functionName}): ${details}`
    );
  }
  return lines.join("\n");
}

function pct(value: number | undefined): string {
  if (value === undefined) return "-";
  return formatPercent(value);
}

function calcVaultSupplyApy(vault: EVault): number {
  return (
    Number(vault.interestRates.supplyAPY) +
    (vault.rewards?.totalRewardsApr ?? 0) +
    (vault.intrinsicApy ? vault.intrinsicApy.apy / 100 : 0)
  );
}

function calcVaultBorrowApy(vault: EVault): number {
  return (
    Number(vault.interestRates.borrowAPY) +
    (vault.intrinsicApy ? vault.intrinsicApy.apy / 100 : 0)
  );
}

function getMarketName(vault: EVault | undefined): string | undefined {
  if (!vault?.eulerLabel) return undefined;
  return vault.eulerLabel.products[0]?.name ?? vault.eulerLabel.vault.name;
}

function formatPairPrice(
  collateralVault: EVault | undefined,
  debtVault: EVault | undefined
): { primary: string; secondary: string } {
  if (!collateralVault || !debtVault) return { primary: "-", secondary: "-" };
  const collateralUsd = collateralVault.marketPriceUsd
    ? Number(collateralVault.marketPriceUsd) / 1e18
    : 0;
  const debtUsd = debtVault.marketPriceUsd
    ? Number(debtVault.marketPriceUsd) / 1e18
    : 0;
  if (!collateralUsd || !debtUsd) return { primary: "-", secondary: "-" };
  const ratio = collateralUsd / debtUsd;
  const inverse = debtUsd / collateralUsd;
  return {
    primary: `1 ${collateralVault.asset.symbol} = ${ratio.toFixed(4)} ${debtVault.asset.symbol}`,
    secondary: `1 ${debtVault.asset.symbol} = ${inverse.toFixed(4)} ${collateralVault.asset.symbol}`,
  };
}

function pickBestQuote(quotes: SwapQuote[]): SwapQuote | null {
  if (!quotes.length) return null;
  return quotes.reduce((best, next) =>
    BigInt(next.amountOut) > BigInt(best.amountOut) ? next : best
  );
}

function sortQuoteCards(cards: QuoteCard[]): QuoteCard[] {
  return [...cards].sort((a, b) => {
    const amountA = BigInt(a.quote.amountOut);
    const amountB = BigInt(b.quote.amountOut);
    if (amountA === amountB) return 0;
    return amountA > amountB ? -1 : 1;
  });
}

function isRevertError(error: unknown): boolean {
  const message = String(error ?? "");
  return message.toLowerCase().includes("revert");
}

function toComparable(value: unknown): unknown {
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (Array.isArray(value)) return value.map(toComparable);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "function") continue;
    out[key] = toComparable(v);
  }
  return out;
}

function formatDiffValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collectDiffs(
  a: unknown,
  b: unknown,
  path = "account",
  out: AccountDiffEntry[] = []
): AccountDiffEntry[] {
  if (a === b) return out;

  // Ignore sub-accounts that existed in current account but are absent in simulated account.
  if (path.startsWith("account.subAccounts.") && a !== undefined && b === undefined) {
    return out;
  }

  const aIsObj = a && typeof a === "object";
  const bIsObj = b && typeof b === "object";
  if (!aIsObj || !bIsObj) {
    const kind: DiffKind = a === undefined ? "added" : b === undefined ? "removed" : "changed";
    out.push({
      path,
      before: formatDiffValue(a),
      after: formatDiffValue(b),
      kind,
    });
    return out;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    const aArr = Array.isArray(a) ? a : [];
    const bArr = Array.isArray(b) ? b : [];
    const max = Math.max(aArr.length, bArr.length);
    for (let i = 0; i < max; i += 1) {
      collectDiffs(aArr[i], bArr[i], `${path}[${i}]`, out);
    }
    return out;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(aObj), ...Object.keys(bObj)])).sort();
  for (const key of keys) {
    collectDiffs(aObj[key], bObj[key], `${path}.${key}`, out);
  }
  return out;
}

function formatInsufficientWalletAssetsMessage(
  requirements: SimulationInsufficientRequirement[],
  tokenMetaByAddress: Map<Address, TokenMeta>
): string {
  const parts = requirements.map((req) => {
    const token = getAddress(req.token);
    const tokenMeta = tokenMetaByAddress.get(token);
    if (tokenMeta) {
      return `${formatUnits(req.amount, tokenMeta.decimals)} ${tokenMeta.symbol}`;
    }
    return `${req.amount.toString()} units of ${token}`;
  });
  return `You don't have enough tokens in your wallet for that operation.. Missing: ${parts.join(", ")}.`;
}

export function BorrowPairPage() {
  const { chainId: chainIdParam, collateral, debt } = useParams<{
    chainId: string;
    collateral: string;
    debt: string;
  }>();
  const { sdk, loading: sdkLoading, error: sdkError, setChainId } = useSDK();
  const chainId = Number(chainIdParam);

  useEffect(() => {
    if (!Number.isNaN(chainId)) setChainId(chainId);
  }, [chainId, setChainId]);

  const { data: collateralVault, isLoading: collateralLoading } = useVaultDetail(
    chainId,
    collateral
  );
  const { data: debtVault, isLoading: debtLoading } = useVaultDetail(chainId, debt);
  const { address: walletAddress, isConnected } = useWagmiAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const isChainMismatch = isConnected && walletChainId !== chainId;

  const { data: accountData } = useSdkAccount(chainId, walletAddress);
  const { data: walletBalance } = useWalletBalance(
    chainId,
    walletAddress,
    collateralVault?.asset.address
  );
  const targetSubAccount = useMemo(() => {
    if (!walletAddress) return undefined;
    
    const owner = getAddress(walletAddress as Address);
    const account = accountData;
    if (!account) return owner;
    
    for (let id = 0; id <= 255; id += 1) {
      const subAccount = getSubAccountAddress(owner, id);
      const current = account.getSubAccount(subAccount);
      if (!current || current.positions.length === 0) {
        return subAccount;
      }
    }
    
    return owner;
  }, [walletAddress, accountData]);

  const [tab, setTab] = useState<FormTab>("borrow");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [multiplyAmount, setMultiplyAmount] = useState("");
  const [multiplyTarget, setMultiplyTarget] = useState<number | null>(null);
  const [quoteCards, setQuoteCards] = useState<QuoteCard[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providersCount, setProvidersCount] = useState(0);
  const [providersFetchedCount, setProvidersFetchedCount] = useState(0);
  const quoteCardsRef = useRef<QuoteCard[]>([]);
  const quoteRequestId = useRef(0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteFailure, setQuoteFailure] = useState<{ provider: string; message: string } | null>(
    null
  );
  const [failedProviders, setFailedProviders] = useState<string[]>([]);
  const [quoteRefreshToken, setQuoteRefreshToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [simulatedAccountPreview, setSimulatedAccountPreview] = useState<any | null>(null);
  const [showAccountDiff, setShowAccountDiff] = useState(false);
  const [previewSimulationError, setPreviewSimulationError] = useState<string | null>(null);
  const [previewInsufficientWalletAssets, setPreviewInsufficientWalletAssets] = useState<string | null>(null);

  const collateralConfig = useMemo(() => {
    if (!debtVault || !collateralVault) return undefined;
    return debtVault.collaterals.find(
      (c) => c.address.toLowerCase() === collateralVault.address.toLowerCase()
    );
  }, [debtVault, collateralVault]);

  const maxMultiplier = useMemo(() => {
    const ltv = collateralConfig?.borrowLTV;
    if (!ltv || ltv <= 0 || ltv >= 1) return undefined;
    return getMaxMultiplier(ltv, 0);
  }, [collateralConfig?.borrowLTV]);

  const maxRoe = useMemo(() => {
    if (!collateralVault || !debtVault || maxMultiplier === undefined) return undefined;
    const supplyApy = calcVaultSupplyApy(collateralVault);
    const borrowApy = calcVaultBorrowApy(debtVault);
    return getMaxRoe(maxMultiplier, supplyApy, borrowApy);
  }, [collateralVault, debtVault, maxMultiplier]);

  const selectedQuote = useMemo(() => {
    if (!selectedProvider) return null;
    return quoteCards.find((card) => card.provider === selectedProvider)?.quote ?? null;
  }, [quoteCards, selectedProvider]);

  const tokenMetaByAddress = useMemo(() => {
    const map = new Map<Address, TokenMeta>();
    if (collateralVault) {
      map.set(getAddress(collateralVault.asset.address), {
        symbol: collateralVault.asset.symbol,
        decimals: collateralVault.asset.decimals,
      });
    }
    if (debtVault) {
      map.set(getAddress(debtVault.asset.address), {
        symbol: debtVault.asset.symbol,
        decimals: debtVault.asset.decimals,
      });
    }
    if (selectedQuote) {
      map.set(getAddress(selectedQuote.tokenIn.address as Address), {
        symbol: selectedQuote.tokenIn.symbol,
        decimals: selectedQuote.tokenIn.decimals,
      });
      map.set(getAddress(selectedQuote.tokenOut.address as Address), {
        symbol: selectedQuote.tokenOut.symbol,
        decimals: selectedQuote.tokenOut.decimals,
      });
    }
    return map;
  }, [collateralVault, debtVault, selectedQuote]);

  const quoteProgress = useMemo(() => {
    if (!providersCount) return 0;
    return Math.min(providersFetchedCount / providersCount, 1);
  }, [providersCount, providersFetchedCount]);

  const resetQuotes = useCallback(() => {
    quoteCardsRef.current = [];
    setQuoteCards([]);
    setSelectedProvider(null);
    setProvidersCount(0);
    setProvidersFetchedCount(0);
    setQuoteLoading(false);
    setQuoteError(null);
    setQuoteFailure(null);
    setFailedProviders([]);
  }, []);

  const refreshQuotes = useCallback(() => {
    setQuoteFailure(null);
    setQuoteRefreshToken((prev) => prev + 1);
  }, []);

  const upsertQuote = useCallback((provider: string, quote: SwapQuote) => {
    setQuoteCards((prev) => {
      const next = sortQuoteCards([
        ...prev.filter((card) => card.provider !== provider),
        { provider, quote },
      ]);
      quoteCardsRef.current = next;
      return next;
    });
  }, []);

  const pairPrice = formatPairPrice(collateralVault, debtVault);

  const collateralUsdPrice =
    collateralVault?.marketPriceUsd !== undefined
      ? Number(collateralVault.marketPriceUsd) / 1e18
      : undefined;
  const debtUsdPrice =
    debtVault?.marketPriceUsd !== undefined
      ? Number(debtVault.marketPriceUsd) / 1e18
      : undefined;

  const previewSubAccount = useMemo(() => {
    if (!simulatedAccountPreview || !targetSubAccount) return undefined;
    return simulatedAccountPreview.getSubAccount(targetSubAccount);
  }, [simulatedAccountPreview, targetSubAccount]);

  const currentSubAccount = useMemo(() => {
    if (!accountData || !targetSubAccount) return undefined;
    return accountData.getSubAccount(targetSubAccount);
  }, [accountData, targetSubAccount]);

  const projectedRoe = previewSubAccount?.roe;
  const currentRoe = currentSubAccount?.roe;

  const previewPositionWithLiquidity = useMemo(() => {
    if (!previewSubAccount) return undefined;
    return previewSubAccount.positions.find((p: any) => p.liquidity);
  }, [previewSubAccount]);

  const previewCollateralLiquidationPriceUsd = useMemo(() => {
    if (!previewPositionWithLiquidity || !collateralVault) return undefined;
    const key = getAddress(collateralVault.address);
    return previewPositionWithLiquidity.collateralLiqiidationPricesUsd?.[key];
  }, [previewPositionWithLiquidity, collateralVault]);

  const previewDebtLiquidationPriceUsd = useMemo(
    () => previewPositionWithLiquidity?.borrowLiquidationPriceUsd,
    [previewPositionWithLiquidity]
  );

  const accountDiffLines = useMemo(() => {
    if (!accountData || !simulatedAccountPreview) return [];
    return collectDiffs(toComparable(accountData), toComparable(simulatedAccountPreview)).slice(0, 300);
  }, [accountData, simulatedAccountPreview]);

  const accountDiffSummary = useMemo(() => {
    const summary = { added: 0, removed: 0, changed: 0 };
    for (const diff of accountDiffLines) summary[diff.kind] += 1;
    return summary;
  }, [accountDiffLines]);

  const applyMultiplyTarget = (value: number) => {
    if (!collateralUsdPrice || !debtUsdPrice) return;
    const collateralAmountNum = Number(collateralAmount);
    if (!Number.isFinite(collateralAmountNum) || collateralAmountNum <= 0) return;
    const collateralUsd = collateralAmountNum * collateralUsdPrice;
    const targetExposureUsd = collateralUsd * value;
    const debtUsd = Math.max(targetExposureUsd - collateralUsd, 0);
    const debtAmount = debtUsd / debtUsdPrice;
    if (!Number.isFinite(debtAmount)) return;
    setMultiplyAmount(debtAmount.toFixed(6));
  };

  useEffect(() => {
    if (tab !== "multiply") return;
    if (multiplyTarget === null) return;
    applyMultiplyTarget(multiplyTarget);
  }, [collateralAmount, collateralUsdPrice, debtUsdPrice, tab, multiplyTarget]);

  useEffect(() => {
    if (!sdk || !collateralVault || !debtVault) return;
    if (tab !== "multiply") return;
    if (!isConnected || !walletAddress) return;
    if (!multiplyAmount.trim()) {
      resetQuotes();
      return;
    }
    if (collateralVault.asset.address.toLowerCase() === debtVault.asset.address.toLowerCase()) {
      resetQuotes();
      return;
    }

    let cancelled = false;
    const requestId = (quoteRequestId.current += 1);
    setQuoteLoading(true);
    setQuoteError(null);
    setQuoteFailure(null);
    setProvidersCount(0);
    setProvidersFetchedCount(0);
    quoteCardsRef.current = [];
    setQuoteCards([]);
    setSelectedProvider(null);
    setFailedProviders([]);

    (async () => {
      let liabilityRaw: bigint;
      try {
        liabilityRaw = parseUnits(multiplyAmount as `${number}`, debtVault.asset.decimals);
      } catch {
        throw new Error("Invalid multiply amount.");
      }

      const providers = await sdk.swapService.getProviders(chainId);
      if (cancelled || quoteRequestId.current !== requestId) return;
      setProvidersCount(providers.length);

      if (!providers.length) {
        throw new Error("No swap providers available.");
      }

      const providersTotal = providers.length;
      const fetchProviderQuote = async (provider: string) => {
        try {
          const quotes = await sdk.swapService.getDepositQuote({
            chainId,
            fromVault: debtVault.address,
            toVault: collateralVault.address,
            fromAccount: (targetSubAccount ?? walletAddress) as Address,
            toAccount: (targetSubAccount ?? walletAddress) as Address,
            fromAsset: debtVault.asset.address,
            toAsset: collateralVault.asset.address,
            amount: liabilityRaw,
            origin: walletAddress as Address,
            slippage: 0.5,
            deadline: Math.floor(Date.now() / 1000) + 60 * 30,
            provider,
          });

          if (cancelled || quoteRequestId.current !== requestId) return;

          const filtered = quotes.filter(
            (q) => !q.route.some((r) => r.providerName.includes("CoW"))
          );
          const best = pickBestQuote(filtered);
          if (best) {
            upsertQuote(provider, best);
          }
        } catch (err) {
          if (cancelled || quoteRequestId.current !== requestId) return;
        } finally {
          if (cancelled || quoteRequestId.current !== requestId) return;
          setProvidersFetchedCount((prev) => {
            const next = prev + 1;
            if (next >= providersTotal) {
              setQuoteLoading(false);
              if (quoteCardsRef.current.length === 0) {
                setQuoteError("Unable to fetch swap quote.");
              }
            }
            return next;
          });
        }
      };

      providers.forEach((provider) => {
        void fetchProviderQuote(provider);
      });
    })()
      .catch((err) => {
        if (cancelled) return;
        resetQuotes();
        setQuoteError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [
    sdk,
    chainId,
    collateralVault,
    debtVault,
    tab,
    isConnected,
    walletAddress,
    multiplyAmount,
    targetSubAccount,
    resetQuotes,
    upsertQuote,
    quoteRefreshToken,
  ]);

  useEffect(() => {
    if (!quoteCards.length) {
      setSelectedProvider(null);
      return;
    }
    if (selectedProvider && !quoteCards.some((card) => card.provider === selectedProvider)) {
      setSelectedProvider(null);
    }
  }, [quoteCards, selectedProvider]);

  const getAccountData = useCallback(async () => {
    if (accountData) return accountData;
    if (!sdk || !walletAddress) throw new Error("Wallet not ready");
    return unwrapServiceResult<any>(
      "accountService.fetchAccount",
      await sdk.accountService.fetchAccount(chainId, walletAddress as Address, {
        populateAll: true,
        vaultFetchOptions: {
          populateAll: true,
        },
      })
    );
  }, [accountData, sdk, walletAddress, chainId]);

  useEffect(() => {
    if (!sdk || !collateralVault || !debtVault) return;
    if (tab !== "multiply") return;
    if (!isConnected || !walletAddress) return;
    if (!publicClient) return;
    if (isChainMismatch) return;
    if (isSubmitting) return;
    if (!multiplyAmount.trim()) return;

    const isSameAsset =
      collateralVault.asset.address.toLowerCase() === debtVault.asset.address.toLowerCase();
    if (!isSameAsset && !selectedQuote) return;

    let cancelled = false;
    setPreviewSimulationError(null);
    setPreviewInsufficientWalletAssets(null);
    setQuoteFailure(null);

    (async () => {
      const account = await getAccountData();

      let liabilityRaw: bigint;
      try {
        liabilityRaw = parseUnits(multiplyAmount as `${number}`, debtVault.asset.decimals);
      } catch {
        throw new Error("Invalid multiply amount.");
      }
      if (liabilityRaw <= 0n) throw new Error("Multiply amount must be greater than zero.");

      let collateralRaw = 0n;
      if (collateralAmount.trim()) {
        try {
          collateralRaw = parseUnits(
            collateralAmount as `${number}`,
            collateralVault.asset.decimals
          );
        } catch {
          throw new Error("Invalid collateral amount.");
        }
      }

      const receiver = (targetSubAccount ?? walletAddress) as Address;

      let plan;
      if (isSameAsset) {
        plan = sdk.executionService.planMultiplySameAsset({
          account,
          collateralVault: collateralVault.address,
          collateralAmount: collateralRaw,
          collateralAsset: collateralVault.asset.address,
          liabilityVault: debtVault.address,
          liabilityAmount: liabilityRaw,
          longVault: collateralVault.address,
          receiver,
        });
      } else {
        if (!selectedQuote) {
          throw new Error("No swap quote available.");
        }
        plan = sdk.executionService.planMultiplyWithSwap({
          account,
          collateralVault: collateralVault.address,
          collateralAmount: collateralRaw,
          collateralAsset: collateralVault.asset.address,
          swapQuote: selectedQuote,
        });
      }

      const {
        simulatedAccounts,
        insufficientWalletAssets,
        rawBatchResults,
        failedBatchItems,
      } = await sdk.simulationService.simulateTransactionPlan(
        chainId,
        walletAddress as Address,
        plan,
        {
          stateOverrides: true,
          vaultFetchOptions: {
            populateMarketPrices: true,
            populateCollaterals: true,
            populateStrategyVaults: true,
            populateRewards: true,
            populateIntrinsicApy: true,
            populateLabels: true,
            eVaultFetchOptions: {
              populateCollaterals: true,
              populateMarketPrices: true,
              populateRewards: true,
              populateIntrinsicApy: true,
            },
          },
          accountFetchOptions: {
            populateVaults: true,
            populateMarketPrices: true,
            populateUserRewards: true,
            vaultFetchOptions: {
              populateMarketPrices: true,
              populateCollaterals: true,
              populateStrategyVaults: true,
              populateRewards: true,
              populateIntrinsicApy: true,
              populateLabels: true,
              eVaultFetchOptions: {
                populateCollaterals: true,
                populateMarketPrices: true,
                populateRewards: true,
                populateIntrinsicApy: true,
              },
            },
          },
        }
      );
      if (rawBatchResults?.length) {
        console.debug("[preview] raw batch results (plan only):", rawBatchResults);
      }
      if (failedBatchItems?.length) {
        setPreviewSimulationError(formatFailedBatchItems(failedBatchItems));
        setSimulatedAccountPreview(null);
        return;
      }
      if (insufficientWalletAssets?.length) {
        const msg = formatInsufficientWalletAssetsMessage(
          insufficientWalletAssets,
          tokenMetaByAddress
        );
        if (!cancelled) setPreviewInsufficientWalletAssets(msg);
      }
      const simulated = simulatedAccounts[0];
      if (cancelled) return;
      setSimulatedAccountPreview(simulated ?? null);
      if (selectedProvider) {
        setFailedProviders((prev) => prev.filter((provider) => provider !== selectedProvider));
      }
    })()
      .catch((err) => {
        if (cancelled) return;
        setPreviewSimulationError(String(err));
        setPreviewInsufficientWalletAssets(null);
        if (selectedProvider && isRevertError(err)) {
          setFailedProviders((prev) =>
            prev.includes(selectedProvider) ? prev : [...prev, selectedProvider]
          );
          setQuoteFailure({ provider: selectedProvider, message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    sdk,
    chainId,
    tab,
    collateralVault,
    debtVault,
    isConnected,
    walletAddress,
    publicClient,
    isChainMismatch,
    isSubmitting,
    multiplyAmount,
    collateralAmount,
    getAccountData,
    selectedQuote,
    selectedProvider,
    targetSubAccount,
    tokenMetaByAddress,
  ]);

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const ensureWalletReady = async () => {
    if (!sdk) throw new Error("SDK not ready");
    if (!isConnected || !walletAddress) {
      throw new Error("Connect a wallet to continue.");
    }
    if (isChainMismatch) {
      if (!switchChain) {
        throw new Error(`Switch wallet to chain ${chainId} and try again.`);
      }
      await switchChain({ chainId });
      return false;
    }
    if (!walletClient || !publicClient) {
      throw new Error("Wallet client not ready yet. Retry in a second.");
    }
    return true;
  };

  const handleBorrow = async () => {
    resetMessages();
    if (!collateralVault || !debtVault) return;

    try {
      const ready = await ensureWalletReady();
      if (!ready) return;

      if (!borrowAmount.trim()) throw new Error("Enter a borrow amount.");
      let borrowRaw: bigint;
      try {
        borrowRaw = parseUnits(borrowAmount as `${number}`, debtVault.asset.decimals);
      } catch {
        throw new Error("Invalid borrow amount.");
      }
      if (borrowRaw <= 0n) throw new Error("Borrow amount must be greater than zero.");

      let collateralRaw = 0n;
      if (collateralAmount.trim()) {
        try {
          collateralRaw = parseUnits(
            collateralAmount as `${number}`,
            collateralVault.asset.decimals
          );
        } catch {
          throw new Error("Invalid collateral amount.");
        }
        if (collateralRaw < 0n) throw new Error("Collateral amount must be positive.");
      }

      setIsSubmitting(true);
      const account = await getAccountData();

      let plan = sdk!.executionService.planBorrow({
        vault: debtVault.address,
        amount: borrowRaw,
        borrowAccount: (targetSubAccount ?? walletAddress) as Address,
        receiver: walletAddress as Address,
        account,
        collateral:
          collateralRaw > 0n
            ? {
                vault: collateralVault.address,
                amount: collateralRaw,
                asset: collateralVault.asset.address,
              }
            : undefined,
      });

      plan = await sdk!.executionService.resolveRequiredApprovals({
        plan,
        chainId,
        account: walletAddress as Address,
        usePermit2: true,
        unlimitedApproval: false,
      });

      setProgress({ completed: 0, total: plan.length });

      await executePlanWithProgress({
        plan,
        sdk: sdk!,
        chainId,
        walletClient: walletClient!,
        publicClient: publicClient!,
        account: walletAddress as Address,
        onProgress: (p) => {
          setProgress({ completed: p.completed, total: p.total, status: p.status });
        },
      });

      queryClient.invalidateQueries({
        queryKey: ["walletBalance", chainId, walletAddress, collateralVault.asset.address],
      });

      setBorrowAmount("");
      setSuccess("Borrow completed.");
      setProgress(null);
    } catch (err) {
      console.error("Borrow execution error:", err);
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMultiply = async () => {
    resetMessages();
    if (!collateralVault || !debtVault) return;

    try {
      const ready = await ensureWalletReady();
      if (!ready) return;

      if (!multiplyAmount.trim()) throw new Error("Enter a multiply amount.");
      let liabilityRaw: bigint;
      try {
        liabilityRaw = parseUnits(
          multiplyAmount as `${number}`,
          debtVault.asset.decimals
        );
      } catch {
        throw new Error("Invalid multiply amount.");
      }
      if (liabilityRaw <= 0n) throw new Error("Multiply amount must be greater than zero.");

      let collateralRaw = 0n;
      if (collateralAmount.trim()) {
        try {
          collateralRaw = parseUnits(
            collateralAmount as `${number}`,
            collateralVault.asset.decimals
          );
        } catch {
          throw new Error("Invalid collateral amount.");
        }
        if (collateralRaw < 0n) throw new Error("Collateral amount must be positive.");
      }

      setIsSubmitting(true);
      const account = await getAccountData();

      let plan;
      if (collateralVault.asset.address.toLowerCase() === debtVault.asset.address.toLowerCase()) {
        plan = sdk!.executionService.planMultiplySameAsset({
          account,
          collateralVault: collateralVault.address,
          collateralAmount: collateralRaw,
          collateralAsset: collateralVault.asset.address,
          liabilityVault: debtVault.address,
          liabilityAmount: liabilityRaw,
          longVault: collateralVault.address,
          receiver: (targetSubAccount ?? walletAddress) as Address,
        });
      } else {
        if (!selectedQuote) {
          throw new Error("No swap quote available. Check amount and try again.");
        }

        plan = sdk!.executionService.planMultiplyWithSwap({
          account,
          collateralVault: collateralVault.address,
          collateralAmount: collateralRaw,
          collateralAsset: collateralVault.asset.address,
          swapQuote: selectedQuote,
        });
      }

      plan = await sdk!.executionService.resolveRequiredApprovals({
        plan,
        chainId,
        account: walletAddress as Address,
        usePermit2: true,
        unlimitedApproval: false,
      });

      setProgress({ completed: 0, total: plan.length });

      await executePlanWithProgress({
        plan,
        sdk: sdk!,
        chainId,
        walletClient: walletClient!,
        publicClient: publicClient!,
        account: walletAddress as Address,
        onProgress: (p) => {
          setProgress({ completed: p.completed, total: p.total, status: p.status });
        },
      });

      queryClient.invalidateQueries({
        queryKey: ["walletBalance", chainId, walletAddress, collateralVault.asset.address],
      });

      setMultiplyAmount("");
      setSuccess("Multiply completed.");
      setProgress(null);
    } catch (err) {
      console.error("Multiply execution error:", err);
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sdkLoading) return <div className="status-message">Initializing SDK...</div>;
  if (sdkError) return <div className="error-message">SDK Error: {sdkError}</div>;
  if (collateralLoading || debtLoading) {
    return <div className="status-message">Loading pair...</div>;
  }
  if (!collateralVault || !debtVault) {
    return <div className="status-message">Pair not found.</div>;
  }

  const collateralWalletBalance =
    walletBalance !== undefined
      ? `${formatBigInt(walletBalance, collateralVault.asset.decimals)} ${collateralVault.asset.symbol}`
      : "-";

  const collateralBalanceUsd =
    walletBalance !== undefined && collateralVault.marketPriceUsd !== undefined
      ? formatPriceUsd(
          (walletBalance * collateralVault.marketPriceUsd) /
            10n ** BigInt(collateralVault.asset.decimals)
        )
      : "-";

  return (
    <>
      <Link to="/borrow" className="back-link">
        &larr; Back to borrow
      </Link>

      <div className="pair-header">
        <div className="pair-title">
          {collateralVault.asset.symbol} / {debtVault.asset.symbol} Borrow Pair
        </div>
        <div className="pair-subtitle">
          {getMarketName(collateralVault) ?? "Unknown Market"} →{" "}
          {getMarketName(debtVault) ?? "Unknown Market"}
        </div>
      </div>

      <div className="pair-layout">
        <div className="pair-form">
          <div className="pair-card">
            <div className="pair-card-header">Open Position</div>
            <div className="tabs">
              <button
                type="button"
                className={`tab ${tab === "borrow" ? "active" : ""}`}
                onClick={() => setTab("borrow")}
              >
                Borrow
              </button>
              <button
                type="button"
                className={`tab ${tab === "multiply" ? "active" : ""}`}
                onClick={() => setTab("multiply")}
              >
                Multiply
              </button>
            </div>

            {!isConnected && (
              <div className="status-message">Connect a wallet to continue.</div>
            )}

            {isConnected && (
              <>
                {isChainMismatch && (
                  <div className="wallet-chain-warning">
                    Wallet is connected to a different chain. We will prompt a switch to{" "}
                    {chainId}.
                  </div>
                )}

                <div className="pair-form-grid">
                  <label className="pair-form-label">
                    Collateral deposit ({collateralVault.asset.symbol})
                  </label>
                  <input
                    type="text"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                    placeholder="0.0"
                    className="deposit-input"
                    disabled={isSubmitting}
                  />
                  <div className="pair-form-subline">Wallet balance</div>
                  <div className="pair-form-subline">
                    {collateralWalletBalance} ({collateralBalanceUsd})
                  </div>

                  <label className="pair-form-label">
                    {tab === "borrow" ? "Borrow amount" : "Multiply amount"} (
                    {debtVault.asset.symbol})
                  </label>
                  <input
                    type="text"
                    value={tab === "borrow" ? borrowAmount : multiplyAmount}
                    onChange={(e) =>
                      tab === "borrow"
                        ? setBorrowAmount(e.target.value)
                        : setMultiplyAmount(e.target.value)
                    }
                    placeholder="0.0"
                    className="deposit-input"
                    disabled={isSubmitting}
                  />
                  {tab === "multiply" && (
                    <>
                      <div className="pair-form-subline">Target multiplier</div>
                      <div className="pair-form-subline">
                        {maxMultiplier !== undefined ? (
                          <>
                            <input
                              type="range"
                              min={1}
                              max={maxMultiplier}
                              step={0.01}
                              value={multiplyTarget ?? 1}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                setMultiplyTarget(next);
                                applyMultiplyTarget(next);
                              }}
                              disabled={
                                isSubmitting ||
                                !collateralAmount.trim() ||
                                !collateralUsdPrice ||
                                !debtUsdPrice
                              }
                            />
                            <span style={{ marginLeft: 8 }}>
                              {(multiplyTarget ?? 1).toFixed(2)}x / {maxMultiplier.toFixed(2)}x
                            </span>
                          </>
                        ) : (
                          "-"
                        )}
                      </div>
                    </>
                  )}
                  <div className="pair-form-subline">Available to borrow</div>
                  <div className="pair-form-subline">
                    {formatBigInt(debtVault.availableToBorrow, debtVault.asset.decimals)}{" "}
                    {debtVault.asset.symbol}
                  </div>
                </div>

                <div className="pair-form-actions">
                  <button
                    type="button"
                    className="wallet-button"
                    onClick={tab === "borrow" ? handleBorrow : handleMultiply}
                    disabled={isSubmitting || !isConnected}
                  >
                    {isSwitching
                      ? "Switching..."
                      : isSubmitting
                      ? "Submitting..."
                      : tab === "borrow"
                      ? "Borrow"
                      : "Multiply"}
                  </button>
                </div>

                {tab === "multiply" && (
                  <div className="pair-quote">
                    <div className="pair-quote-title">
                      <span>Swap Quotes</span>
                      <button
                        type="button"
                        className="quote-refresh"
                        onClick={refreshQuotes}
                        disabled={quoteLoading || !multiplyAmount.trim()}
                      >
                        Refresh
                      </button>
                    </div>
                    {collateralVault.asset.address.toLowerCase() ===
                    debtVault.asset.address.toLowerCase() ? (
                      <div className="pair-form-subline">No swap required.</div>
                    ) : quoteError ? (
                      <div className="error-message">{quoteError}</div>
                    ) : quoteLoading && !quoteCards.length ? (
                      <div className="pair-form-subline">Fetching swap quotes...</div>
                    ) : quoteCards.length ? (
                      <>
                        <div className="quote-progress">
                          <div className="quote-progress-bar" style={{ width: `${quoteProgress * 100}%` }} />
                        </div>
                        <div className="quote-list">
                          {quoteCards.map((card, index) => {
                            const isSelected = card.provider === selectedProvider;
                            const isFailed = failedProviders.includes(card.provider);
                            const isBest = index === 0;
                            return (
                              <button
                                key={card.provider}
                                type="button"
                                className={`quote-card${isSelected ? " selected" : ""}${
                                  isFailed ? " failed" : ""
                                }`}
                                onClick={() => {
                                  setSelectedProvider(card.provider);
                                  setQuoteFailure(null);
                                }}
                              >
                                <div className="quote-provider">
                                  <span>{card.provider}</span>
                                  {isBest && <span className="quote-badge">Best</span>}
                                </div>
                                <div className="quote-amount-row">
                                  <div className="quote-amount">
                                    {formatUnits(
                                      BigInt(card.quote.amountIn),
                                      card.quote.tokenIn.decimals
                                    )}{" "}
                                    {card.quote.tokenIn.symbol} →{" "}
                                    {formatUnits(
                                      BigInt(card.quote.amountOut),
                                      card.quote.tokenOut.decimals
                                    )}{" "}
                                    {card.quote.tokenOut.symbol}
                                  </div>
                                  <div className="quote-impact">
                                    Price impact: {card.quote.slippage.toFixed(2)}%
                                  </div>
                                </div>
                                {isFailed && (
                                  <div className="quote-warning">Simulation failed</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {selectedQuote && (
                          <div className="quote-summary">
                            <div className="quote-summary-title">Selected Quote</div>
                            <div className="quote-summary-line">
                              Provider: {selectedProvider ?? "-"}
                            </div>
                            <div className="quote-summary-line">
                              {formatUnits(
                                BigInt(selectedQuote.amountIn),
                                selectedQuote.tokenIn.decimals
                              )}{" "}
                              {selectedQuote.tokenIn.symbol} →{" "}
                              {formatUnits(
                                BigInt(selectedQuote.amountOut),
                                selectedQuote.tokenOut.decimals
                              )}{" "}
                              {selectedQuote.tokenOut.symbol}
                            </div>
                            <div className="quote-summary-line">
                              Price impact: {selectedQuote.slippage.toFixed(2)}%
                            </div>
                          </div>
                        )}
                        {quoteLoading && (
                          <div className="pair-form-subline">Fetching swap quotes...</div>
                        )}
                      </>
                    ) : (
                      <div className="pair-form-subline">
                        Enter a multiply amount to fetch quotes.
                      </div>
                    )}
                  </div>
                )}

                <div className="pair-summary">
                  <div className="pair-summary-item">
                    <div className="label">Net APY</div>
                    <div className="value">
                      {projectedRoe ? (
                        <RoeCell roe={projectedRoe} />
                      ) : currentRoe ? (
                        <RoeCell roe={currentRoe} />
                      ) : (
                        "-"
                      )}
                    </div>
                    {projectedRoe && (
                      <div className="pair-subtitle">
                        Current: {currentRoe ? <RoeCell roe={currentRoe} /> : "-"}
                      </div>
                    )}
                  </div>
                  <div className="pair-summary-item">
                    <div className="label">Liquidation Price (USD)</div>
                    <div className="value">
                      {previewSubAccount &&
                      previewCollateralLiquidationPriceUsd !== undefined &&
                      previewDebtLiquidationPriceUsd !== undefined
                        ? `${formatPriceUsd(previewCollateralLiquidationPriceUsd)} / ${formatPriceUsd(
                            previewDebtLiquidationPriceUsd
                          )}`
                        : "-"}
                    </div>
                  </div>
                  <div className="pair-summary-item">
                    <div className="label">Position Health</div>
                    <div className="value">
                      {previewSubAccount ? formatWad(previewSubAccount.healthFactor) : "-"}
                    </div>
                  </div>
                </div>
                <div className="pair-form-actions">
                  <button
                    type="button"
                    className="wallet-button"
                    onClick={() => setShowAccountDiff(true)}
                    disabled={!accountData || !simulatedAccountPreview}
                  >
                    Account Diff
                  </button>
                </div>

                {progress && (
                  <div className="plan-progress">
                    <div className="plan-progress-label">
                      Progress: {progress.completed}/{progress.total}
                    </div>
                    {progress.status && (
                      <div className="plan-progress-status">{progress.status}</div>
                    )}
                    <div className="plan-progress-bar">
                      <div
                        className="plan-progress-fill"
                        style={{
                          width: `${Math.round(
                            (progress.completed / Math.max(progress.total, 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {success && <div className="success-message">{success}</div>}
                {error && <div className="error-message">{error}</div>}
                {previewInsufficientWalletAssets && (
                  <div className="wallet-chain-warning">{previewInsufficientWalletAssets}</div>
                )}
                {previewSimulationError && <div className="error-message">{previewSimulationError}</div>}
              </>
            )}
          </div>
        </div>

        <div className="pair-content">
          <div className="pair-card">
            <div className="pair-card-header">Pair Overview</div>
            <div className="pair-overview-grid">
              <div className="pair-overview-item">
                <div className="label">Oracle Price</div>
                <div className="value">{pairPrice.primary}</div>
                <div className="pair-subtitle">{pairPrice.secondary}</div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Supply APY</div>
                <div className="value">
                  <ApyCell
                    baseApy={Number(collateralVault.interestRates.supplyAPY)}
                    rewards={collateralVault.rewards}
                    intrinsicApy={collateralVault.intrinsicApy}
                  />
                </div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Borrow APY</div>
                <div className="value">{formatAPY(debtVault.interestRates.borrowAPY)}</div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Max ROE</div>
                <div className="value">{pct(maxRoe)}</div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Max Multiplier</div>
                <div className="value">
                  {maxMultiplier !== undefined ? `${maxMultiplier.toFixed(2)}x` : "-"}
                </div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Borrow LTV</div>
                <div className="value">{pct(collateralConfig?.borrowLTV)}</div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Liquidation LTV</div>
                <div className="value">{pct(collateralConfig?.liquidationLTV)}</div>
              </div>
              <div className="pair-overview-item">
                <div className="label">Correlated Assets</div>
                <div className="value">
                  {collateralVault.asset.symbol === debtVault.asset.symbol ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </div>

          <div className="pair-card">
            <div className="pair-card-header">Vault Details</div>
            <div className="pair-vault-grid">
              <div className="pair-vault">
                <div className="pair-vault-title">Collateral Vault</div>
                <div className="pair-vault-line">
                  {collateralVault.asset.symbol} ({collateralVault.asset.name})
                </div>
                <div className="pair-vault-line">
                  Market: {getMarketName(collateralVault) ?? "-"}
                </div>
                <div className="pair-vault-line">
                  Address: <CopyAddress address={collateralVault.address} />
                </div>
              </div>
              <div className="pair-vault">
                <div className="pair-vault-title">Debt Vault</div>
                <div className="pair-vault-line">
                  {debtVault.asset.symbol} ({debtVault.asset.name})
                </div>
                <div className="pair-vault-line">
                  Market: {getMarketName(debtVault) ?? "-"}
                </div>
                <div className="pair-vault-line">
                  Address: <CopyAddress address={debtVault.address} />
                </div>
              </div>
            </div>

            <div className="pair-stat-grid">
              <div className="detail-item">
                <div className="label">Collateral Liquidity</div>
                <div className="value">
                  {formatBigInt(
                    collateralVault.availableToBorrow,
                    collateralVault.asset.decimals
                  )}{" "}
                  {collateralVault.asset.symbol}
                </div>
              </div>
              <div className="detail-item">
                <div className="label">Debt Liquidity</div>
                <div className="value">
                  {formatBigInt(debtVault.availableToBorrow, debtVault.asset.decimals)}{" "}
                  {debtVault.asset.symbol}
                </div>
              </div>
              <div className="detail-item">
                <div className="label">Collateral USD Price</div>
                <div className="value">{formatPriceUsd(collateralVault.marketPriceUsd)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Debt USD Price</div>
                <div className="value">{formatPriceUsd(debtVault.marketPriceUsd)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Collateral Vault Address</div>
                <div className="value">
                  <CopyAddress address={collateralVault.address} />
                </div>
              </div>
              <div className="detail-item">
                <div className="label">Debt Vault Address</div>
                <div className="value">
                  <CopyAddress address={debtVault.address} />
                </div>
              </div>
            </div>
          </div>

          {debtVault.collaterals.length > 0 && (
            <div className="pair-card">
              <div className="pair-card-header">Pair Collaterals</div>
              <table>
                <thead>
                  <tr>
                    <th>Collateral</th>
                    <th>Borrow LTV</th>
                    <th>Liquidation LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {debtVault.collaterals.map((collateral) => {
                    const isCurrent =
                      collateralVault?.address.toLowerCase() === collateral.address.toLowerCase();
                    const symbol = isCurrent ? collateralVault.asset.symbol : "Unknown";
                    return (
                      <tr key={collateral.address}>
                        <td>
                          <div>{symbol}</div>
                          <div className="table-subline">
                            <CopyAddress address={collateral.address} />
                          </div>
                        </td>
                        <td>{pct(collateral.borrowLTV)}</td>
                        <td>{pct(collateral.liquidationLTV)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {showAccountDiff && (
        <div
          className="account-diff-overlay"
          onClick={() => setShowAccountDiff(false)}
        >
          <div className="account-diff-modal" onClick={(e) => e.stopPropagation()}>
            <div className="account-diff-header">
              <div>
                <div className="pair-card-header">Current vs Simulated Account Diff</div>
                <div className="account-diff-meta">
                  {accountDiffLines.length} change{accountDiffLines.length === 1 ? "" : "s"}{" "}
                  ({accountDiffSummary.added} added, {accountDiffSummary.removed} removed,{" "}
                  {accountDiffSummary.changed} changed)
                </div>
              </div>
              <button type="button" className="wallet-button" onClick={() => setShowAccountDiff(false)}>
                Close
              </button>
            </div>
            <div className="account-diff-list">
              {accountDiffLines.length > 0 ? (
                accountDiffLines.map((entry, index) => (
                  <div className={`account-diff-item account-diff-item-${entry.kind}`} key={`${entry.path}-${index}`}>
                    <div className="account-diff-item-top">
                      <span className={`account-diff-badge account-diff-badge-${entry.kind}`}>
                        {entry.kind}
                      </span>
                      <code className="account-diff-path">{entry.path}</code>
                    </div>
                    <div className="account-diff-values">
                      <div className="account-diff-value-block">
                        <div className="account-diff-value-label">Current</div>
                        <pre className="account-diff-value">{entry.before}</pre>
                      </div>
                      <div className="account-diff-value-block">
                        <div className="account-diff-value-label">Simulated</div>
                        <pre className="account-diff-value">{entry.after}</pre>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="account-diff-empty">No differences.</div>
              )}
            </div>
          </div>
        </div>
      )}
      {quoteFailure && (
        <div className="quote-popup-overlay">
          <div className="quote-popup">
            <div className="quote-popup-title">Quote Simulation Failed</div>
            <div className="quote-popup-body">
              The quote from {quoteFailure.provider} reverted during simulation. Select another
              quote to continue.
            </div>
            <div className="quote-popup-error">{quoteFailure.message}</div>
            <div className="quote-popup-actions">
              <button
                type="button"
                className="wallet-button"
                onClick={() => setQuoteFailure(null)}
              >
                Choose another quote
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
