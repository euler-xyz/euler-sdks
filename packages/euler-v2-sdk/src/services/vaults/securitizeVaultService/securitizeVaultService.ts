import { Address, getAddress } from "viem";
import {
  SecuritizeCollateralVault,
  ISecuritizeCollateralVault,
} from "../../../entities/SecuritizeCollateralVault.js";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService } from "../index.js";

export interface ISecuritizeCollateralDataSource {
  fetchVaults(
    chainId: number,
    vault: Address[]
  ): Promise<ISecuritizeCollateralVault[]>;
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
  > {}

export class SecuritizeVaultService implements ISecuritizeVaultService {
  constructor(
    private readonly dataSource: ISecuritizeCollateralDataSource,
    private readonly deploymentService: DeploymentService
  ) {}

  factory(chainId: number): Address {
    // TODO fix this
    return getAddress("0x5f51d980f15fe6075ae30394dc35de57a4f76cbb");
  }

  async fetchVault(
    chainId: number,
    vault: Address
  ): Promise<SecuritizeCollateralVault> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Securitize vault not found for ${vault}`);
    }
    return new SecuritizeCollateralVault(vaults[0]!);
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[]
  ): Promise<SecuritizeCollateralVault[]> {
    return (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (v) => new SecuritizeCollateralVault(v)
    );
  }

  async fetchVerifiedVaultAddresses(
    _chainId: number,
    _perspectives: (StandardSecuritizeCollateralPerspectives | Address)[]
  ): Promise<Address[]> {
    return [];
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardSecuritizeCollateralPerspectives | Address)[]
  ): Promise<SecuritizeCollateralVault[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses);
  }
}
