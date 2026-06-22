import {
	type Address,
	type PublicClient,
	type StateOverride,
	getAddress,
	parseEther,
} from "viem";
import type { TransactionPlan } from "../../services/executionService/executionServiceTypes.js";
import { getBalanceOverrides } from "./balanceOverrides.js";
import { getApprovalOverrides } from "./approvalOverrides.js";
import { mergeStateOverrides } from "./mergeStateOverrides.js";
import type { SlotHints } from "./slotHints.js";

export type DeriveStateOverridesOptions = {
	/** Override the native (ETH) balance. Defaults to 1000 ETH. Set to 0n to skip. */
	nativeBalance?: bigint;
	/** Permit2 contract address. Required for approval overrides. */
	permit2Address: Address;
	/**
	 * Skip ERC20 balance overrides entirely. Use when the caller has already
	 * validated that the account holds sufficient funds (e.g. UI form validation).
	 * No `balanceOf` reads, no slot probing — only allowance overrides + native
	 * balance + Permit2 deterministic overrides are emitted.
	 */
	noBalanceOverride?: boolean;
	/**
	 * Skip ERC20 allowance overrides entirely (the Permit2 deterministic
	 * overrides are still emitted because they cost no RPC). Use when the
	 * caller knows the account has already approved the relevant spenders.
	 */
	noAllowanceOverride?: boolean;
	/**
	 * Caller-supplied wallet snapshot. Lets the SDK skip per-call `balanceOf`
	 * and `allowance` reads when the supplied values already cover the
	 * requirement.
	 *
	 *  - `balances[token]`: when ≥ the plan's required amount, no override
	 *    is emitted and no `balanceOf` RPC fires.
	 *  - `allowances[token:spender]`: when `maxUint256`, no override is emitted
	 *    and no `allowance` RPC fires.
	 */
	wallet?: {
		balances?: Record<Address, bigint>;
		allowances?: Record<`${Address}:${Address}`, bigint>;
	};
	/**
	 * Caller-supplied storage slot hints. When the `balanceSlotIndex` or
	 * `allowanceSlotIndex` is present for a token, the SDK computes the slot
	 * cryptographically and bypasses access-list discovery. Missing entries
	 * fall through to the SDK's own probing + final access-list fallback.
	 *
	 * Pre-fetch with `fetchErc20SlotHints` (exported from this module) to
	 * amortise discovery across many simulate/estimate calls.
	 */
	slotHints?: SlotHints;
};

/**
 * Extract token balance requirements from a TransactionPlan.
 * Each RequiredApproval represents a deposit-like operation where the user needs
 * tokens in their wallet. Several approvals can draw on the same token within one
 * plan (e.g. supplying it into two vaults, or supply + repay), so we sum the
 * amounts per token — the wallet must cover their total, not the largest single
 * one. Over-forging is harmless; under-forging would make an op revert with
 * E_InsufficientBalance mid-simulation.
 */
function extractBalanceRequirements(
	plan: TransactionPlan,
	account: Address,
): [Address, bigint][] {
	const totalPerToken = new Map<Address, bigint>();

	for (const item of plan) {
		if (item.type !== "requiredApproval") continue;
		if (getAddress(item.owner) !== getAddress(account)) continue;

		const token = getAddress(item.token);
		totalPerToken.set(token, (totalPerToken.get(token) || 0n) + item.amount);
	}

	return Array.from(totalPerToken.entries());
}

/**
 * Extract approval pairs from a TransactionPlan.
 * Returns unique [asset, spender] pairs.
 */
function extractApprovalRequirements(
	plan: TransactionPlan,
	account: Address,
): [Address, Address][] {
	const seen = new Set<string>();
	const approvals: [Address, Address][] = [];

	for (const item of plan) {
		if (item.type !== "requiredApproval") continue;
		if (getAddress(item.owner) !== getAddress(account)) continue;

		const asset = getAddress(item.token);
		const spender = getAddress(item.spender);
		const key = `${asset}:${spender}`;
		if (!seen.has(key)) {
			seen.add(key);
			approvals.push([asset, spender]);
		}
	}

	return approvals;
}

/**
 * Generate all state overrides needed to simulate a TransactionPlan
 * for an account that may not have sufficient tokens or approvals.
 *
 * Combines:
 * - Native balance override (ETH)
 * - ERC20 balance overrides (via storage slot discovery)
 * - ERC20 approval + Permit2 allowance overrides
 *
 * @param client - viem PublicClient (must support eth_createAccessList and eth_call with state overrides)
 * @param plan - TransactionPlan from the SDK's execution service
 * @param account - the connected wallet address
 * @param options - Permit2 address and optional native balance override
 *
 * @example
 * ```ts
 * const plan = sdk.executionService.planDeposit({ ... })
 * const permit2 = sdk.deploymentService.getDeployment(chainId).addresses.coreAddrs.permit2
 * const overrides = await deriveStateOverrides(client, plan, account, { permit2Address: permit2 })
 * // Use overrides with simulateContract or eth_call
 * ```
 */
export async function deriveStateOverrides(
	client: PublicClient,
	plan: TransactionPlan,
	account: Address,
	options: DeriveStateOverridesOptions,
): Promise<StateOverride> {
	const {
		nativeBalance = parseEther("1000"),
		permit2Address,
		noBalanceOverride = false,
		noAllowanceOverride = false,
		wallet,
		slotHints,
	} = options;

	const balanceTokens = noBalanceOverride
		? []
		: extractBalanceRequirements(plan, account);
	const approvalPairs = extractApprovalRequirements(plan, account);

	const [balanceOverrides, approvalOverrides] = await Promise.all([
		getBalanceOverrides(client, account, balanceTokens, {
			walletBalances: wallet?.balances,
			slotHints,
		}),
		noAllowanceOverride
			? Promise.resolve([] as StateOverride)
			: getApprovalOverrides(client, account, approvalPairs, permit2Address, {
					walletAllowances: wallet?.allowances,
					slotHints,
				}),
	]);

	const allOverrides: StateOverride = [];

	// Native balance override
	if (nativeBalance > 0n) {
		allOverrides.push({ address: account, balance: nativeBalance });
	}

	allOverrides.push(...balanceOverrides);
	allOverrides.push(...approvalOverrides);

	return mergeStateOverrides(allOverrides);
}
