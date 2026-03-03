import { Address, isAddressEqual } from "viem";
import { transferEntityDataIssues } from "../utils/entityDiagnostics.js";

export interface IWallet {
  chainId: number;
  account: Address;
  assets: WalletAsset[];
}

export interface AssetAllowances {
  assetForVault: bigint;
  assetForPermit2: bigint;
  assetForVaultInPermit2: bigint;
  permit2ExpirationTime: number;
}

export interface WalletAsset {
  account: Address;
  asset: Address;
  balance: bigint;
  allowances: Record<Address, AssetAllowances>;
}

export class Wallet implements IWallet {
  chainId: number;
  account: Address;
  assets: WalletAsset[];

  constructor(wallet: IWallet) {
    transferEntityDataIssues(wallet as object, this);
    this.chainId = wallet.chainId;
    this.account = wallet.account;
    this.assets = wallet.assets;
  }

  getAsset(asset: Address): WalletAsset | undefined {
    return this.assets.find(a => isAddressEqual(a.asset, asset));
  }

  getBalance(asset: Address): bigint {
    return this.getAsset(asset)?.balance ?? 0n;
  }

  getAllowances(asset: Address, spender: Address): AssetAllowances | undefined {
    return this.getAsset(asset)?.allowances[spender];
  }
}
