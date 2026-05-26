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
const TARGET_TIME_AGO_SECONDS = 60 * 60;
const SAMPLE_DISTANCE_BLOCKS = 10_000;
const EULER_EARN_FETCH_BATCH_SIZE = 4;

// Blocks to step back from the latest head when picking the "current" sample
// point. Load-balanced JSON-RPC fleets can serve subsequent eth_calls from
// nodes whose heads lag the node that answered `getBlockNumber()` by 1–2
// blocks; pinning convertToAssets to `latest.number` would then fail on lagging
// nodes. Backing off by a few blocks puts the measurement at a height that
// every plausibly-synced backend has seen, while the resulting staleness
// (~60s on Ethereum, sub-second on most L2s) is negligible against the 3600s
// measurement window.
const MEASUREMENT_BLOCK_BACKOFF = 5n;

// Extra digits of precision added on top of share decimals when probing the
// vault exchange rate. The probe is linear in `convertToAssets`, so scaling it
// up costs nothing other than headroom against uint256 overflow. With 1e12 on
// top of asset decimals, even low-decimal assets (USDC/cbBTC) keep tens of
// significant digits of resolution in the 1h rate change.
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
		oneHourAgoBlockNumber: bigint;
		elapsedSeconds: number;
	}> {
		const latestBlockNumber = await this.queryBlockNumber(provider);
		if (latestBlockNumber <= MEASUREMENT_BLOCK_BACKOFF) {
			throw new Error("Failed to estimate 1h EulerEarn APY block window.");
		}
		const measurementBlockNumber = latestBlockNumber - MEASUREMENT_BLOCK_BACKOFF;
		const sampleDistanceBlocks =
			measurementBlockNumber > BigInt(SAMPLE_DISTANCE_BLOCKS)
				? BigInt(SAMPLE_DISTANCE_BLOCKS)
				: measurementBlockNumber;
		const sampleBlockNumber = measurementBlockNumber - sampleDistanceBlocks;

		const [measurementBlockData, sampleBlockData] = await Promise.all([
			this.queryBlock(provider, measurementBlockNumber),
			this.queryBlock(provider, sampleBlockNumber),
		]);

		const elapsedForSample =
			Number(measurementBlockData.timestamp) -
			Number(sampleBlockData.timestamp);
		if (elapsedForSample <= 0) {
			throw new Error("Failed to estimate 1h EulerEarn APY block window.");
		}

		const averageBlockTimeSeconds =
			elapsedForSample / Number(sampleDistanceBlocks);
		const oneHourAgoBlockOffset = Math.round(
			TARGET_TIME_AGO_SECONDS / averageBlockTimeSeconds,
		);

		// Bail if the chain has less than ~1h of history rather than silently
		// clamping to genesis — the latter would normalise the rate change against
		// a too-short window and explode the displayed APY.
		if (measurementBlockNumber <= BigInt(oneHourAgoBlockOffset)) {
			throw new Error("Failed to determine 1h EulerEarn APY time delta.");
		}
		const oneHourAgoBlockNumber =
			measurementBlockNumber - BigInt(oneHourAgoBlockOffset);

		// Read the actual timestamp at the prior block instead of trusting the
		// 10K-block average. Block-rate variance over the last hour (sequencer
		// hiccups, MEV bursts, late-block stretches) would otherwise scale the
		// displayed APY by the inverse of the rate skew.
		const priorBlockData = await this.queryBlock(
			provider,
			oneHourAgoBlockNumber,
		);
		const elapsedSeconds =
			Number(measurementBlockData.timestamp) -
			Number(priorBlockData.timestamp);
		if (elapsedSeconds <= 0) {
			throw new Error("Failed to determine 1h EulerEarn APY time delta.");
		}

		return { measurementBlockNumber, oneHourAgoBlockNumber, elapsedSeconds };
	}

	// Compound a measured rate change observed over `elapsedSeconds` into an APY,
	// using continuous-per-second compounding to match the EVK/Lens convention.
	// Equivalent to `(1 + spy) ** SECONDS_IN_YEAR - 1` where
	// `spy = rateChange / elapsedSeconds`.
	private computeSupplyApy1h(
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
									"Failed to populate 1h EulerEarn APY from onchain exchange rates.",
								locations: [
									dataIssueLocation(
										vaultDiagnosticOwner(chainId, getAddress(vault)),
										"$.supplyApy1h",
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
										supplyApyWindow.value.oneHourAgoBlockNumber,
									),
								]);

							if (
								currentRateResult.status === "fulfilled" &&
								oldRateResult.status === "fulfilled"
							) {
								parsed.supplyApy1h = this.computeSupplyApy1h(
									currentRateResult.value,
									oldRateResult.value,
									supplyApyWindow.value.elapsedSeconds,
								);
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
										"Failed to populate 1h EulerEarn APY from onchain exchange rates.",
									locations: [
										dataIssueLocation(
											vaultDiagnosticOwner(chainId, getAddress(vault)),
											"$.supplyApy1h",
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
