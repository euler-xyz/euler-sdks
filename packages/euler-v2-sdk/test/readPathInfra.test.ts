import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, zeroAddress } from "viem";

import {
  applyBuildQuery,
  createQueryCacheBuildQuery,
  serializeQueryArgs,
  type BuildQueryFn,
} from "../src/utils/buildQuery.js";
import { DeploymentService } from "../src/services/deploymentService/deploymentService.js";
import { ProviderService } from "../src/services/providerService/providerService.js";
import { ABIService } from "../src/services/abiService/abiService.js";
import { TokenlistService } from "../src/services/tokenlistService/tokenlistService.js";
import {
  EulerLabelsService,
  EulerLabelsURLAdapter,
} from "../src/services/eulerLabelsService/eulerLabelsService.js";
import { IntrinsicApyService } from "../src/services/intrinsicApyService/intrinsicApyService.js";
import { WalletService } from "../src/services/walletService/walletService.js";
import { WalletOnchainAdapter } from "../src/services/walletService/adapters/walletOnchainAdapter.js";
import { OracleAdapterService } from "../src/services/oracleAdapterService/oracleAdapterService.js";
import { Wallet } from "../src/entities/Wallet.js";
import { EVault } from "../src/entities/EVault.js";
import {
  getCollateralizedEVaultFixture,
  getPlainEVaultFixture,
} from "./helpers/readCorpus.ts";
import {
  applyEulerLabelVaultOverrides,
  createEmptyEulerLabelsData,
  getEulerLabelAssetBlock,
  getEulerLabelEntitiesByVault,
  getEulerLabelProductByVault,
  getEulerLabelVaultNotice,
  isEulerLabelEarnVaultDeprecated,
  isEulerLabelVaultDeprecated,
  isEulerLabelVaultFeatured,
  isEulerLabelVaultKeyring,
  isEulerLabelVaultNotExplorable,
} from "../src/utils/eulerLabels.js";

const originalQueryDeployments = DeploymentService.queryDeployments;

function createBuildQueryRecorder() {
  const calls: Array<{ queryName: string; args: unknown[] }> = [];
  const buildQuery: BuildQueryFn = (queryName, fn, target) => {
    assert.ok(target);
    return (async (...args: unknown[]) => {
      calls.push({ queryName, args });
      return fn(...args);
    }) as typeof fn;
  };
  return { buildQuery, calls };
}

function makeDeployment(chainId = 1) {
  return {
    chainId,
    name: `chain-${chainId}`,
    status: "active",
    addresses: {
      coreAddrs: {
        balanceTracker: zeroAddress,
        eVaultFactory: "0x0000000000000000000000000000000000000001",
        eVaultImplementation: "0x0000000000000000000000000000000000000002",
        eulerEarnFactory: "0x0000000000000000000000000000000000000003",
        evc: "0x0000000000000000000000000000000000000004",
        permit2: "0x0000000000000000000000000000000000000005",
        protocolConfig: "0x0000000000000000000000000000000000000006",
        sequenceRegistry: "0x0000000000000000000000000000000000000007",
      },
      lensAddrs: {
        accountLens: "0x0000000000000000000000000000000000000011",
        eulerEarnVaultLens: "0x0000000000000000000000000000000000000012",
        irmLens: "0x0000000000000000000000000000000000000013",
        oracleLens: "0x0000000000000000000000000000000000000014",
        utilsLens: "0x0000000000000000000000000000000000000015",
        vaultLens: "0x0000000000000000000000000000000000000016",
      },
    },
  } as const;
}

