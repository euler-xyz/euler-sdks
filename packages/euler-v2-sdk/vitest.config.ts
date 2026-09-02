import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@eulerxyz/euler-v2-sdk": new URL("./src/index.ts", import.meta.url).pathname,
		},
	},
	test: {
		environment: "node",
		include: ["test/*.test.ts"],
		typecheck: {
			enabled: true,
			include: ["test/*.test-d.ts"],
			tsconfig: "./tsconfig.typetest.json",
		},
	},
});
