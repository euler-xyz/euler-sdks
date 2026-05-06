import type { AccountV3AdapterConfig } from "../services/accountService/accountServiceConfig.js";
import type { DeploymentServiceConfig } from "src/services/deploymentService/deploymentService.js";
import type { AccountVaultsSubgraphAdapterConfig } from "../services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js";
import type { EVaultV3AdapterConfig } from "../services/vaults/eVaultService/eVaultServiceConfig.js";
import type { EulerEarnV3AdapterConfig } from "../services/vaults/eulerEarnService/index.js";
import type {
	VaultTypeSubgraphAdapterConfig,
	VaultTypeV3AdapterConfig,
} from "../services/vaults/vaultMetaService/index.js";
import type { EulerLabelsURLAdapterConfig } from "../services/eulerLabelsService/index.js";
import type { SwapServiceConfig } from "../services/swapService/index.js";
import type { TokenlistServiceConfig } from "../services/tokenlistService/index.js";
import type { BackendConfig } from "../services/priceService/index.js";
import type { IntrinsicApyV3AdapterConfig } from "../services/intrinsicApyService/index.js";
import type { RewardsV3AdapterConfig } from "../services/rewardsService/index.js";

const SUBGRAPH_BASE_URL =
	"https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs";

export const defaultAccountVaultsAdapterConfig: AccountVaultsSubgraphAdapterConfig =
	{
		subgraphURLs: {
			1: `${SUBGRAPH_BASE_URL}/euler-simple-mainnet/latest/gn`,
			10: `${SUBGRAPH_BASE_URL}/euler-simple-optimism/latest/gn`,
			56: `${SUBGRAPH_BASE_URL}/euler-simple-bsc/latest/gn`,
			100: `${SUBGRAPH_BASE_URL}/euler-simple-gnosis/latest/gn`,
			130: `${SUBGRAPH_BASE_URL}/euler-simple-unichain/latest/gn`,
			143: `${SUBGRAPH_BASE_URL}/euler-simple-monad/latest/gn`,
			146: `${SUBGRAPH_BASE_URL}/euler-simple-sonic/latest/gn`,
			239: `${SUBGRAPH_BASE_URL}/euler-simple-tac/latest/gn`,
			480: `${SUBGRAPH_BASE_URL}/euler-simple-worldchain/latest/gn`,
			999: `${SUBGRAPH_BASE_URL}/euler-simple-hyperevm/latest/gn`,
			1923: `${SUBGRAPH_BASE_URL}/euler-simple-swell/latest/gn`,
			5000: `${SUBGRAPH_BASE_URL}/euler-simple-mantle/latest/gn`,
			8453: `${SUBGRAPH_BASE_URL}/euler-simple-base/latest/gn`,
			9745: `${SUBGRAPH_BASE_URL}/euler-simple-plasma/latest/gn`,
			42161: `${SUBGRAPH_BASE_URL}/euler-simple-arbitrum/latest/gn`,
			43114: `${SUBGRAPH_BASE_URL}/euler-simple-avalanche/latest/gn`,
			57073: `${SUBGRAPH_BASE_URL}/euler-simple-ink/latest/gn`,
			60808: `${SUBGRAPH_BASE_URL}/euler-simple-bob/latest/gn`,
			80094: `${SUBGRAPH_BASE_URL}/euler-simple-berachain/latest/gn`,
		},
	};

export const defaultAccountV3AdapterConfig: AccountV3AdapterConfig = {
	endpoint: process.env.EULER_ACCOUNT_V3_API_URL || "https://v3.eul.dev",
};

export const defaultEVaultV3AdapterConfig: EVaultV3AdapterConfig = {
	endpoint: process.env.EULER_EVAULT_V3_API_URL || "https://v3.eul.dev",
};

export const defaultEulerEarnV3AdapterConfig: EulerEarnV3AdapterConfig = {
	endpoint: process.env.EULER_EULER_EARN_V3_API_URL || "https://v3.eul.dev",
};

export const defaultVaultTypeAdapterConfig: VaultTypeV3AdapterConfig = {
	endpoint: process.env.EULER_VAULT_TYPE_V3_API_URL || "https://v3.eul.dev",
};

export const defaultIntrinsicApyV3AdapterConfig: IntrinsicApyV3AdapterConfig = {
	endpoint: process.env.EULER_INTRINSIC_APY_V3_API_URL || "https://v3.eul.dev",
};

export const defaultRewardsV3AdapterConfig: RewardsV3AdapterConfig = {
	endpoint: process.env.EULER_REWARDS_V3_API_URL || "https://v3.eul.dev",
};

/** Same subgraph endpoints as account vaults; kept for explicit subgraph-based vault type resolution. */
export const defaultVaultTypeSubgraphAdapterConfig: VaultTypeSubgraphAdapterConfig =
	defaultAccountVaultsAdapterConfig;

const EULER_LABELS_BASE =
	"https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master";

export const defaultEulerLabelsURLAdapterConfig: EulerLabelsURLAdapterConfig = {
	getEulerLabelsEntitiesUrl: (chainId: number) =>
		`${EULER_LABELS_BASE}/${chainId}/entities.json`,
	getEulerLabelsProductsUrl: (chainId: number) =>
		`${EULER_LABELS_BASE}/${chainId}/products.json`,
	getEulerLabelsPointsUrl: (chainId: number) =>
		`${EULER_LABELS_BASE}/${chainId}/points.json`,
	getEulerLabelsEarnVaultsUrl: (chainId: number) =>
		`${EULER_LABELS_BASE}/${chainId}/earn-vaults.json`,
	getEulerLabelsAssetsUrl: (chainId: number) =>
		`${EULER_LABELS_BASE}/${chainId}/assets.json`,
	getEulerLabelsGlobalAssetsUrl: () => `${EULER_LABELS_BASE}/all/assets.json`,
	getEulerLabelsLogoUrl: (filename: string) =>
		`${EULER_LABELS_BASE}/logo/${filename}`,
};

export const defaultBackendConfig: BackendConfig = {
	endpoint: process.env.PRICING_API_URL || "https://v3.eul.dev",
};

export const defaultSwapServiceConfig: SwapServiceConfig = {
	swapApiUrl: process.env.SWAP_API_URL || "https://swap.euler.finance",
	defaultDeadline: 1800, // 30 minutes
};

export const defaultDeploymentServiceConfig: DeploymentServiceConfig = {
	deploymentsUrl:
		process.env.DEPLOYMENTS_URL ||
		"https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/master/EulerChains.json",
};

const DEFAULT_TOKENLIST_API_BASE =
	process.env.TOKENLIST_API_BASE || "https://indexer.euler.finance";

export const defaultTokenlistServiceConfig: TokenlistServiceConfig = {
	getTokenListUrl: (chainId: number) =>
		`${DEFAULT_TOKENLIST_API_BASE}/v1/tokens?chainId=${chainId}`,
};
