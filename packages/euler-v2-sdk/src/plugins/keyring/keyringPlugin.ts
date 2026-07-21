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
import type {
	EulerPlugin,
	KeyringPluginPrefetch,
	PluginPrefetchData,
	PluginSDK,
} from "../types.js";

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
	// Integrator-supplied hook targets (e.g. HookTargetAccessControlKeyringUnwind)
	// expose the same values behind `get`-prefixed getters instead of the public
	// immutables above. Declared uint256 as a safe superset — the value is coerced
	// to a Number by queryKeyringPolicyId.
	{
		type: "function",
		name: "getPolicyId",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getKeyring",
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

// Euler's native HookTargetAccessControlKeyring exposes the policy id and
// keyring credentials contract as public immutables (`policyId()`, `keyring()`).
// Integrator-supplied hook targets (e.g. HookTargetAccessControlKeyringUnwind)
// expose the same values behind `get`-prefixed getters. Try each name in order
// so both conventions resolve; rethrow the last error only if none succeed.
async function readHookTargetGetter<T>(
	provider: PublicClient,
	hookTarget: Address,
	functionNames: ReadonlyArray<
		"policyId" | "getPolicyId" | "keyring" | "getKeyring"
	>,
): Promise<T> {
	let lastError: unknown;
	for (const functionName of functionNames) {
		try {
			return (await provider.readContract({
				address: hookTarget,
				abi: HOOK_TARGET_ABI,
				functionName,
			})) as T;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
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
	 * Read the policyId from a hook target contract. Falls back to `getPolicyId()`
	 * for integrator hook targets (e.g. HookTargetAccessControlKeyringUnwind) that
	 * expose `get`-prefixed getters instead of Euler's public immutables.
	 */
	queryKeyringPolicyId = async (
		provider: PublicClient,
		hookTarget: Address,
	): Promise<number> => {
		const policyId = await readHookTargetGetter<number | bigint>(
			provider,
			hookTarget,
			["policyId", "getPolicyId"],
		);
		return Number(policyId);
	};

	/**
	 * Read the keyring credentials contract address from a hook target. Falls back
	 * to `getKeyring()` for integrator hook targets that use `get`-prefixed getters.
	 */
	queryKeyringAddress = async (
		provider: PublicClient,
		hookTarget: Address,
	): Promise<Address> => {
		return readHookTargetGetter<Address>(provider, hookTarget, [
			"keyring",
			"getKeyring",
		]);
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

	type GateInfo = NonNullable<
		ReturnType<KeyringPluginPrefetch["gatedVaults"]["get"]>
	>;

	const resolveGateInfo = async (
		provider: PublicClient,
		hookTarget: Address,
	): Promise<GateInfo> => {
		const [policyId, keyring] = await Promise.all([
			adapter.queryKeyringPolicyId(provider, hookTarget),
			adapter.queryKeyringAddress(provider, hookTarget),
		]);
		return { hookTarget, policyId, keyring };
	};

	return {
		name: "keyring",

		// Keyring does not affect reads — no getReadPrepend

		async prefetch(
			plan: TransactionPlan,
			account: AddressOrAccount,
			chainId: number,
			sdk: PluginSDK,
		): Promise<KeyringPluginPrefetch | undefined> {
			const chainHookTargets = config.hookTargets[chainId];
			if (!chainHookTargets?.length) return undefined;

			const targetVaults = await resolveTargetVaults(
				plan,
				account,
				chainId,
				sdk,
			);
			if (!targetVaults.length) return undefined;
			const provider = sdk.providerService.getProvider(chainId);

			const entries = await Promise.all(
				targetVaults.map(async (vault) => {
					const address = getAddress(vault.address);
					if (!isKeyringHook(vault, chainHookTargets)) {
						return [address, null] as const;
					}
					try {
						const info = await resolveGateInfo(
							provider,
							getAddress(vault.hooks.hookTarget),
						);
						return [address, info] as const;
					} catch {
						return [address, null] as const;
					}
				}),
			);

			const gatedVaults = new Map<Address, GateInfo | null>(entries);
			return { gatedVaults };
		},

		async processPlan(
			plan: TransactionPlan,
			account: AddressOrAccount,
			chainId: number,
			sdk: PluginSDK,
			prefetch?: PluginPrefetchData,
		): Promise<TransactionPlan> {
			const chainHookTargets = config.hookTargets[chainId];
			if (!chainHookTargets?.length) return plan;
			const sender =
				typeof account === "string"
					? getAddress(account)
					: getAddress(account.owner);
			const provider = sdk.providerService.getProvider(chainId);

			const keyringPrefetch = prefetch?.keyring;

			// Short-circuit: the form's vaults were prefetched and none are gated.
			if (keyringPrefetch && keyringPrefetch.gatedVaults.size > 0) {
				const anyGated = [...keyringPrefetch.gatedVaults.values()].some(
					(info) => info !== null,
				);
				if (!anyGated) return plan;
			}

			// Resolve the keyring vaults to act on: prefer the prefetch's already-
			// classified set, fall back to plan-walk + live isKeyringHook check.
			let keyringEntries: Array<{ vault: EVault; gate: GateInfo }> = [];
			if (keyringPrefetch) {
				const targetVaults = await resolveTargetVaults(
					plan,
					account,
					chainId,
					sdk,
				);
				for (const vault of targetVaults) {
					const address = getAddress(vault.address);
					const gate = keyringPrefetch.gatedVaults.get(address);
					if (gate) keyringEntries.push({ vault, gate });
				}
			} else {
				const candidates = (
					await resolveTargetVaults(plan, account, chainId, sdk)
				).filter((v) => isKeyringHook(v, chainHookTargets));
				keyringEntries = await Promise.all(
					candidates.map(async (vault) => ({
						vault,
						gate: await resolveGateInfo(
							provider,
							getAddress(vault.hooks.hookTarget),
						),
					})),
				);
			}
			if (!keyringEntries.length) return plan;

			const items: EVCBatchItem[] = [];

			for (const { gate } of keyringEntries) {
				try {
					// Credential validity is intentionally re-checked here even if
					// prefetched: it can flip between prefetch and submit if the
					// user opens/closes an extension session.
					const hasCredential = await adapter.queryKeyringCheckCredential(
						provider,
						gate.hookTarget,
						sender,
					);
					if (hasCredential) continue;

					const credentialData = await config.getCredentialData({
						chainId,
						account: sender,
						hookTarget: gate.hookTarget,
						policyId: gate.policyId,
					});
					if (!credentialData) continue;

					items.push({
						targetContract: gate.keyring,
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
