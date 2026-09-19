import { describe, it } from "vitest";
import type { EVault, IEVault } from "../src/entities/EVault.js";
import type { VaultEntity } from "../src/services/vaults/vaultMetaService/index.js";
import { isEVault } from "../src/services/vaults/vaultMetaService/index.js";

/**
 * Downstream compile fixtures for the escrow surface. This file is only
 * typechecked (vitest typecheck mode), never executed — each assignment models
 * a strict consumer that must keep compiling.
 */
describe("vault escrow public types", () => {
	it("keeps escrow status optional on the entity input shape", () => {
		// The back-compat guarantee: an integrator's existing IEVault literal,
		// written before the field existed, must still satisfy IEVault.
		const legacyArgs = {} as Omit<IEVault, "isEscrow">;
		const args: IEVault = legacyArgs;
		void args;
	});

	it("reads escrow status off a catalogue row after narrowing on type", () => {
		// `type` stays the discriminant; escrow status is the EVK-only fact.
		const vault = {} as VaultEntity;
		const label = isEVault(vault) && vault.isEscrow ? "Escrow" : "Vault";
		void label;
	});

	it("keeps the undecided verdict in the type, so it cannot be ignored", () => {
		const vault = {} as EVault;
		// @ts-expect-error a consumer must handle the unreadable case
		const isEscrow: boolean = vault.isEscrow;
		void isEscrow;
	});
});
