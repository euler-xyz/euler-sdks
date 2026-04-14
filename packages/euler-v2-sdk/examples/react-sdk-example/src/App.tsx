import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries/sdkQueries.ts";
import { useShowQueryProfiler } from "./queries/queryOptionsStore.ts";
import { SdkProvider } from "./context/SdkContext.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { DataInterceptorModal } from "./components/DataInterceptorModal.tsx";
import { QueryOptionsModal } from "./components/QueryOptionsModal.tsx";
import { QueryProfiler } from "./components/QueryProfiler.tsx";
import { VaultListPage } from "./pages/VaultListPage.tsx";
import { VaultDetailPage } from "./pages/VaultDetailPage.tsx";
import { EulerEarnDetailPage } from "./pages/EulerEarnDetailPage.tsx";
import { BorrowPage } from "./pages/BorrowPage.tsx";
import { BorrowPairPage } from "./pages/BorrowPairPage.tsx";
import { PortfolioPage } from "./pages/PortfolioPage.tsx";
import { RewardsPage } from "./pages/RewardsPage.tsx";
import { FeeFlowPage } from "./pages/FeeFlowPage.tsx";

function AppShell() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const showQueryProfiler = useShowQueryProfiler();

  return (
    <>
      <TopBar />
      <DataInterceptorModal />
      <QueryOptionsModal open={toolsOpen} onClose={() => setToolsOpen(false)} />
      <button
        type="button"
        className={`sdk-tools-launcher ${toolsOpen ? "active" : ""}`}
        onClick={() => setToolsOpen(true)}
        aria-label="Open SDK tools"
        title="Open SDK tools"
      >
        <span aria-hidden="true" className="sdk-tools-launcher-icon">
          ⚙
        </span>
      </button>
      <div className="app-layout">
        <div className="app-main">
          <div className="container">
            <Routes>
              <Route path="/" element={<Navigate to="/vaults" replace />} />
              <Route path="/vaults" element={<VaultListPage tab="evaults" />} />
              <Route path="/earn" element={<VaultListPage tab="eulerEarn" />} />
              <Route path="/securitize" element={<VaultListPage tab="securitize" />} />
              <Route path="/borrow" element={<BorrowPage />} />
              <Route
                path="/borrow/:chainId/:collateral/:debt"
                element={<BorrowPairPage />}
              />
              <Route
                path="/vault/:chainId/:address"
                element={<VaultDetailPage />}
              />
              <Route
                path="/earn/:chainId/:address"
                element={<EulerEarnDetailPage />}
              />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/fee-flow" element={<FeeFlowPage />} />
            </Routes>
          </div>
        </div>
        {showQueryProfiler ? <QueryProfiler /> : null}
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SdkProvider>
        <AppShell />
      </SdkProvider>
    </QueryClientProvider>
  );
}

export default App;
