import { AccountVaultsSubgraphDataSourceConfig } from "../services/accountService/dataSources/accountVaultsSubgraphDataSource.js"
import { EulerLabelsURLDataSourceConfig } from "../services/eulerLabelsService/index.js"
import type { SwapServiceConfig } from "../services/swapService/index.js"

export const defaultAccountVaultsDataSourceConfig: AccountVaultsSubgraphDataSourceConfig = {
  subgraphURLs: {
    1: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn',
    10: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-optimism/latest/gn',
    56: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-bsc/latest/gn',
    100: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-gnosis/latest/gn',
    130: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-unichain/latest/gn',
    146: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-sonic/latest/gn',
    239: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-tac/latest/gn',
    480: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-worldchain/latest/gn',
    999: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-hyperevm/latest/gn',
    1923: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-swell/latest/gn',
    5000: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mantle/latest/gn',
    8453: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-base/latest/gn',
    9745: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-plasma/latest/gn',
    42161: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-arbitrum/latest/gn',
    43114: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-avalanche/latest/gn',
    57073: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-ink/latest/gn',
    60808: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-bob/latest/gn',
    80094: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-berachain/latest/gn',
  }
}

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