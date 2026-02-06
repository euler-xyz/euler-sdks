import { DeploymentServiceConfig } from "src/services/deploymentService/deploymentService.js"
import { AccountVaultsSubgraphDataSourceConfig } from "../services/accountService/dataSources/accountVaultsSubgraphDataSource.js"
import type { VaultTypeSubgraphDataSourceConfig } from "../services/vaults/vaultMetaService/index.js"
import { EulerLabelsURLDataSourceConfig } from "../services/eulerLabelsService/index.js"
import type { SwapServiceConfig } from "../services/swapService/index.js"
import type { TokenlistServiceConfig } from "../services/tokenlistService/index.js"

export const defaultAccountVaultsDataSourceConfig: AccountVaultsSubgraphDataSourceConfig = {
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

/** Same subgraph endpoints as account vaults; used by VaultMetaService to resolve vault type from factory. */
export const defaultVaultTypeDataSourceConfig: VaultTypeSubgraphDataSourceConfig =
  defaultAccountVaultsDataSourceConfig;

export const defaultEulerLabelsURLDataSourceConfig: EulerLabelsURLDataSourceConfig = {
  getEulerLabelsVaultsUrl: (chainId: number) => `https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master/${chainId}/vaults.json`,
  getEulerLabelsEntitiesUrl: (chainId: number) => `https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master/${chainId}/entities.json`,
  getEulerLabelsProductsUrl: (chainId: number) => `https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master/${chainId}/products.json`,
  getEulerLabelsEarnVaultsUrl: (chainId: number) => `https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master/${chainId}/eulerEarnVaults.json`,
}

export const defaultSwapServiceConfig: SwapServiceConfig = {
  swapApiUrl: process.env.SWAP_API_URL || "https://swap.euler.finance",
  defaultDeadline: 1800, // 30 minutes
}

export const defaultDeploymentServiceConfig: DeploymentServiceConfig = {
  deploymentsUrl: process.env.DEPLOYMENTS_URL || "https://raw.githubusercontent.com/euler-xyz/euler-interfaces/refs/heads/master/EulerChains.json"
}

export const defaultTokenlistServiceConfig: TokenlistServiceConfig = {
  apiBaseUrl: process.env.EULER_API_URL || "https://index.euler.finance",
} 