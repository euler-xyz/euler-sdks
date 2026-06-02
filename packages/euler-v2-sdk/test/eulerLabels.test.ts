import { describe, expect, it } from "vitest";
import {
	createEmptyEulerLabelsData,
	getEulerLabelEntitiesByEarnVault,
	getEulerLabelEntitiesByVault,
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
	it("normalizes product recently-added vaults", async () => {
		const service = new EulerLabelsService({
			fetchEulerLabelsEntities: async () => ({}),
			fetchEulerLabelsProducts: async () => ({
				prime: {
					name: "Prime",
					description: "",
					url: "",
					vaults: [VAULT.toLowerCase()],
					recentlyAddedVaults: [VAULT.toLowerCase()],
				},
			}),
			fetchEulerLabelsPoints: async () => [],
		} satisfies IEulerLabelsAdapter);

		const labels = await service.fetchEulerLabelsData(1);

		expect(labels.products.prime?.recentlyAddedVaults).toEqual([VAULT]);
		expect(isEulerLabelVaultRecentlyAdded(labels, VAULT)).toBe(true);
	});

	it("normalizes Earn recently-added entries", async () => {
		const service = new EulerLabelsService({
			fetchEulerLabelsEntities: async () => ({}),
			fetchEulerLabelsProducts: async () => ({}),
			fetchEulerLabelsPoints: async () => [],
			fetchEulerLabelsEarnVaults: async () => [
				{ address: VAULT.toLowerCase(), recentlyAdded: true },
			],
		} satisfies IEulerLabelsAdapter);

		const labels = await service.fetchEulerLabelsData(1);

		expect(labels.earnVaultEntries[VAULT.toLowerCase()]?.recentlyAdded).toBe(
			true,
		);
		expect(labels.recentlyAddedEarnVaults.has(VAULT)).toBe(true);
		expect(isEulerLabelVaultRecentlyAdded(labels, VAULT)).toBe(true);
	});
});
