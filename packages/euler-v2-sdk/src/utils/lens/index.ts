import { vaultLensAbi } from "../../services/vaults/eVaultService/adapters/eVaultOnchainAdapter/abis/vaultLensAbi.js";
import { irmLensAbi } from "./abis/irmLensAbi.js";
import { oracleLensAbi } from "./abis/oracleLensAbi.js";
import { defineLensRead } from "./lensRead.js";

export { irmLensAbi, oracleLensAbi };
export { type LensRead, defineLensRead } from "./lensRead.js";

/**
 * OracleLens views. `getOracleInfo` answers the `OracleDetailedInfo` that
 * `decodeOracleInfo` / `decodeOracleRoutes` in `utils/oracle.ts` decode.
 */
export const oracleLens = {
	getOracleInfo: defineLensRead(oracleLensAbi, "getOracleInfo"),
	getValidAdapters: defineLensRead(oracleLensAbi, "getValidAdapters"),
	isStalePullOracle: defineLensRead(oracleLensAbi, "isStalePullOracle"),
} as const;

/**
 * IRMLens views. `getInterestRateModelInfo` answers the
 * `InterestRateModelDetailedInfo` that `decodeIRMParams` in `utils/irm.ts`
 * decodes from its `interestRateModelType` and `interestRateModelParams`.
 */
export const irmLens = {
	getInterestRateModelInfo: defineLensRead(
		irmLensAbi,
		"getInterestRateModelInfo",
	),
} as const;

/**
 * VaultLens views. `getVaultInfoFull` answers what
 * `convertVaultInfoFullToIEVault` converts; the static and dynamic halves are
 * for consumers that want only one of them.
 */
export const vaultLens = {
	getVaultInfoFull: defineLensRead(vaultLensAbi, "getVaultInfoFull"),
	getVaultInfoStatic: defineLensRead(vaultLensAbi, "getVaultInfoStatic"),
	getVaultInfoDynamic: defineLensRead(vaultLensAbi, "getVaultInfoDynamic"),
	getRecognizedCollateralsLTVInfo: defineLensRead(
		vaultLensAbi,
		"getRecognizedCollateralsLTVInfo",
	),
	getVaultInterestRateModelInfo: defineLensRead(
		vaultLensAbi,
		"getVaultInterestRateModelInfo",
	),
} as const;
