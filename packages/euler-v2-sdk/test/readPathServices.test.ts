import assert from "node:assert/strict";
import { test } from "vitest";
import { getAddress, zeroAddress } from "viem";

import { AccountService } from "../src/services/accountService/accountService.js";
import { RewardsV3Adapter } from "../src/services/rewardsService/adapters/rewardsV3Adapter/index.js";
import { EVaultService } from "../src/services/vaults/eVaultService/eVaultService.js";
import {
	VaultMetaService,
	isEVault,
	isEulerEarn,
	isSecuritizeCollateralVault,
} from "../src/services/vaults/vaultMetaService/vaultMetaService.js";
import { WalletOnchainAdapter } from "../src/services/walletService/adapters/walletOnchainAdapter.js";
import { Account, SubAccount } from "../src/entities/Account.js";
import { EVault } from "../src/entities/EVault.js";
import { VaultType } from "../src/utils/types.js";
import {
	dataIssueLocation,
	serviceDiagnosticOwner,
	vaultCollateralDiagnosticOwner,
	vaultDiagnosticOwner,
} from "../src/utils/entityDiagnostics.js";
import {
	getAccountFixture,
	getCollateralizedEVaultFixture,
	getPlainEVaultFixture,
	normalizeAddress,
} from "./helpers/readCorpus.ts";

function makeResolvedVaults() {
	const plain = new EVault(getPlainEVaultFixture());
	const collateralized = new EVault(getCollateralizedEVaultFixture());
	return { plain, collateralized };
}

function makeDeploymentService() {
	return {
		getDeployment() {
			return {
				addresses: {
					coreAddrs: {
						eVaultFactory: "0x0000000000000000000000000000000000000001",
					},
				},
			};
		},
	} as any;
}

function vaultLocations(address: `0x${string}`, path = "$") {
	return [dataIssueLocation(vaultDiagnosticOwner(1, getAddress(address)), path)];
}

function serviceLocations(service: string, path = "$") {
	return [dataIssueLocation(serviceDiagnosticOwner(service, 1), path)];
}

function hasLocationPath(issue: { locations?: Array<{ path: string }> }, path: string) {
	return issue.locations?.some((location) => location.path === path) ?? false;
}

function hasLocationPathContaining(
	issue: { locations?: Array<{ path: string }> },
	needle: string,
) {
	return issue.locations?.some((location) => location.path.includes(needle)) ?? false;
}

test("account service fetches and populates real account fixtures through vault, price, and reward services", async () => {
	const accountFixture = getAccountFixture(0);
	const { plain, collateralized } = makeResolvedVaults();
	const fetchedVaultOptions: unknown[] = [];

	const accountService = new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return { result: accountFixture.subAccounts[Object.keys(accountFixture.subAccounts)[0]!], errors: [] };
			},
		},
		{
			async fetchVaults(_chainId, addresses, options) {
				fetchedVaultOptions.push(options);
				return {
					result: addresses.map((address) => {
						const source =
							normalizeAddress(address) === normalizeAddress(collateralized.address)
								? collateralized
								: plain;
						return new EVault({
							...source,
							address: normalizeAddress(address),
						});
					}),
					errors: [],
				};
			},
		} as any,
		{
			async fetchAssetUsdPriceWithDiagnostics(vault) {
				return {
					result: {
						amountOutMid:
							normalizeAddress(vault.address) === normalizeAddress(collateralized.address)
								? 2n * 10n ** 18n
								: 10n ** 18n,
					},
					errors: [],
				};
			},
			async fetchCollateralUsdPriceWithDiagnostics() {
				return { result: { amountOutMid: 3n * 10n ** 18n }, errors: [] };
			},
			async fetchUnitOfAccountUsdRateWithDiagnostics() {
				return { result: 2n * 10n ** 18n, errors: [] };
			},
		} as any,
	);
	accountService.setRewardsService({
		async fetchUserRewards() {
			return [
				{
					provider: "merkl",
					chainId: 1,
					unclaimed: "1000000",
					tokenPrice: 2,
					token: { symbol: "EUL", decimals: 18, address: zeroAddress },
				},
			];
		},
	} as any);

	const fetched = await accountService.fetchAccount(1, accountFixture.owner, {
		populateAll: true,
	});
	const firstSubAccountAddress = Object.keys(accountFixture.subAccounts)[0]! as `0x${string}`;
	const firstSubAccount = accountFixture.subAccounts[firstSubAccountAddress]!;
	const controllerVaultAddress = firstSubAccount.enabledControllers[0]!;
	assert.equal(fetched.result.populated.vaults, true);
	assert.equal(fetched.result.populated.marketPrices, true);
	assert.equal(fetched.result.populated.userRewards, true);
	assert.ok(fetched.result.userRewards?.length);
	assert.ok(
		Object.values(fetched.result.subAccounts)
			.filter(Boolean)
			.some((subAccount) =>
				subAccount!.positions.some((position) => position.vault !== undefined),
			),
	);
	assert.ok(
		Object.values(fetched.result.subAccounts)
			.filter(Boolean)
			.some((subAccount) =>
				subAccount!.positions.some((position) => position.marketPriceUsd !== undefined),
			),
	);
	assert.ok(fetched.result.totalRewardsValueUsd !== undefined);
	assert.ok(
		fetched.result.getPosition(
			firstSubAccountAddress,
			controllerVaultAddress,
		),
	);
	assert.equal(
		fetched.result.isControllerEnabled(
			firstSubAccountAddress,
			controllerVaultAddress,
		),
		true,
	);
	assert.deepEqual(fetchedVaultOptions[0], {
		populateAll: true,
		populateMarketPrices: true,
		populateCollaterals: true,
		populateStrategyVaults: true,
		populateRewards: true,
		populateIntrinsicApy: true,
		populateLabels: true,
		eVaultFetchOptions: {
			populateAll: true,
			populateCollaterals: true,
			populateMarketPrices: true,
			populateRewards: true,
			populateIntrinsicApy: true,
		},
	});

	const unpopulated = await accountService.fetchAccount(1, accountFixture.owner, {
		populateVaults: false,
	});
	assert.equal(unpopulated.result.populated.vaults, false);

	const empty = await new AccountService(
		{
			async fetchAccount() {
				return { result: undefined, errors: [] };
			},
			async fetchSubAccount() {
				return { result: undefined, errors: [] };
			},
		},
		{} as any,
	).fetchAccount(1, accountFixture.owner, { populateVaults: false });
	assert.equal(empty.result.owner, accountFixture.owner);
});

