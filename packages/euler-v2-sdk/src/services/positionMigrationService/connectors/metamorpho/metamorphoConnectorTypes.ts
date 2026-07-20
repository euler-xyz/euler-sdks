import type { Address } from "viem";
import type {
	MigrationAuthorizationCall,
	MigrationPosition,
	TransactionMigrationAuthorizationRequest,
	TypedDataMigrationAuthorizationRequest,
} from "../../positionMigrationServiceTypes.js";

/**
 * `v1` covers MetaMorpho v1 and v1.1 — both are OZ ERC20Permit vaults with an
 * identical ERC-4626/permit interface and allowance storage layout. `v2` is
 * Morpho Vaults V2, which uses a minimal EIP-712 domain (chainId +
 * verifyingContract only) and a different allowance slot.
 */
export type MetamorphoVaultVersion = "v1" | "v2";

export type MetamorphoPositionRef = {
	vault: Address;
	version: MetamorphoVaultVersion;
};

export type MetamorphoPositionRaw = {
	id: string;
	owner: Address;
	vault: Address;
	version: MetamorphoVaultVersion;
	shareBalance: bigint;
	assets: bigint;
	underlying: Address;
	underlyingSymbol: string;
	underlyingDecimals: number;
};

export type MetamorphoMigrationPosition = MigrationPosition<
	MetamorphoPositionRaw,
	MetamorphoPositionRef
>;

export type MetamorphoPermitTypedDataMessage = {
	owner: Address;
	spender: Address;
	value: bigint;
	nonce: bigint;
	deadline: bigint;
} & Record<string, unknown>;

export type MetamorphoPermitTypedDataRequest =
	TypedDataMigrationAuthorizationRequest<MetamorphoPermitTypedDataMessage> & {
		authorizationType: "metamorphoPermit";
		/** The vault address — Metamorpho shares are the vault token itself. */
		token: Address;
		/**
		 * Storage slot index of the vault's ERC-20 allowance mapping, used to
		 * stub the permit with a state override during simulation. Empirically
		 * verified: 1 for MetaMorpho v1/v1.1 (OZ layout), 13 for Vaults V2.
		 */
		allowanceSlotIndex: bigint;
	};

/** `vault.approve` — the signature-free counterpart of the share permit. */
export type MetamorphoShareApprovalTransactionRequest =
	TransactionMigrationAuthorizationRequest & {
		authorizationType: "metamorphoApproval";
		/** The vault address — Metamorpho shares are the vault token itself. */
		token: Address;
		allowanceSlotIndex: bigint;
		revocation: MigrationAuthorizationCall;
	};

export type MetamorphoMigrationAuthorizationRequest =
	MetamorphoPermitTypedDataRequest;

export type MetamorphoConnectorMigrationAuthorizationRequest =
	| MetamorphoMigrationAuthorizationRequest
	| MetamorphoShareApprovalTransactionRequest;

export type MetamorphoMigrationConnectorConfig = Record<string, never>;
