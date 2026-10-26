import { type Address, getAddress, isAddressEqual, zeroAddress } from "viem";

export interface IWallet {
	chainId: number;
	account: Address;
	assets: WalletAsset[];
}

export type AssetAllowanceRead =
	| "assetForVault"
	| "assetForPermit2"
	| "assetForVaultInPermit2";

export interface AssetAllowances {
	assetForVault: bigint;
	assetForPermit2: bigint;
	assetForVaultInPermit2: bigint;
	permit2ExpirationTime: number;
	permit2Nonce: number;
	// Each listed read failed on chain; its value is the 0 fallback, not a confirmed zero
	// (the Permit2 read also carries permit2ExpirationTime and permit2Nonce).
	failedReads?: readonly AssetAllowanceRead[];
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
		this.chainId = wallet.chainId;
		this.account = wallet.account;
		this.assets = wallet.assets;
	}

	getAsset(asset: Address): WalletAsset | undefined {
		return this.assets.find((a) => isAddressEqual(a.asset, asset));
	}

	getBalance(asset: Address): bigint {
		return this.getAsset(asset)?.balance ?? 0n;
	}

	/**
	 * Native (gas) token balance. The wallet adapter fetches it via
	 * `eth_getBalance` when the zero address is among the requested assets and
	 * stores it as a `WalletAsset` keyed by the zero address, so this is just an
	 * explicit accessor for that convention.
	 */
	getNativeBalance(): bigint {
		return this.getBalance(zeroAddress);
	}

	getAllowances(asset: Address, spender: Address): AssetAllowances | undefined {
		return this.getAsset(asset)?.allowances[getAddress(spender)];
	}
}
