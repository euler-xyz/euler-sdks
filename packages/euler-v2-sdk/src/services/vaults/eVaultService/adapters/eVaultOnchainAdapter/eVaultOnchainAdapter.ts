import { type Abi, type Address, encodeFunctionData, getAddress } from "viem";
import { EVault, type IEVault } from "../../../../../entities/EVault.js";
import {
	type BatchSimulationAdapter,
	executeBatchSimulation,
} from "../../../../../plugins/batchSimulation.js";
import type {
	EulerPlugin,
	PluginBatchItems,
} from "../../../../../plugins/types.js";
import {
	applyBuildQuery,
	type BuildQueryFn,
	serializeQueryArgs,
} from "../../../../../utils/buildQuery.js";
import {
	type DataIssue,
	dataIssueLocation,
	vaultDiagnosticOwner,
} from "../../../../../utils/entityDiagnostics.js";
import type { DeploymentService } from "../../../../deploymentService/index.js";
import type { EVCBatchItem } from "../../../../executionService/executionServiceTypes.js";
import type { ProviderService } from "../../../../providerService/index.js";
import {
	assertEVaultCanonicalBlock,
	assertEVaultExactReadContext,
	currentEVaultReadProvenance,
	type EVaultExactReadContext,
	type EVaultReadContext,
	exactEVaultReadProvenance,
	readEVaultContractAtExactBlock,
	waitForEVaultRead,
} from "../../eVaultReadContext.js";
import type {
	EVaultServiceResult,
	IEVaultAdapter,
} from "../../eVaultService.js";
import { vaultLensAbi } from "./abis/vaultLensAbi.js";
import type { VaultInfoFull } from "./eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "./vaultInfoConverter.js";

const verifiedArrayAbi = [
	{
		type: "function",
		name: "verifiedArray",
		inputs: [],
		outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
		stateMutability: "view",
	},
] as const;

const exactVaultConfigAbi = [
	{
		type: "function",
		name: "caps",
		inputs: [],
		outputs: [
			{ name: "supplyCap", type: "uint16", internalType: "uint16" },
			{ name: "borrowCap", type: "uint16", internalType: "uint16" },
		],
		stateMutability: "view",
	},
] as const;

export const getVaultInfoFullLensBatchItem = (
	vaultLensAddress: Address,
	vault: Address,
	onBehalfOfAccount: Address,
): EVCBatchItem => ({
	targetContract: vaultLensAddress,
	onBehalfOfAccount,
	value: 0n,
	data: encodeFunctionData({
		abi: vaultLensAbi,
		functionName: "getVaultInfoFull",
		args: [vault],
	}),
});

export class EVaultOnchainAdapter implements IEVaultAdapter {
	private plugins: EulerPlugin[] = [];
	private batchSimulationAdapter?: BatchSimulationAdapter;

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

	setPlugins(plugins: EulerPlugin[]): void {
		this.plugins = plugins;
	}

	setBatchSimulationAdapter(adapter: BatchSimulationAdapter): void {
		this.batchSimulationAdapter = adapter;
	}

