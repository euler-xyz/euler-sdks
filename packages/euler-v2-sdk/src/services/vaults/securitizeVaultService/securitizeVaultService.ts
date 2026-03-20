import { type Address, getAddress } from "viem";
import {
  SecuritizeCollateralVault,
  type ISecuritizeCollateralVault,
} from "../../../entities/SecuritizeCollateralVault.js";
import type { IVaultService, VaultFetchOptions } from "../index.js";
import type { IPriceService } from "../../priceService/index.js";
import type { IRewardsService } from "../../rewardsService/index.js";
import type { IIntrinsicApyService } from "../../intrinsicApyService/index.js";
import type { IEulerLabelsService } from "../../eulerLabelsService/index.js";
import type { DataIssue, ServiceResult } from "../../../utils/entityDiagnostics.js";
import {
  compressDataIssues,
  mapDataIssuePaths,
  normalizeTopLevelVaultArrayPath,
  withPathPrefix,
} from "../../../utils/entityDiagnostics.js";

export interface ISecuritizeCollateralAdapter {
  fetchVaults(
    chainId: number,
    vault: Address[]
  ): Promise<ServiceResult<(ISecuritizeCollateralVault | undefined)[]>>;
  fetchVerifiedVaultsAddresses(
    chainId: number,
    perspectives: Address[]
  ): Promise<Address[]>;
}

/** No standard perspectives for Securitize collateral vaults; use fetchVault(s) with known addresses. */
export type StandardSecuritizeCollateralPerspectives = never;

export interface ISecuritizeVaultService
  extends IVaultService<
    SecuritizeCollateralVault,
    StandardSecuritizeCollateralPerspectives | Address
  > {
  populateMarketPrices(
    vaults: SecuritizeCollateralVault[],
    getVaultPathPrefix?: (vaultIndex: number) => string
  ): Promise<DataIssue[]>;
  populateRewards(vaults: SecuritizeCollateralVault[]): Promise<DataIssue[]>;
  populateIntrinsicApy(vaults: SecuritizeCollateralVault[]): Promise<DataIssue[]>;
  populateLabels(vaults: SecuritizeCollateralVault[]): Promise<DataIssue[]>;
}

export class SecuritizeVaultService implements ISecuritizeVaultService {
  private priceService?: IPriceService;
  private rewardsService?: IRewardsService;
  private intrinsicApyService?: IIntrinsicApyService;
  private eulerLabelsService?: IEulerLabelsService;

  constructor(private adapter: ISecuritizeCollateralAdapter) {}

  setAdapter(adapter: ISecuritizeCollateralAdapter): void {
    this.adapter = adapter;
  }

  setPriceService(service: IPriceService): void {
    this.priceService = service;
  }

  setRewardsService(service: IRewardsService): void {
    this.rewardsService = service;
  }

  setIntrinsicApyService(service: IIntrinsicApyService): void {
    this.intrinsicApyService = service;
  }

  setEulerLabelsService(service: IEulerLabelsService): void {
    this.eulerLabelsService = service;
  }

  factory(_chainId: number): Address {
    // TODO fix this
    return getAddress("0x5f51d980f15fe6075ae30394dc35de57a4f76cbb");
  }

