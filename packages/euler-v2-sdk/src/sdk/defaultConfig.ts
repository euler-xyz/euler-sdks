import type { AccountV3AdapterConfig } from "../services/accountService/accountServiceConfig.js"
import type { DeploymentServiceConfig } from "src/services/deploymentService/deploymentService.js"
import type { AccountVaultsSubgraphAdapterConfig } from "../services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.js"
import type { EVaultV3AdapterConfig } from "../services/vaults/eVaultService/eVaultServiceConfig.js"
import type { EulerEarnV3AdapterConfig } from "../services/vaults/eulerEarnService/index.js"
import type { VaultTypeSubgraphAdapterConfig, VaultTypeV3AdapterConfig } from "../services/vaults/vaultMetaService/index.js"
import type { EulerLabelsURLAdapterConfig } from "../services/eulerLabelsService/index.js"
import type { SwapServiceConfig } from "../services/swapService/index.js"
import type { TokenlistServiceConfig } from "../services/tokenlistService/index.js"
import type { BackendConfig } from "../services/priceService/index.js"

export const defaultAccountVaultsAdapterConfig: AccountVaultsSubgraphAdapterConfig = {
  subgraphURLs: {
    1: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-mainnet/latest/gn',
    10: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-optimism/latest/gn',
    56: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-bsc/latest/gn',
    100: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-gnosis/latest/gn',
    130: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-unichain/latest/gn',
    146: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-sonic/latest/gn',
    239: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-tac/latest/gn',
    480: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-worldchain/latest/gn',
    999: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-hyperevm/latest/gn',
    1923: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-swell/latest/gn',
    5000: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-mantle/latest/gn',
    8453: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-base/latest/gn',
    9745: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-plasma/latest/gn',
    42161: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-arbitrum/latest/gn',
    43114: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-avalanche/latest/gn',
    57073: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-ink/latest/gn',
    60808: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-bob/latest/gn',
    80094: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-berachain/latest/gn',
  }
}

export const defaultAccountV3AdapterConfig: AccountV3AdapterConfig = {
  endpoint: process.env.EULER_ACCOUNT_V3_API_URL || "https://v3staging.eul.dev",
}

export const defaultEVaultV3AdapterConfig: EVaultV3AdapterConfig = {
  endpoint: process.env.EULER_EVAULT_V3_API_URL || "https://v3staging.eul.dev",
}

export const defaultEulerEarnV3AdapterConfig: EulerEarnV3AdapterConfig = {
  endpoint: process.env.EULER_EULER_EARN_V3_API_URL || "https://v3staging.eul.dev",
}

export const defaultVaultTypeAdapterConfig: VaultTypeV3AdapterConfig = {
  endpoint: process.env.EULER_VAULT_TYPE_V3_API_URL || "https://v3staging.eul.dev",
}

/** Same subgraph endpoints as account vaults; kept for explicit subgraph-based vault type resolution. */
export const defaultVaultTypeSubgraphAdapterConfig: VaultTypeSubgraphAdapterConfig =
  defaultAccountVaultsAdapterConfig;

const EULER_LABELS_BASE = 'https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master';

export const defaultEulerLabelsURLAdapterConfig: EulerLabelsURLAdapterConfig = {
  getEulerLabelsVaultsUrl: (chainId: number) => `${EULER_LABELS_BASE}/${chainId}/vaults.json`,
  getEulerLabelsEntitiesUrl: (chainId: number) => `${EULER_LABELS_BASE}/${chainId}/entities.json`,
  getEulerLabelsProductsUrl: (chainId: number) => `${EULER_LABELS_BASE}/${chainId}/products.json`,
  getEulerLabelsPointsUrl: (chainId: number) => `${EULER_LABELS_BASE}/${chainId}/points.json`,
  getEulerLabelsEarnVaultsUrl: (chainId: number) => `${EULER_LABELS_BASE}/${chainId}/eulerEarnVaults.json`,
  getEulerLabelsLogoUrl: (filename: string) => `${EULER_LABELS_BASE}/logo/${filename}`,
}

export const defaultBackendConfig: BackendConfig = {
  endpoint: process.env.PRICING_API_URL || "https://indexer.euler.finance",
}

export const defaultSwapServiceConfig: SwapServiceConfig = {
  swapApiUrl: process.env.SWAP_API_URL || "https://swap.euler.finance",
  defaultDeadline: 1800, // 30 minutes
}

export const defaultDeploymentServiceConfig: DeploymentServiceConfig = {
  deploymentsUrl: process.env.DEPLOYMENTS_URL || "https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/master/EulerChains.json"
}

const DEFAULT_TOKENLIST_API_BASE = process.env.TOKENLIST_API_BASE || "https://indexer.euler.finance";

export const defaultTokenlistServiceConfig: TokenlistServiceConfig = {
  getTokenListUrl: (chainId: number) => `${DEFAULT_TOKENLIST_API_BASE}/v1/tokens?chainId=${chainId}`,
}
