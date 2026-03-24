import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
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