  async fetchVault(
    chainId: number,
    vault: Address,
    options?: VaultFetchOptions
  ): Promise<ServiceResult<SecuritizeCollateralVault | undefined>> {
    const fetched = await this.fetchVaults(chainId, [vault], options);
    const result = fetched.result[0];
    const errors = fetched.errors.map((issue) =>
      mapDataIssuePaths(issue, normalizeTopLevelVaultArrayPath)
    );
    if (result === undefined) {
      errors.push({
        code: "SOURCE_UNAVAILABLE",
        severity: "error",
        message: `Securitize vault not found for ${getAddress(vault)}.`,
        paths: ["$"],
        entityId: getAddress(vault),
        source: "securitizeVaultService",
        originalValue: getAddress(vault),
      });
    }
    return { result, errors: compressDataIssues(errors) };
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[],
    options?: VaultFetchOptions
  ): Promise<ServiceResult<(SecuritizeCollateralVault | undefined)[]>> {
    const resolvedOptions = this.resolveFetchOptions(options);
    const fetched = await this.adapter.fetchVaults(chainId, vaults);
    const errors: DataIssue[] = [...fetched.errors];
    const entities = fetched.result.map((v) =>
      v ? new SecuritizeCollateralVault(v) : undefined
    );
    const resolvedVaults = entities.filter((vault): vault is SecuritizeCollateralVault => vault !== undefined);
    await Promise.all([
      (async () => {
        if (resolvedOptions.populateMarketPrices) {
          errors.push(
            ...(await this.populateMarketPrices(
              resolvedVaults,
              (vaultIndex) => `$.vaults[${vaultIndex}]`
            ))
          );
        }
      })(),
      (async () => {
        if (resolvedOptions.populateRewards) {
          errors.push(...(await this.populateRewards(resolvedVaults)));
        }
      })(),
      (async () => {
        if (resolvedOptions.populateIntrinsicApy) {
          errors.push(...(await this.populateIntrinsicApy(resolvedVaults)));
        }
      })(),
      (async () => {
        if (resolvedOptions.populateLabels) {
          errors.push(...(await this.populateLabels(resolvedVaults)));
        }
      })(),
    ]);
    return { result: entities, errors: compressDataIssues(errors) };
  }

  async populateMarketPrices(
    vaults: SecuritizeCollateralVault[],
    getVaultPathPrefix: (vaultIndex: number) => string = (vaultIndex) => `$.vaults[${vaultIndex}]`
  ): Promise<DataIssue[]> {
    if (!this.priceService || vaults.length === 0) return [];
    const errors: DataIssue[] = [];

    await Promise.all(
      vaults.map(async (v, index) => {
        const vaultErrors = await v.populateMarketPrices(this.priceService!);
        errors.push(...vaultErrors.map((issue) => ({
          ...mapDataIssuePaths(
            issue,
            (path) => withPathPrefix(path, getVaultPathPrefix(index))
          ),
          entityId: issue.entityId ?? v.address,
        })));
      })
    );
    return errors;
  }

  async populateRewards(vaults: SecuritizeCollateralVault[]): Promise<DataIssue[]> {
    if (!this.rewardsService || vaults.length === 0) return [];
    try {
      await this.rewardsService.populateRewards(vaults);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate rewards.",
        paths: ["$"],
        entityId: vaults[0]?.address,
        source: "rewardsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateIntrinsicApy(vaults: SecuritizeCollateralVault[]): Promise<DataIssue[]> {
    if (!this.intrinsicApyService || vaults.length === 0) return [];
    try {
      await this.intrinsicApyService.populateIntrinsicApy(vaults);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate intrinsic APY.",
        paths: ["$"],
        entityId: vaults[0]?.address,
        source: "intrinsicApyService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateLabels(vaults: SecuritizeCollateralVault[]): Promise<DataIssue[]> {
    if (!this.eulerLabelsService || vaults.length === 0) return [];
    try {
      await this.eulerLabelsService.populateLabels(vaults);
      return [];
    } catch (error) {
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate labels.",
        paths: ["$"],
        entityId: vaults[0]?.address,
        source: "eulerLabelsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async fetchVerifiedVaultAddresses(
    _chainId: number,
    _perspectives: (StandardSecuritizeCollateralPerspectives | Address)[]
  ): Promise<Address[]> {
    // TODO fix this
    return [];
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardSecuritizeCollateralPerspectives | Address)[],
    options?: VaultFetchOptions
  ): Promise<ServiceResult<(SecuritizeCollateralVault | undefined)[]>> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    const fetched = await this.fetchVaults(chainId, addresses, options);
    return {
      ...fetched,
      errors: compressDataIssues(
        fetched.errors.map((issue) =>
          mapDataIssuePaths(issue, normalizeTopLevelVaultArrayPath)
        )
      ),
    };
  }

  private resolveFetchOptions(options?: VaultFetchOptions): VaultFetchOptions {
    const resolved = options ?? {};
    if (!resolved.populateAll) return resolved;
    return {
      ...resolved,
      populateMarketPrices: true,
      populateRewards: true,
      populateIntrinsicApy: true,
      populateLabels: true,
    };
  }
}
