import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  StandardEVaultPerspectives,
  StandardEulerEarnPerspectives,
  getMaxMultiplier,
  getMaxRoe,
  isEVault,
  type EVault,
  type SwapQuote,
} from "euler-v2-sdk";
import { formatUnits, parseUnits, type Address } from "viem";
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
  useAccount as useSdkAccount,
  useVaultDetail,
  useVerifiedVaults,
  useWalletBalance,
} from "../queries/sdkQueries.ts";
import {
  formatAPY,
  formatBigInt,
  formatPercent,
  formatPriceUsd,
} from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ApyCell } from "../components/ApyCell.tsx";
import { executePlanWithProgress, type PlanProgress } from "../utils/txExecutor.ts";

const ALL_PERSPECTIVES = [
  StandardEVaultPerspectives.GOVERNED,
  StandardEVaultPerspectives.ESCROW,
  StandardEulerEarnPerspectives.GOVERNED,
];

type FormTab = "borrow" | "multiply";

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
  const { data: allVaults } = useVerifiedVaults(ALL_PERSPECTIVES);
  const eVaults = useMemo(() => (allVaults?.filter(isEVault) ?? []), [allVaults]);

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

  const [tab, setTab] = useState<FormTab>("borrow");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [multiplyAmount, setMultiplyAmount] = useState("");
  const [multiplyTarget, setMultiplyTarget] = useState<number | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    const borrowApy = Number(debtVault.interestRates.borrowAPY);
    return getMaxRoe(maxMultiplier, supplyApy, borrowApy);
  }, [collateralVault, debtVault, maxMultiplier]);

  const pairPrice = formatPairPrice(collateralVault, debtVault);

  const collateralUsdPrice =
    collateralVault?.marketPriceUsd !== undefined
      ? Number(collateralVault.marketPriceUsd) / 1e18
      : undefined;
  const debtUsdPrice =
    debtVault?.marketPriceUsd !== undefined
      ? Number(debtVault.marketPriceUsd) / 1e18
      : undefined;

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
      setSelectedQuote(null);
      setQuoteError(null);
      return;
    }
    if (collateralVault.asset.address.toLowerCase() === debtVault.asset.address.toLowerCase()) {
      setSelectedQuote(null);
      setQuoteError(null);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);

    (async () => {
      let liabilityRaw: bigint;
      try {
        liabilityRaw = parseUnits(
          multiplyAmount as `${number}`,
          debtVault.asset.decimals
        );
      } catch {
        throw new Error("Invalid multiply amount.");
      }

      const quotes = await sdk.swapService.getDepositQuote({
        chainId,
        fromVault: debtVault.address,
        toVault: collateralVault.address,
        fromAccount: walletAddress as Address,
        toAccount: walletAddress as Address,
        fromAsset: debtVault.asset.address,
        toAsset: collateralVault.asset.address,
        amount: liabilityRaw,
        origin: walletAddress as Address,
        slippage: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 60 * 30,
      });

      const filtered = quotes.filter(
        (q) => !q.route.some((r) => r.providerName.includes("CoW"))
      );

      if (filtered.length === 0) {
        throw new Error("No swap quotes available.");
      }

      if (!cancelled) {
        setSelectedQuote(filtered[0] ?? null);
      }
    })()
      .catch((err) => {
        if (cancelled) return;
        setSelectedQuote(null);
        setQuoteError(String(err));
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
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

  const getAccountData = async () => {
    if (accountData) return accountData;
    if (!sdk || !walletAddress) throw new Error("Wallet not ready");
    return sdk.accountService.fetchAccount(chainId, walletAddress as Address, {
      populateVaults: true,
      populateMarketPrices: true,
      populateUserRewards: true,
      vaultFetchOptions: {
        populateMarketPrices: true,
        populateCollaterals: true,
        populateRewards: true,
        populateIntrinsicApy: true,
      },
    });
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
        borrowAccount: walletAddress as Address,
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
          receiver: walletAddress as Address,
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
                    <div className="pair-quote-title">Best Swap Quote</div>
                    {collateralVault.asset.address.toLowerCase() ===
                    debtVault.asset.address.toLowerCase() ? (
                      <div className="pair-form-subline">No swap required.</div>
                    ) : quoteLoading ? (
                      <div className="pair-form-subline">Fetching swap quotes...</div>
                    ) : quoteError ? (
                      <div className="error-message">{quoteError}</div>
                    ) : selectedQuote ? (
                      <div className="pair-form-subline">
                        {formatUnits(
                          BigInt(selectedQuote.amountIn),
                          selectedQuote.tokenIn.decimals
                        )}{" "}
                        {selectedQuote.tokenIn.symbol} →{" "}
                        {formatUnits(
                          BigInt(selectedQuote.amountOut),
                          selectedQuote.tokenOut.decimals
                        )}{" "}
                        {selectedQuote.tokenOut.symbol}{" "}
                        <span>
                          ({selectedQuote.route.map((r) => r.providerName).join(" → ")})
                        </span>
                      </div>
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
                    <div className="value">-</div>
                  </div>
                  <div className="pair-summary-item">
                    <div className="label">Liquidation Price</div>
                    <div className="value">-</div>
                  </div>
                  <div className="pair-summary-item">
                    <div className="label">Position Health</div>
                    <div className="value">-</div>
                  </div>
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

          {eVaults.length > 0 && (
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
                    const vault = eVaults.find(
                      (v) => v.address.toLowerCase() === collateral.address.toLowerCase()
                    );
                    return (
                      <tr key={collateral.address}>
                        <td>
                          <div>{vault?.asset.symbol ?? "Unknown"}</div>
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
    </>
  );
}
