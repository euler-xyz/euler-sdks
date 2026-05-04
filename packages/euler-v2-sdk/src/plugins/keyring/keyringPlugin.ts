import {
	type Abi,
	type Address,
	decodeFunctionData,
	encodeFunctionData,
	getAddress,
	type Hex,
	type PublicClient,
	zeroAddress,
} from "viem";
import type {
	Account,
	AddressOrAccount,
	IHasVaultAddress,
} from "../../entities/Account.js";
import type { EVault } from "../../entities/EVault.js";
import type {
	BatchItemDescription,
	EVCBatchItem,
	TransactionPlan,
	TransactionPlanItem,
} from "../../services/executionService/executionServiceTypes.js";
import { flattenBatchEntries } from "../../services/executionService/executionServiceTypes.js";
import { applyBuildQuery, type BuildQueryFn } from "../../utils/buildQuery.js";
import type { EulerPlugin, PluginSDK } from "../types.js";

// ── Keyring ABIs (minimal: only the functions we need) ──

const KEYRING_CONTRACT_ABI = [
	{
		type: "function",
		name: "createCredential",
		inputs: [
			{ name: "tradingAddress", type: "address" },
			{ name: "policyId", type: "uint256" },
			{ name: "chainId", type: "uint256" },
			{ name: "validUntil", type: "uint256" },
			{ name: "cost", type: "uint256" },
			{ name: "key", type: "bytes" },
			{ name: "signature", type: "bytes" },
			{ name: "backdoor", type: "bytes" },
		],
		outputs: [],
		stateMutability: "payable",
	},
] as const;

