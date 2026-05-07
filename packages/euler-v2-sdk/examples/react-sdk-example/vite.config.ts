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
        target: "https://v3.eul.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/v3/, ""),
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
