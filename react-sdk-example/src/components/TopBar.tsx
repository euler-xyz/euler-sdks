import { useSDK } from "../context/SdkContext.tsx";
import { useNavigate, useLocation } from "react-router-dom";
import { WalletConnectButton } from "./WalletConnectButton.tsx";

export function TopBar() {
  const { chainId, setChainId, chainNames } = useSDK();
  const navigate = useNavigate();
  const location = useLocation();

  const isVaults =
    location.pathname === "/" ||
    location.pathname.startsWith("/vaults") ||
    location.pathname.startsWith("/vault/");
  const isBorrow = location.pathname.startsWith("/borrow");
  const isPortfolio = location.pathname.startsWith("/portfolio");
  const isRewards = location.pathname.startsWith("/rewards");

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <h1 style={{ cursor: "pointer" }} onClick={() => navigate("/vaults")}>
          Euler V2 Explorer
        </h1>
        <nav className="topbar-nav">
          <button
            className={`nav-link ${isVaults ? "active" : ""}`}
            onClick={() => navigate("/vaults")}
          >
            Vaults
          </button>
          <button
            className={`nav-link ${isBorrow ? "active" : ""}`}
            onClick={() => navigate("/borrow")}
          >
            Borrow
          </button>
          <button
            className={`nav-link ${isPortfolio ? "active" : ""}`}
            onClick={() => navigate("/portfolio")}
          >
            Portfolio
          </button>
          <button
            className={`nav-link ${isRewards ? "active" : ""}`}
            onClick={() => navigate("/rewards")}
          >
            Rewards
          </button>
        </nav>
      </div>
      <div className="topbar-right">
        <label>
          Chain:{" "}
          <select
            value={chainId}
            onChange={(e) => {
              setChainId(Number(e.target.value));
            }}
          >
            {Object.entries(chainNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({id})
              </option>
            ))}
          </select>
        </label>
        <WalletConnectButton
          appChainId={chainId}
          appChainName={chainNames[chainId] ?? String(chainId)}
        />
      </div>
    </div>
  );
}
