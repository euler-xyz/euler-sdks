import type { Address } from "viem";
import type {
	BuildSDKOverrides,
	EVault,
	EVaultFetchOptions,
	FetchAllVaultsArgs,
	IEVaultService,
	ServiceResult,
	StandardEVaultPerspectives,
} from "../../src/index.js";

type LegacyEVaultFetchOptions = Omit<EVaultFetchOptions, "readContext">;

type LegacyEVaultService = Omit<
	IEVaultService,
	"fetchAllVaults" | "fetchVault" | "fetchVaults" | "fetchVerifiedVaults"
> & {
	fetchVault(
		chainId: number,
		vault: Address,
		options?: LegacyEVaultFetchOptions,
	): Promise<ServiceResult<EVault | undefined>>;
	fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: LegacyEVaultFetchOptions,
	): Promise<ServiceResult<(EVault | undefined)[]>>;
	fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<EVault, LegacyEVaultFetchOptions>,
	): Promise<ServiceResult<(EVault | undefined)[]>>;
	fetchVerifiedVaults(
		chainId: number,
		perspectives: (StandardEVaultPerspectives | Address)[],
		options?: LegacyEVaultFetchOptions,
	): Promise<ServiceResult<(EVault | undefined)[]>>;
};

declare const legacyEVaultService: LegacyEVaultService;

const compatibleOverride: NonNullable<
	BuildSDKOverrides["eVaultService"]
> = legacyEVaultService;

void compatibleOverride;
