"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";
import { QueryProfiler } from "./components/QueryProfiler";
import { TopBar } from "./components/TopBar";
import { SdkProvider } from "./context/SdkContext";
import { queryClient } from "./queries/sdkQueries";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SdkProvider>
        <TopBar />
        <div className="app-layout">
          <div className="app-main">
            <div className="container">{children}</div>
          </div>
          <QueryProfiler />
        </div>
      </SdkProvider>
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
