import { describe, it } from "vitest";
import type { VaultFamily } from "../src/index.js";
import type { EVault, IEVault } from "../src/entities/EVault.js";
import type { VaultEntity } from "../src/services/vaults/vaultMetaService/index.js";

/**
 * Downstream compile fixtures for the vault family surface. This file is only
 * typechecked (vitest typecheck mode), never executed — each assignment models
 * a strict consumer that must keep compiling.
 */
describe("vault family public types", () => {
	it("answers the family for any vault entity without narrowing first", () => {
		// A catalogue consumer holds the meta service union and chips the row
		// from one field. Dropping the family from any member breaks this.
		const vault = {} as VaultEntity;
		// `null` is the third state: the source could not read the vault
		// configuration the family is derived from.
		const family: VaultFamily | null = vault.vaultFamily;
		void family;
	});

	it("keeps the unknown family in the type, so it cannot be ignored", () => {
		const vault = {} as VaultEntity;
		// @ts-expect-error a consumer must handle the unreadable case
		const family: VaultFamily = vault.vaultFamily;
		void family;
	});

	it("keeps the family optional on the entity input shape", () => {
		// The back-compat guarantee: an integrator's existing IEVault literal,
		// written before the family existed, must still satisfy IEVault.
		const legacyArgs = {} as Omit<IEVault, "vaultFamily">;
		const args: IEVault = legacyArgs;
		void args;
	});

	it("narrows an EVault family to the two EVK families", () => {
		const vault = {} as EVault;
		const isEscrow: boolean = vault.vaultFamily === "escrow";
		// @ts-expect-error an EVK vault is never an Earn vault
		const isEarn: boolean = vault.vaultFamily === "earn";
		void isEscrow;
		void isEarn;
	});
});
