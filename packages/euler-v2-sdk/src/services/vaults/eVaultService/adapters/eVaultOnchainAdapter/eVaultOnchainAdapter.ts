import type { IEVaultAdapter } from "../../eVaultService.js";
import type { ProviderService } from "../../../../providerService/index.js";
import type { DeploymentService } from "../../../../deploymentService/index.js";
import { getAddress, type Address, type Abi, encodeFunctionData } from "viem";
import { EVault, type IEVault } from "../../../../../entities/EVault.js";
import type { VaultInfoFull } from "./eVaultLensTypes.js";
import { convertVaultInfoFullToIEVault } from "./vaultInfoConverter.js";
import { vaultLensAbi } from "./abis/vaultLensAbi.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../../utils/buildQuery.js";
import type {
	EulerPlugin,
	PluginBatchItems,
} from "../../../../../plugins/types.js";
import {
	executeBatchSimulation,
	type BatchSimulationAdapter,
} from "../../../../../plugins/batchSimulation.js";
import type { EVCBatchItem } from "../../../../executionService/executionServiceTypes.js";
import {
	dataIssueLocation,
	type DataIssue,
	type ServiceResult,
	vaultDiagnosticOwner,
} from "../../../../../utils/entityDiagnostics.js";

const verifiedArrayAbi = [
	{
		type: "function",
		name: "verifiedArray",
		inputs: [],
		outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
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
	) => {
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

	/**
	 * The escrow perspective's verified set, or `undefined` when the chain has
	 * no perspective deployed or the read failed. Membership is the same answer
	 * `fetchVerifiedVaultAddresses(chainId, [ESCROW])` returns, so a vault's
	 * `isEscrow` never disagrees with the SDK's own escrow list. The SDK asks the
	 * registry rather than deriving a verdict of its own, so it cannot contradict
	 * another system reading the same registry.
	 */
	private async fetchEscrowVerifiedSet(
		chainId: number,
		vaults: Address[],
		errors: DataIssue[],
	): Promise<Set<string> | undefined> {
		const deployment = this.deploymentService.getDeployment(chainId);
		const perspective =
			deployment.addresses.peripheryAddrs?.escrowedCollateralPerspective;
		const unanswered = (reason: unknown): undefined => {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "warning",
				message:
					"Escrowed collateral perspective unavailable; escrow status left unanswered.",
				locations: vaults.map((vault) =>
					dataIssueLocation(
						vaultDiagnosticOwner(chainId, getAddress(vault)),
						"$.isEscrow",
					),
				),
				source: "escrowedCollateralPerspective",
				originalValue:
					reason instanceof Error ? reason.message : String(reason),
				normalizedValue: null,
			});
			return undefined;
		};

		if (!perspective) return unanswered("perspective address not configured");

		try {
			const verified = await this.queryEVaultVerifiedArray(
				this.providerService.getProvider(chainId),
				perspective,
			);
			return new Set(
				(verified as Address[]).map((address) => address.toLowerCase()),
			);
		} catch (error) {
			return unanswered(error);
		}
	}

	async fetchVaults(
		chainId: number,
		vaults: Address[],
	): Promise<ServiceResult<(IEVault | undefined)[]>> {
		const provider = this.providerService.getProvider(chainId);
		const deployment = this.deploymentService.getDeployment(chainId);
		const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
		const firstPassErrorsByIndex = new Map<number, DataIssue[]>();
		const finalPassErrorsByIndex = new Map<number, DataIssue[]>();
		const secondPassIndices = new Set<number>();
		const escrowErrors: DataIssue[] = [];
		const escrowVerified =
			vaults.length > 0
				? await this.fetchEscrowVerifiedSet(chainId, vaults, escrowErrors)
				: undefined;
		const isEscrow = (vault: Address): boolean | null =>
			escrowVerified ? escrowVerified.has(vault.toLowerCase()) : null;

		const eVaults = await Promise.all(
			vaults.map(async (vault, index) => {
				try {
					const result = await this.queryEVaultInfoFull(
						provider,
						vaultLensAddress,
						vault,
					);
					const vaultInfo = result as unknown as VaultInfoFull;
					const conversionErrors: DataIssue[] = [];
					const parsed = convertVaultInfoFullToIEVault(
						vaultInfo,
						chainId,
						conversionErrors,
					);
					firstPassErrorsByIndex.set(index, conversionErrors);
					return new EVault({ ...parsed, isEscrow: isEscrow(parsed.address) });
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

		// Plugin enrichment: re-fetch vaults via batchSimulation when plugins provide prepend items
		if (this.plugins.length === 0) {
			return {
				result: eVaults,
				errors: [
					...escrowErrors,
					...vaults.flatMap(
						(_, index) => firstPassErrorsByIndex.get(index) ?? [],
					),
				],
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
					return new EVault({
						...parsed,
						isEscrow: isEscrow(parsed.address),
					});
				} catch {
					return eVault;
				}
			}),
		);

		const errors = [
			...escrowErrors,
			...vaults.flatMap((_, index) =>
				secondPassIndices.has(index)
					? (finalPassErrorsByIndex.get(index) ?? [])
					: (firstPassErrorsByIndex.get(index) ?? []),
			),
		];

		return { result: enriched, errors };
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
	): Promise<ServiceResult<(IEVault | undefined)[]>> {
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
