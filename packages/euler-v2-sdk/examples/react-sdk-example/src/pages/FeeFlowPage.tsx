import { useEffect, useMemo, useState } from "react";
import {
  useAccount as useWagmiAccount,
  useChainId,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { getAddress, type Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";
import { queryClient, useFeeFlowPageData } from "../queries/sdkQueries.ts";
import {
  formatTransactionPlanError,
  toPlanProgress,
  type PlanProgress,
  walletExecutionCallbacks,
} from "../utils/txProgress.ts";
import { formatBigInt, formatPriceUsd } from "../utils/format.ts";
import { CopyAddress } from "../components/CopyAddress.tsx";
import { ExecutionProgress } from "../components/ExecutionProgress.tsx";

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

export function FeeFlowPage() {
  const { sdk, chainId, loading: sdkLoading, error: sdkError } = useSDK();
  const { data, isLoading, error } = useFeeFlowPageData();
  const { address: walletAddress, isConnected } = useWagmiAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient({ chainId });
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlanProgress | null>(null);

  const candidates = data?.candidates ?? [];
  const topTenKeys = useMemo(
    () => new Set(candidates.slice(0, 10).map((candidate) => candidate.vault.address.toLowerCase())),
    [candidates]
  );

  useEffect(() => {
    setSelected({});
  }, [chainId]);

  useEffect(() => {
    if (Object.keys(selected).length > 0 || topTenKeys.size === 0) return;
    const next: Record<string, boolean> = {};
    for (const key of topTenKeys) next[key] = true;
    setSelected(next);
  }, [selected, topTenKeys]);

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selected[candidate.vault.address.toLowerCase()]),
    [candidates, selected]
  );

  const selectedTotalValueUsd = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.claimableValueUsd,
    0
  );

  const selectedVaults = selectedCandidates.map((candidate) => candidate.vault.address);
  const selectedCount = selectedCandidates.length;
  const paymentTokenSymbol = data?.paymentTokenMeta?.symbol ?? "TOKEN";
  const paymentTokenDecimals = data?.paymentTokenMeta?.decimals ?? 18;

  const ensureWalletReady = async (): Promise<boolean> => {
    if (!walletAddress) {
      throw new Error("Connect a wallet to buy from FeeFlow.");
    }
    if (!walletClient) {
      throw new Error("Wallet client not ready.");
    }
    if (walletChainId !== chainId) {
      if (!switchChain) {
        throw new Error(`Switch your wallet to chain ${chainId} before buying.`);
      }
      await switchChain({ chainId });
      return false;
    }
    return true;
  };

  const handleBuy = async () => {
    setBuyError(null);
    setBuySuccess(null);

    try {
      const ready = await ensureWalletReady();
      if (!ready || !sdk || !walletClient || !walletAddress || !data) return;
      if (selectedVaults.length === 0) {
        throw new Error("Select at least one vault.");
      }

      const plan = await sdk.feeFlowService.buildBuyPlan({
        chainId,
        account: walletAddress as Address,
        recipient: walletAddress as Address,
        vaults: selectedVaults,
      });

      setProgress({ completed: 0, total: plan.length });

      await sdk.executionService.executeTransactionPlan({
        plan,
        chainId,
        account: walletAddress as Address,
        ...walletExecutionCallbacks(walletClient),
        usePermit2: true,
        unlimitedApproval: false,
        onProgress: (progress) => setProgress(toPlanProgress(progress)),
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feeFlowPageData", chainId] }),
        queryClient.invalidateQueries({ queryKey: ["account", chainId, getAddress(walletAddress)] }),
        queryClient.invalidateQueries({ queryKey: ["accountWithDiagnostics", chainId, getAddress(walletAddress)] }),
      ]);

      setBuySuccess(`Bought ${selectedVaults.length} FeeFlow vault tokens.`);
    } catch (err) {
      setBuyError(String(await formatTransactionPlanError(err)));
    } finally {
      setProgress(null);
    }
  };

  if (sdkLoading) return <div className="status-message">Initializing SDK...</div>;
  if (sdkError) return <div className="error-message">SDK Error: {sdkError}</div>;
  if (isLoading) return <div className="status-message">Loading FeeFlow page...</div>;
  if (error) return <div className="error-message">Error: {String(error)}</div>;
  if (!data) return <div className="status-message">FeeFlow unavailable for this chain.</div>;

  const { state } = data;

  return (
    <>
      <h2 className="section-title">FeeFlow</h2>

      <div className="detail-grid fee-flow-header">
        <div className="detail-item">
          <div className="label">Current Price</div>
          <div className="value">
            {formatBigInt(state.currentPrice, paymentTokenDecimals, 4)} {paymentTokenSymbol}
          </div>
        </div>
        <div className="detail-item">
          <div className="label">Auction Ends In</div>
          <div className="value">{formatDuration(state.timeRemaining)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Selected Fee Value</div>
          <div className="value">{formatPriceUsd(selectedTotalValueUsd)}</div>
        </div>
        <div className="detail-item">
          <div className="label">Selected Vaults</div>
          <div className="value">{selectedCount}</div>
        </div>
      </div>

      <div className="fee-flow-toolbar">
        <div className="fee-flow-meta">
          <span>Controller: <CopyAddress address={state.feeFlowControllerAddress} /></span>
          <span>Util: {state.feeFlowControllerUtilAddress ? <CopyAddress address={state.feeFlowControllerUtilAddress} /> : "n/a"}</span>
          <span>Payment Token: <CopyAddress address={state.paymentToken} /></span>
        </div>
        <div className="fee-flow-actions">
          <button
            className="action-button secondary"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const candidate of candidates.slice(0, 10)) {
                next[candidate.vault.address.toLowerCase()] = true;
              }
              setSelected(next);
            }}
          >
            Select Top 10
          </button>
          <button
            className="action-button secondary"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const candidate of candidates) {
                next[candidate.vault.address.toLowerCase()] = true;
              }
              setSelected(next);
            }}
          >
            Select All
          </button>
          <button
            className="action-button secondary"
            onClick={() => setSelected({})}
          >
            Clear
          </button>
          <button
            className="action-button"
            disabled={!isConnected || isSwitching || selectedCount === 0 || !!progress}
            onClick={handleBuy}
          >
            {progress
              ? `Buying ${progress.completed}/${progress.total}`
              : `Buy ${selectedCount || ""}`.trim()}
          </button>
        </div>
      </div>

      {walletAddress && walletChainId !== chainId && (
        <div className="wallet-chain-warning">
          Wallet is connected to a different chain than the app.
        </div>
      )}

      {buyError && <div className="error-message">{buyError}</div>}
      {buySuccess && <div className="status-message">{buySuccess}</div>}
      {progress && <ExecutionProgress progress={progress} label="Buying fees" />}

      {candidates.length === 0 ? (
        <div className="status-message">No claimable FeeFlow vaults found.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Vault</th>
              <th>Asset</th>
              <th>Protocol Fees</th>
              <th>Held By FeeFlow</th>
              <th>Total Claimable</th>
              <th>Fee Value</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const key = candidate.vault.address.toLowerCase();
              const checked = !!selected[key];
              return (
                <tr key={candidate.vault.address}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                  </td>
                  <td><CopyAddress address={candidate.vault.address} /></td>
                  <td>
                    <div>{candidate.vault.asset.symbol}</div>
                    <div className="table-subline">{candidate.vault.shares.name}</div>
                  </td>
                  <td>{formatBigInt(candidate.protocolFeesAssets, candidate.vault.asset.decimals, 4)}</td>
                  <td>{formatBigInt(candidate.feeFlowAssets, candidate.vault.asset.decimals, 4)}</td>
                  <td>{formatBigInt(candidate.claimableAssets, candidate.vault.asset.decimals, 4)}</td>
                  <td>{formatPriceUsd(candidate.claimableValueUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