test("account total rewards skips malformed reward pricing", () => {
	const accountFixture = getAccountFixture(0);
	const account = new Account(accountFixture);
	account.userRewards = [
		{
			provider: "merkl",
			chainId: 1,
			accumulated: "1000000",
			unclaimed: "1000000",
			tokenPrice: Number.NaN,
			token: {
				address: zeroAddress,
				chainId: 1,
				symbol: "BAD",
				name: "BAD",
				decimals: 18,
			},
		},
		{
			provider: "merkl",
			chainId: 1,
			accumulated: "1000000",
			unclaimed: "1000000",
			tokenPrice: 2,
			token: {
				address: zeroAddress,
				chainId: 1,
				symbol: "EUL",
				name: "EUL",
				decimals: 6,
			},
		},
	];

	assert.equal(account.totalRewardsValueUsd, 2n * 10n ** 18n);
});

test("V3 rewards adapter normalizes malformed user reward price to zero", async () => {
	const adapter = new RewardsV3Adapter({ endpoint: "https://example.invalid" });
	adapter.setQueryV3RewardsBreakdown(async () => ({
		data: [
			{
				provider: "merkl",
				chainId: 1,
				token: {
					address: zeroAddress,
					chainId: 1,
					symbol: "BAD",
					name: "BAD",
					decimals: "18",
				},
				tokenPriceUsd: "NaN",
				unclaimed: "1000000",
				accumulated: "1000000",
			},
		],
	}));

	const rewards = await adapter.fetchUserRewards(1, zeroAddress);
	assert.equal(rewards.length, 1);
	assert.equal(rewards[0]?.tokenPrice, 0);
	assert.equal(rewards[0]?.token.decimals, 18);
});

test("account service covers fetchSubAccount and populate error paths", async () => {
	const accountFixture = getAccountFixture(0);
	const rawSubAccount = accountFixture.subAccounts[Object.keys(accountFixture.subAccounts)[0]!]!;

	const service = new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return { result: rawSubAccount, errors: [] };
			},
		},
		{
			async fetchVaults() {
				throw new Error("vaults");
			},
		} as any,
	);
	service.setPriceService({
		async fetchAssetUsdPriceWithDiagnostics() {
			throw new Error("price");
		},
		async fetchCollateralUsdPriceWithDiagnostics() {
			throw new Error("collateral");
		},
		async fetchUnitOfAccountUsdRateWithDiagnostics() {
			throw new Error("uoa");
		},
	} as any);
	service.setRewardsService({
		async fetchUserRewards() {
			throw new Error("rewards");
		},
	} as any);

	const failedAccount = await service.fetchAccount(1, accountFixture.owner, {
		populateAll: true,
	});
	assert.ok(failedAccount.errors.some((issue) => issue.source === "vaultMetaService"));
	assert.ok(failedAccount.errors.some((issue) => issue.source === "priceService"));
	assert.ok(failedAccount.errors.some((issue) => issue.source === "rewardsService"));

	const subAccountOnly = await service.fetchSubAccount(
		1,
		rawSubAccount.account,
		undefined,
		{ populateVaults: false },
	);
	assert.equal(subAccountOnly.result?.account, rawSubAccount.account);

	const emptySubAccount = await new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return {
					result: { ...rawSubAccount, positions: [] },
					errors: [],
				};
			},
		},
		{
			async fetchVaults() {
				return { result: [], errors: [] };
			},
		} as any,
	).fetchSubAccount(
		1,
		rawSubAccount.account,
		[],
	);
	assert.equal(emptySubAccount.result?.account, rawSubAccount.account);

	const missingSubAccount = await new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return {
					result: undefined,
					errors: [
						{
							code: "MISS",
							severity: "warning",
							message: "miss",
							locations: serviceLocations("testAccountAdapter"),
						},
					],
				};
			},
		},
		{} as any,
	).fetchSubAccount(1, rawSubAccount.account);
	assert.equal(missingSubAccount.result, undefined);
	assert.equal(missingSubAccount.errors[0]?.code, "MISS");

	const account = new Account(accountFixture);
	account.updateSubAccounts(new SubAccount(rawSubAccount));
	assert.equal(Object.keys(account.subAccounts).length, 1);
});

