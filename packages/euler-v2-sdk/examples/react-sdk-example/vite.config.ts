import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";

export default defineConfig({
  plugins: [react(), basicSsl()],
  envPrefix: ["VITE_", "EULER_SDK_"],
  server: {
    proxy: {
      "/api/swap": {
        target: "http://localhost:3002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/swap/, ""),
      },
      "/api/v3": {
        target: "https://v3.euler.finance",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/v3/, ""),
      },
      "/api/subgraphs/euler-simple-mainnet": {
        target:
          "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-mainnet/latest/gn",
        changeOrigin: true,
        rewrite: () => "",
      },
      "/api/subgraphs/euler-simple-unichain": {
        target:
          "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-unichain/latest/gn",
        changeOrigin: true,
        rewrite: () => "",
      },
      "/api/subgraphs/euler-simple-monad": {
        target:
          "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-monad/latest/gn",
        changeOrigin: true,
        rewrite: () => "",
      },
      "/api/subgraphs/euler-simple-sonic": {
        target:
          "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-sonic/latest/gn",
        changeOrigin: true,
        rewrite: () => "",
      },
      "/api/subgraphs/euler-simple-swell": {
        target:
          "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-swell/latest/gn",
        changeOrigin: true,
        rewrite: () => "",
      },
    },
  },
  resolve: {
    alias: {
      "@eulerxyz/euler-v2-sdk": path.resolve(
        __dirname,
        "../../dist/src/index.js",
      ),
    },
  },
  optimizeDeps: {
    exclude: ["@eulerxyz/euler-v2-sdk"],
  },
  define: {
    "process.env": {},
  },
});
