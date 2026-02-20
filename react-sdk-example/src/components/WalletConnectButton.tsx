import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortenAddress } from "../utils/format.ts";

export function WalletConnectButton({
  appChainId,
  appChainName,
}: {
  appChainId: number;
  appChainName: string;
}) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const walletChainId = useChainId();
  const {
    switchChain,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();

  const injectedConnector =
    connectors.find((connector) => connector.id === "injected") ??
    connectors[0];

  const isChainMismatch = isConnected && walletChainId !== appChainId;

  if (isConnected && address) {
    return (
      <div className="wallet-connection">
        <span className="wallet-address">{shortenAddress(address)}</span>
        {isChainMismatch && (
          <button
            type="button"
            className="wallet-button"
            onClick={() => switchChain({ chainId: appChainId })}
            disabled={!switchChain || isSwitching}
          >
            {isSwitching ? "Switching..." : `Switch to ${appChainName}`}
          </button>
        )}
        <button
          type="button"
          className="wallet-button"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
        {switchError && <span className="wallet-error">{switchError.message}</span>}
      </div>
    );
  }

  return (
    <div className="wallet-connection">
      <button
        type="button"
        className="wallet-button"
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={!injectedConnector || isPending}
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <span className="wallet-error">{error.message}</span>}
    </div>
  );
}
