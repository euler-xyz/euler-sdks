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
import { prefixDataIssues } from "../../../../utils/entityDiagnostics.js";

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
const TARGET_TIME_AGO_SECONDS = 60 * 60;
const SAMPLE_DISTANCE_BLOCKS = 100;
const APY_SHARE_PROBE = 10n ** 18n;

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
		currentBlockNumber: bigint;
		oneHourAgoBlockNumber: bigint;
		elapsedSeconds: number;
	}> {
		const currentBlockNumber = await this.queryBlockNumber(provider);
		const sampleBlockNumber =
			currentBlockNumber > BigInt(SAMPLE_DISTANCE_BLOCKS)
				? currentBlockNumber - BigInt(SAMPLE_DISTANCE_BLOCKS)
				: 0n;

		const [currentBlockData, sampleBlockData] = await Promise.all([
			this.queryBlock(provider, currentBlockNumber),
			this.queryBlock(provider, sampleBlockNumber),
		]);

		const elapsedForSample =
			Number(currentBlockData.timestamp) - Number(sampleBlockData.timestamp);
		if (elapsedForSample <= 0) {
			throw new Error("Failed to estimate 1h EulerEarn APY block window.");
		}

		const averageBlockTimeSeconds = elapsedForSample / SAMPLE_DISTANCE_BLOCKS;
		const oneHourAgoBlockOffset = Math.floor(
			TARGET_TIME_AGO_SECONDS / averageBlockTimeSeconds,
		);
		const oneHourAgoBlockNumber =
			currentBlockNumber > BigInt(oneHourAgoBlockOffset)
				? currentBlockNumber - BigInt(oneHourAgoBlockOffset)
				: 0n;
		const oneHourAgoBlockData = await this.queryBlock(
			provider,
			oneHourAgoBlockNumber,
		);
		const elapsedSeconds =
			Number(currentBlockData.timestamp) - Number(oneHourAgoBlockData.timestamp);
		if (elapsedSeconds <= 0) {
			throw new Error("Failed to determine 1h EulerEarn APY time delta.");
		}

		return { currentBlockNumber, oneHourAgoBlockNumber, elapsedSeconds };
	}

	private computeSupplyApy1h(
		currentRate: bigint,
		oldRate: bigint,
		elapsedSeconds: number,
	): number | undefined {
		if (oldRate <= 0n) return undefined;

		const rateChange = Number(currentRate - oldRate) / Number(oldRate);
		const apy = (rateChange * SECONDS_IN_YEAR) / elapsedSeconds;
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
		const parsedVaults = await Promise.all(
			vaults.map(async (vault, idx) => {
				try {
					const vaultInfoPromise = this.queryEulerEarnVaultInfoFull(
						provider,
						lensAddress,
						vault,
					);
					const supplyApyWindow = await supplyApyWindowPromise;
					const supplyApyRatesPromise: Promise<
						[PromiseSettledResult<bigint>, PromiseSettledResult<bigint>] | undefined
					> =
						supplyApyWindow instanceof Error
							? Promise.resolve(undefined)
							: Promise.allSettled([
									this.queryEulerEarnConvertToAssets(
										provider,
										vault,
										APY_SHARE_PROBE,
									),
									this.queryEulerEarnConvertToAssets(
										provider,
										vault,
										APY_SHARE_PROBE,
										supplyApyWindow.oneHourAgoBlockNumber,
									),
								]);
					const result = await vaultInfoPromise;
					const vaultInfo = result as unknown as EulerEarnVaultInfoFull;
					const conversionErrors: DataIssue[] = [];
					const parsed = convertEulerEarnVaultInfoFullToIEulerEarn(
						vaultInfo,
						chainId,
						conversionErrors,
					);
					errors.push(
						...prefixDataIssues(conversionErrors, `$.vaults[${idx}]`).map(
							(issue) => ({
								...issue,
								entityId: issue.entityId ?? getAddress(vault),
							}),
						),
					);
					if (supplyApyWindow instanceof Error) {
						errors.push({
							code: "SOURCE_UNAVAILABLE",
							severity: "warning",
							message: "Failed to populate 1h EulerEarn APY from onchain exchange rates.",
							paths: [`$.vaults[${idx}].supplyApy1h`],
							entityId: getAddress(vault),
							source: "eulerEarnOnchainAdapter",
							originalValue: supplyApyWindow.message,
						});
					} else {
						const [currentRateResult, oldRateResult] =
							(await supplyApyRatesPromise)!;

						if (
							currentRateResult.status === "fulfilled" &&
							oldRateResult.status === "fulfilled"
						) {
							parsed.supplyApy1h = this.computeSupplyApy1h(
								currentRateResult.value,
								oldRateResult.value,
								supplyApyWindow.elapsedSeconds,
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
								paths: [`$.vaults[${idx}].supplyApy1h`],
								entityId: getAddress(vault),
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
						paths: [`$.vaults[${idx}]`],
						entityId: getAddress(vault),
						source: "eulerEarnLens",
						originalValue:
							error instanceof Error ? error.message : String(error),
					});
					return undefined;
				}
			}),
		);

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