const HOOK_TARGET_ABI = [
	{
		type: "function",
		name: "checkKeyringCredentialOrWildCard",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "policyId",
		inputs: [],
		outputs: [{ name: "", type: "uint32" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "keyring",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
] as const;

// ── Credential data type (matches Keyring Connect SDK output) ──

export interface KeyringCredentialData {
	trader: Address;
	policyId: number;
	chainId: number;
	validUntil: number;
	cost: number;
	key: Hex;
	signature: Hex;
	backdoor: Hex;
}

// ── Adapter (injectable query pattern) ──

export class KeyringPluginAdapter {
	constructor(buildQuery?: BuildQueryFn) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	/**
	 * Check if an account has a valid Keyring credential (or wildcard) on a hook target.
	 */
	queryKeyringCheckCredential = async (
		provider: PublicClient,
		hookTarget: Address,
		account: Address,
	): Promise<boolean> => {
		return provider.readContract({
			address: hookTarget,
			abi: HOOK_TARGET_ABI,
			functionName: "checkKeyringCredentialOrWildCard",
			args: [account],
		});
	};

	/**
	 * Read the policyId from a hook target contract.
	 */
	queryKeyringPolicyId = async (
		provider: PublicClient,
		hookTarget: Address,
	): Promise<number> => {
		return provider.readContract({
			address: hookTarget,
			abi: HOOK_TARGET_ABI,
			functionName: "policyId",
		});
	};

	/**
	 * Read the keyring credentials contract address from a hook target.
	 */
	queryKeyringAddress = async (
		provider: PublicClient,
		hookTarget: Address,
	): Promise<Address> => {
		return provider.readContract({
			address: hookTarget,
			abi: HOOK_TARGET_ABI,
			functionName: "keyring",
		});
	};
}

// ── Plugin factory ──

export interface KeyringPluginConfig {
	/** Known Keyring hook target addresses per chain. Only vaults with these hookTargets will be handled. */
	hookTargets: Record<number, Address[]>;
	/** Callback to get credential data. Called when a vault requires keyring and the account doesn't have a valid credential. */
	getCredentialData: (args: {
		chainId: number;
		account: Address;
		hookTarget: Address;
		policyId: number;
	}) => Promise<KeyringCredentialData | null>;
	buildQuery?: BuildQueryFn;
}

/**
 * Check if a vault's hook target is a known Keyring hook.
 */
function isKeyringHook(vault: EVault, hookTargets: Address[]): boolean {
	const target = vault.hooks.hookTarget;
	if (!target || target === zeroAddress) return false;
	return hookTargets.some((ht) => ht.toLowerCase() === target.toLowerCase());
}

function prependToEveryBatch(
	plan: TransactionPlan,
	items: EVCBatchItem[],
): TransactionPlan {
	if (items.length === 0) return plan;

	return plan.map((entry: TransactionPlanItem) => {
		if (entry.type === "evcBatch") {
			return { ...entry, items: [...items, ...entry.items] };
		}
		return entry;
	});
}

function collectPlanTargetAddresses(plan: TransactionPlan): Address[] {
	return [
		...new Set(
			plan.flatMap((entry) =>
				entry.type === "evcBatch"
					? flattenBatchEntries(entry.items).map((item) =>
							getAddress(item.targetContract),
						)
					: [],
			),
		),
	];
}

function collectAccountVaults(
	account: Account<IHasVaultAddress>,
	targetAddresses: Address[],
): EVault[] {
	const targets = new Set(
		targetAddresses.map((address) => getAddress(address)),
	);
	const vaults = new Map<Address, EVault>();
	const push = (vault: IHasVaultAddress | undefined) => {
		if (!vault || !targets.has(getAddress(vault.address))) return;
		if (!("hooks" in vault)) return;
		vaults.set(getAddress(vault.address), vault as EVault);
	};

	for (const subAccount of Object.values(account.subAccounts)) {
		if (!subAccount) continue;
		for (const position of subAccount.positions) {
			push(position.vault);
			if (position.liquidity) {
				push(position.liquidity.vault);
				for (const collateral of position.liquidity.collaterals) {
					push(collateral.vault);
				}
			}
		}
	}

	return [...vaults.values()];
}

async function resolveTargetVaults(
	plan: TransactionPlan,
	account: AddressOrAccount,
	chainId: number,
	sdk: PluginSDK,
): Promise<EVault[]> {
	const targetAddresses = collectPlanTargetAddresses(plan);
	if (!targetAddresses.length) return [];

	if (typeof account !== "string") {
		return collectAccountVaults(account, targetAddresses);
	}

	const fetched = await sdk.vaultMetaService.fetchVaults(
		chainId,
		targetAddresses,
	);
	return fetched.result.filter(
		(v): v is EVault =>
			!!v &&
			"hooks" in v &&
			targetAddresses.some(
				(target) => getAddress(target) === getAddress(v.address),
			),
	);
}

export function createKeyringPlugin(config: KeyringPluginConfig): EulerPlugin {
	const adapter = new KeyringPluginAdapter(config.buildQuery);

	return {
		name: "keyring",

		// Keyring does not affect reads — no getReadPrepend

		async processPlan(
			plan: TransactionPlan,
			account: AddressOrAccount,
			chainId: number,
			sdk: PluginSDK,
		): Promise<TransactionPlan> {
			const chainHookTargets = config.hookTargets[chainId];
			if (!chainHookTargets?.length) return plan;
			const sender =
				typeof account === "string"
					? getAddress(account)
					: getAddress(account.owner);
			const provider = sdk.providerService.getProvider(chainId);

			// Find vaults that have keyring hooks
			const keyringVaults = (
				await resolveTargetVaults(plan, account, chainId, sdk)
			).filter((v) => isKeyringHook(v, chainHookTargets));
			if (!keyringVaults.length) return plan;

			const items: EVCBatchItem[] = [];

			for (const vault of keyringVaults) {
				try {
					const hookTarget = vault.hooks.hookTarget;

					// Check if credential is already valid
					const hasCredential = await adapter.queryKeyringCheckCredential(
						provider,
						hookTarget,
						sender,
					);
					if (hasCredential) continue;

					// Read policyId and keyring address from hook target
					const [policyId, keyringAddress] = await Promise.all([
						adapter.queryKeyringPolicyId(provider, hookTarget),
						adapter.queryKeyringAddress(provider, hookTarget),
					]);

					// Get credential data from consumer callback
					const credentialData = await config.getCredentialData({
						chainId,
						account: sender,
						hookTarget,
						policyId,
					});
					if (!credentialData) continue;

					items.push({
						targetContract: keyringAddress,
						onBehalfOfAccount: sender,
						value: BigInt(credentialData.cost),
						data: encodeFunctionData({
							abi: KEYRING_CONTRACT_ABI,
							functionName: "createCredential",
							args: [
								credentialData.trader,
								BigInt(credentialData.policyId),
								BigInt(credentialData.chainId),
								BigInt(credentialData.validUntil),
								BigInt(credentialData.cost),
								credentialData.key,
								credentialData.signature,
								credentialData.backdoor,
							],
						}),
					});
				} catch {}
			}

			if (!items.length) return plan;
			return prependToEveryBatch(plan, items);
		},

		decodeBatchItem(item: EVCBatchItem): BatchItemDescription | null {
			try {
				const decoded = decodeFunctionData({
					abi: KEYRING_CONTRACT_ABI as unknown as Abi,
					data: item.data,
				});

				const functionAbi = KEYRING_CONTRACT_ABI.find(
					(a) => a.type === "function" && a.name === decoded.functionName,
				);
				const namedArgs: Record<string, unknown> = {};
				if (
					functionAbi &&
					"inputs" in functionAbi &&
					Array.isArray(decoded.args)
				) {
					functionAbi.inputs.forEach((input, index) => {
						namedArgs[input.name] = decoded.args?.[index];
					});
				}

				return {
					targetContract: item.targetContract,
					onBehalfOfAccount: item.onBehalfOfAccount,
					functionName: decoded.functionName,
					args: namedArgs,
				};
			} catch {
				return null;
			}
		},
	};
}
