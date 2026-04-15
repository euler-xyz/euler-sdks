import { useSDK } from "../context/SdkContext.tsx";
import { useNavigate, useLocation } from "react-router-dom";
import { WalletConnectButton } from "./WalletConnectButton.tsx";

export function TopBar() {
  const { chainId, chainNames } = useSDK();
  const navigate = useNavigate();
  const location = useLocation();

  const isVaults =
    location.pathname === "/" ||
    location.pathname.startsWith("/vaults") ||
    location.pathname.startsWith("/vault/");
  const isEarn =
    location.pathname === "/earn" || location.pathname.startsWith("/earn/");
  const isSecuritize = location.pathname.startsWith("/securitize");
  const isBorrow = location.pathname.startsWith("/borrow");
  const isPortfolio = location.pathname.startsWith("/portfolio");
  const isRewards = location.pathname.startsWith("/rewards");
  const isFeeFlow = location.pathname.startsWith("/fee-flow");
  const isTotals = location.pathname.startsWith("/totals");

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
            className={`nav-link ${isEarn ? "active" : ""}`}
            onClick={() => navigate("/earn")}
          >
            Earn
          </button>
          <button
            className={`nav-link ${isSecuritize ? "active" : ""}`}
            onClick={() => navigate("/securitize")}
          >
            Securitize
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
          <button
            className={`nav-link ${isFeeFlow ? "active" : ""}`}
            onClick={() => navigate("/fee-flow")}
          >
            FeeFlow
          </button>
          <button
            className={`nav-link ${isTotals ? "active" : ""}`}
            onClick={() => navigate("/totals")}
          >
            Totals
          </button>
        </nav>
      </div>
      <div className="topbar-right">
        <WalletConnectButton
          appChainId={chainId}
          appChainName={chainNames[chainId] ?? String(chainId)}
        />
      </div>
    </div>
  );
}
