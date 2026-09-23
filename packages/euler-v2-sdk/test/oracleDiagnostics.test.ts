import { describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import type {
	OracleAdapterAssessment,
	OracleRoute,
} from "../src/index.js";
import { getAdapterMismatchDetails } from "../examples/react-sdk-example/src/utils/oracleDiagnostics.ts";

const BASE = getAddress("0x0000000000000000000000000000000000000001");
const CROSS = getAddress("0x0000000000000000000000000000000000000002");
const QUOTE = getAddress("0x0000000000000000000000000000000000000003");
const OTHER = getAddress("0x0000000000000000000000000000000000000004");
const ADAPTER_ONE = getAddress("0x0000000000000000000000000000000000000011");
const ADAPTER_TWO = getAddress("0x0000000000000000000000000000000000000012");

const route: OracleRoute = {
	base: BASE,
	quote: QUOTE,
	source: "configured",
	steps: [
		{
			kind: "adapter",
			oracle: ADAPTER_ONE,
			name: "FirstAdapter",
			base: BASE,
			quote: CROSS,
		},
		{
			kind: "adapter",
			oracle: ADAPTER_TWO,
			name: "SecondAdapter",
			base: CROSS,
			quote: QUOTE,
		},
	],
};

function assessment(
	address: Address,
	base: Address,
	quote: Address,
	overrides: Partial<OracleAdapterAssessment> = {},
): OracleAdapterAssessment {
	return {
		chainId: 1,
		address,
		recognized: true,
		checksStatus: "positive",
		reason: null,
		inActiveRoute: true,
		adapterClass: "CrossAdapter",
		label: null,
		provider: null,
		methodology: null,
		model: null,
		config: { base, quote },
		findings: [],
		summary: null,
		policyId: null,
		policyVersion: null,
		blockNumber: null,
		evaluatedAt: null,
		lastCheckedAt: null,
		...overrides,
	};
}

describe("getAdapterMismatchDetails", () => {
	it("accepts each adapter's own pair in a multi-leg route", () => {
		const details = getAdapterMismatchDetails({
			chainId: 1,
			collateral: { oraclePriceRaw: { amountOutMid: 0n }, oracleRoute: route },
			assessmentMap: {
				[ADAPTER_ONE.toLowerCase()]: assessment(ADAPTER_ONE, BASE, CROSS),
				[ADAPTER_TWO.toLowerCase()]: assessment(ADAPTER_TWO, CROSS, QUOTE),
			},
			tokenSymbolMap: undefined,
		});

		expect(details).toBeUndefined();
	});

	it("accepts an assessed pair in the reverse direction", () => {
		const details = getAdapterMismatchDetails({
			chainId: 1,
			collateral: { oraclePriceRaw: { amountOutMid: 0n }, oracleRoute: route },
			assessmentMap: {
				[ADAPTER_ONE.toLowerCase()]: assessment(ADAPTER_ONE, CROSS, BASE),
			},
			tokenSymbolMap: undefined,
		});

		expect(details).toBeUndefined();
	});

	it("reports when a recognized assessment does not match its route step", () => {
		const details = getAdapterMismatchDetails({
			chainId: 1,
			collateral: { oraclePriceRaw: { amountOutMid: 0n }, oracleRoute: route },
			assessmentMap: {
				[ADAPTER_ONE.toLowerCase()]: assessment(ADAPTER_ONE, OTHER, CROSS),
			},
			tokenSymbolMap: undefined,
		});

		expect(details).toContain(`Adapter ${ADAPTER_ONE} pair mismatch on chain 1`);
		expect(details).toContain(`assessment reports ${OTHER} / ${CROSS}`);
		expect(details).toContain(`route step uses ${BASE} / ${CROSS}`);
	});

	it("does not trust config from an unrecognized assessment", () => {
		const details = getAdapterMismatchDetails({
			chainId: 1,
			collateral: { oraclePriceRaw: { amountOutMid: 0n }, oracleRoute: route },
			assessmentMap: {
				[ADAPTER_ONE.toLowerCase()]: assessment(ADAPTER_ONE, OTHER, CROSS, {
					recognized: false,
					checksStatus: null,
				}),
			},
			tokenSymbolMap: undefined,
		});

		expect(details).toBeUndefined();
	});
});
