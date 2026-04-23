import { defineConfig } from "vitest/config";

const coverageFiles = [
	"src/utils/buildQuery.ts",
	"src/services/abiService/abiService.ts",
	"src/services/deploymentService/deploymentService.ts",
	"src/services/providerService/providerService.ts",
	"src/services/tokenlistService/tokenlistService.ts",
	"src/services/eulerLabelsService/eulerLabelsService.ts",
	"src/services/intrinsicApyService/intrinsicApyService.ts",
	"src/services/walletService/walletService.ts",
	"src/services/walletService/adapters/walletOnchainAdapter.ts",
	"src/services/accountService/accountService.ts",
	"src/services/vaults/vaultMetaService/vaultMetaService.ts",
	"src/services/vaults/eVaultService/eVaultService.ts",
];

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/readPathInfra.test.ts", "test/readPathServices.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "lcov"],
			include: coverageFiles,
			thresholds: {
				perFile: true,
				lines: 100,
				branches: 100,
				functions: 100,
				statements: 100,
			},
		},
	},
});