	queryEVaultInfoFull = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		vaultLensAddress: Address,
		vault: Address,
		readContext?: EVaultExactReadContext,
		_chainId?: number,
	) => {
		if (readContext) {
			return readEVaultContractAtExactBlock<VaultInfoFull>(
				provider,
				readContext,
				{
					address: vaultLensAddress,
					abi: vaultLensAbi,
					functionName: "getVaultInfoFull",
					args: [vault],
				},
			);
		}
		return provider.readContract({
			address: vaultLensAddress,
			abi: vaultLensAbi,
			functionName: "getVaultInfoFull",
			args: [vault],
		});
	};

	setQueryEVaultInfoFull(fn: typeof this.queryEVaultInfoFull): void {
		this.queryEVaultInfoFull = fn;
	}

	queryEVaultCaps = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		vault: Address,
		readContext: EVaultExactReadContext,
		_chainId?: number,
	): Promise<readonly [number | bigint, number | bigint]> =>
		readEVaultContractAtExactBlock<readonly [number | bigint, number | bigint]>(
			provider,
			readContext,
			{
				address: vault,
				abi: exactVaultConfigAbi,
				functionName: "caps",
			},
		);

	setQueryEVaultCaps(fn: typeof this.queryEVaultCaps): void {
		this.queryEVaultCaps = fn;
	}

	getQueryKeyEVaultInfoFull(
		provider: ReturnType<ProviderService["getProvider"]>,
		vaultLensAddress: Address,
		vault: Address,
		readContext?: EVaultExactReadContext,
		chainId?: number,
	): string | null {
		if (readContext?.signal) return null;
		return serializeQueryArgs([
			{ chainId: chainId ?? provider.chain?.id ?? "unknown" },
			getAddress(vaultLensAddress),
			getAddress(vault),
			readContext
				? {
						blockHash: readContext.blockHash.toLowerCase(),
						blockNumber: readContext.blockNumber,
						mode: readContext.mode,
						requireCanonical: readContext.requireCanonical,
					}
				: { mode: "current" },
		]);
	}

	getQueryKeyEVaultCaps(
		provider: ReturnType<ProviderService["getProvider"]>,
		vault: Address,
		readContext: EVaultExactReadContext,
		chainId?: number,
	): string | null {
		if (readContext.signal) return null;
		return serializeQueryArgs([
			{ chainId: chainId ?? provider.chain?.id ?? "unknown" },
			getAddress(vault),
			{
				blockHash: readContext.blockHash.toLowerCase(),
				blockNumber: readContext.blockNumber,
				mode: readContext.mode,
				requireCanonical: readContext.requireCanonical,
			},
		]);
	}

	queryEVaultVerifiedArray = async (
		provider: ReturnType<ProviderService["getProvider"]>,
		perspective: Address,
	) => {
		return provider.readContract({
			address: perspective,
			abi: verifiedArrayAbi,
			functionName: "verifiedArray",
		});
	};

	setQueryEVaultVerifiedArray(fn: typeof this.queryEVaultVerifiedArray): void {
		this.queryEVaultVerifiedArray = fn;
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
		readContext?: EVaultReadContext,
	): Promise<EVaultServiceResult<(IEVault | undefined)[]>> {
		if (readContext) assertEVaultExactReadContext(readContext);
		const provider =
			readContext?.provider ?? this.providerService.getProvider(chainId);
		const queryContext = readContext
			? {
					blockHash: readContext.blockHash,
					blockNumber: readContext.blockNumber,
					mode: "exact" as const,
					requireCanonical: true as const,
					signal: readContext.signal,
				}
			: undefined;
		if (queryContext) {
			const actualChainId = await waitForEVaultRead(
				provider.getChainId(),
				queryContext.signal,
			);
			if (actualChainId !== chainId) {
				throw new Error(
					`Exact EVault provider chain mismatch: requested ${chainId}, received ${actualChainId}.`,
				);
			}
			await assertEVaultCanonicalBlock(provider, queryContext);
		}
		const deployment = this.deploymentService.getDeployment(chainId);
		const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
		const firstPassErrorsByIndex = new Map<number, DataIssue[]>();
		const finalPassErrorsByIndex = new Map<number, DataIssue[]>();
		const secondPassIndices = new Set<number>();

		const eVaults = await Promise.all(
			vaults.map(async (vault, index) => {
				try {
					const [result, encodedCaps] = await Promise.all([
						this.queryEVaultInfoFull(
							provider,
							vaultLensAddress,
							vault,
							queryContext,
							chainId,
						),
						queryContext
							? this.queryEVaultCaps(provider, vault, queryContext, chainId)
							: undefined,
					]);
					const vaultInfo = result as unknown as VaultInfoFull;
					const conversionErrors: DataIssue[] = [];
					const parsed = convertVaultInfoFullToIEVault(
						vaultInfo,
						chainId,
						conversionErrors,
						encodedCaps
							? {
									borrowCap: BigInt(encodedCaps[1]),
									supplyCap: BigInt(encodedCaps[0]),
								}
							: undefined,
					);
					firstPassErrorsByIndex.set(index, conversionErrors);
					return new EVault(parsed);
				} catch (error) {
					firstPassErrorsByIndex.set(index, [
						{
							code: "SOURCE_UNAVAILABLE",
							severity: "error",
							message: `Failed to fetch eVault ${getAddress(vault)}.`,
							locations: [
								dataIssueLocation(
									vaultDiagnosticOwner(chainId, getAddress(vault)),
								),
							],
							source: "vaultLens",
							originalValue:
								error instanceof Error ? error.message : String(error),
						},
					]);
					return undefined;
				}
			}),
		);

		if (queryContext) {
			await assertEVaultCanonicalBlock(provider, queryContext);
			return {
				result: eVaults,
				errors: vaults.flatMap(
					(_, index) => firstPassErrorsByIndex.get(index) ?? [],
				),
				read: exactEVaultReadProvenance(queryContext),
			};
		}

		// Plugin enrichment: re-fetch vaults via batchSimulation when plugins provide prepend items
		if (this.plugins.length === 0) {
			return {
				result: eVaults,
				errors: vaults.flatMap(
					(_, index) => firstPassErrorsByIndex.get(index) ?? [],
				),
				read: currentEVaultReadProvenance("onchain"),
			};
		}

		const enriched = await Promise.all(
			eVaults.map(async (eVault, vaultIndex) => {
				if (!eVault) return undefined;
				try {
					const prepend = await this.collectReadPrepend(chainId, [eVault]);
					if (!prepend || prepend.items.length === 0) return eVault;
					secondPassIndices.add(vaultIndex);

					const result = await executeBatchSimulation<VaultInfoFull>(
						{
							provider,
							evcAddress: deployment.addresses.coreAddrs.evc,
							prependItems: prepend.items,
							totalValue: prepend.totalValue,
							lensAddress: vaultLensAddress,
							lensAbi: vaultLensAbi as unknown as Abi,
							lensFunctionName: "getVaultInfoFull",
							lensArgs: [eVault.address],
						},
						this.batchSimulationAdapter,
					);

					if (!result) return eVault;
					const conversionErrors: DataIssue[] = [];
					const parsed = convertVaultInfoFullToIEVault(
						result,
						chainId,
						conversionErrors,
					);
					finalPassErrorsByIndex.set(vaultIndex, conversionErrors);
					return new EVault(parsed);
				} catch {
					return eVault;
				}
			}),
		);

		const errors = vaults.flatMap((_, index) =>
			secondPassIndices.has(index)
				? (finalPassErrorsByIndex.get(index) ?? [])
				: (firstPassErrorsByIndex.get(index) ?? []),
		);

		return {
			result: enriched,
			errors,
			read: currentEVaultReadProvenance("onchain"),
		};
	}

	private async collectReadPrepend(
		chainId: number,
		vaults: EVault[],
	): Promise<PluginBatchItems | null> {
		const provider = this.providerService.getProvider(chainId);
		const allItems: PluginBatchItems = { items: [], totalValue: 0n };

		for (const plugin of this.plugins) {
			if (!plugin.getReadPrepend) continue;
			try {
				const result = await plugin.getReadPrepend({
					chainId,
					vaults,
					provider,
				});
				if (result) {
					allItems.items.push(...result.items);
					allItems.totalValue += result.totalValue;
				}
			} catch {
				// Plugin failed — skip it gracefully
			}
		}

		return allItems.items.length > 0 ? allItems : null;
	}

	async fetchVerifiedVaultsAddresses(
		chainId: number,
		perspectives: Address[],
	): Promise<Address[]> {
		const provider = this.providerService.getProvider(chainId);

		const results = await Promise.all(
			perspectives.map((perspective) =>
				this.queryEVaultVerifiedArray(provider, perspective),
			),
		);

		const addresses: Address[] = results.flatMap(
			(result) => result as Address[],
		);

		return [...new Set(addresses)];
	}

	async fetchAllVaults(
		chainId: number,
	): Promise<EVaultServiceResult<(IEVault | undefined)[]>> {
		const deployment = this.deploymentService.getDeployment(chainId);
		const perspective =
			deployment.addresses.peripheryAddrs?.evkFactoryPerspective;
		if (!perspective) {
			throw new Error(
				"Perspective address not found for evkFactoryPerspective",
			);
		}

		const addresses = await this.fetchVerifiedVaultsAddresses(chainId, [
			perspective,
		]);
		return this.fetchVaults(chainId, addresses);
	}
}
