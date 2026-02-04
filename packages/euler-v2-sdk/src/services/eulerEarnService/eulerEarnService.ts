import { EulerEarn, IEulerEarn } from "../../entities/EulerEarn.js";
import { Address } from "viem";
import { DeploymentService } from "../deploymentService/index.js";
import type { IVaultService } from "../vaultService/index.js";

export interface IEulerEarnDataSource {
  fetchVaults(chainId: number, vault: Address[]): Promise<IEulerEarn[]>;
  fetchVerifiedVaultsAddresses(chainId: number, perspectives: Address[]): Promise<Address[]>;
}

export enum StandardEulerEarnPerspectives {
  GOVERNED = "eulerEarnGovernedPerspective",
  FACTORY = "eulerEarnFactoryPerspective",
}

export interface IEulerEarnService
  extends IVaultService<EulerEarn, StandardEulerEarnPerspectives> {}

export class EulerEarnService implements IEulerEarnService {
  constructor(
    private readonly dataSource: IEulerEarnDataSource,
    private readonly deploymentService: DeploymentService
  ) {}

  factory(chainId: number): Address {
    return this.deploymentService.getDeployment(chainId).addresses.coreAddrs
      .eulerEarnFactory;
  }

  async fetchVault(chainId: number, vault: Address): Promise<EulerEarn> {
    const vaults = await this.dataSource.fetchVaults(chainId, [vault]);
    if (vaults.length === 0) {
      throw new Error(`Vault not found for ${vault}`);
    }
    return new EulerEarn(vaults[0]!);
  }

  async fetchVaults(chainId: number, vaults: Address[]): Promise<EulerEarn[]> {
    return (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (vault) => new EulerEarn(vault)
    );
  }

  async fetchVerifiedVaultAddresses(
    chainId: number,
    perspectives: (StandardEulerEarnPerspectives | Address)[]
  ): Promise<Address[]> {
    if (perspectives.length === 0) {
      return [];
    }

    const perspectiveAddresses = perspectives.map((perspective) => {
      if (perspective.startsWith("0x")) {
        return perspective as Address;
      }

      const deployment = this.deploymentService.getDeployment(chainId);
      if (
        !deployment.addresses.peripheryAddrs?.[
          perspective as StandardEulerEarnPerspectives
        ]
      ) {
        throw new Error(`Perspective address not found for ${perspective}`);
      }

      return deployment.addresses.peripheryAddrs[
        perspective as StandardEulerEarnPerspectives
      ] as Address;
    });
    return this.dataSource.fetchVerifiedVaultsAddresses(
      chainId,
      perspectiveAddresses
    );
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: (StandardEulerEarnPerspectives | Address)[]
  ): Promise<EulerEarn[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses);
  }
}

