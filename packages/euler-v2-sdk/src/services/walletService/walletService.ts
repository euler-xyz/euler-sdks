import { Wallet, IWallet } from "../../entities/Wallet.js";
import { Address } from "viem";
import { type ServiceResult } from "../../utils/entityDiagnostics.js";

export interface AssetWithSpenders {
  asset: Address;
  spenders: Address[];
}

export interface IWalletAdapter {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<ServiceResult<IWallet | undefined>>;
}

export interface IWalletService {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<ServiceResult<Wallet>>;
}

export class WalletService implements IWalletService {
  constructor(
    private adapter: IWalletAdapter
  ) {}

  setAdapter(adapter: IWalletAdapter): void {
    this.adapter = adapter;
  }

  async fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<ServiceResult<Wallet>> {
    const fetched = await this.adapter.fetchWallet(chainId, account, assetsWithSpenders);
    if (!fetched.result) {
      const emptyWallet: IWallet = { chainId, account, assets: [] };
      return { result: new Wallet(emptyWallet), errors: [...fetched.errors, {
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Wallet adapter returned no data; created empty wallet.",
        path: "$",
        source: "walletAdapter",
        normalizedValue: "empty-wallet",
      }] };
    }

    return { result: new Wallet(fetched.result), errors: fetched.errors };
  }
}
