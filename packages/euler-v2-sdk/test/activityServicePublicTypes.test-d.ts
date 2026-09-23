import { describe, it } from "vitest";
import type { EulerSDK, EulerSDKOptions } from "../src/sdk/sdk.js";
import type {
	IActivityService,
	LiquidationsPage,
} from "../src/services/activityService/index.js";

/**
 * Downstream compile fixtures for the public activity surface. This file is
 * only typechecked (vitest typecheck mode), never executed — each assignment
 * models a strict consumer that must keep compiling.
 */
describe("EulerSDK activity service public types", () => {
	it("exposes callable liquidations on the built SDK without narrowing", () => {
		const sdk = {} as EulerSDK;
		// A strict consumer calls the guaranteed built-in method directly —
		// no optional chaining, no narrowing. Regressing the property to the
		// override-facing contract makes this TS2722.
		const page: Promise<LiquidationsPage> =
			sdk.activityService.fetchLiquidations({ chainId: 1 });
		void page;
	});

	it("keeps legacy custom-service overrides assignable", () => {
		// A pre-liquidations override object, exactly as an integrator wrote
		// it against the previous release: no fetchLiquidations.
		const legacyOverride = {} as Pick<
			IActivityService,
			| "getCapabilities"
			| "getScopeSupport"
			| "fetchAccountActivityEvents"
			| "fetchVaultActivityEvents"
		>;
		const options: Pick<EulerSDKOptions, "activityService"> = {
			activityService: legacyOverride,
		};
		void options;
	});
});
