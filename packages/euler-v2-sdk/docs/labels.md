# Labels

Labels are purely off-chain metadata sourced from [`euler-labels`](https://github.com/euler-xyz/euler-labels). They have no effect on any on-chain calculations, pricing, or risk parameters. The labels provided by the SDK are the same data used by the official Euler UI.

## What labels provide

- **Vault labels** &mdash; human-readable name and description for each vault
- **Entities** &mdash; the organisation(s) governing a vault (name, logo, website, socials)
- **Products** &mdash; named groupings of vaults (e.g. "Euler Prime", "MEV Capital")
- **Points** &mdash; third-party points programs available on specific vaults

## Usage

```typescript
const sdk = await buildEulerSDK({ rpcUrls: { 1: 'https://...' } })

// Fetch labels for a chain
const [vaults, entities, products] = await Promise.all([
  sdk.eulerLabelsService.fetchEulerLabelsVaults(1),
  sdk.eulerLabelsService.fetchEulerLabelsEntities(1),
  sdk.eulerLabelsService.fetchEulerLabelsProducts(1),
])

// Look up a specific vault
const label = vaults['0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2']
console.log(label.name)        // "Euler Prime WETH"
console.log(label.description) // "A conservative WETH vault..."
console.log(label.entity)      // "euler-dao" (slug referencing entities map)

// Resolve the entity
const entity = entities['euler-dao']
console.log(entity.name) // "Euler DAO"
console.log(entity.url)  // "https://euler.finance/"

// Find products containing this vault
const vaultProducts = Object.values(products).filter(p =>
  p.vaults.includes('0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2')
)
```

See [`examples/vaults/fetch-vault-details-example.ts`](../examples/vaults/fetch-vault-details-example.ts) for a complete working example.
