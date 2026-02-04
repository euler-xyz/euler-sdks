import { Address, getAddress } from "viem";
import { EVault } from "../../../entities/EVault.js";
import { EulerEarn } from "../../../entities/EulerEarn.js";
import type { IVaultService } from "../index.js";
import type { IVaultTypeDataSource } from "./dataSources/IVaultTypeDataSource.js";
import { StandardEVaultPerspectives } from "../eVaultService/index.js";
import { StandardEulerEarnPerspectives } from "../eulerEarnService/index.js";

export type VaultMetaPerspective =
  | StandardEulerEarnPerspectives
  | StandardEVaultPerspectives
  | Address;

/** Default union of vault entity types (EVault, Euler Earn). Extend this when registering additional vault services. */
export type VaultMetaEntity = EVault | EulerEarn;

/** A vault service that can be registered with VaultMetaService. Use TEntity to extend the meta service return type (e.g. EVault | EulerEarn | CustomVault). */
export type RegisteredVaultService<TEntity = VaultMetaEntity> = IVaultService<
  TEntity,
  string
>;

/** Meta vault service; TEntity is the union of all registered vault entity types (default EVault | EulerEarn). Extend with a wider union when registering more services. */
export interface IVaultMetaService<TEntity = VaultMetaEntity>
  extends Omit<IVaultService<TEntity, VaultMetaPerspective>, "fetchVault"> {
  /** Register an additional vault service; its return type is included in this meta service's TEntity. */
  registerVaultService(service: RegisteredVaultService<TEntity>): void;
  /** Fetches a single vault; returns undefined if the vault type is unknown (no matching registered service). */
  fetchVault(
    chainId: number,
    vault: Address
  ): Promise<TEntity | undefined>;
}

export interface VaultMetaServiceConfig<TEntity = VaultMetaEntity> {
  vaultTypeDataSource: IVaultTypeDataSource;
  /** Initial vault services; each must implement factory(chainId). More can be added via registerVaultService. */
  vaultServices?: RegisteredVaultService<TEntity>[];
}

export class VaultMetaService<TEntity = VaultMetaEntity>
  implements IVaultMetaService<TEntity> {
  private readonly vaultServicesList: RegisteredVaultService<TEntity>[] = [];

  constructor(private readonly config: VaultMetaServiceConfig<TEntity>) {
    if (config.vaultServices?.length) {
      this.vaultServicesList.push(...config.vaultServices);
    }
  }

  /** Register an additional vault service; its return type is included in this meta service's TEntity. */
  registerVaultService(service: RegisteredVaultService<TEntity>): void {
    this.vaultServicesList.push(service);
  }

  private get vaultServices(): readonly RegisteredVaultService<TEntity>[] {
    return this.vaultServicesList;
  }

  private getFactoryToServiceMap(
    chainId: number
  ): Map<string, RegisteredVaultService<TEntity>> {
    const map = new Map<string, RegisteredVaultService<TEntity>>();
    for (const service of this.vaultServices) {
      const factory = getAddress(service.factory(chainId));
      map.set(factory, service);
    }
    return map;
  }

  private async getVaultToService(
    chainId: number,
    vaultAddresses: Address[]
  ): Promise<Map<Address, RegisteredVaultService<TEntity>>> {
    if (vaultAddresses.length === 0) return new Map();
    const results = await this.config.vaultTypeDataSource.getVaultFactories(
      chainId,
      vaultAddresses
    );
    const factoryToService = this.getFactoryToServiceMap(chainId);
    const map = new Map<Address, RegisteredVaultService<TEntity>>();
    for (const { id, factory } of results) {
      const service = factoryToService.get(getAddress(factory));
      if (service) {
        map.set(getAddress(id), service);
      }
    }
    return map;
  }

  factory(chainId: number): Address {
    if (this.vaultServices.length === 0) {
      throw new Error("VaultMetaService has no registered vault services");
    }
    return this.vaultServices[0]!.factory(chainId);
  }

  async fetchVault(
    chainId: number,
    vault: Address
  ): Promise<TEntity | undefined> {
    const vaultToService = await this.getVaultToService(chainId, [vault]);
    const service = vaultToService.get(getAddress(vault));
    if (!service) return undefined;
    return service.fetchVault(chainId, vault);
  }

  async fetchVaults(
    chainId: number,
    vaults: Address[]
  ): Promise<TEntity[]> {
    if (vaults.length === 0) return [];
    const vaultToService = await this.getVaultToService(chainId, vaults);
    const serviceToAddresses = new Map<
      RegisteredVaultService<TEntity>,
      Address[]
    >();
    for (const v of vaults) {
      const service = vaultToService.get(getAddress(v));
      if (service) {
        const list = serviceToAddresses.get(service) ?? [];
        list.push(v);
        serviceToAddresses.set(service, list);
      }
    }
    const resultsByAddress = new Map<string, TEntity>();
    await Promise.all(
      Array.from(serviceToAddresses.entries()).map(
        async ([service, addrs]) => {
          const entities = await service.fetchVaults(chainId, addrs);
          for (const e of entities) {
            resultsByAddress.set(
              getAddress((e as { address: Address }).address),
              e
            );
          }
        }
      )
    );
    return vaults
      .map((v) => resultsByAddress.get(getAddress(v)))
      .filter((e): e is TEntity => e != null);
  }

  async fetchVerifiedVaultAddresses(
    chainId: number,
    perspectives: VaultMetaPerspective[]
  ): Promise<Address[]> {
    if (perspectives.length === 0) return [];
    const allAddrs = await Promise.all(
      this.vaultServices.map((service) =>
        service.fetchVerifiedVaultAddresses(
          chainId,
          perspectives as (string | Address)[]
        )
      )
    );
    const seen = new Set<string>();
    const merged: Address[] = [];
    for (const addrs of allAddrs) {
      for (const a of addrs) {
        const key = getAddress(a);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(a);
      }
    }
    return merged;
  }

  async fetchVerifiedVaults(
    chainId: number,
    perspectives: VaultMetaPerspective[]
  ): Promise<TEntity[]> {
    const addresses = await this.fetchVerifiedVaultAddresses(
      chainId,
      perspectives
    );
    return this.fetchVaults(chainId, addresses);
  }
}
