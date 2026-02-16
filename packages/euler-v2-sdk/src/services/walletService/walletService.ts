import { Wallet, IWallet } from "../../entities/Wallet.js";
import { Address } from "viem";

export interface AssetWithSpenders {
  asset: Address;
  spenders: Address[];
}

export interface IWalletAdapter {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<IWallet | undefined>;
}

export interface IWalletService {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<Wallet>;
}

export class WalletService implements IWalletService {
  constructor(
    private adapter: IWalletAdapter
  ) {}

  setAdapter(adapter: IWalletAdapter): void {
    this.adapter = adapter;
  }

  async fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<Wallet> {
    const walletData = await this.adapter.fetchWallet(chainId, account, assetsWithSpenders);
    if (!walletData) return new Wallet({ chainId, account, assets: [] });

    return new Wallet(walletData);
  }
}
