# Adding a Chain

Most chain data reaches the SDK at runtime. This page lists what still needs a change in this repository when Euler launches on a chain, and what to remove when Euler leaves one.

## Read at runtime

These need no SDK change:

- **Deployments.** `deploymentService` reads `EulerChains.json` from [euler-interfaces](https://github.com/euler-xyz/euler-interfaces): contract addresses, `status`, the optional `explorerUrl` and `viemName`. The legacy status `testing` reads as `staging`, and any other unknown status as `unlisted`.
- **The viem chain.** `providerService` resolves the chain from viem by id. See [Chains](./configuration.md#chains) for the resolution order. Two cases need work outside this repository:
  - viem exports several chains with the id: set `viemName` for the chain in euler-interfaces.
  - viem lacks the chain: add it to viem upstream. Until a viem release with the chain is pinned here, apps pass the chain through `chains` in `buildEulerSDK()`.
- **RPC URLs.** Apps supply them through `config.rpcUrls` or `EULER_SDK_RPC_URL_<chainId>`.
- **V3 data.** Vaults, accounts, prices, rewards, labels and token lists come from the V3 API for the chain.

The SDK pins its `viem` version in `package.json`. A chain that viem ships later reaches the SDK's built-in resolution only after that pin is bumped.

## Kept in this repository

| What | Where | Without an entry |
|---|---|---|
| Subgraph default | `defaultAccountVaultsAdapterConfig.subgraphURLs` in `src/sdk/defaultConfig.ts` | The on-chain account adapter and the subgraph vault type adapter have no subgraph for the chain unless apps set `accountVaultsSubgraphUrls` or `vaultTypeSubgraphUrls` (or the matching `EULER_SDK_*_SUBGRAPH_URL_<chainId>` variables). |
| Pyth | `OFFICIAL_PYTH_ADDRESSES_BY_CHAIN_ID` in `src/plugins/pyth/pythPlugin.ts` | The chain's Pyth contract is untrusted: the Pyth plugin skips its price updates on reads and fails planned transactions that need them, unless apps pass `pythAddresses` to `createPythPlugin()`. |
| Merkl | `MERKL_DEFAULT_DISTRIBUTOR_CHAIN_IDS`, or `MERKL_DISTRIBUTOR_OVERRIDES` for a chain with a different distributor, in `src/services/rewardsService/rewardsService.ts` | Merkl claim planning throws `No trusted Merkl distributor for chainId` unless apps set a non-default `rewardsMerklDistributorAddress`. |
| CoW | `COWSWAP_CHAIN_CONFIG` in `src/services/executionService/cowSwapHelpers.ts`: CoW's orderbook URL, settlement and vault relayer, and Euler's CoW wrapper deployments | CoW swaps throw `CoW Swap not supported on chain`. |
| Zero-approval tokens | `TOKENS_REQUIRING_ZERO_APPROVAL_RESET` in `src/services/executionService/tokenApprovalReset.ts` | Approval plans do not reset to zero first for tokens that require it, such as USDT on Ethereum. |
| Position migration | `DEFAULT_AAVE_POOL_ADDRESSES` in `src/services/positionMigrationService/connectors/aave/aaveConnector.ts` and `DEFAULT_MORPHO_ADDRESSES` in `.../morpho/morphoConnector.ts` | Aave and Morpho migrations have no protocol address for the chain unless apps pass `poolAddresses` or `morphoAddresses` in `positionMigrationConnectorConfig`. Add these only when the chain should support migrations. |

Base (8453) and HyperEVM (999) resolve through an interim viem name in `src/services/providerService/chainResolution.ts` because euler-interfaces sets no `viemName` for them yet. Remove that entry once the registry names them.

## Leaving a chain

- The registry marks the chain `deprecated`; apps read it from `deploymentService.getDeployment(chainId).status`.
- Remove the chain's subgraph default once its subgraph is deleted.
- Keep the Pyth, Merkl, CoW and zero-approval entries while the chain is `deprecated`: exits and reward claims still use them.
