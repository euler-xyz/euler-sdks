import { Wallet, IWallet } from "../../entities/Wallet.js";
import { Address, getAddress } from "viem";
import { RequiredApproval, TransactionPlanItem } from "../executionService/executionServiceTypes.js";

export interface AssetWithSpenders {
  asset: Address;
  spenders: Address[];
}

export interface IWalletDataSource {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<IWallet | undefined>;
}

export interface IWalletService {
  fetchWallet(chainId: number, account: Address, assetsWithSpenders: AssetWithSpenders[]): Promise<Wallet>;
  fetchWalletForPlan(chainId: number, account: Address, transactionPlan: TransactionPlanItem[]): Promise<Wallet>;
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

  async fetchWalletForPlan(chainId: number, account: Address, transactionPlan: TransactionPlanItem[]): Promise<Wallet> {
    // Filter transaction plan for only RequiredApproval items
    const requiredApprovals = transactionPlan.filter(
      (item): item is RequiredApproval => item.type === "requiredApproval"
    );

    // Transform RequiredApprovals into AssetWithSpenders
    const assetSpendersMap = new Map<Address, Set<Address>>();

    for (const approval of requiredApprovals) {
      const asset = getAddress(approval.token);
      const spender = getAddress(approval.spender);

      if (!assetSpendersMap.has(asset)) {
        assetSpendersMap.set(asset, new Set());
      }
      assetSpendersMap.get(asset)!.add(spender);
    }

    // Convert map to AssetWithSpenders array
    const assetsWithSpenders: AssetWithSpenders[] = Array.from(assetSpendersMap.entries()).map(
      ([asset, spenders]) => ({
        asset,
        spenders: Array.from(spenders),
      })
    );

    return this.fetchWallet(chainId, account, assetsWithSpenders);
  }
}