test("account service setters and successful fetchSubAccount address collection work", async () => {
	const accountFixture = getAccountFixture(0);
	const rawSubAccount = accountFixture.subAccounts[Object.keys(accountFixture.subAccounts)[0]!]!;
	const { plain } = makeResolvedVaults();
	const service = new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return { result: rawSubAccount, errors: [] };
			},
		},
		{
			async fetchVaults(_chainId, addresses) {
				return {
					result: addresses.map((address) => new EVault({ ...plain, address })),
					errors: [],
				};
			},
		} as any,
	);
	service.setAdapter({
		async fetchAccount() {
			return { result: accountFixture, errors: [] };
		},
		async fetchSubAccount() {
			return { result: rawSubAccount, errors: [] };
		},
	});
	service.setVaultMetaService({
		async fetchVaults(_chainId, addresses) {
			return {
				result: addresses.map((address) => new EVault({ ...plain, address })),
				errors: [],
			};
		},
	} as any);
	service.setPriceService({} as any);
	const fetched = await service.fetchSubAccount(1, rawSubAccount.account);
	assert.ok(
		fetched.result?.positions.some(
			(position) =>
				position.vault !== undefined ||
				position.liquidity?.collaterals.some((collateral) => collateral.vault !== undefined),
		),
	);
	const populated = await service.populateVaults([new Account(accountFixture) as Account<never>], {
		populateAll: true,
	});
	assert.equal(populated.result.length, 1);
	const passthrough = await service.fetchAccount(1, accountFixture.owner, {
		populateMarketPrices: true,
		populateUserRewards: true,
	});
	assert.equal(passthrough.result.populated.marketPrices, true);
	assert.equal(passthrough.result.populated.userRewards, false);

	const optionsProbeCalls: unknown[] = [];
	const optionsProbeService = new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return { result: rawSubAccount, errors: [] };
			},
		},
		{
			async fetchVaults(_chainId, _addresses, options) {
				optionsProbeCalls.push(options);
				return { result: [], errors: [] };
			},
		} as any,
	);
	await optionsProbeService.fetchSubAccount(1, rawSubAccount.account, [
		rawSubAccount.positions[0]!.vaultAddress,
	], {
		vaultFetchOptions: { populateAll: true },
	});
	assert.deepEqual(optionsProbeCalls[0], { populateAll: true });
	await optionsProbeService.fetchSubAccount(1, rawSubAccount.account, [
		rawSubAccount.positions[0]!.vaultAddress,
	], {
		vaultFetchOptions: {},
	});
	assert.deepEqual(optionsProbeCalls[1], { populateAll: false });

	const stringRewardFailure = new AccountService(
		{
			async fetchAccount() {
				return { result: accountFixture, errors: [] };
			},
			async fetchSubAccount() {
				return { result: rawSubAccount, errors: [] };
			},
		},
		{
			async fetchVaults(_chainId, addresses) {
				return {
					result: addresses.map((address) => new EVault({ ...plain, address })),
					errors: [],
				};
			},
		} as any,
	);
	stringRewardFailure.setPriceService({} as any);
	stringRewardFailure.setRewardsService({
		async fetchUserRewards() {
			throw "raw-string";
		},
	} as any);
	const rewardFailure = await stringRewardFailure.fetchAccount(1, accountFixture.owner, {
		populateUserRewards: true,
	});
	assert.ok(rewardFailure.errors.some((issue) => issue.originalValue === "raw-string"));

	const originalPopulateUserRewards = Account.prototype.populateUserRewards;
	try {
		Account.prototype.populateUserRewards = async function populateUserRewardsThrows() {
			throw "prototype-rewards";
		};
		const prototypeRewardFailure = await stringRewardFailure.fetchAccount(
			1,
			accountFixture.owner,
			{ populateUserRewards: true },
		);
		assert.ok(
			prototypeRewardFailure.errors.some(
				(issue) => issue.source === "rewardsService" && issue.originalValue === "prototype-rewards",
			),
		);
	} finally {
		Account.prototype.populateUserRewards = originalPopulateUserRewards;
	}

	const originalPopulateMarketPrices = Account.prototype.populateMarketPrices;
	try {
		Account.prototype.populateMarketPrices = async function populateMarketPricesThrows() {
			throw "prototype-market-prices";
		};
		const marketPriceFailure = await stringRewardFailure.fetchAccount(
			1,
			accountFixture.owner,
			{ populateMarketPrices: true },
		);
		assert.ok(
			marketPriceFailure.errors.some(
				(issue) => issue.source === "priceService" && issue.originalValue === "prototype-market-prices",
			),
		);
	} finally {
		Account.prototype.populateMarketPrices = originalPopulateMarketPrices;
	}

	try {
		Account.prototype.populateUserRewards = async function populateUserRewardsError() {
			throw new Error("prototype-rewards-error");
		};
		const prototypeRewardError = await stringRewardFailure.fetchAccount(
			1,
			accountFixture.owner,
			{ populateUserRewards: true },
		);
		assert.ok(
			prototypeRewardError.errors.some(
				(issue) => issue.source === "rewardsService" && issue.originalValue === "prototype-rewards-error",
			),
		);
	} finally {
		Account.prototype.populateUserRewards = originalPopulateUserRewards;
	}

	const originalPopulateVaults = Account.prototype.populateVaults;
	try {
		Account.prototype.populateVaults = async function populateVaultsThrows() {
			throw "vault-populate-string";
		};
		const vaultPopulateFailure = await stringRewardFailure.populateVaults([
			new Account(accountFixture) as Account<never>,
		]);
		assert.ok(
			vaultPopulateFailure.errors.some(
				(issue) => issue.source === "vaultMetaService" && issue.originalValue === "vault-populate-string",
			),
		);
	} finally {
		Account.prototype.populateVaults = originalPopulateVaults;
	}
});

