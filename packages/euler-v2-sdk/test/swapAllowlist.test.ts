import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
	assertSwapperAllowed,
	assertSwapQuoteContractsAllowed,
	assertSwapVerifierAllowed,
	getAllowedSwapperAddresses,
} from "../src/services/swapService/swapAllowlist.js";

const SWAPPER = "0x0000000000000000000000000000000000000001" as Address;
const EULER_SWAP_V1_PERIPHERY =
	"0x0000000000000000000000000000000000000002" as Address;
const EULER_SWAP_V2_PERIPHERY =
	"0x0000000000000000000000000000000000000003" as Address;
const SWAP_VERIFIER = "0x0000000000000000000000000000000000000004" as Address;
const ATTACKER = "0x0000000000000000000000000000000000000005" as Address;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const knownAddresses = {
	swapper: SWAPPER,
	eulerSwapV1Periphery: EULER_SWAP_V1_PERIPHERY,
	eulerSwapV2Periphery: EULER_SWAP_V2_PERIPHERY,
	swapVerifier: SWAP_VERIFIER,
};

describe("swap allowlist", () => {
	it("returns the canonical swapper deployments from chain config", () => {
		expect(
			getAllowedSwapperAddresses({
				swapper: SWAPPER,
				eulerSwapV1Periphery: EULER_SWAP_V1_PERIPHERY,
				eulerSwapV2Periphery: EULER_SWAP_V2_PERIPHERY,
				eulerSwapPeriphery: ZERO_ADDRESS,
			}),
		).toEqual([SWAPPER, EULER_SWAP_V1_PERIPHERY, EULER_SWAP_V2_PERIPHERY]);
	});

	it("accepts quote swappers that match a canonical deployment", () => {
		expect(() =>
			assertSwapperAllowed(EULER_SWAP_V2_PERIPHERY, knownAddresses),
		).not.toThrow();
	});

	it("rejects quote swappers outside the canonical deployments", () => {
		expect(() => assertSwapperAllowed(ATTACKER, knownAddresses)).toThrow(
			`Unknown swapper address: ${ATTACKER}`,
		);
	});

	it("validates both swapper and verifier before letting a quote build EVC calls", () => {
		expect(() =>
			assertSwapQuoteContractsAllowed(
				{
					swapperAddress: EULER_SWAP_V1_PERIPHERY,
					verifierAddress: SWAP_VERIFIER,
				},
				knownAddresses,
			),
		).not.toThrow();

		expect(() =>
			assertSwapQuoteContractsAllowed(
				{
					swapperAddress: ATTACKER,
					verifierAddress: SWAP_VERIFIER,
				},
				knownAddresses,
			),
		).toThrow(`Unknown swapper address: ${ATTACKER}`);
	});

	it("fails closed when no canonical swapper address is configured", () => {
		expect(() =>
			assertSwapperAllowed(SWAPPER, { swapVerifier: SWAP_VERIFIER }),
		).toThrow("Known swapper address not configured");
	});

	it("fails closed when no chain-pinned swap verifier is configured", () => {
		expect(() => assertSwapVerifierAllowed(SWAP_VERIFIER, undefined)).toThrow(
			"Known swap verifier address not configured",
		);
	});

	it("rejects a quote verifier that doesn't match the chain-pinned address", () => {
		expect(() => assertSwapVerifierAllowed(ATTACKER, SWAP_VERIFIER)).toThrow(
			`Unknown swap verifier address: ${ATTACKER}`,
		);
	});

	it("compares addresses case-insensitively", () => {
		expect(() =>
			assertSwapperAllowed(SWAPPER.toUpperCase() as Address, knownAddresses),
		).not.toThrow();
		expect(() =>
			assertSwapVerifierAllowed(
				SWAP_VERIFIER.toUpperCase() as Address,
				SWAP_VERIFIER,
			),
		).not.toThrow();
	});
});
