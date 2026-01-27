import { Wallet, IWallet } from "../../entities/Wallet.js";
import { Address } from "viem";

export interface IWalletDataSource {
  fetchWallet(chainId: number, account: Address, asset: Address, spenders: Address[]): Promise<IWallet | undefined>;
}

export interface IWalletService {
  fetchWallet(chainId: number, account: Address, asset: Address, spenders: Address[]): Promise<Wallet>;
}

export class WalletService implements IWalletService {
  constructor(
    private readonly dataSource: IWalletDataSource
  ) {}

  async fetchWallet(chainId: number, account: Address, asset: Address, spenders: Address[]): Promise<Wallet> {
    const walletData = await this.dataSource.fetchWallet(chainId, account, asset, spenders);
    if (!walletData) return new Wallet({ account, assets: [] });

    return new Wallet(walletData);
  }
}
