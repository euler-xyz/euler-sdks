import { EulerEarn, IEulerEarn } from "../../../entities/EulerEarn.js";
import { Address } from "viem";
import { DeploymentService } from "../../deploymentService/index.js";
import type { IVaultService } from "../index.js";
import type { IEVaultService } from "../eVaultService/index.js";

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
    private readonly deploymentService: DeploymentService,
    private readonly eVaultService?: IEVaultService
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
    const eulerEarn = new EulerEarn(vaults[0]!);
    await this.populateStrategyVaults(chainId, [eulerEarn]);
    return eulerEarn;
  }

  async fetchVaults(chainId: number, vaults: Address[]): Promise<EulerEarn[]> {
    const eulerEarns = (await this.dataSource.fetchVaults(chainId, vaults)).map(
      (vault) => new EulerEarn(vault)
    );
    await this.populateStrategyVaults(chainId, eulerEarns);
    return eulerEarns;
  }

  private async populateStrategyVaults(
    chainId: number,
    eulerEarns: EulerEarn[]
  ): Promise<void> {
    if (!this.eVaultService) return;

    const allStrategyAddresses = [
      ...new Set(
        eulerEarns.flatMap((ee) => ee.strategies.map((s) => s.address))
      ),
    ];

    if (allStrategyAddresses.length === 0) return;

    const eVaults = await Promise.all(
      allStrategyAddresses.map((addr) =>
        this.eVaultService!.fetchVault(chainId, addr).catch(() => undefined)
      )
    );

    const eVaultByAddress = new Map(
      eVaults
        .filter((v) => v !== undefined)
        .map((v) => [v.address.toLowerCase(), v])
    );

    for (const ee of eulerEarns) {
      for (const strategy of ee.strategies) {
        strategy.vault = eVaultByAddress.get(strategy.address.toLowerCase());
      }
    }
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

