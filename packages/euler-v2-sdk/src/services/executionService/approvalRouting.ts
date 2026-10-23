import { type Address, getAddress, maxUint160, zeroAddress } from "viem";
import type {
	AssetAllowanceRead,
	AssetAllowances,
} from "../../entities/Wallet.js";
import { VaultType } from "../../utils/types.js";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { ProviderService } from "../providerService/index.js";
import type { IVaultMetaService } from "../vaults/vaultMetaService/vaultMetaService.js";
import type {
	ApprovalTransferBehavior,
	RequiredApproval,
	TransactionPlan,
} from "./executionServiceTypes.js";

type AllowanceStatus = "sufficient" | "insufficient" | "unknown";
export type ApprovalAssessment = {
	status: AllowanceStatus;
	route: "direct" | "permit2" | "either" | "unknown";
	direct: AllowanceStatus;
	tokenToPermit2: AllowanceStatus;
	permit2ToSpender: AllowanceStatus;
	directAllowance?: bigint;
	tokenToPermit2Allowance?: bigint;
	permit2ToSpenderAllowance?: bigint;
	permit2Expiration?: number;
};

/** Both resolution and diagnostics assess the route the spender actually takes. */
export function assessApproval(
	approval: RequiredApproval,
	allowances: AssetAllowances | undefined,
	walletPermit2: Address,
	now = Math.floor(Date.now() / 1000),
): ApprovalAssessment {
	const { amount, transferBehavior: behavior } = approval;
	const read = (key: AssetAllowanceRead) =>
		allowances?.failedReads?.includes(key) ? undefined : allowances?.[key];
	const sufficient = (value: bigint | undefined): AllowanceStatus =>
		value === undefined
			? "unknown"
			: value >= amount
				? "sufficient"
				: "insufficient";
	const samePermit2 =
		behavior &&
		behavior.type !== "direct" &&
		getAddress(behavior.permit2) ===
			getAddress(allowances?.permit2Address ?? walletPermit2);
	const directAllowance = read("assetForVault");
	const tokenToPermit2Allowance = samePermit2
		? read("assetForPermit2")
		: undefined;
	const permit2ToSpenderAllowance = samePermit2
		? read("assetForVaultInPermit2")
		: undefined;
	const permit2Expiration =
		permit2ToSpenderAllowance === undefined
			? undefined
			: allowances?.permit2ExpirationTime;
	const direct = sufficient(directAllowance);
	const tokenToPermit2 = sufficient(tokenToPermit2Allowance);
	const permit2ToSpender =
		permit2ToSpenderAllowance === undefined || permit2Expiration === undefined
			? "unknown"
			: permit2Expiration < now || amount > maxUint160
				? "insufficient"
				: sufficient(permit2ToSpenderAllowance);
	const result: ApprovalAssessment = {
		status: "unknown",
		route: "unknown",
		direct,
		tokenToPermit2,
		permit2ToSpender,
		directAllowance,
		tokenToPermit2Allowance,
		permit2ToSpenderAllowance,
		permit2Expiration,
	};
	if (amount === 0n)
		return { ...result, status: "sufficient", route: "direct" };
	if (!behavior) return result;
	if (
		behavior.type === "direct" ||
		getAddress(behavior.permit2) === zeroAddress
	) {
		return { ...result, status: direct, route: "direct" };
	}
	if (behavior.type === "permit2WhenAuthorized") {
		// Earn reads the internal allowance even when the amount exceeds uint160.
		if (
			permit2ToSpender === "unknown" ||
			permit2Expiration === undefined ||
			permit2ToSpenderAllowance === undefined
		)
			return result;
		if (
			approval.amountIsExact === false &&
			permit2ToSpender === "insufficient" &&
			permit2Expiration >= now &&
			permit2ToSpenderAllowance > 0n &&
			(tokenToPermit2Allowance === undefined ||
				tokenToPermit2Allowance < permit2ToSpenderAllowance)
		) {
			// A smaller transfer may select Permit2 even though the aggregate/estimate
			// does not. Direct coverage is safe only if every possibly selected Permit2
			// transfer is covered too, up to the remaining internal allowance.
			return result;
		}
		return permit2ToSpender === "sufficient"
			? { ...result, status: tokenToPermit2, route: "permit2" }
			: { ...result, status: direct, route: "direct" };
	}
	// EVK catches Permit2 failures and can always use a sufficient direct route.
	if (direct === "sufficient" || amount > maxUint160) {
		return { ...result, status: direct, route: "direct" };
	}
	const permit2 =
		tokenToPermit2 === "insufficient" || permit2ToSpender === "insufficient"
			? "insufficient"
			: tokenToPermit2 === "sufficient" && permit2ToSpender === "sufficient"
				? "sufficient"
				: "unknown";
	return {
		...result,
		status:
			permit2 === "sufficient"
				? "sufficient"
				: direct === "insufficient" && permit2 === "insufficient"
					? "insufficient"
					: "unknown",
		route: permit2 === "sufficient" ? "permit2" : "either",
	};
}

const permit2AddressAbi = [
	{
		type: "function",
		name: "permit2Address",
		inputs: [],
		outputs: [{ type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "permit2",
		inputs: [],
		outputs: [{ type: "address" }],
		stateMutability: "view",
	},
] as const;

/** Resolve known implementations only. A getter or ERC4626 interface alone is not proof of behavior. */
export async function withApprovalTransferBehaviors(
	ctx: {
		deploymentService: IDeploymentService;
		providerService?: ProviderService;
		vaultMetaService?: Pick<IVaultMetaService, "fetchVaultTypes">;
	},
	chainId: number,
	plan: TransactionPlan,
): Promise<TransactionPlan> {
	const spenders = [
		...new Set(
			plan.flatMap((item) =>
				item.type === "requiredApproval" &&
				!item.transferBehavior &&
				item.amount > 0n
					? [getAddress(item.spender)]
					: [],
			),
		),
	];
	const providerService = ctx.providerService;
	if (!spenders.length || !providerService) return plan;
	const verifier =
		ctx.deploymentService.getDeployment(chainId).addresses.peripheryAddrs
			?.swapVerifier;
	const isVerifier = (spender: Address) =>
		!!verifier && spender === getAddress(verifier);
	const vaults = spenders.filter((spender) => !isVerifier(spender));
	const types: Partial<Record<Address, string>> =
		vaults.length && ctx.vaultMetaService?.fetchVaultTypes
			? await ctx.vaultMetaService
					.fetchVaultTypes(chainId, vaults)
					.catch(() => ({}))
			: {};
	const behaviors = new Map<Address, ApprovalTransferBehavior>();
	await Promise.all(
		spenders.map(async (spender) => {
			const type = types[spender];
			if (
				!isVerifier(spender) &&
				type !== VaultType.EVault &&
				type !== VaultType.EulerEarn
			)
				return;
			try {
				const permit2 = getAddress(
					await providerService.getProvider(chainId).readContract({
						address: spender,
						abi: permit2AddressAbi,
						functionName: isVerifier(spender) ? "permit2" : "permit2Address",
					}),
				);
				behaviors.set(spender, {
					type:
						type === VaultType.EVault && !isVerifier(spender)
							? "permit2WithDirectFallback"
							: "permit2WhenAuthorized",
					permit2,
				});
			} catch {
				// The configured address is unknown; never substitute the deployment's address.
			}
		}),
	);
	return plan.map((item) =>
		item.type === "requiredApproval" &&
		!item.transferBehavior &&
		behaviors.has(getAddress(item.spender))
			? { ...item, transferBehavior: behaviors.get(getAddress(item.spender)) }
			: item,
	);
}
