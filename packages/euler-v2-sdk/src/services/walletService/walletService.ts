import { Wallet, IWallet } from "../../entities/Wallet.js";
import { Address } from "viem";
import { addEntityDataIssue } from "../../utils/entityDiagnostics.js";

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
    if (!walletData) {
      const emptyWallet: IWallet = { chainId, account, assets: [] };
      addEntityDataIssue(emptyWallet as object, {
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Wallet adapter returned no data; created empty wallet.",
        path: "$",
        source: "walletAdapter",
        normalizedValue: "empty-wallet",
      });
      return new Wallet(emptyWallet);
    }

    return new Wallet(walletData);
  }
}