test("vault meta service routes by type, remaps diagnostics, dedupes verified addresses, and tolerates failures", async () => {
	const { plain, collateralized } = makeResolvedVaults();

	const typeAdapter = {
		async fetchVaultTypes(_chainId: number, vaults: `0x${string}`[]) {
			return vaults.map((vault) => ({
				id: vault,
				type:
					normalizeAddress(vault) === normalizeAddress(plain.address)
						? VaultType.EVault
						: "0x00000000000000000000000000000000000000f1",
			}));
		},
	};

	const evaultService = {
		factory() {
			return "0x00000000000000000000000000000000000000e1";
		},
		async fetchVaults(_chainId: number, vaults: `0x${string}`[]) {
			return {
				result: vaults.map((address, index) =>
					index === 0 ? plain : undefined,
				),
				errors: [
					{
						code: "WARN",
						severity: "warning",
						message: "warn",
						locations: vaultLocations(plain.address, "$.detail"),
					},
				],
			};
		},
		async fetchVerifiedVaultAddresses() {
			return [plain.address, collateralized.address];
		},
		async fetchAllVaults() {
			return { result: [plain], errors: [] };
		},
	};

	const customService = {
		factory() {
			return "0x00000000000000000000000000000000000000f1";
		},
		async fetchVaults() {
			throw new Error("custom-failure");
		},
		async fetchVerifiedVaultAddresses() {
			return [plain.address];
		},
		async fetchAllVaults() {
			throw new Error("all-failure");
		},
	};

	const meta = new VaultMetaService({
		vaultTypeAdapter: typeAdapter as any,
		vaultServices: [{ type: VaultType.EVault, service: evaultService as any }, customService as any],
	});
	meta.registerVaultService({ type: "CustomVault", service: customService as any });
	assert.deepEqual(await meta.fetchVerifiedVaultAddresses(1, []), []);

	assert.equal(meta.getFactoryByType(1, VaultType.EVault), "0x00000000000000000000000000000000000000e1");
	assert.equal(meta.getFactoryByType(1, "CustomVault"), "0x00000000000000000000000000000000000000f1");
	assert.equal(await meta.fetchVaultType(1, plain.address), VaultType.EVault);
	assert.deepEqual(await meta.fetchVaultTypes(1, [plain.address, collateralized.address]), {
		[normalizeAddress(plain.address)]: VaultType.EVault,
		[normalizeAddress(collateralized.address)]: "CustomVault",
	});
	assert.deepEqual(await meta.fetchVaultTypes(1, []), {});

	const fetched = await meta.fetchVaults(1, [plain.address, collateralized.address, zeroAddress]);
	assert.equal(fetched.result[0]?.address, plain.address);
	assert.equal(fetched.result[1], undefined);
	assert.equal(fetched.result[2], undefined);
	assert.ok(fetched.errors.some((issue) => hasLocationPath(issue, "$.detail")));
	assert.ok(
		fetched.errors.some((issue) =>
			issue.locations.some(
				(location) =>
					location.owner.kind === "vault" &&
					location.owner.address === normalizeAddress(collateralized.address),
			),
		),
	);
	assert.ok(
		fetched.errors.some((issue) =>
			issue.locations.some(
				(location) =>
					location.owner.kind === "vault" && location.owner.address === zeroAddress,
			),
		),
	);

	const fetchedSingle = await meta.fetchVault(1, zeroAddress);
	assert.equal(fetchedSingle.result, undefined);
	assert.ok(fetchedSingle.errors.some((issue) => issue.source === "vaultMetaService"));

	const verifiedAddresses = await meta.fetchVerifiedVaultAddresses(1, [VaultType.EVault]);
	assert.deepEqual(verifiedAddresses, [plain.address, collateralized.address]);
	const verifiedVaults = await meta.fetchVerifiedVaults(1, [VaultType.EVault]);
	assert.equal(verifiedVaults.result.length, 2);

	const allVaults = await meta.fetchAllVaults(1);
	assert.equal(allVaults.result.length, 1);
	assert.ok(allVaults.errors.some((issue) => issue.source === "vaultMetaService"));

	const emptyMeta = new VaultMetaService({
		vaultTypeAdapter: { async fetchVaultTypes() { return []; } } as any,
	});
	assert.deepEqual(await emptyMeta.fetchVaults(1, []), { result: [], errors: [] });
	assert.equal(await emptyMeta.fetchVaultType(1, zeroAddress), undefined);
	assert.deepEqual(await emptyMeta.fetchVerifiedVaultAddresses(1, []), []);
});

test("vault meta helpers cover type guards, untyped services, adapter replacement, and service-label fallbacks", async () => {
	const { plain } = makeResolvedVaults();
	assert.equal(isEVault({ type: VaultType.EVault } as any), true);
	assert.equal(isEulerEarn({ type: VaultType.EulerEarn } as any), true);
	assert.equal(
		isSecuritizeCollateralVault({ type: VaultType.SecuritizeCollateral } as any),
		true,
	);

	class NamedVaultService {
		factory() {
			return "0x00000000000000000000000000000000000000d1";
		}
		async fetchVaults(_chainId: number, _vaults: `0x${string}`[]) {
			return {
				result: [undefined],
				errors: [
					{
						code: "N",
						severity: "warning",
						message: "named",
						locations: vaultLocations(zeroAddress),
					},
				],
			};
		}
		async fetchVerifiedVaultAddresses() {
			return [zeroAddress];
		}
		async fetchAllVaults() {
			throw new Error("named-all");
		}
	}

	const objectService = {
		factory() {
			return "0x00000000000000000000000000000000000000d2";
		},
		async fetchVaults() {
			return { result: [undefined], errors: [] };
		},
		async fetchVerifiedVaultAddresses() {
			return [];
		},
		async fetchAllVaults() {
			throw "object-all";
		},
	};

	const meta = new VaultMetaService({
		vaultTypeAdapter: {
			async fetchVaultTypes() {
				return [{ id: zeroAddress, type: "not-an-address" }];
			},
		} as any,
		vaultServices: [objectService as any],
	});
	meta.registerVaultService(new NamedVaultService() as any);
	assert.equal(meta.getFactoryByType(1, "missing"), undefined);
	assert.equal(await meta.fetchVaultType(1, zeroAddress), undefined);
	assert.deepEqual(await meta.fetchVaultTypes(1, [zeroAddress]), {});

	meta.setVaultTypeAdapter({
		async fetchVaultTypes() {
			return [{ id: zeroAddress, type: "0x00000000000000000000000000000000000000d1" }];
		},
	} as any);
	assert.equal(await meta.fetchVaultType(1, zeroAddress), undefined);

	meta.registerVaultService({ type: "NamedType", service: new NamedVaultService() as any });
	meta.setVaultTypeAdapter({
		async fetchVaultTypes() {
			return [{ id: zeroAddress, type: "NamedType" }];
		},
	} as any);
	assert.equal(await meta.fetchVaultType(1, zeroAddress), "NamedType");

	const fetched = await meta.fetchVaults(1, [zeroAddress]);
	assert.equal(fetched.result[0], undefined);
	assert.ok(fetched.errors.some((issue) => issue.source === "vaultService"));

	const allVaults = await meta.fetchAllVaults(1);
	assert.ok(allVaults.errors.some((issue) => issue.message.includes("NamedVaultService")));
	assert.ok(allVaults.errors.some((issue) => issue.message.includes("unknownVaultService")));

	const remapMeta = new VaultMetaService({
		vaultTypeAdapter: {
			async fetchVaultTypes() {
				return [{ id: zeroAddress, type: VaultType.EVault }];
			},
		} as any,
		vaultServices: [
			{
				type: VaultType.EVault,
				service: {
					factory() {
						return "0x00000000000000000000000000000000000000e1";
					},
					async fetchVaults() {
						return {
							result: [undefined],
							errors: [
								{
									code: "A",
									severity: "warning",
									message: "service-owned",
									locations: serviceLocations("customVaultService", "detail"),
								},
								{
									code: "B",
									severity: "warning",
									message: "vault-owned",
									locations: vaultLocations(zeroAddress, "$.detail"),
								},
							],
						};
					},
					async fetchVerifiedVaultAddresses() {
						return [];
					},
					async fetchAllVaults() {
						return { result: [], errors: [] };
					},
				},
			} as any,
		],
	});
	const remapped = await remapMeta.fetchVaults(1, [zeroAddress]);
	assert.ok(remapped.errors.some((issue) => hasLocationPath(issue, "detail")));
	assert.ok(remapped.errors.some((issue) => hasLocationPath(issue, "$.detail")));

	const stringThrowMeta = new VaultMetaService({
		vaultTypeAdapter: {
			async fetchVaultTypes() {
				return [{ id: zeroAddress, type: VaultType.EVault }];
			},
		} as any,
		vaultServices: [
			{
				type: VaultType.EVault,
				service: {
					factory() {
						return "0x00000000000000000000000000000000000000e1";
					},
					async fetchVaults() {
						throw "vault-string";
					},
					async fetchVerifiedVaultAddresses() {
						return [];
					},
					async fetchAllVaults() {
						return { result: [], errors: [] };
					},
				},
			} as any,
		],
	});
	const stringThrown = await stringThrowMeta.fetchVaults(1, [zeroAddress]);
	assert.ok(stringThrown.errors.some((issue) => issue.originalValue === "vault-string"));

	const noServiceMeta = new VaultMetaService({
		vaultTypeAdapter: {
			async fetchVaultTypes() {
				return [];
			},
		} as any,
		vaultServices: [],
	});
	const noService = await noServiceMeta.fetchVaults(1, [zeroAddress]);
	assert.ok(noService.errors.some((issue) => issue.source === "vaultTypeAdapter"));

	const foundMeta = new VaultMetaService({
		vaultTypeAdapter: {
			async fetchVaultTypes() {
				return [{ id: zeroAddress, type: VaultType.EVault }];
			},
		} as any,
		vaultServices: [
			{
				type: VaultType.EVault,
				service: {
					factory() {
						return "0x00000000000000000000000000000000000000e1";
					},
					async fetchVaults() {
						return { result: [plain], errors: [] };
					},
					async fetchVerifiedVaultAddresses() {
						return [];
					},
					async fetchAllVaults() {
						return { result: [], errors: [] };
					},
				},
			} as any,
		],
	});
	assert.equal((await foundMeta.fetchVault(1, zeroAddress)).result?.address, plain.address);

	const untypedTypeMeta = new VaultMetaService({
		vaultTypeAdapter: {
			async fetchVaultTypes() {
				return [{ id: zeroAddress, type: "0x00000000000000000000000000000000000000d2" }];
			},
		} as any,
		vaultServices: [objectService as any],
	});
	assert.deepEqual(await untypedTypeMeta.fetchVaultTypes(1, [zeroAddress]), {});
});

