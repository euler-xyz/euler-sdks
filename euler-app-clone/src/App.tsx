import { Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries/queryClient.ts";
import { SdkProvider } from "./context/SdkContext.tsx";
import { Header } from "./components/Header.tsx";
import { LendPage } from "./pages/LendPage.tsx";
import { BorrowPage } from "./pages/BorrowPage.tsx";
import { EarnPage } from "./pages/EarnPage.tsx";
import { PortfolioPage } from "./pages/PortfolioPage.tsx";
import { VaultDetailPage } from "./pages/VaultDetailPage.tsx";
import { EarnDetailPage } from "./pages/EarnDetailPage.tsx";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SdkProvider>
        <Header />
        <main className="page-container">
          <Routes>
            <Route path="/" element={<Navigate to="/lend" replace />} />
            <Route path="/lend" element={<LendPage />} />
            <Route path="/borrow" element={<BorrowPage />} />
            <Route path="/earn" element={<EarnPage />} />
            <Route path="/earn/:chainId/:address" element={<EarnDetailPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/vault/:chainId/:address" element={<VaultDetailPage />} />
          </Routes>
        </main>
      </SdkProvider>
    </QueryClientProvider>
  );
}
