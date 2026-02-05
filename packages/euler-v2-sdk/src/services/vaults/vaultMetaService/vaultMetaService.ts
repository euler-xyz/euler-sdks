import { Address, getAddress } from "viem";
import { EVault } from "../../../entities/EVault.js";
import { EulerEarn } from "../../../entities/EulerEarn.js";
import { SecuritizeCollateralVault } from "../../../entities/SecuritizeCollateralVault.js";
import type { IVaultService } from "../index.js";
import type { IVaultTypeDataSource } from "./dataSources/IVaultTypeDataSource.js";
import { StandardEVaultPerspectives } from "../eVaultService/index.js";
import { StandardEulerEarnPerspectives } from "../eulerEarnService/index.js";

export type VaultMetaPerspective =
  | StandardEulerEarnPerspectives
  | StandardEVaultPerspectives
  | Address;

/** Default union of vault entity types (EVault, Euler Earn, SecuritizeCollateral). Extend this when registering additional vault services. */
export type VaultMetaEntity = EVault | EulerEarn | SecuritizeCollateralVault;

/** A vault service that can be registered with VaultMetaService. Use TEntity to extend the meta service return type (e.g. EVault | EulerEarn | CustomVault). */
export type RegisteredVaultService<TEntity = VaultMetaEntity> = IVaultService<
  TEntity,
  string
>;

/** Extendable vault type: built-in (e.g. VaultType.EVault, VaultType.Earn) or custom string when adding vault services with a type. */
export type VaultTypeString = string;

/** A vault service optionally tagged with a type for getFactoryByType(chainId, type). Use { type, service } when adding custom vault types. */
export type VaultServiceEntry<TEntity = VaultMetaEntity> =
  | RegisteredVaultService<TEntity>
  | { type: VaultTypeString; service: RegisteredVaultService<TEntity> };

/** Meta vault service; TEntity is the union of all registered vault entity types (default EVault | EulerEarn). Extend with a wider union when registering more services. */
export interface IVaultMetaService<TEntity = VaultMetaEntity>
  extends Omit<IVaultService<TEntity, VaultMetaPerspective>, "fetchVault"> {
  /** Register a vault service; use { type, service } to make the type available to getFactoryByType(chainId, type). */
  registerVaultService(entry: VaultServiceEntry<TEntity>): void;
  /** Fetches a single vault; returns undefined if the vault type is unknown (no matching registered service). */
  fetchVault(
    chainId: number,
    vault: Address
  ): Promise<TEntity | undefined>;
  /** Returns the factory address for the given chain and vault type, or undefined if the type is not registered. */
  getFactoryByType(chainId: number, type: VaultTypeString): Address | undefined;
}

export interface VaultMetaServiceConfig<TEntity = VaultMetaEntity> {
  vaultTypeDataSource: IVaultTypeDataSource;
  /** Initial vault services; each must implement factory(chainId). Use { type, service } to register a vault type for getFactoryByType(chainId, type). */
  vaultServices?: VaultServiceEntry<TEntity>[];
}

export class VaultMetaService<TEntity = VaultMetaEntity>
  implements IVaultMetaService<TEntity> {
  private readonly vaultServicesList: RegisteredVaultService<TEntity>[] = [];
  private readonly typeToService = new Map<string, RegisteredVaultService<TEntity>>();

  constructor(private readonly config: VaultMetaServiceConfig<TEntity>) {
    if (config.vaultServices?.length) {
      for (const entry of config.vaultServices) {
        if ("type" in entry && "service" in entry) {
          this.typeToService.set(entry.type, entry.service);
          this.vaultServicesList.push(entry.service);
        } else {
          this.vaultServicesList.push(entry as RegisteredVaultService<TEntity>);
        }
      }
    }
  }

  /** Register a vault service; use { type, service } to make the type available to getFactoryByType(chainId, type). */
  registerVaultService(entry: VaultServiceEntry<TEntity>): void {
    if ("type" in entry && "service" in entry) {
      this.typeToService.set(entry.type, entry.service);
      this.vaultServicesList.push(entry.service);
    } else {
      this.vaultServicesList.push(entry as RegisteredVaultService<TEntity>);
    }
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

  getFactoryByType(chainId: number, type: string): Address | undefined {
    const service = this.typeToService.get(type);
    return service?.factory(chainId);
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