test("evault service hydrates, filters, populates collateral and price data, and reports failures", async () => {
	const { plain, collateralized } = makeResolvedVaults();
	const adapter = {
		async fetchVaults(_chainId: number, vaults: `0x${string}`[]) {
			return {
				result: vaults.map((address) =>
					normalizeAddress(address) === normalizeAddress(plain.address)
						? { ...getPlainEVaultFixture() }
						: { ...getCollateralizedEVaultFixture() },
				),
				errors: [
					{
						code: "A",
						severity: "warning",
						message: "adapter",
						locations: vaultLocations(collateralized.address),
					},
				],
			};
		},
		async fetchAllVaults() {
			return {
				result: [{ ...getPlainEVaultFixture() }, { ...getCollateralizedEVaultFixture() }],
				errors: [],
			};
		},
		async fetchVerifiedVaultsAddresses() {
			return [plain.address];
		},
	};

	const service = new EVaultService(adapter as any, makeDeploymentService());
	service.setVaultMetaService({
		async fetchVaults(_chainId: number, addresses: `0x${string}`[]) {
			return {
				result: addresses.map((address) =>
					new EVault({
						...getPlainEVaultFixture(),
						address: address,
						asset: { ...getPlainEVaultFixture().asset, address },
					}),
				),
				errors: [
					{
						code: "C",
						severity: "warning",
						message: "collateral",
						locations: [
							dataIssueLocation(
								vaultCollateralDiagnosticOwner(
									1,
									collateralized.address,
									plain.address,
								),
								"$.vault.market",
							),
						],
					},
				],
			};
		},
	} as any);
	service.setPriceService({
		async fetchAssetUsdPriceWithDiagnostics(vault) {
			if (normalizeAddress(vault.address) === normalizeAddress(plain.address)) {
				throw new Error("asset-price");
			}
			return { result: { amountOutMid: 2n * 10n ** 18n }, errors: [] };
		},
		async fetchCollateralUsdPriceWithDiagnostics() {
			return {
				result: { amountOutMid: 3n * 10n ** 18n },
				errors: [
					{
						code: "P",
						severity: "info",
						message: "priced",
						locations: [
							dataIssueLocation(
								vaultCollateralDiagnosticOwner(
									1,
									collateralized.address,
									plain.address,
								),
							),
						],
					},
				],
			};
		},
	} as any);
	service.setRewardsService({
		async populateRewards(vaults: EVault[]) {
			for (const vault of vaults) vault.populated.rewards = true;
		},
	} as any);
	service.setIntrinsicApyService({
		async populateIntrinsicApy(vaults: EVault[]) {
			for (const vault of vaults) vault.populated.intrinsicApy = true;
		},
	} as any);
	service.setEulerLabelsService({
		async populateLabels(vaults: EVault[]) {
			for (const vault of vaults) vault.populated.labels = true;
		},
	} as any);

	assert.equal(service.factory(1), "0x0000000000000000000000000000000000000001");

	const fetchedVault = await service.fetchVault(1, zeroAddress);
	assert.ok(fetchedVault.result);
	const missingVault = await new EVaultService(
		{
			async fetchVaults() {
				return { result: [undefined], errors: [] };
			},
			async fetchAllVaults() {
				return { result: [], errors: [] };
			},
			async fetchVerifiedVaultsAddresses() {
				return [];
			},
		} as any,
		makeDeploymentService(),
	).fetchVault(1, zeroAddress);
	assert.equal(missingVault.result, undefined);
	assert.ok(missingVault.errors.some((issue) => issue.source === "eVaultService"));

	const fetchedVaults = await service.fetchVaults(1, [plain.address, collateralized.address], {
		populateAll: true,
	});
	assert.equal(fetchedVaults.result.length, 2);
	assert.ok(fetchedVaults.errors.some((issue) => issue.code === "A"));
	assert.ok(fetchedVaults.errors.some((issue) => issue.code === "C"));
	assert.ok(fetchedVaults.errors.some((issue) => issue.code === "P"));
	assert.equal(fetchedVaults.result[0]?.populated.marketPrices, true);
	assert.equal(fetchedVaults.result[1]?.populated.collaterals, true);
	assert.equal(fetchedVaults.result[1]?.populated.rewards, true);
	assert.equal(fetchedVaults.result[1]?.populated.intrinsicApy, true);
	assert.equal(fetchedVaults.result[1]?.populated.labels, true);

	const filtered = await service.fetchAllVaults(1, {
		filter: async (vault) => normalizeAddress(vault.address) === normalizeAddress(collateralized.address),
	});
	assert.equal(filtered.result.filter(Boolean).length, 1);

	const noPopulate = await new EVaultService(adapter as any, makeDeploymentService()).fetchVaults(1, [plain.address], {
		populateCollaterals: false,
	});
	assert.ok(noPopulate.result[0]);

	const failingPopulate = new EVaultService(adapter as any, makeDeploymentService());
	failingPopulate.setVaultMetaService({
		async fetchVaults() {
			throw new Error("collateral-fetch");
		},
	} as any);
	failingPopulate.setPriceService({
		async fetchAssetUsdPriceWithDiagnostics() {
			throw new Error("asset");
		},
		async fetchCollateralUsdPriceWithDiagnostics() {
			throw new Error("collateral");
		},
	} as any);
	failingPopulate.setRewardsService({
		async populateRewards() {
			throw new Error("rewards");
		},
	} as any);
	failingPopulate.setIntrinsicApyService({
		async populateIntrinsicApy() {
			throw new Error("apy");
		},
	} as any);
	failingPopulate.setEulerLabelsService({
		async populateLabels() {
			throw new Error("labels");
		},
	} as any);
	const failed = await failingPopulate.fetchVaults(1, [collateralized.address], {
		populateAll: true,
	});
	assert.ok(failed.errors.some((issue) => issue.source === "vaultMetaService"));
	assert.ok(failed.errors.some((issue) => issue.source === "priceService"));
	assert.ok(failed.errors.some((issue) => issue.source === "rewardsService"));
	assert.ok(failed.errors.some((issue) => issue.source === "intrinsicApyService"));
	assert.ok(failed.errors.some((issue) => issue.source === "eulerLabelsService"));
	assert.deepEqual(await service.fetchVerifiedVaultAddresses(1, []), []);
});

