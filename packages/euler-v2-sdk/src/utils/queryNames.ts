import type { ABIService } from "../services/abiService/abiService.js";
import type { AccountOnchainAdapter } from "../services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.js";
import type { AccountVaultsSubgraphAdapter } from "../services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import type { AccountV3Adapter } from "../services/accountService/adapters/accountV3Adapter/accountV3Adapter.js";
import type { DeploymentService } from "../services/deploymentService/deploymentService.js";
import type { EulerLabelsURLAdapter } from "../services/eulerLabelsService/eulerLabelsService.js";
import type { IntrinsicApyService } from "../services/intrinsicApyService/intrinsicApyService.js";
import type { OracleAdapterService } from "../services/oracleAdapterService/oracleAdapterService.js";
import type { PricingBackendClient } from "../services/priceService/backendClient.js";
import type { PriceService } from "../services/priceService/priceService.js";
import type { RewardsService } from "../services/rewardsService/rewardsService.js";
import type { SwapService } from "../services/swapService/swapService.js";
import type { TokenlistService } from "../services/tokenlistService/tokenlistService.js";
import type { WalletOnchainAdapter } from "../services/walletService/adapters/walletOnchainAdapter.js";
import type { EVaultOnchainAdapter } from "../services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.js";
import type { EVaultV3Adapter } from "../services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.js";
import type { EulerEarnOnchainAdapter } from "../services/vaults/eulerEarnService/adapters/eulerEarnOnchainAdapter.js";
import type { EulerEarnV3Adapter } from "../services/vaults/eulerEarnService/adapters/eulerEarnV3Adapter.js";
import type { SecuritizeVaultOnchainAdapter } from "../services/vaults/securitizeVaultService/adapters/securitizeVaultOnchainAdapter.js";
import type { VaultTypeSubgraphAdapter } from "../services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.js";
import type { VaultTypeV3Adapter } from "../services/vaults/vaultMetaService/adapters/VaultTypeV3Adapter.js";
import type { BatchSimulationAdapter } from "../plugins/batchSimulation.js";
import type { KeyringPluginAdapter } from "../plugins/keyring/keyringPlugin.js";
import type { PythPluginAdapter } from "../plugins/pyth/pythPlugin.js";

export type QueryMethodName<T> = Extract<keyof T, `query${string}`>;

export type EulerSDKQueryName =
	| QueryMethodName<ABIService>
	| QueryMethodName<AccountOnchainAdapter>
	| QueryMethodName<AccountVaultsSubgraphAdapter>
	| QueryMethodName<AccountV3Adapter>
	| QueryMethodName<typeof DeploymentService>
	| QueryMethodName<EulerLabelsURLAdapter>
	| QueryMethodName<IntrinsicApyService>
	| QueryMethodName<OracleAdapterService>
	| QueryMethodName<PricingBackendClient>
	| QueryMethodName<PriceService>
	| QueryMethodName<RewardsService>
	| QueryMethodName<SwapService>
	| QueryMethodName<TokenlistService>
	| QueryMethodName<WalletOnchainAdapter>
	| QueryMethodName<EVaultOnchainAdapter>
	| QueryMethodName<EVaultV3Adapter>
	| QueryMethodName<EulerEarnOnchainAdapter>
	| QueryMethodName<EulerEarnV3Adapter>
	| QueryMethodName<SecuritizeVaultOnchainAdapter>
	| QueryMethodName<VaultTypeSubgraphAdapter>
	| QueryMethodName<VaultTypeV3Adapter>
	| QueryMethodName<BatchSimulationAdapter>
	| QueryMethodName<KeyringPluginAdapter>
	| QueryMethodName<PythPluginAdapter>;
