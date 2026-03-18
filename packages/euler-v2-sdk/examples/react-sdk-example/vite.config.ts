import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/euler-v3": {
        target: "https://v3staging.eul.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/euler-v3/, ""),
      },
      "/api/brevis-campaigns": {
        target: "https://incentra-prd.brevis.network/sdk/v1/eulerCampaigns",
        changeOrigin: true,
        rewrite: () => "",
      },
      "/api/brevis-proofs": {
        target: "https://incentra-prd.brevis.network/v1/getMerkleProofsBatch",
        changeOrigin: true,
        rewrite: () => "",
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