test("evault service setters and empty branches are exercised", async () => {
	const { plain } = makeResolvedVaults();
	const adapterA = {
		async fetchVaults() {
			return { result: [{ ...plain }], errors: [] };
		},
		async fetchAllVaults() {
			return { result: [{ ...plain }], errors: [] };
		},
		async fetchVerifiedVaultsAddresses() {
			return [];
		},
	};
	const adapterB = {
		async fetchVaults() {
			return { result: [], errors: [] };
		},
		async fetchAllVaults() {
			return { result: [], errors: [] };
		},
		async fetchVerifiedVaultsAddresses() {
			return [];
		},
	};
	const service = new EVaultService(adapterA as any, makeDeploymentService());
	service.setAdapter(adapterB as any);
	service.setVaultMetaService({} as any);
	service.setPriceService({} as any);
	service.setRewardsService({} as any);
	service.setIntrinsicApyService({} as any);
	service.setEulerLabelsService({} as any);
	assert.deepEqual(await service.populateCollaterals([], () => "$.vaults[0]"), []);
	assert.deepEqual(await service.populateMarketPrices([], () => "$.vaults[0]"), []);
	assert.deepEqual(await service.populateRewards([]), []);
	assert.deepEqual(await service.populateIntrinsicApy([]), []);
	assert.deepEqual(await service.populateLabels([]), []);

	const directPerspectiveService = new EVaultService(
		{
			async fetchVaults() {
				return { result: [], errors: [] };
			},
			async fetchAllVaults() {
				return { result: [], errors: [] };
			},
			async fetchVerifiedVaultsAddresses(_chainId, perspectives) {
				return perspectives;
			},
		} as any,
		{
			getDeployment() {
				return {
					addresses: {
						coreAddrs: { eVaultFactory: zeroAddress },
						peripheryAddrs: {
							governedPerspective: "0x00000000000000000000000000000000000000bb",
						},
					},
				};
			},
		} as any,
	);
	assert.deepEqual(
		await directPerspectiveService.fetchVerifiedVaultAddresses(1, [
			"0x00000000000000000000000000000000000000aa",
			"governedPerspective",
		]),
		[
			"0x00000000000000000000000000000000000000aa",
			"0x00000000000000000000000000000000000000bb",
		],
	);
	await assert.rejects(
		() => directPerspectiveService.fetchVerifiedVaultAddresses(1, ["edgeFactoryPerspective"]),
		/Perspective address not found/,
	);
	const verified = await directPerspectiveService.fetchVerifiedVaults(1, []);
	assert.deepEqual(verified.result, []);

	const plainOnly = new EVault(getPlainEVaultFixture());
	directPerspectiveService.setVaultMetaService({
		async fetchVaults() {
			return { result: [], errors: [] };
		},
	} as any);
	assert.deepEqual(await directPerspectiveService.populateCollaterals([plainOnly]), []);
	assert.equal(plainOnly.populated.collaterals, true);

	const remapService = new EVaultService(adapterA as any, makeDeploymentService());
	remapService.setVaultMetaService({
		async fetchVaults(_chainId: number, addresses: `0x${string}`[]) {
			const [collateralAddress = zeroAddress] = addresses;
			return {
				result: [new EVault(getPlainEVaultFixture())],
				errors: [
					{
						code: "R",
						severity: "warning",
						message: "raw",
						locations: vaultLocations(collateralAddress, "$.other"),
					},
				],
			};
		},
	} as any);
	const remapTarget = new EVault(getCollateralizedEVaultFixture());
	const remapErrors = await remapService.populateCollaterals([remapTarget]);
	assert.ok(remapErrors.some((issue) => hasLocationPath(issue, "$.vault.other")));

	const noUnitOfAccount = new EVault({
		...getCollateralizedEVaultFixture(),
		unitOfAccount: undefined,
	});
	await remapService.populateCollaterals([noUnitOfAccount]);
	assert.deepEqual(noUnitOfAccount.collaterals[0]?.oracleAdapters, []);

	const collateralPriceFailure = new EVaultService(adapterA as any, makeDeploymentService());
	collateralPriceFailure.setPriceService({
		async fetchAssetUsdPriceWithDiagnostics() {
			return { result: { amountOutMid: 1n }, errors: [] };
		},
		async fetchCollateralUsdPriceWithDiagnostics() {
			throw "collateral-price-string";
		},
	} as any);
	const pricedVault = new EVault(getCollateralizedEVaultFixture());
	pricedVault.collaterals[0]!.vault = new EVault(getPlainEVaultFixture());
	const priceErrors = await collateralPriceFailure.populateMarketPrices([pricedVault]);
	assert.ok(
		priceErrors.some(
			(issue) =>
				hasLocationPathContaining(issue, "marketPriceUsd") &&
				issue.originalValue === "collateral-price-string",
		),
	);

	const verifiedErrorService = new EVaultService(
		{
			async fetchVaults() {
				return {
					result: [new EVault(getPlainEVaultFixture())],
					errors: [
						{
							code: "V",
							severity: "warning",
							message: "verified",
							locations: vaultLocations(getPlainEVaultFixture().address, "$.detail"),
						},
					],
				};
			},
			async fetchAllVaults() {
				return { result: [], errors: [] };
			},
			async fetchVerifiedVaultsAddresses() {
				return [zeroAddress];
			},
		} as any,
		makeDeploymentService(),
	);
	const verifiedErrors = await verifiedErrorService.fetchVerifiedVaults(1, [zeroAddress]);
	assert.ok(verifiedErrors.errors.some((issue) => hasLocationPath(issue, "$.detail")));

	const filteredUndefinedService = new EVaultService(
		{
			async fetchVaults() {
				return { result: [undefined, { ...getPlainEVaultFixture() }], errors: [] };
			},
			async fetchAllVaults() {
				return { result: [undefined, { ...getPlainEVaultFixture() }], errors: [] };
			},
			async fetchVerifiedVaultsAddresses() {
				return [];
			},
		} as any,
		makeDeploymentService(),
	);
	const filteredUndefined = await filteredUndefinedService.fetchAllVaults(1, {
		filter: async (vault) => normalizeAddress(vault.address) === normalizeAddress(plain.address),
	});
	assert.equal(filteredUndefined.result.filter(Boolean).length, 1);

	const stringCollateralFailure = new EVaultService(adapterA as any, makeDeploymentService());
	stringCollateralFailure.setVaultMetaService({
		async fetchVaults() {
			throw "collateral-string";
		},
	} as any);
	const stringCollateralTarget = new EVault(getCollateralizedEVaultFixture());
	const stringCollateralErrors = await stringCollateralFailure.populateCollaterals([
		stringCollateralTarget,
	]);
	assert.ok(
		stringCollateralErrors.some((issue) => issue.originalValue === "collateral-string"),
	);

	const stringPriceFailure = new EVaultService(adapterA as any, makeDeploymentService());
	stringPriceFailure.setPriceService({
		async fetchAssetUsdPriceWithDiagnostics() {
			throw "asset-string";
		},
		async fetchCollateralUsdPriceWithDiagnostics() {
			throw new Error("collateral-error");
		},
	} as any);
	const stringPriceTarget = new EVault(getCollateralizedEVaultFixture());
	stringPriceTarget.collaterals[0]!.vault = new EVault(getPlainEVaultFixture());
	const stringPriceErrors = await stringPriceFailure.populateMarketPrices([
		stringPriceTarget,
	]);
	assert.ok(stringPriceErrors.some((issue) => issue.originalValue === "asset-string"));
	assert.ok(stringPriceErrors.some((issue) => issue.originalValue === "collateral-error"));

	const noUnitOfAccountService = new EVaultService(adapterA as any, makeDeploymentService());
	noUnitOfAccountService.setVaultMetaService({
		async fetchVaults() {
			return { result: [new EVault(getPlainEVaultFixture())], errors: [] };
		},
	} as any);
	const noUnitVault = new EVault(getCollateralizedEVaultFixture());
	(noUnitVault as any).unitOfAccount = undefined;
	await noUnitOfAccountService.populateCollaterals([noUnitVault]);
	assert.deepEqual(noUnitVault.collaterals[0]?.oracleAdapters, []);

	const stringEnrichmentFailures = new EVaultService(adapterA as any, makeDeploymentService());
	stringEnrichmentFailures.setRewardsService({
		async populateRewards() {
			throw "reward-string";
		},
	} as any);
	stringEnrichmentFailures.setIntrinsicApyService({
		async populateIntrinsicApy() {
			throw "apy-string";
		},
	} as any);
	stringEnrichmentFailures.setEulerLabelsService({
		async populateLabels() {
			throw "labels-string";
		},
	} as any);
	assert.ok(
		(await stringEnrichmentFailures.populateRewards([new EVault(getPlainEVaultFixture())]))
			.some((issue) => issue.originalValue === "reward-string"),
	);
	assert.ok(
		(await stringEnrichmentFailures.populateIntrinsicApy([new EVault(getPlainEVaultFixture())]))
			.some((issue) => issue.originalValue === "apy-string"),
	);
	assert.ok(
		(await stringEnrichmentFailures.populateLabels([new EVault(getPlainEVaultFixture())]))
			.some((issue) => issue.originalValue === "labels-string"),
	);
});

