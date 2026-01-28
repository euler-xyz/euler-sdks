import { Wallet, IWallet } from "../../entities/Wallet.js";
import { Address } from "viem";

export interface AssetWithSpenders {
  asset: Address;
  spenders: Address[];
}

export interface IWalletDataSource {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<IWallet | undefined>;
}

export interface IWalletService {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<Wallet>;
}

export class WalletService implements IWalletService {
  constructor(
    private readonly dataSource: IWalletDataSource
  ) {}

  async fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<Wallet> {
    const walletData = await this.dataSource.fetchWallet(chainId, account, assetsWithSpenders);
    if (!walletData) return new Wallet({ chainId, account, assets: [] });

    return new Wallet(walletData);
  }
}
