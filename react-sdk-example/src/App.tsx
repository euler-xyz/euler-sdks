import { Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries/sdkQueries.ts";
import { SdkProvider } from "./context/SdkContext.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { QueryProfiler } from "./components/QueryProfiler.tsx";
import { VaultListPage } from "./pages/VaultListPage.tsx";
import { VaultDetailPage } from "./pages/VaultDetailPage.tsx";
import { EulerEarnDetailPage } from "./pages/EulerEarnDetailPage.tsx";
import { PortfolioPage } from "./pages/PortfolioPage.tsx";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SdkProvider>
        <TopBar />
        <div className="app-layout">
          <div className="app-main">
            <div className="container">
              <Routes>
                <Route path="/" element={<Navigate to="/vaults" replace />} />
                <Route path="/vaults" element={<VaultListPage />} />
                <Route
                  path="/vault/:chainId/:address"
                  element={<VaultDetailPage />}
                />
                <Route
                  path="/earn/:chainId/:address"
                  element={<EulerEarnDetailPage />}
                />
                <Route path="/portfolio" element={<PortfolioPage />} />
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