test("wallet onchain adapter setters, query wrappers, and top-level failure are covered", async () => {
	const adapter = new WalletOnchainAdapter(
		{
			getProvider() {
				return {
					readContract({ functionName }: { functionName: string }) {
						if (functionName === "balanceOf") return Promise.resolve(1n);
						if (functionName === "allowance") return Promise.resolve(2n);
						return Promise.resolve([3n, 4, 5]);
					},
				};
			},
		} as any,
		{
			getDeployment() {
				return { addresses: { coreAddrs: { permit2: zeroAddress } } };
			},
		} as any,
	);
	adapter.setProviderService({
		getProvider() {
			throw new Error("provider");
		},
	} as any);
	await assert.rejects(
		() =>
			adapter.fetchWallet(1, zeroAddress, [
				{ asset: zeroAddress, spenders: [zeroAddress] },
			]),
		/provider/,
	);

	const working = new WalletOnchainAdapter(
		{
			getProvider() {
				return {
					readContract({ functionName }: { functionName: string }) {
						if (functionName === "balanceOf") return Promise.resolve(1n);
						if (functionName === "allowance") return Promise.resolve(2n);
						return Promise.resolve([3n, 2n ** 60n, 0]);
					},
				};
			},
		} as any,
		{
			getDeployment() {
				return { addresses: { coreAddrs: { permit2: zeroAddress } } };
			},
		} as any,
	);
	working.setQueryBalanceOf(working.queryBalanceOf);
	working.setQueryAllowance(working.queryAllowance);
	working.setQueryPermit2Allowance(working.queryPermit2Allowance);
	assert.equal(await working.queryBalanceOf({ readContract: ({}) => Promise.resolve(7n) } as any, zeroAddress, zeroAddress), 7n);
	assert.equal(await working.queryAllowance({ readContract: ({}) => Promise.resolve(8n) } as any, zeroAddress, zeroAddress, zeroAddress), 8n);
	assert.deepEqual(
		await working.queryPermit2Allowance({ readContract: ({}) => Promise.resolve([9n, 10, 11]) } as any, zeroAddress, zeroAddress, zeroAddress, zeroAddress),
		[9n, 10, 11],
	);
	const invalidWallet = await working.fetchWallet(1, zeroAddress, [
		{ asset: zeroAddress, spenders: [undefined as any, zeroAddress] },
	]);
	assert.equal(invalidWallet.result, undefined);
	assert.ok(invalidWallet.errors.some((issue) => issue.source === "walletOnchainAdapter"));
	const wallet = await working.fetchWallet(1, zeroAddress, [
		{ asset: zeroAddress, spenders: [zeroAddress] },
	]);
	assert.equal(wallet.result?.assets[0]?.allowances[zeroAddress]?.permit2ExpirationTime, 0);

	const skipSpender = [undefined] as unknown as `0x${string}`[];
	skipSpender.map = (() => [
		Promise.resolve({
			spender: zeroAddress,
			spenderAddress: zeroAddress,
			assetForVault: { value: 2n, failed: false as const },
			assetForPermit2: { value: 2n, failed: false as const },
			permit2Allowance: {
				value: [3n, 4, 5] as const,
				failed: false as const,
			},
		}),
	]) as any;
	const skippedSpenderWallet = await working.fetchWallet(1, zeroAddress, [
		{ asset: zeroAddress, spenders: skipSpender as any },
	]);
	assert.deepEqual(
		skippedSpenderWallet.result?.assets[0]?.allowances ?? {},
		{},
	);

	const missingResultSpenders = [zeroAddress] as `0x${string}`[];
	missingResultSpenders.map = (() => []) as any;
	const missingResultWallet = await working.fetchWallet(1, zeroAddress, [
		{ asset: zeroAddress, spenders: missingResultSpenders as any },
	]);
	assert.deepEqual(
		missingResultWallet.result?.assets[0]?.allowances ?? {},
		{},
	);

	const permit2ApprovalFailure = new WalletOnchainAdapter(
		{ getProvider() { return {}; } } as any,
		{ getDeployment() { return { addresses: { coreAddrs: { permit2: zeroAddress } } }; } } as any,
	);
	permit2ApprovalFailure.setQueryBalanceOf(async () => 1n);
	permit2ApprovalFailure.setQueryAllowance(async (_provider, _asset, _owner, spender) => {
		if (spender === zeroAddress) throw new Error("permit2-approval");
		return 2n;
	});
	permit2ApprovalFailure.setQueryPermit2Allowance(async () => [3n, 4, 5]);
	const permit2Wallet = await permit2ApprovalFailure.fetchWallet(1, "0x0000000000000000000000000000000000000001", [
		{ asset: "0x0000000000000000000000000000000000000002", spenders: ["0x0000000000000000000000000000000000000003"] },
	]);
	assert.ok(permit2Wallet.errors.some((issue) => hasLocationPathContaining(issue, "assetForPermit2")));

	const stringTopLevelFailure = new WalletOnchainAdapter(
		{
			getProvider() {
				return {};
			},
		} as any,
		{
			getDeployment() {
				return { addresses: { coreAddrs: { permit2: zeroAddress } } };
			},
		} as any,
	);
	const brokenAssets = [{ asset: zeroAddress, spenders: [zeroAddress] }] as any[];
	brokenAssets.map = () => {
		throw "wallet-string";
	};
	const topLevelFailure = await stringTopLevelFailure.fetchWallet(
		1,
		zeroAddress,
		brokenAssets as any,
	);
	assert.ok(topLevelFailure.errors.some((issue) => issue.originalValue === "wallet-string"));
});
