"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode, Suspense } from "react";
import { TopBar } from "./components/TopBar";
import { SdkProvider } from "./context/SdkContext";
import { queryClient } from "./queries/sdkQueries";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SdkProvider>
        <Suspense fallback={null}>
          <TopBar />
        </Suspense>
        <div className="app-layout">
          <div className="app-main">
            <div className="container">{children}</div>
          </div>
        </div>
      </SdkProvider>
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
