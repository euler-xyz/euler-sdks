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
} from "../../services/executionService/executionServiceTypes.js";
import { flattenBatchEntries } from "../../services/executionService/executionServiceTypes.js";
import { applyBuildQuery, type BuildQueryFn } from "../../utils/buildQuery.js";
import {
	type EulerPlugin,
	type KeyringPluginPrefetch,
	type PluginPrefetchData,
	type PluginSDK,
	prependToBatch,
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
	// immutables above. getPolicyId() is uint32 on the verified integrator ABI,
	// matching the native policyId() getter and the SDK's `policyId: number` surface.
	{
		type: "function",
		name: "getPolicyId",
		inputs: [],
		outputs: [{ name: "", type: "uint32" }],
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
		// Both policyId() and getPolicyId() are uint32, so viem returns a number
		// directly — no bigint coercion (and no unsafe-integer rounding) needed.
		return readHookTargetGetter<number>(provider, hookTarget, [
			"policyId",
			"getPolicyId",
		]);
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
	targetAddresses: Address[],
	account: AddressOrAccount,
	chainId: number,
	sdk: PluginSDK,
): Promise<EVault[]> {
	if (!targetAddresses.length) return [];

	const accountVaults =
		typeof account === "string"
			? []
			: collectAccountVaults(account, targetAddresses);
	const accountVaultAddresses = new Set(
		accountVaults.map((vault) => getAddress(vault.address)),
	);
	const missingTargetAddresses = targetAddresses.filter(
		(address) => !accountVaultAddresses.has(getAddress(address)),
	);
	if (!missingTargetAddresses.length) return accountVaults;

	const fetched = await sdk.vaultMetaService.fetchVaults(
		chainId,
		missingTargetAddresses,
	);
	const fetchedVaults = fetched.result.filter(
		(v): v is EVault =>
			!!v &&
			"hooks" in v &&
			missingTargetAddresses.some(
				(target) => getAddress(target) === getAddress(v.address),
			),
	);
	return [...accountVaults, ...fetchedVaults];
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

			const targetAddresses = collectPlanTargetAddresses(plan);
			const targetVaults = await resolveTargetVaults(
				targetAddresses,
				account,
				chainId,
				sdk,
			);
			if (!targetVaults.length) {
				return {
					targetAddresses: new Set(targetAddresses),
					gatedVaults: new Map(),
				};
			}
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
			return { targetAddresses: new Set(targetAddresses), gatedVaults };
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
			const targetAddresses = collectPlanTargetAddresses(plan);
			const keyringEntries = new Map<string, GateInfo>();
			const addGate = (gate: GateInfo) => {
				const key = [
					getAddress(gate.keyring),
					getAddress(gate.hookTarget),
					gate.policyId,
				].join(":");
				keyringEntries.set(key, gate);
			};
			const resolveGates = async (addresses: Address[]) => {
				const candidates = (
					await resolveTargetVaults(addresses, account, chainId, sdk)
				).filter((vault) => isKeyringHook(vault, chainHookTargets));
				const hookTargets = new Set(
					candidates.map((vault) => getAddress(vault.hooks.hookTarget)),
				);
				const gates = await Promise.all(
					[...hookTargets].map((hookTarget) =>
						resolveGateInfo(provider, hookTarget),
					),
				);
				for (const gate of gates) addGate(gate);
			};
			if (keyringPrefetch) {
				for (const address of targetAddresses) {
					const gate = keyringPrefetch.gatedVaults.get(address);
					if (gate) addGate(gate);
				}
				const prefetchedTargetAddresses =
					keyringPrefetch.targetAddresses ??
					new Set(keyringPrefetch.gatedVaults.keys());
				const newTargetAddresses = targetAddresses.filter(
					(address) => !prefetchedTargetAddresses.has(address),
				);
				await resolveGates(newTargetAddresses);
			} else {
				await resolveGates(targetAddresses);
			}
			if (!keyringEntries.size) return plan;

			const items = new Map<string, EVCBatchItem>();

			for (const gate of keyringEntries.values()) {
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

					const credentialKey = [
						getAddress(gate.keyring),
						getAddress(credentialData.trader),
						credentialData.policyId,
					].join(":");
					if (items.has(credentialKey)) continue;

					items.set(credentialKey, {
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

			if (!items.size) return plan;
			return prependToBatch(plan, [...items.values()]);
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