test("buildQuery cache dedupes, clears rejected promises, and decorate query methods", async () => {
  let runs = 0;
  const cached = createQueryCacheBuildQuery({ ttlMs: 60_000 })(
    "queryExample",
    async (value: unknown) => {
      runs += 1;
      if (value === "boom") throw new Error("boom");
      return { value, runs };
    },
    {},
  );

  const concurrent = await Promise.all([cached("ok"), cached("ok")]);
  assert.deepEqual(concurrent[0], concurrent[1]);
  assert.equal(runs, 1);
  assert.deepEqual(await cached("circular"), { value: "circular", runs: 2 });
  assert.deepEqual(await cached(1n), { value: 1n, runs: 3 });
  assert.deepEqual(await cached(1n), { value: 1n, runs: 3 });
  const fnArg = async () => "fn";
  assert.deepEqual(await cached(fnArg), { value: fnArg, runs: 4 });

  await assert.rejects(() => cached("boom"), /boom/);
  await assert.rejects(() => cached("boom"), /boom/);
  assert.equal(runs, 6);

  const passthrough = createQueryCacheBuildQuery({ enabled: false })(
    "queryDisabled",
    async () => "disabled",
    {},
  );
  assert.equal(await passthrough(), "disabled");

  const ttlDisabled = createQueryCacheBuildQuery({ ttlMs: 0 })(
    "queryNoTtl",
    async () => "no-ttl",
    {},
  );
  assert.equal(await ttlDisabled(), "no-ttl");

  const uncachedFn = createQueryCacheBuildQuery()(
    "queryUnserializable",
    async () => "unserializable",
    {},
  );
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(await uncachedFn(circular), "unserializable");

  class QueryContainer {
    queryAlpha = async () => "alpha";
    notAQuery = async () => "skip";
  }

  const decorated = new QueryContainer();
  const seen: string[] = [];
  applyBuildQuery(decorated, (queryName, fn) => {
    seen.push(queryName);
    return (async (...args: unknown[]) => fn(...args)) as typeof fn;
  });
  assert.deepEqual(seen, ["queryAlpha"]);
  assert.equal(await decorated.queryAlpha(), "alpha");
  assert.equal(await decorated.notAQuery(), "skip");

  const originalMapGet = Map.prototype.get;
  try {
    const malformedCached = createQueryCacheBuildQuery({ ttlMs: 60_000 })(
      "queryMalformed",
      async () => "seed",
      {},
    );
    assert.equal(await malformedCached("k"), "seed");
    let injectedMalformedValue = false;
    Map.prototype.get = function patchedGet(key) {
      const value = originalMapGet.call(this, key);
      if (
        !injectedMalformedValue &&
        value &&
        typeof value === "object" &&
        "value" in (value as object)
      ) {
        injectedMalformedValue = true;
        return { expiresAt: Date.now() + 60_000 } as any;
      }
      return value;
    };
    assert.equal(await malformedCached("k"), "seed");
  } finally {
    Map.prototype.get = originalMapGet;
  }

  try {
    const staleRejected = createQueryCacheBuildQuery({ ttlMs: 60_000 })(
      "queryRejectedCleanup",
      async () => {
        throw new Error("reject-no-delete");
      },
      {},
    );
    let replacedPromiseReference = false;
    Map.prototype.get = function patchedGet(key) {
      const value = originalMapGet.call(this, key);
      if (
        !replacedPromiseReference &&
        value &&
        typeof value === "object" &&
        "promise" in (value as object)
      ) {
        replacedPromiseReference = true;
        return {
          ...(value as object),
          promise: Promise.resolve("other"),
        } as any;
      }
      return value;
    };
    await assert.rejects(() => staleRejected("k"), /reject-no-delete/);
  } finally {
    Map.prototype.get = originalMapGet;
  }
});

test("serializeQueryArgs handles nested bigint values for external caches", () => {
  assert.equal(
    serializeQueryArgs([{ nested: { amount: 1n } }]),
    '[{"nested":{"amount":{"__type":"bigint","value":"1"}}}]',
  );
});

