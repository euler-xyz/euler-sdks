import { describe, expect, it } from "vitest";
import {
	createEmptyEulerLabelsData,
	getEulerLabelEntitiesByEarnVault,
	getEulerLabelEntitiesByVault,
	isEulerLabelVaultCyclicalNote,
	isEulerLabelVaultGovernanceLimited,
	isEulerLabelVaultRecentlyAdded,
} from "../src/utils/eulerLabels.js";
import { EulerLabelsService } from "../src/index.js";
import type { EulerEarn, EVault, IEulerLabelsAdapter } from "../src/index.js";

const VAULT = "0x0000000000000000000000000000000000000001";
const GOVERNOR = "0x0000000000000000000000000000000000000002";
const OTHER_ENTITY_GOVERNOR = "0x0000000000000000000000000000000000000003";

const data = {
	...createEmptyEulerLabelsData(),
	products: {
		prime: {
			name: "Prime",
			description: "",
			entity: "declared",
			url: "",
			vaults: [VAULT],
		},
	},
	entities: {
		declared: {
			name: "Declared",
			logo: "",
			description: "",
			url: "",
			addresses: { [GOVERNOR]: "" },
			social: {
				twitter: "",
				youtube: "",
				discord: "",
				telegram: "",
				github: "",
			},
		},
		undeclared: {
			name: "Undeclared",
			logo: "",
			description: "",
			url: "",
			addresses: { [OTHER_ENTITY_GOVERNOR]: "" },
			social: {
				twitter: "",
				youtube: "",
				discord: "",
				telegram: "",
				github: "",
			},
		},
	},
};

describe("Euler label entity helpers", () => {
	it("only returns entities declared by the vault product", () => {
		const entities = getEulerLabelEntitiesByVault(data, {
			address: VAULT,
			governorAdmin: OTHER_ENTITY_GOVERNOR,
		} as EVault);

		expect(entities).toEqual([]);
	});

	it("returns the declared product entity when the governor matches", () => {
		const entities = getEulerLabelEntitiesByVault(data, {
			address: VAULT,
			governorAdmin: GOVERNOR,
		} as EVault);

		expect(entities.map((entity) => entity.name)).toEqual(["Declared"]);
	});

	it("uses the same declared-entity rule for Earn owners", () => {
		const entities = getEulerLabelEntitiesByEarnVault(data, {
			address: VAULT,
			governance: { owner: GOVERNOR },
		} as EulerEarn);

		expect(entities.map((entity) => entity.name)).toEqual(["Declared"]);
	});

	it("falls back to owner-address entity matching for Earn vaults outside products", () => {
		const entities = getEulerLabelEntitiesByEarnVault(data, {
			address: "0x0000000000000000000000000000000000000099",
			governance: { owner: OTHER_ENTITY_GOVERNOR },
		} as EulerEarn);

		expect(entities.map((entity) => entity.name)).toEqual(["Undeclared"]);
	});

	it("does not fall back when a product explicitly declares no Earn entity", () => {
		const emptyEntityData = {
			...data,
			products: {
				empty: {
					name: "Empty",
					description: "",
					entity: undefined,
					url: "",
					vaults: [VAULT],
				},
			},
		};

		const entities = getEulerLabelEntitiesByEarnVault(emptyEntityData, {
			address: VAULT,
			governance: { owner: GOVERNOR },
		} as EulerEarn);

		expect(entities).toEqual([]);
	});
});

describe("Euler recently-added labels", () => {
	it("reads recently-added product vault override tags", async () => {
		const service = new EulerLabelsService({
			fetchEulerLabelsEntities: async () => ({}),
			fetchEulerLabelsProducts: async () => ({
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT.toLowerCase()],
					vaultOverrides: {
						[VAULT.toLowerCase()]: {
							tags: ["recently added"],
						},
					},
				},
			}),
			fetchEulerLabelsPoints: async () => [],
		} satisfies IEulerLabelsAdapter);

		const labels = await service.fetchEulerLabelsData(1);

		expect(labels.products.prime?.vaultOverrides?.[VAULT]?.tags).toEqual([
			"recently added",
		]);
		expect(isEulerLabelVaultRecentlyAdded(labels, VAULT)).toBe(true);
	});

	it("preserves recently-added override tags when populating vault labels", async () => {
		const service = new EulerLabelsService({
			fetchEulerLabelsEntities: async () => ({}),
			fetchEulerLabelsProducts: async () => ({
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT.toLowerCase()],
					vaultOverrides: {
						[VAULT]: {
							tags: ["recently added"],
						},
					},
				},
			}),
			fetchEulerLabelsPoints: async () => [],
		} satisfies IEulerLabelsAdapter);
		const vault = {
			address: VAULT.toLowerCase(),
			chainId: 1,
			populated: {},
		} as EVault;

		await service.populateLabels([vault]);

		expect(vault.eulerLabel?.products[0]?.tags).toContain("recently added");
	});

	it("reads Earn recently-added tags", async () => {
		const service = new EulerLabelsService({
			fetchEulerLabelsEntities: async () => ({}),
			fetchEulerLabelsProducts: async () => ({}),
			fetchEulerLabelsPoints: async () => [],
			fetchEulerLabelsEarnVaults: async () => [
				{ address: VAULT.toLowerCase(), tags: ["recently added"] },
			],
		} satisfies IEulerLabelsAdapter);

		const labels = await service.fetchEulerLabelsData(1);

		expect(labels.earnVaultEntries[VAULT.toLowerCase()]?.tags).toEqual([
			"recently added",
		]);
		expect(isEulerLabelVaultRecentlyAdded(labels, VAULT)).toBe(true);
	});
});

describe("Euler governance-limited labels", () => {
	it("reads governance-limited product tags", () => {
		const labels = {
			...createEmptyEulerLabelsData(),
			products: {
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT],
					tags: ["governance limited"],
				},
			},
		};

		expect(isEulerLabelVaultGovernanceLimited(labels, VAULT)).toBe(true);
	});

	it("reads governance-limited vault override tags", () => {
		const labels = {
			...createEmptyEulerLabelsData(),
			products: {
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT],
					vaultOverrides: {
						[VAULT]: {
							tags: ["governance limited"],
						},
					},
				},
			},
		};

		expect(isEulerLabelVaultGovernanceLimited(labels, VAULT)).toBe(true);
	});
});

describe("Euler cyclical-note labels", () => {
	it("reads cyclical-note product tags", () => {
		const labels = {
			...createEmptyEulerLabelsData(),
			products: {
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT],
					tags: ["cyclical note"],
				},
			},
		};

		expect(isEulerLabelVaultCyclicalNote(labels, VAULT)).toBe(true);
	});

	it("reads cyclical-note vault override tags", () => {
		const labels = {
			...createEmptyEulerLabelsData(),
			products: {
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT],
					vaultOverrides: {
						[VAULT]: {
							tags: ["cyclical note"],
						},
					},
				},
			},
		};

		expect(isEulerLabelVaultCyclicalNote(labels, VAULT)).toBe(true);
	});
});
