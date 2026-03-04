import { Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries/sdkQueries.ts";
import { SdkProvider } from "./context/SdkContext.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { DataInterceptorModal } from "./components/DataInterceptorModal.tsx";
import { QueryProfiler } from "./components/QueryProfiler.tsx";
import { VaultListPage } from "./pages/VaultListPage.tsx";
import { VaultDetailPage } from "./pages/VaultDetailPage.tsx";
import { EulerEarnDetailPage } from "./pages/EulerEarnDetailPage.tsx";
import { BorrowPage } from "./pages/BorrowPage.tsx";
import { BorrowPairPage } from "./pages/BorrowPairPage.tsx";
import { PortfolioPage } from "./pages/PortfolioPage.tsx";
import { RewardsPage } from "./pages/RewardsPage.tsx";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SdkProvider>
        <TopBar />
        <DataInterceptorModal />
        <div className="app-layout">
          <div className="app-main">
            <div className="container">
              <Routes>
                <Route path="/" element={<Navigate to="/vaults" replace />} />
                <Route path="/vaults" element={<VaultListPage />} />
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
              </Routes>
            </div>
          </div>
          <QueryProfiler />
        </div>
      </SdkProvider>
    </QueryClientProvider>
  );
}

export default App;
