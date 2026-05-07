import type { IWalletAdapter, AssetWithSpenders } from "../walletService.js";
import type { ProviderService } from "../../providerService/index.js";
import type { DeploymentService } from "../../deploymentService/index.js";
import { type Address, getAddress, erc20Abi, zeroAddress } from "viem";
import type {
	IWallet,
	WalletAsset,
	AssetAllowances,
} from "../../../entities/Wallet.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../utils/buildQuery.js";
import {
	dataIssueLocation,
	type DataIssue,
	type ServiceResult,
	walletAssetDiagnosticOwner,
	walletDiagnosticOwner,
} from "../../../utils/entityDiagnostics.js";
import { numberLikeToSafeFiniteNumber } from "../../../utils/normalization.js";

// Permit2 IAllowanceTransfer.allowance function ABI
const permit2AllowanceAbi = [
	{
		type: "function",
		name: "allowance",
		inputs: [
			{ name: "user", type: "address" },
			{ name: "token", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [
			{ name: "amount", type: "uint160" },
			{ name: "expiration", type: "uint48" },
			{ name: "nonce", type: "uint48" },
		],
		stateMutability: "view",
	},
] as const;

const utilsLensTokenBalancesAbi = [
	{
		type: "function",
		name: "tokenBalances",
		inputs: [
			{ name: "account", type: "address", internalType: "address" },
			{ name: "tokens", type: "address[]", internalType: "address[]" },
		],
		outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
		stateMutability: "view",
	},
] as const;

type BalanceResult = { value: bigint; failed: boolean };
const TOKEN_BALANCES_CHUNK_SIZE = 250;

export class WalletOnchainAdapter implements IWalletAdapter {
	constructor(
		private providerService: ProviderService,
		private deploymentService: DeploymentService,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setProviderService(providerService: ProviderService): void {
		this.providerService = providerService;
	}

	queryNativeBalance = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		account: Address,
	): Promise<bigint> => {
		return provider.getBalance({ address: account });
	};

	setQueryNativeBalance(fn: typeof this.queryNativeBalance): void {
		this.queryNativeBalance = fn;
	}

	queryTokenBalances = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		utilsLensAddress: Address,
		account: Address,
		assets: Address[],
	): Promise<readonly bigint[]> => {
		return provider.readContract({
			address: utilsLensAddress,
			abi: utilsLensTokenBalancesAbi,
			functionName: "tokenBalances",
			args: [account, assets],
		});
	};

	setQueryTokenBalances(fn: typeof this.queryTokenBalances): void {
		this.queryTokenBalances = fn;
	}

	queryBalanceOf = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		asset: Address,
		account: Address,
	): Promise<bigint> => {
		return provider.readContract({
			address: asset,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [account],
		});
	};

	setQueryBalanceOf(fn: typeof this.queryBalanceOf): void {
		this.queryBalanceOf = fn;
	}

	queryAllowance = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		asset: Address,
		owner: Address,
		spender: Address,
	): Promise<bigint> => {
		return provider.readContract({
			address: asset,
			abi: erc20Abi,
			functionName: "allowance",
			args: [owner, spender],
		});
	};

	setQueryAllowance(fn: typeof this.queryAllowance): void {
		this.queryAllowance = fn;
	}

	queryPermit2Allowance = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		permit2Address: Address,
		owner: Address,
		asset: Address,
		spender: Address,
	): Promise<readonly [bigint, number, number]> => {
		return provider.readContract({
			address: permit2Address,
			abi: permit2AllowanceAbi,
			functionName: "allowance",
			args: [owner, asset, spender],
		});
	};

	setQueryPermit2Allowance(fn: typeof this.queryPermit2Allowance): void {
		this.queryPermit2Allowance = fn;
	}

	async fetchWallet(
		chainId: number,
		account: Address,
		assetsWithSpenders: AssetWithSpenders[],
	): Promise<ServiceResult<IWallet | undefined>> {
		const provider = this.providerService.getProvider(chainId);
		const deployment = this.deploymentService.getDeployment(chainId);
		const accountAddress = getAddress(account);
		const permit2Address = deployment.addresses.coreAddrs.permit2;
		const errors: DataIssue[] = [];

		try {
			const walletAssets: WalletAsset[] = [];
			const requestedAssets = Array.from(
				assetsWithSpenders.reduce((assetsByAddress, { asset, spenders }) => {
					const assetAddress = getAddress(asset);
					const entry = assetsByAddress.get(assetAddress) ?? {
						assetAddress,
						spenders: [] as Address[],
					};

					if (assetAddress !== zeroAddress) {
						for (const spender of spenders ?? []) {
							const spenderAddress = getAddress(spender);
							if (!entry.spenders.includes(spenderAddress)) {
								entry.spenders.push(spenderAddress);
							}
						}
					}

					assetsByAddress.set(assetAddress, entry);
					return assetsByAddress;
				}, new Map<Address, { assetAddress: Address; spenders: Address[] }>()),
				([, value]) => value,
			);
			const balanceResults = new Map<Address, BalanceResult>();

			if (requestedAssets.some(({ assetAddress }) => assetAddress === zeroAddress)) {
				const nativeBalance = await this.queryNativeBalance(
					provider,
					accountAddress,
				)
					.then((value) => ({ value, failed: false }))
					.catch(() => ({ value: 0n, failed: true }));
				if (nativeBalance.failed) {
					errors.push({
						code: "SOURCE_UNAVAILABLE",
						severity: "warning",
						message:
							"Failed to fetch native balance; defaulted to 0.",
						locations: [
							dataIssueLocation(
								walletAssetDiagnosticOwner(chainId, accountAddress, zeroAddress),
								"$.balance",
							),
						],
						source: "eth_getBalance",
						normalizedValue: "0",
					});
				}
				balanceResults.set(zeroAddress, nativeBalance);
			}

			const erc20Assets = Array.from(
				new Set(
					requestedAssets
						.map(({ assetAddress }) => assetAddress)
						.filter((assetAddress) => assetAddress !== zeroAddress),
				),
			);
			if (erc20Assets.length) {
				const utilsLensAddress = deployment.addresses.lensAddrs.utilsLens;
				const chunks: Address[][] = [];
				for (
					let index = 0;
					index < erc20Assets.length;
					index += TOKEN_BALANCES_CHUNK_SIZE
				) {
					chunks.push(erc20Assets.slice(index, index + TOKEN_BALANCES_CHUNK_SIZE));
				}

				await Promise.all(
					chunks.map(async (chunk, chunkIndex) => {
						const tokenBalances = await this.queryTokenBalances(
							provider,
							utilsLensAddress,
							accountAddress,
							chunk,
						)
							.then((values) => ({ values, failed: false as const }))
							.catch(() => ({
								values: chunk.map(() => 0n),
								failed: true as const,
							}));

						if (
							tokenBalances.failed ||
							tokenBalances.values.length !== chunk.length
						) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message:
									"Failed to fetch batched token balances; falling back to balanceOf.",
								locations: [
									dataIssueLocation(
										walletDiagnosticOwner(chainId, accountAddress),
										`$.assets[${chunkIndex}]`,
									),
								],
								source: "utilsLens.tokenBalances",
								normalizedValue: "fallback-balanceOf",
							});

							await Promise.all(
								chunk.map(async (assetAddress) => {
									const balance = await this.queryBalanceOf(
										provider,
										assetAddress,
										accountAddress,
									)
										.then((value) => ({ value, failed: false }))
										.catch(() => ({ value: 0n, failed: true }));
									if (balance.failed) {
										errors.push({
											code: "SOURCE_UNAVAILABLE",
											severity: "warning",
											message:
												"Failed to fetch asset balance; defaulted to 0.",
											locations: [
												dataIssueLocation(
													walletAssetDiagnosticOwner(
														chainId,
														accountAddress,
														assetAddress,
													),
													"$.balance",
												),
											],
											source: "erc20.balanceOf",
											originalValue: assetAddress,
											normalizedValue: "0",
										});
									}
									balanceResults.set(assetAddress, balance);
								}),
							);
							return;
						}

						chunk.forEach((assetAddress, index) => {
							balanceResults.set(assetAddress, {
								value: tokenBalances.values[index] ?? 0n,
								failed: false,
							});
						});
					}),
				);
			}

			for (const assetAddress of erc20Assets) {
				if (!balanceResults.has(assetAddress)) {
					const balance = await this.queryBalanceOf(
						provider,
						assetAddress,
						accountAddress,
					)
						.then((value) => ({ value, failed: false }))
						.catch(() => ({ value: 0n, failed: true }));
					if (balance.failed) {
						errors.push({
							code: "SOURCE_UNAVAILABLE",
							severity: "warning",
							message:
								"Failed to fetch asset balance; defaulted to 0.",
							locations: [
								dataIssueLocation(
									walletAssetDiagnosticOwner(
										chainId,
										accountAddress,
										assetAddress,
									),
									"$.balance",
								),
							],
							source: "erc20.balanceOf",
							originalValue: assetAddress,
							normalizedValue: "0",
						});
					}
					balanceResults.set(assetAddress, balance);
				}
			}

			// Fetch all data in parallel
			const assetResults = await Promise.all(
				requestedAssets.map(async ({ assetAddress, spenders }) => {
					const balanceResult = balanceResults.get(assetAddress) ?? {
						value: 0n,
						failed: true,
					};

					const readSpender = async (spender: Address) => {
						const spenderAddress = getAddress(spender);
						const assetForVault = await this.queryAllowance(
							provider,
							assetAddress,
							accountAddress,
							spenderAddress,
						)
							.then((value) => ({ value, failed: false as const }))
							.catch(() => ({ value: 0n, failed: true as const }));

						const assetForPermit2 = await this.queryAllowance(
							provider,
							assetAddress,
							accountAddress,
							permit2Address,
						)
							.then((value) => ({ value, failed: false as const }))
							.catch(() => ({ value: 0n, failed: true as const }));

						const permit2Allowance = await this.queryPermit2Allowance(
							provider,
							permit2Address,
							accountAddress,
							assetAddress,
							spenderAddress,
						)
							.then((value) => ({ value, failed: false as const }))
							.catch(() => ({
								value: [0n, 0, 0] as unknown as readonly [
									bigint,
									number,
									number,
								],
								failed: true as const,
							}));

						if (assetForVault.failed) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message:
									"Failed to fetch asset allowance for spender; defaulted to 0.",
								locations: [
									dataIssueLocation(
										walletAssetDiagnosticOwner(
											chainId,
											accountAddress,
											assetAddress,
										),
										`$.allowances['${spenderAddress}'].assetForVault`,
									),
								],
								source: "erc20.allowance",
								normalizedValue: "0",
							});
						}
						if (assetForPermit2.failed) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message:
									"Failed to fetch Permit2 allowance approval; defaulted to 0.",
								locations: [
									dataIssueLocation(
										walletAssetDiagnosticOwner(
											chainId,
											accountAddress,
											assetAddress,
										),
										`$.allowances['${spenderAddress}'].assetForPermit2`,
									),
								],
								source: "erc20.allowance",
								normalizedValue: "0",
							});
						}
						if (permit2Allowance.failed) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message:
									"Failed to fetch Permit2 spender allowance; defaulted to 0.",
								locations: [
									dataIssueLocation(
										walletAssetDiagnosticOwner(
											chainId,
											accountAddress,
											assetAddress,
										),
										`$.allowances['${spenderAddress}'].assetForVaultInPermit2`,
									),
								],
								source: "permit2.allowance",
								normalizedValue: "0",
							});
						}

						return {
							spender,
							spenderAddress,
							assetForVault,
							assetForPermit2,
							permit2Allowance,
						};
					};

					const spenderResults =
						assetAddress === zeroAddress
							? []
							: await Promise.all(spenders.map(readSpender));

					return {
						assetAddress,
						balanceResult,
						spenders,
						spenderResults,
					};
				}),
			);

			for (const {
				assetAddress,
				balanceResult,
				spenders,
				spenderResults,
			} of assetResults) {
				const balance = balanceResult.value;

				const allowances: Record<Address, AssetAllowances> = {};
				for (let i = 0; i < spenders.length; i++) {
					const spender = spenders[i];
					if (!spender) continue;

					const result = spenderResults[i];
					if (!result) continue;
					const spenderAddress = result.spenderAddress;
					const assetForVault = result.assetForVault.value;
					const assetForPermit2 = result.assetForPermit2.value;
					const permit2Result = result.permit2Allowance.value;

					const assetForVaultInPermit2 = permit2Result?.[0] ?? 0n;
					const permit2ExpirationTime = numberLikeToSafeFiniteNumber(
						(permit2Result?.[1] ?? 0) as bigint | number,
						{
							path: `$.allowances['${spenderAddress}'].permit2ExpirationTime`,
							errors,
							source: "permit2.allowance",
							owner: walletAssetDiagnosticOwner(chainId, accountAddress, assetAddress),
							fallback: 0,
						},
					);
					const permit2Nonce = numberLikeToSafeFiniteNumber(
						(permit2Result?.[2] ?? 0) as bigint | number,
						{
							path: `$.allowances['${spenderAddress}'].permit2Nonce`,
							errors,
							source: "permit2.allowance",
							owner: walletAssetDiagnosticOwner(chainId, accountAddress, assetAddress),
							fallback: 0,
						},
					);

					allowances[getAddress(spender)] = {
						assetForVault,
						assetForPermit2,
						assetForVaultInPermit2,
						permit2ExpirationTime,
						permit2Nonce,
					};
				}

				walletAssets.push({
					account: accountAddress,
					asset: assetAddress,
					balance,
					allowances,
				});
			}

			return {
				result: {
					chainId,
					account: accountAddress,
					assets: walletAssets,
				},
				errors,
			};
		} catch (error) {
			console.error(`Failed to fetch wallet info for ${account}:`, error);
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "warning",
				message: "Failed to fetch wallet info.",
				locations: [
					dataIssueLocation(walletDiagnosticOwner(chainId, getAddress(account))),
				],
				source: "walletOnchainAdapter",
				originalValue: error instanceof Error ? error.message : String(error),
			});
			return { result: undefined, errors };
		}
	}
}
