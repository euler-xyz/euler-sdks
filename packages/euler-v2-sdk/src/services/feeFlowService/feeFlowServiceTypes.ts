import type { Address } from "viem";
import type { EVault } from "../../entities/EVault.js";
import type { TransactionPlan } from "../executionService/index.js";

export interface FeeFlowServiceConfig {
	feeFlowControllerAddress?: Address;
	feeFlowControllerUtilAddress?: Address;
	defaultBuyDeadlineSeconds?: number;
}

export interface FeeFlowSlot0 {
	locked: number;
	epochId: number;
	initPrice: bigint;
	startTime: number;
}

export interface FeeFlowState {
	chainId: number;
	feeFlowControllerAddress: Address;
	feeFlowControllerUtilAddress?: Address;
	paymentToken: Address;
	paymentReceiver: Address;
	epochPeriod: bigint;
	priceMultiplier: bigint;
	minInitPrice: bigint;
	currentPrice: bigint;
	slot0: FeeFlowSlot0;
	now: number;
	endTime: number;
	timeRemaining: number;
}

export interface BuildFeeFlowBuyPlanArgs {
	chainId: number;
	account: Address;
	vaults: Address[] | EVault[];
	recipient?: Address;
	deadline?: bigint;
	maxPaymentTokenAmount?: bigint;
}

export interface IFeeFlowService {
	fetchState(chainId: number): Promise<FeeFlowState>;
	getEligibleVaults(vaults: EVault[], chainId?: number): EVault[];
	buildBuyPlan(args: BuildFeeFlowBuyPlanArgs): Promise<TransactionPlan>;
}
