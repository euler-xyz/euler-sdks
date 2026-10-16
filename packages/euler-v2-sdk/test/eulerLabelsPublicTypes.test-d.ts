import { describe, expectTypeOf, it } from "vitest";
import type {
	buildEulerSDK,
	EulerLabelsV3Service,
	EulerLabelsData,
	EulerLabelsFileData,
	IEulerLabelsService,
	PublicEulerLabelsData,
	PublicGeoPolicy,
	PublicVaultVisibility,
} from "../src/index.js";
import type {
	normalizeEulerLabelsFileData,
	EulerLabelsFileData as PublicLabelsFileData,
} from "../src/publicLabels.js";

describe("labels service public types", () => {
	it("exposes the pure application snapshot helper from the public-labels subpath", () => {
		expectTypeOf<PublicLabelsFileData>().toEqualTypeOf<EulerLabelsFileData>();
		expectTypeOf<
			Parameters<typeof normalizeEulerLabelsFileData>
		>().toEqualTypeOf<[EulerLabelsFileData]>();
		expectTypeOf<
			ReturnType<typeof normalizeEulerLabelsFileData>
		>().toEqualTypeOf<EulerLabelsData>();
	});

	it("retains precise V3 fields through the built SDK service boundary", () => {
		type SDK = Awaited<ReturnType<typeof buildEulerSDK>>;
		const data = null as unknown as Awaited<
			ReturnType<SDK["eulerLabelsService"]["fetchEulerLabelsData"]>
		>;
		if ("visibility" in data) {
			expectTypeOf(data.visibility).toEqualTypeOf<
				Record<string, PublicVaultVisibility>
			>();
			expectTypeOf(data.rawGeoPolicies).toEqualTypeOf<PublicGeoPolicy[]>();
			expectTypeOf(data.managingEntityByVault).toEqualTypeOf<
				Record<string, string>
			>();
		}
		expectTypeOf<EulerLabelsV3Service>().toExtend<IEulerLabelsService>();
		expectTypeOf<
			ReturnType<EulerLabelsV3Service["fetchEulerLabelsData"]>
		>().toEqualTypeOf<Promise<PublicEulerLabelsData>>();
	});
});