test("deployment, provider, abi, tokenlist, intrinsic apy, wallet, and labels services cover their read flows", async () => {
  const { buildQuery, calls } = createBuildQueryRecorder();

  DeploymentService.setQueryDeployments(async (url) => {
    assert.equal(url, "https://deployments");
    return [makeDeployment(1), makeDeployment(8453)];
  });
  const deploymentService = await DeploymentService.build(
    { deploymentsUrl: "https://deployments" },
    buildQuery,
  );
  const undecoratedDeploymentService = await DeploymentService.build({
    deploymentsUrl: "https://deployments",
  });
  assert.equal(undecoratedDeploymentService.getDeployment(1).name, "chain-1");
  assert.deepEqual(
    deploymentService.getDeploymentChainIds().sort((a, b) => a - b),
    [1, 8453],
  );
  assert.equal(
    deploymentService.getDeployment(1).addresses.coreAddrs.permit2,
    "0x0000000000000000000000000000000000000005",
  );
  deploymentService.addDeployment(makeDeployment(42161));
  assert.equal(deploymentService.getDeployment(42161).name, "chain-42161");
  assert.throws(
    () => deploymentService.getDeployment(999),
    /Deployment not found/,
  );

  const providerService = new ProviderService({
    1: "https://ethereum-rpc.publicnode.com",
    8453: "https://base-rpc.publicnode.com",
  });
  assert.deepEqual(
    providerService.getSupportedChainIds().sort((a, b) => a - b),
    [1, 8453],
  );
  assert.equal(providerService.getProvider(1).chain?.id, 1);
  assert.throws(
    () => providerService.getProvider(10),
    /No provider configured/,
  );
  assert.throws(
    () => new ProviderService({ 999999: "https://invalid.example" }),
    /Chain 999999 not supported/,
  );

  const abiService = new ABIService(buildQuery);
  let abiFetches = 0;
  abiService.setQueryABI(async (url) => {
    abiFetches += 1;
    assert.match(url, /MockContract\.json$/);
    return [{ type: "function", name: "mock", inputs: [], outputs: [] }] as any;
  });
  const abiA = await abiService.fetchABI(1, "MockContract");
  const abiB = await abiService.fetchABI(1, "MockContract");
  assert.equal(abiFetches, 1);
  assert.deepEqual(abiA, abiB);

  const tokenlistService = new TokenlistService(
    { getTokenListUrl: (chainId) => `https://tokens/${chainId}` },
    buildQuery,
  );
  tokenlistService.setQueryTokenList(async (url) => {
    assert.equal(url, "https://tokens/1");
    return [
      {
        chainId: 1,
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        logoURI: "usdc.svg",
        groups: ["stable"],
        metadata: { verified: true },
        coingeckoId: "usd-coin",
      },
      {
        chainId: 1,
        address: "0x00000000000000000000000000000000000000aa",
        name: undefined as any,
        symbol: undefined as any,
        decimals: undefined as any,
      },
      {
        chainId: 1,
        address: "",
        name: "Broken",
        symbol: "BROKEN",
        decimals: 18,
      },
    ];
  });
  assert.equal(tokenlistService.isLoaded(1), false);
  const tokenlist = await tokenlistService.loadTokenlist(1);
  assert.equal(tokenlist.length, 2);
  assert.equal(tokenlist[0]?.logoURI, "usdc.svg");
  assert.equal(tokenlist[1]?.name, "");
  assert.equal(tokenlist[1]?.symbol, "");
  assert.equal(Number.isNaN(tokenlist[1]?.decimals), true);
  assert.equal(tokenlistService.isLoaded(1), true);
  assert.equal(
    tokenlistService.getToken(1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
      ?.symbol,
    "USDC",
  );
  assert.throws(
    () => tokenlistService.getToken(8453, zeroAddress),
    /not loaded/,
  );

  const intrinsicAdapterCalls: Array<{
    chainId: number;
    assetAddresses?: Address[];
  }> = [];
  const intrinsicApyService = new IntrinsicApyService({
    async fetchIntrinsicApy(chainId, assetAddress) {
      return { apy: Number(chainId) + assetAddress.length, provider: "mock" };
    },
    async fetchChainIntrinsicApys(chainId, assetAddresses) {
      intrinsicAdapterCalls.push({ chainId, assetAddresses });
      return new Map(
        (assetAddresses ?? []).map((address) => [
          address.toLowerCase(),
          { apy: 0.05, provider: "mock", source: `${chainId}:${address}` },
        ]),
      );
    },
  });
  const plainVault = new EVault(getPlainEVaultFixture());
  const collateralVault = new EVault(getCollateralizedEVaultFixture());
  await intrinsicApyService.populateIntrinsicApy([
    plainVault,
    collateralVault,
    new EVault({
      ...getPlainEVaultFixture(),
      address: getAddress("0x00000000000000000000000000000000000000aa"),
    }),
  ]);
  assert.equal(intrinsicAdapterCalls.length, 1);
  assert.equal(plainVault.populated.intrinsicApy, true);
  assert.equal(collateralVault.populated.intrinsicApy, true);
  assert.deepEqual(
    await intrinsicApyService.fetchIntrinsicApy(1, plainVault.asset.address),
    { apy: 43, provider: "mock" },
  );
  assert.deepEqual(
    await intrinsicApyService.fetchChainIntrinsicApys(1),
    new Map(),
  );
  intrinsicApyService.setAdapter({
    async fetchIntrinsicApy() {
      return undefined;
    },
    async fetchChainIntrinsicApys() {
      return new Map();
    },
  });
  assert.equal(
    await intrinsicApyService.fetchIntrinsicApy(1, plainVault.asset.address),
    undefined,
  );
  await intrinsicApyService.populateIntrinsicApy([]);
  await intrinsicApyService.populateIntrinsicApy([
    new EVault(getPlainEVaultFixture()),
  ]);

  const walletAdapter = new WalletOnchainAdapter(
    { getProvider: () => ({}) } as any,
    deploymentService as any,
    buildQuery,
  );
  walletAdapter.setQueryBalanceOf(async (_provider, asset) => {
    if (asset === plainVault.asset.address) throw new Error("balance");
    return 123n;
  });
  walletAdapter.setQueryAllowance(async (_provider, asset, _owner, spender) => {
    if (
      asset === collateralVault.asset.address &&
      spender === plainVault.address
    ) {
      throw new Error("allowance");
    }
    return 456n;
  });
  walletAdapter.setQueryPermit2Allowance(
    async (_provider, _permit2, _owner, asset) => {
      if (asset === collateralVault.asset.address) throw new Error("permit2");
      return [789n, 111, 222] as const;
    },
  );
  const fetchedWallet = await walletAdapter.fetchWallet(1, plainVault.address, [
    { asset: plainVault.asset.address, spenders: [plainVault.address] },
    { asset: collateralVault.asset.address, spenders: [plainVault.address] },
  ]);
  assert.equal(fetchedWallet.result?.assets.length, 1);
  assert.ok(fetchedWallet.errors.length >= 3);

  const walletService = new WalletService({
    async fetchWallet() {
      return { result: undefined, errors: [] };
    },
  });
  let wallet = await walletService.fetchWallet(1, plainVault.address, []);
  assert.equal(wallet.result.assets.length, 0);
  assert.equal(wallet.errors[0]?.source, "walletAdapter");
  walletService.setAdapter({
    async fetchWallet() {
      return {
        result: {
          chainId: 1,
          account: plainVault.address,
          assets: [
            {
              account: plainVault.address,
              asset: plainVault.asset.address,
              balance: 500n,
              allowances: {
                [plainVault.address]: {
                  assetForVault: 1n,
                  assetForPermit2: 2n,
                  assetForVaultInPermit2: 3n,
                  permit2ExpirationTime: 4,
                },
              },
            },
          ],
        },
        errors: [
          { code: "X", severity: "warning", message: "x", paths: ["$"] },
        ],
      };
    },
  });
  wallet = await walletService.fetchWallet(1, plainVault.address, []);
  assert.equal(wallet.result.getBalance(plainVault.asset.address), 500n);
  assert.equal(
    wallet.result.getAllowances(plainVault.asset.address, plainVault.address)
      ?.assetForVaultInPermit2,
    3n,
  );
  assert.equal(
    wallet.result.getAsset(collateralVault.asset.address),
    undefined,
  );
  assert.deepEqual(new Wallet(wallet.result).assets, wallet.result.assets);

  const labelsAdapter = new EulerLabelsURLAdapter(
    {
      getEulerLabelsEntitiesUrl: (chainId) =>
        `https://labels/${chainId}/entities`,
      getEulerLabelsProductsUrl: (chainId) =>
        `https://labels/${chainId}/products`,
      getEulerLabelsPointsUrl: (chainId) => `https://labels/${chainId}/points`,
      getEulerLabelsEarnVaultsUrl: (chainId) =>
        `https://labels/${chainId}/earn-vaults`,
      getEulerLabelsAssetsUrl: (chainId) => `https://labels/${chainId}/assets`,
      getEulerLabelsGlobalAssetsUrl: () => "https://labels/all/assets",
      getEulerLabelsLogoUrl: (filename) => `https://cdn/${filename}`,
    },
    buildQuery,
  );
  labelsAdapter.setQueryEulerLabelsEntities(async (url) => {
    assert.equal(url, "https://labels/1/entities");
    return { euler: { name: "Euler", logo: "euler.svg" } } as any;
  });
  labelsAdapter.setQueryEulerLabelsProducts(async (url) => {
    assert.equal(url, "https://labels/1/products");
    return {
      // Bare-string `entity` covers single-curator products in the labels JSON.
      product: {
        name: "Flagship",
        entity: "euler",
        vaults: [plainVault.address],
        deprecatedVaults: [plainVault.address],
        deprecationReason: "Migrated",
        logo: "product.svg",
      },
    } as any;
  });
  labelsAdapter.setQueryEulerLabelsPoints(async (url) => {
    assert.equal(url, "https://labels/1/points");
    return [
      {
        name: "Points",
        collateralVaults: [plainVault.address],
        logo: "points.svg",
      },
    ] as any;
  });
  labelsAdapter.setQueryEulerLabelsEarnVaults(async (url) => {
    assert.equal(url, "https://labels/1/earn-vaults");
    return [];
  });
  const initialAssetUrls: string[] = [];
  labelsAdapter.setQueryEulerLabelsAssets(async (url) => {
    initialAssetUrls.push(url);
    return [];
  });
  assert.equal(
    Object.keys(await labelsAdapter.fetchEulerLabelsEntities(1)).length,
    1,
  );
  assert.equal(
    Object.keys(await labelsAdapter.fetchEulerLabelsProducts(1)).length,
    1,
  );
  assert.equal((await labelsAdapter.fetchEulerLabelsPoints(1)).length, 1);
  assert.equal((await labelsAdapter.fetchEulerLabelsEarnVaults(1)).length, 0);
  assert.equal((await labelsAdapter.fetchEulerLabelsAssets(1)).length, 0);
  assert.deepEqual(initialAssetUrls, [
    "https://labels/1/assets",
    "https://labels/all/assets",
  ]);

  const labelsService = new EulerLabelsService(
    labelsAdapter,
    (filename) => `https://cdn/${filename}`,
  );
  await labelsService.populateLabels([plainVault, collateralVault]);
  await labelsService.populateLabels([]);
  assert.equal(
    plainVault.eulerLabel?.entities[0]?.logo,
    "https://cdn/euler.svg",
  );
  assert.equal(
    plainVault.eulerLabel?.products[0]?.logo,
    "https://cdn/product.svg",
  );
  assert.equal(
    plainVault.eulerLabel?.points[0]?.logo,
    "https://cdn/points.svg",
  );
  assert.equal(plainVault.eulerLabel?.deprecationReason, "Migrated");
  assert.equal(collateralVault.populated.labels, true);
  // Vault not referenced by any product/point keeps no eulerLabel attached
  assert.equal(collateralVault.eulerLabel, undefined);

  const failingLabelsService = new EulerLabelsService({
    async fetchEulerLabelsEntities() {
      throw new Error("entities");
    },
    async fetchEulerLabelsProducts() {
      throw new Error("products");
    },
    async fetchEulerLabelsPoints() {
      throw new Error("points");
    },
  });
  const unlabeledVault = new EVault(getPlainEVaultFixture());
  await failingLabelsService.populateLabels([unlabeledVault]);
  assert.equal(unlabeledVault.populated.labels, true);
  assert.equal(failingLabelsService.resolveLogoUrl("plain.svg"), "plain.svg");
  labelsService.setAdapter({
    async fetchEulerLabelsEntities() {
      return { euler: { name: "Euler", logo: undefined } } as any;
    },
    async fetchEulerLabelsProducts() {
      return {
        product2: {
          name: "NoLogo",
          entity: ["missing", "euler"],
          vaults: [collateralVault.address],
        },
        product3: {
          name: "DeprecatedWithoutReason",
          entity: ["euler"],
          vaults: ["0x00000000000000000000000000000000000000ac"],
          deprecatedVaults: ["0x00000000000000000000000000000000000000ac"],
        },
      } as any;
    },
    async fetchEulerLabelsPoints() {
      return [
        { name: "NoCollateral" },
        { name: "WithCollateral", collateralVaults: [collateralVault.address] },
        {
          name: "NoLogoCollateral",
          collateralVaults: ["0x00000000000000000000000000000000000000ac"],
        },
      ] as any;
    },
  });
  const stringEntityVault = new EVault({
    ...getPlainEVaultFixture(),
    address: getAddress("0x00000000000000000000000000000000000000ac"),
  });
  await labelsService.populateLabels([collateralVault, stringEntityVault]);
  assert.equal(collateralVault.eulerLabel?.entities.length, 1);
  assert.equal(collateralVault.eulerLabel?.products[0]?.logo, undefined);
  assert.equal(stringEntityVault.eulerLabel?.entities.length, 1);
  assert.equal(stringEntityVault.eulerLabel?.products[0]?.logo, undefined);
  assert.equal(stringEntityVault.eulerLabel?.points[0]?.logo, undefined);
  assert.equal(stringEntityVault.eulerLabel?.deprecationReason, "");
  labelsService.setAdapter({
    async fetchEulerLabelsEntities() {
      return {};
    },
    async fetchEulerLabelsProducts() {
      return {};
    },
    async fetchEulerLabelsPoints() {
      return [];
    },
  } as any);
  const bareVault = new EVault({
    ...getPlainEVaultFixture(),
    address: getAddress("0x00000000000000000000000000000000000000ad"),
  });
  await labelsService.populateLabels([bareVault]);
  // With no products/points/deprecation hits, no eulerLabel is attached
  assert.equal(bareVault.eulerLabel, undefined);
  assert.equal(bareVault.populated.labels, true);

  labelsService.setAdapter(labelsAdapter);
  labelsAdapter.setQueryEulerLabelsProducts(async () => ({
    parityProduct: {
      name: "Base Product",
      description: "base",
      entity: "euler",
      url: "https://example.com",
      logo: "product.svg",
      vaults: [plainVault.address.toLowerCase()],
      deprecatedVaults: [stringEntityVault.address.toLowerCase()],
      deprecateReason: "legacy reason",
      featuredVaults: [plainVault.address.toLowerCase()],
      notExplorable: true,
      keyring: true,
      portfolioNotice: "product notice",
      vaultOverrides: {
        [plainVault.address.toLowerCase()]: {
          name: "Overridden Product",
          description: "override",
          portfolioNotice: "override notice",
        },
      },
    },
  }) as any);
  labelsAdapter.setQueryEulerLabelsEntities(async () => ({
    euler: {
      name: "Euler",
      logo: "euler.svg",
      url: "not-a-url",
      addresses: {
        [plainVault.address.toLowerCase()]: "Vault",
      },
    },
  }) as any);
  labelsAdapter.setQueryEulerLabelsPoints(async () => [
    {
      name: "Points",
      logo: "points.svg",
      collateralVaults: [plainVault.address.toLowerCase()],
    },
  ] as any);
  labelsAdapter.setQueryEulerLabelsEarnVaults(async () => [
    {
      address: collateralVault.address.toLowerCase(),
      block: ["US"],
      restricted: ["DE"],
      featured: true,
      deprecated: true,
      deprecationReason: "earn migrated",
      description: "earn description",
      portfolioNotice: "earn notice",
      notExplorable: true,
    },
  ]);
  labelsAdapter.setQueryEulerLabelsAssets(async (url) =>
    url === "https://labels/all/assets"
      ? [
          {
            names: ["Global Asset Rule"],
            block: ["CA"],
          },
        ]
      : [
          {
            address: plainVault.asset.address.toLowerCase(),
            block: ["US"],
            restricted: ["DE"],
          },
          {
            symbols: ["USDC"],
            symbolRegex: "usd",
            names: ["USD Coin"],
            nameRegex: "coin",
            block: ["GB"],
          },
          {
            symbols: ["BAD"],
            symbolRegex: "[",
            block: ["FR"],
          },
        ],
  );
  const labelsData = await labelsService.fetchEulerLabelsData(1);
  assert.equal(labelsData.products.parityProduct?.vaults[0], plainVault.address);
  assert.equal(
    labelsData.products.parityProduct?.deprecatedVaults?.[0],
    stringEntityVault.address,
  );
  assert.equal(
    labelsData.products.parityProduct?.deprecationReason,
    "legacy reason",
  );
  assert.equal(labelsData.entities.euler?.url, "");
  assert.deepEqual(labelsData.earnVaultBlocks[collateralVault.address.toLowerCase()], [
    "US",
  ]);
  assert.equal(labelsData.featuredEarnVaults.has(collateralVault.address), true);
  assert.equal(
    labelsData.deprecatedEarnVaults[collateralVault.address.toLowerCase()],
    "earn migrated",
  );
  assert.equal(
    labelsData.assetBlocks[plainVault.asset.address.toLowerCase()]?.[0],
    "US",
  );
  assert.equal(labelsData.assetPatternRules.length, 3);
  assert.deepEqual(createEmptyEulerLabelsData().verifiedVaultAddresses, []);
  assert.equal(
    applyEulerLabelVaultOverrides(
      labelsData.products.parityProduct!,
      plainVault.address,
    ).name,
    "Overridden Product",
  );
  assert.equal(
    getEulerLabelProductByVault(labelsData, plainVault.address)?.name,
    "Base Product",
  );
  assert.equal(
    getEulerLabelEntitiesByVault(labelsData, {
      governorAdmin: plainVault.address,
    })[0]?.name,
    "Euler",
  );
  assert.equal(getEulerLabelVaultNotice(labelsData, plainVault.address), "override notice");
  assert.equal(getEulerLabelAssetBlock(labelsData, plainVault.asset.address)?.[0], "US");
  assert.equal(isEulerLabelVaultFeatured(labelsData, plainVault.address), true);
  assert.equal(isEulerLabelVaultFeatured(labelsData, collateralVault.address), true);
  assert.equal(isEulerLabelVaultDeprecated(labelsData, stringEntityVault.address), true);
  assert.equal(isEulerLabelEarnVaultDeprecated(labelsData, collateralVault.address), true);
  assert.equal(isEulerLabelVaultKeyring(labelsData, plainVault.address), true);
  assert.equal(isEulerLabelVaultNotExplorable(labelsData, plainVault.address), true);

  await labelsService.populateLabels([plainVault, collateralVault]);
  assert.equal(
    plainVault.eulerLabel?.products[0]?.name,
    "Overridden Product",
  );
  assert.equal(plainVault.eulerLabel?.deprecationReason, undefined);
  assert.equal(collateralVault.eulerLabel?.earnVault?.address, collateralVault.address);
  assert.equal(collateralVault.eulerLabel?.deprecated, true);
  assert.equal(collateralVault.eulerLabel?.portfolioNotice, "earn notice");

  const oracleAdapterService = new OracleAdapterService({}, buildQuery);
  oracleAdapterService.setQueryOracleAdapters(async (chainId) => {
    assert.equal(chainId, 1);
    return [
      {
        oracle: plainVault.oracle.oracle.toLowerCase(),
        baseAsset: plainVault.asset.address.toLowerCase(),
        quote_asset: zeroAddress,
        provider: "Provider",
        checks: [
          { id: "Adapter whitelist", pass: false, severity: "HIGH" },
          {
            id: "pricing-valid",
            message: "Pricing valid",
            pass: true,
            severity: "INFO",
          },
        ],
      },
      {
        adapter: "not-an-address",
      },
    ];
  });
  const oracleAdapters = await oracleAdapterService.fetchOracleAdapters(1);
  assert.equal(oracleAdapters.length, 1);
  assert.equal(oracleAdapters[0]?.oracle, plainVault.oracle.oracle);
  assert.equal(oracleAdapters[0]?.base, plainVault.asset.address);
  assert.equal(oracleAdapters[0]?.checks?.length, 1);
  assert.equal(
    (await oracleAdapterService.fetchOracleAdapterMap(1))[
      plainVault.oracle.oracle.toLowerCase()
    ]?.provider,
    "Provider",
  );

  assert.ok(calls.some((entry) => entry.queryName === "queryDeployments"));
});

test("native fetch-backed read helpers cover their error branches", async () => {
  const originalFetch = globalThis.fetch;
  try {
    DeploymentService.setQueryDeployments(originalQueryDeployments);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("deployments-ok")) {
        return {
          ok: true,
          json: async () => [makeDeployment(1)],
        } as Response;
      }
      if (url.includes("deployments-bad")) {
        return {
          ok: true,
          json: async () => ({ bad: true }),
        } as Response;
      }
      if (url.includes("abi-ok")) {
        return {
          ok: true,
          json: async () => [
            { type: "function", name: "x", inputs: [], outputs: [] },
          ],
        } as Response;
      }
      if (url.includes("tokens-ok")) {
        return {
          ok: true,
          json: async () => [
            {
              chainId: 1,
              address: "0x00000000000000000000000000000000000000aa",
            },
          ],
        } as Response;
      }
      if (url.includes("labels-entities-ok")) {
        return {
          ok: true,
          json: async () => ({ euler: { name: "Euler" } }),
        } as Response;
      }
      if (url.includes("labels-products-ok")) {
        return {
          ok: true,
          json: async () => ({
            product: { name: "Product", vaults: [zeroAddress] },
          }),
        } as Response;
      }
      if (url.includes("labels-points-ok")) {
        return {
          ok: true,
          json: async () => [
            { name: "Point", collateralVaults: [zeroAddress] },
          ],
        } as Response;
      }
      if (url.includes("tokens-bad-status")) {
        return {
          ok: false,
          status: 500,
          statusText: "Server Error",
        } as Response;
      }
      if (url.includes("tokens-bad-payload")) {
        return {
          ok: true,
          json: async () => ({ nope: true }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response;
    }) as typeof fetch;

    assert.deepEqual(
      await DeploymentService.queryDeployments("https://deployments-ok"),
      [makeDeployment(1)],
    );
    await assert.rejects(
      () => DeploymentService.queryDeployments(""),
      /Deployments URL is required/,
    );
    await assert.rejects(
      () => DeploymentService.queryDeployments("https://deployments-bad"),
      /Invalid deployment data format/,
    );

    const abiService = new ABIService();
    assert.deepEqual(await abiService.queryABI("https://abi-ok"), [
      { type: "function", name: "x", inputs: [], outputs: [] },
    ]);

    const tokenlistService = new TokenlistService({
      getTokenListUrl: () => "",
    });
    tokenlistService.setQueryTokenList(tokenlistService.queryTokenList);
    assert.deepEqual(
      await tokenlistService.queryTokenList("https://tokens-ok"),
      [
        { chainId: 1, address: "0x00000000000000000000000000000000000000aa" },
      ] as any,
    );
    await assert.rejects(
      () => tokenlistService.queryTokenList("https://tokens-bad-status"),
      /Failed to fetch token list: 500 Server Error/,
    );
    await assert.rejects(
      () => tokenlistService.queryTokenList("https://tokens-bad-payload"),
      /Invalid token list response/,
    );

    const labelsAdapter = new EulerLabelsURLAdapter({
      getEulerLabelsEntitiesUrl: () => "https://labels-entities-ok",
      getEulerLabelsProductsUrl: () => "https://labels-products-ok",
      getEulerLabelsPointsUrl: () => "https://labels-points-ok",
      getEulerLabelsLogoUrl: (filename) => filename,
    });
    assert.equal(
      Object.keys(await labelsAdapter.fetchEulerLabelsEntities(1)).length,
      1,
    );
    assert.equal(
      Object.keys(await labelsAdapter.fetchEulerLabelsProducts(1)).length,
      1,
    );
    assert.equal((await labelsAdapter.fetchEulerLabelsPoints(1)).length, 1);
    await assert.rejects(
      () => labelsAdapter.queryEulerLabelsEntities("https://labels-entities"),
      /Failed to fetch Euler labels entities/,
    );
    await assert.rejects(
      () => labelsAdapter.queryEulerLabelsProducts("https://labels-products"),
      /Failed to fetch Euler labels products/,
    );
    await assert.rejects(
      () => labelsAdapter.queryEulerLabelsPoints("https://labels-points"),
      /Failed to fetch Euler labels points/,
    );
  } finally {
    DeploymentService.setQueryDeployments(originalQueryDeployments);
    globalThis.fetch = originalFetch;
  }
});
