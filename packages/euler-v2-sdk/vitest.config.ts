import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@eulerxyz/euler-v2-sdk": fileURLToPath(
				new URL("./src/index.ts", import.meta.url),
			),
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
