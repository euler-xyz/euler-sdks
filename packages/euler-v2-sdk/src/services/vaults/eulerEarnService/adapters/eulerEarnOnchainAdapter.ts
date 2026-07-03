import type { IEulerEarnAdapter } from "../eulerEarnService.js";
import type { ProviderService } from "../../../providerService/index.js";
import type { DeploymentService } from "../../../deploymentService/index.js";
import { type Address, encodeFunctionData, getAddress } from "viem";
import { EulerEarn, type IEulerEarn } from "../../../../entities/EulerEarn.js";
import type { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import { convertEulerEarnVaultInfoFullToIEulerEarn } from "./eulerEarnInfoConverter.js";
import { eulerEarnVaultLensAbi } from "./abis/eulerEarnVaultLensAbi.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import type { EVCBatchItem } from "../../../executionService/executionServiceTypes.js";
import type {
	DataIssue,
	ServiceResult,
} from "../../../../utils/entityDiagnostics.js";
import {
	dataIssueLocation,
	vaultDiagnosticOwner,
} from "../../../../utils/entityDiagnostics.js";

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
const DEFAULT_SUPPLY_APY_WINDOW_SECONDS = 60;
const EULER_EARN_FETCH_BATCH_SIZE = 4;

// Blocks to step back from the latest head when picking the "current" sample
// point. Load-balanced JSON-RPC fleets can serve subsequent eth_calls from
// nodes whose heads lag the node that answered `getBlockNumber()` by 1–2
// blocks; pinning convertToAssets to `latest.number` would then fail on lagging
// nodes. Backing off by a few blocks puts the measurement at a height that
// every plausibly-synced backend has seen, while the resulting staleness
// (~60s on Ethereum, sub-second on most L2s) is acceptable for this
// short-window APY sample.
const MEASUREMENT_BLOCK_BACKOFF = 5n;

// Extra digits of precision added on top of share decimals when probing the
// vault exchange rate. The probe is linear in `convertToAssets`, so scaling it
// up costs nothing other than headroom against uint256 overflow. With 1e12 on
// top of asset decimals, even low-decimal assets (USDC/cbBTC) keep tens of
// significant digits of resolution in the short-window rate change.
const PROBE_PRECISION_BOOST = 12n;

const verifiedArrayAbi = [
	{
		type: "function",
		name: "verifiedArray",
		inputs: [],
		outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
		stateMutability: "view",
	},
] as const;

const vaultConvertToAssetsAbi = [
	{
		type: "function",
		name: "convertToAssets",
		inputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
		outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
		stateMutability: "view",
	},
] as const;

export const getEulerEarnVaultInfoFullLensBatchItem = (
	lensAddress: Address,
	vault: Address,
	onBehalfOfAccount: Address,
): EVCBatchItem => ({
	targetContract: lensAddress,
	onBehalfOfAccount,
	value: 0n,
	data: encodeFunctionData({
		abi: eulerEarnVaultLensAbi,
		functionName: "getVaultInfoFull",
		args: [vault],
	}),
});

export class EulerEarnOnchainAdapter implements IEulerEarnAdapter {
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

	queryBlockNumber = async (
		provider: ReturnType<ProviderService["getProvider"]>,
	) => {
		return provider.getBlockNumber();
	};

	setQueryBlockNumber(fn: typeof this.queryBlockNumber): void {
		this.queryBlockNumber = fn;
	}

	queryBlock = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		blockNumber: bigint,
	) => {
		return provider.getBlock({ blockNumber });
	};

	setQueryBlock(fn: typeof this.queryBlock): void {
		this.queryBlock = fn;
	}

	queryEulerEarnVaultInfoFull = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		lensAddress: Address,
		vault: Address,
	) => {
		return provider.readContract({
			address: lensAddress,
			abi: eulerEarnVaultLensAbi,
			functionName: "getVaultInfoFull",
			args: [vault],
		});
	};

	setQueryEulerEarnVaultInfoFull(
		fn: typeof this.queryEulerEarnVaultInfoFull,
	): void {
		this.queryEulerEarnVaultInfoFull = fn;
	}

	queryEulerEarnConvertToAssets = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		vault: Address,
		shares: bigint,
		blockNumber?: bigint,
	) => {
		return provider.readContract({
			address: vault,
			abi: vaultConvertToAssetsAbi,
			functionName: "convertToAssets",
			args: [shares],
			...(blockNumber !== undefined ? { blockNumber } : {}),
		});
	};

	setQueryEulerEarnConvertToAssets(
		fn: typeof this.queryEulerEarnConvertToAssets,
	): void {
		this.queryEulerEarnConvertToAssets = fn;
	}

	queryEulerEarnVerifiedArray = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		perspective: Address,
	) => {
		return provider.readContract({
			address: perspective,
			abi: verifiedArrayAbi,
			functionName: "verifiedArray",
		});
	};

	setQueryEulerEarnVerifiedArray(
		fn: typeof this.queryEulerEarnVerifiedArray,
	): void {
		this.queryEulerEarnVerifiedArray = fn;
	}

	private async getSupplyApyWindow(
		provider: ReturnType<ProviderService["getProvider"]>,
	): Promise<{
		measurementBlockNumber: bigint;
		referenceBlockNumber: bigint;
		elapsedSeconds: number;
	}> {
		const latestBlockNumber = await this.queryBlockNumber(provider);
		if (latestBlockNumber <= MEASUREMENT_BLOCK_BACKOFF) {
			throw new Error("Failed to estimate EulerEarn APY block window.");
		}
		const measurementBlockNumber = latestBlockNumber - MEASUREMENT_BLOCK_BACKOFF;
		const measurementBlockData = await this.queryBlock(
			provider,
			measurementBlockNumber,
		);
		const measurementTimestamp = Number(measurementBlockData.timestamp);
		const targetTimestamp =
			measurementTimestamp - DEFAULT_SUPPLY_APY_WINDOW_SECONDS;
		const referenceBlock = await this.findBlockAtOrBeforeTimestamp(
			provider,
			measurementBlockNumber - 1n,
			targetTimestamp,
		);
		if (!referenceBlock) {
			throw new Error("Failed to determine EulerEarn APY time delta.");
		}

		const elapsedSeconds = measurementTimestamp - referenceBlock.timestamp;
		if (elapsedSeconds <= 0) {
			throw new Error("Failed to determine EulerEarn APY time delta.");
		}

		return {
			measurementBlockNumber,
			referenceBlockNumber: referenceBlock.blockNumber,
			elapsedSeconds,
		};
	}

	private async findBlockAtOrBeforeTimestamp(
		provider: ReturnType<ProviderService["getProvider"]>,
		highestBlockNumber: bigint,
		targetTimestamp: number,
	): Promise<{ blockNumber: bigint; timestamp: number } | undefined> {
		let low = 0n;
		let high = highestBlockNumber;
		let candidate: { blockNumber: bigint; timestamp: number } | undefined;

		while (low <= high) {
			const mid = (low + high) / 2n;
			const block = await this.queryBlock(provider, mid);
			const timestamp = Number(block.timestamp);

			if (timestamp <= targetTimestamp) {
				candidate = { blockNumber: mid, timestamp };
				low = mid + 1n;
			} else {
				if (mid === 0n) break;
				high = mid - 1n;
			}
		}

		return candidate;
	}

	// Compound a measured rate change observed over `elapsedSeconds` into an APY,
	// using continuous-per-second compounding to match the EVK/Lens convention.
	// Equivalent to `(1 + spy) ** SECONDS_IN_YEAR - 1` where
	// `spy = rateChange / elapsedSeconds`.
	private computeSupplyApy(
		currentRate: bigint,
		oldRate: bigint,
		elapsedSeconds: number,
	): number | undefined {
		if (oldRate <= 0n || elapsedSeconds <= 0) return undefined;

		const rateChange = Number(currentRate - oldRate) / Number(oldRate);
		const spy = rateChange / elapsedSeconds;
		const apy = ((1 + spy) ** SECONDS_IN_YEAR - 1) * 100;
		return Number.isFinite(apy) ? apy : undefined;
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
	): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
		const provider = this.providerService.getProvider(chainId);
		const deployment = this.deploymentService.getDeployment(chainId);
		const lensAddress = deployment.addresses.lensAddrs.eulerEarnVaultLens;
		const errors: DataIssue[] = [];
		const supplyApyWindowPromise = this.getSupplyApyWindow(provider).catch(
			(error) => error,
		);
		const parsedVaults: (IEulerEarn | undefined)[] = [];
		for (
			let batchStart = 0;
			batchStart < vaults.length;
			batchStart += EULER_EARN_FETCH_BATCH_SIZE
		) {
			const batch = vaults.slice(
				batchStart,
				batchStart + EULER_EARN_FETCH_BATCH_SIZE,
			);
			const batchResults = await Promise.all(
				batch.map(async (vault) => {
					try {
						const [vaultInfoResult, supplyApyWindow] = await Promise.allSettled(
							[
								this.queryEulerEarnVaultInfoFull(provider, lensAddress, vault),
								supplyApyWindowPromise,
							],
						);
						if (vaultInfoResult.status === "rejected") {
							throw vaultInfoResult.reason;
						}
						const vaultInfo =
							vaultInfoResult.value as unknown as EulerEarnVaultInfoFull;
						const conversionErrors: DataIssue[] = [];
						const parsed = convertEulerEarnVaultInfoFullToIEulerEarn(
							vaultInfo,
							chainId,
							conversionErrors,
						);
						errors.push(...conversionErrors);
						if (
							supplyApyWindow.status === "rejected" ||
							supplyApyWindow.value instanceof Error
						) {
							errors.push({
								code: "SOURCE_UNAVAILABLE",
								severity: "warning",
								message:
									"Failed to populate EulerEarn APY from onchain exchange rates.",
								locations: [
									dataIssueLocation(
										vaultDiagnosticOwner(chainId, getAddress(vault)),
										"$.supplyApy",
									),
								],
								source: "eulerEarnOnchainAdapter",
								originalValue:
									supplyApyWindow.status === "rejected"
										? supplyApyWindow.reason instanceof Error
											? supplyApyWindow.reason.message
											: String(supplyApyWindow.reason)
										: supplyApyWindow.value.message,
							});
						} else {
							const probeShares =
								10n ** (vaultInfo.vaultDecimals + PROBE_PRECISION_BOOST);
							const [currentRateResult, oldRateResult] =
								await Promise.allSettled([
									this.queryEulerEarnConvertToAssets(
										provider,
										vault,
										probeShares,
										supplyApyWindow.value.measurementBlockNumber,
									),
									this.queryEulerEarnConvertToAssets(
										provider,
										vault,
										probeShares,
										supplyApyWindow.value.referenceBlockNumber,
									),
								]);

							if (
								currentRateResult.status === "fulfilled" &&
								oldRateResult.status === "fulfilled"
							) {
								const supplyApy = this.computeSupplyApy(
									currentRateResult.value,
									oldRateResult.value,
									supplyApyWindow.value.elapsedSeconds,
								);
								parsed.supplyApy = supplyApy;
							} else {
								const apyReadErrors = [currentRateResult, oldRateResult]
									.filter((result) => result.status === "rejected")
									.map((result) =>
										result.reason instanceof Error
											? result.reason.message
											: String(result.reason),
									);
								errors.push({
									code: "SOURCE_UNAVAILABLE",
									severity: "warning",
									message:
										"Failed to populate EulerEarn APY from onchain exchange rates.",
									locations: [
										dataIssueLocation(
											vaultDiagnosticOwner(chainId, getAddress(vault)),
											"$.supplyApy",
										),
									],
									source: "eulerEarnOnchainAdapter",
									originalValue: apyReadErrors.join(" | "),
								});
							}
						}
						return new EulerEarn(parsed);
					} catch (error) {
						errors.push({
							code: "SOURCE_UNAVAILABLE",
							severity: "warning",
							message: `Failed to fetch EulerEarn vault ${getAddress(vault)}.`,
							locations: [
								dataIssueLocation(
									vaultDiagnosticOwner(chainId, getAddress(vault)),
								),
							],
							source: "eulerEarnLens",
							originalValue:
								error instanceof Error ? error.message : String(error),
						});
						return undefined;
					}
				}),
			);
			parsedVaults.push(...batchResults);
		}

		return { result: parsedVaults, errors };
	}

	async fetchVerifiedVaultsAddresses(
		chainId: number,
		perspectives: Address[],
	): Promise<Address[]> {
		const provider = this.providerService.getProvider(chainId);

		const results = await Promise.all(
			perspectives.map((perspective) =>
				this.queryEulerEarnVerifiedArray(provider, perspective),
			),
		);

		const addresses: Address[] = results.flatMap(
			(result) => result as Address[],
		);

		return addresses;
	}

	async fetchAllVaults(
		chainId: number,
	): Promise<ServiceResult<(IEulerEarn | undefined)[]>> {
		const deployment = this.deploymentService.getDeployment(chainId);
		const perspective =
			deployment.addresses.peripheryAddrs?.eulerEarnFactoryPerspective;
		if (!perspective) {
			throw new Error(
				"Perspective address not found for eulerEarnFactoryPerspective",
			);
		}

		const addresses = await this.fetchVerifiedVaultsAddresses(chainId, [
			perspective,
		]);
		return this.fetchVaults(chainId, addresses);
	}
}
