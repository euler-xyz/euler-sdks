import { describe, expect, it } from "vitest";
import {
	createEmptyEulerLabelsData,
	getEulerLabelEntitiesByEarnVault,
	getEulerLabelEntitiesByVault,
} from "../src/utils/eulerLabels.js";
import type { EulerEarn, EVault } from "../src/index.js";

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
});
