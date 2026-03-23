import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const proxyStartKey = Symbol("proxyStart");

function withProxyProfiling(label: string) {
  return (proxy: {
    on: (
      event: string,
      listener: (...args: unknown[]) => void
    ) => void;
  }) => {
    proxy.on("proxyReq", (_proxyReq, req) => {
      (req as Record<PropertyKey, unknown>)[proxyStartKey] = Date.now();
    });

    proxy.on("proxyRes", (proxyRes, req) => {
      const start = (req as Record<PropertyKey, unknown>)[proxyStartKey];
      const elapsedMs =
        typeof start === "number" ? Date.now() - start : undefined;
      const method =
        typeof (req as { method?: unknown }).method === "string"
          ? (req as { method: string }).method
          : "UNKNOWN";
      const url =
        typeof (req as { url?: unknown }).url === "string"
          ? (req as { url: string }).url
          : "";
      const statusCode =
        typeof (proxyRes as { statusCode?: unknown }).statusCode === "number"
          ? (proxyRes as { statusCode: number }).statusCode
          : "unknown";

      console.log(
        `[proxy:${label}] ${method} ${url} -> ${statusCode} in ${elapsedMs ?? "?"}ms`
      );
    });

    proxy.on("error", (error, req) => {
      const start = (req as Record<PropertyKey, unknown>)[proxyStartKey];
      const elapsedMs =
        typeof start === "number" ? Date.now() - start : undefined;
      const method =
        typeof (req as { method?: unknown }).method === "string"
          ? (req as { method: string }).method
          : "UNKNOWN";
      const url =
        typeof (req as { url?: unknown }).url === "string"
          ? (req as { url: string }).url
          : "";
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[proxy:${label}] ${method} ${url} failed in ${elapsedMs ?? "?"}ms: ${message}`
      );
    });
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/euler-v3": {
        target: "https://v3staging.eul.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/euler-v3/, ""),
        configure: withProxyProfiling("euler-v3"),
      },
      "/api/brevis-campaigns": {
        target: "https://incentra-prd.brevis.network/sdk/v1/eulerCampaigns",
        changeOrigin: true,
        rewrite: () => "",
        configure: withProxyProfiling("brevis-campaigns"),
      },
      "/api/brevis-proofs": {
        target: "https://incentra-prd.brevis.network/v1/getMerkleProofsBatch",
        changeOrigin: true,
        rewrite: () => "",
        configure: withProxyProfiling("brevis-proofs"),
      },
    },
  },
  resolve: {
    alias: {
      "euler-v2-sdk": path.resolve(
        __dirname,
        "../../dist/src/index.js",
      ),
    },
  },
  optimizeDeps: {
    exclude: ["euler-v2-sdk"],
  },
  define: {
    "process.env": {},
  },
});
