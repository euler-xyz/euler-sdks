import { isAddress } from "viem";
import type { BrevisCampaign } from "../../rewardsServiceTypes.js";

export const BREVIS_LEND = 2002;
export const BREVIS_BORROW = 2001;

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | undefined {
	return value && typeof value === "object" ? (value as RawRecord) : undefined;
}

function pick(record: RawRecord, snake: string, camel: string): unknown {
	return record[snake] ?? record[camel];
}

function asNumber(value: unknown): number | undefined {
	const parsed =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed)
		? parsed
		: undefined;
}

function asText(value: unknown): string | undefined {
	if (typeof value === "string" && value !== "") return value;
	return typeof value === "number" && Number.isFinite(value)
		? String(value)
		: undefined;
}

/** Brevis sends the action as 2001/2002, or since 2026 as `EULER_BORROW`/`EULER_LEND`. */
function asAction(value: unknown): number | undefined {
	const numeric = asNumber(value);
	if (numeric === BREVIS_LEND || numeric === BREVIS_BORROW) return numeric;
	if (typeof value !== "string") return undefined;
	if (value.endsWith("LEND")) return BREVIS_LEND;
	if (value.endsWith("BORROW")) return BREVIS_BORROW;
	return undefined;
}

/**
 * One Brevis campaign in the SDK's shape, from either API shape: snake_case
 * with numbers, or the camelCase with numeric strings Brevis answers with
 * since 2026. A campaign without a vault, an id, a known action, a reward
 * token or an APR is left out.
 */
export function normalizeBrevisCampaign(raw: unknown): BrevisCampaign | null {
	const campaign = asRecord(raw);
	const rewardInfo = campaign
		? asRecord(pick(campaign, "reward_info", "rewardInfo"))
		: undefined;
	if (!campaign || !rewardInfo) return null;

	const vaultAddress = pick(campaign, "vault_address", "vaultAddress");
	const campaignId = asText(pick(campaign, "campaign_id", "campaignId"));
	const action = asAction(campaign.action);
	const tokenAddress = pick(rewardInfo, "token_address", "tokenAddress");
	const apr = asNumber(rewardInfo.apr);
	if (
		typeof vaultAddress !== "string" ||
		!isAddress(vaultAddress) ||
		!campaignId ||
		action === undefined ||
		typeof tokenAddress !== "string" ||
		!isAddress(tokenAddress) ||
		apr === undefined
	) {
		return null;
	}

	const claimChainId = asNumber(
		pick(rewardInfo, "claim_chain_id", "claimChainId"),
	);
	const claimContract = pick(rewardInfo, "claim_contract", "claimContract");
	const rewardUsdPrice = asNumber(rewardInfo.rewardUsdPrice);
	const status = campaign.status;

	return {
		chain_id: asNumber(pick(campaign, "chain_id", "chainId")) ?? 0,
		vault_address: vaultAddress,
		action,
		campaign_id: campaignId,
		campaign_name:
			asText(pick(campaign, "campaign_name", "campaignName")) ?? "",
		start_time: asNumber(pick(campaign, "start_time", "startTime")) ?? 0,
		end_time: asNumber(pick(campaign, "end_time", "endTime")) ?? 0,
		reward_info: {
			token_address: tokenAddress,
			token_symbol:
				asText(pick(rewardInfo, "token_symbol", "tokenSymbol")) ?? "",
			apr,
			...(rewardUsdPrice !== undefined ? { rewardUsdPrice } : {}),
			...(claimChainId !== undefined ? { claim_chain_id: claimChainId } : {}),
			...(typeof claimContract === "string"
				? { claim_contract: claimContract }
				: {}),
		},
		...(typeof status === "number" || typeof status === "string"
			? { status }
			: {}),
	};
}

export function normalizeBrevisCampaigns(raw: unknown): BrevisCampaign[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((entry) => {
		const campaign = normalizeBrevisCampaign(entry);
		return campaign ? [campaign] : [];
	});
}
