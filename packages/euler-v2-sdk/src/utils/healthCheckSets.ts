import {
	type Address,
	type Abi,
	decodeFunctionData,
	getAddress,
	zeroAddress,
} from "viem";
import {
	Account,
	type IHasVaultAddress,
	type SubAccount,
} from "../entities/Account.js";
import type {
	EVCBatchItem,
	TransactionPlan,
} from "../services/executionService/executionServiceTypes.js";
import { flattenBatchEntries } from "../services/executionService/executionServiceTypes.js";
import { ethereumVaultConnectorAbi } from "../services/executionService/abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "../services/executionService/abis/eVaultAbi.js";
import { resolveBorrowCollateralVaults } from "./accountPositionClassification.js";

type HealthCheckState = {
	controllers: Set<Address>;
	collaterals: Set<Address>;
};

export type HealthCheckAccountSet = {
	account: Address;
	controllers: Address[];
	collaterals: Address[];
};

export type PlanHealthCheckSet = {
	planIndex: number;
	accounts: HealthCheckAccountSet[];
};

function ensurePopulatedAccount(account: Account<IHasVaultAddress>): void {
	if (!account.populated.vaults) {
		throw new Error(
			"Health check calculation requires an Account populated with vaults.",
		);
	}
}

function ensureState(
	states: Map<Address, HealthCheckState>,
	account: Address,
): HealthCheckState {
	const normalized = getAddress(account);
	const existing = states.get(normalized);
	if (existing) return existing;
	const created = {
		controllers: new Set<Address>(),
		collaterals: new Set<Address>(),
	};
	states.set(normalized, created);
	return created;
}

function addAddress(set: Set<Address>, value: Address): void {
	set.add(getAddress(value));
}

function deleteAddress(set: Set<Address>, value: Address): void {
	set.delete(getAddress(value));
}

function collectInitialCollateralVaults(
	subAccount: SubAccount<IHasVaultAddress>,
): Address[] {
	const collaterals = new Map<string, Address>();
	for (const position of subAccount.positions) {
		if (position.borrowed === 0n) continue;
		for (const collateral of resolveBorrowCollateralVaults(
			subAccount,
			position,
		)) {
			const normalized = getAddress(collateral);
			collaterals.set(normalized.toLowerCase(), normalized);
		}
	}
	return [...collaterals.values()];
}

function buildInitialStates(
	account: Account<IHasVaultAddress>,
): Map<Address, HealthCheckState> {
	const states = new Map<Address, HealthCheckState>();
	for (const subAccount of Object.values(account.subAccounts)) {
		if (!subAccount) continue;
		const state = ensureState(states, subAccount.account);
		for (const controller of subAccount.enabledControllers) {
			addAddress(state.controllers, controller);
		}
		for (const collateral of collectInitialCollateralVaults(subAccount)) {
			addAddress(state.collaterals, collateral);
		}
	}
	return states;
}

function decodeEvcFunction(item: EVCBatchItem) {
	try {
		return decodeFunctionData({
			abi: ethereumVaultConnectorAbi as unknown as Abi,
			data: item.data,
		});
	} catch {
		return null;
	}
}

function decodeEVaultFunction(item: EVCBatchItem) {
	try {
		return decodeFunctionData({
			abi: eVaultAbi as unknown as Abi,
			data: item.data,
		});
	} catch {
		return null;
	}
}

function applyEvcStateMutation(
	item: EVCBatchItem,
	states: Map<Address, HealthCheckState>,
): void {
	const decoded = decodeEvcFunction(item);
	if (!decoded) return;
	const args = (decoded.args ?? []) as readonly unknown[];

	if (decoded.functionName === "enableController") {
		const [account, vault] = args as [Address, Address];
		addAddress(ensureState(states, account).controllers, vault);
		return;
	}

	if (decoded.functionName === "disableController") {
		const [account] = args as [Address];
		ensureState(states, account).controllers.clear();
		return;
	}

	if (decoded.functionName === "enableCollateral") {
		const [account, vault] = args as [Address, Address];
		addAddress(ensureState(states, account).collaterals, vault);
		return;
	}

	if (decoded.functionName === "disableCollateral") {
		const [account, vault] = args as [Address, Address];
		deleteAddress(ensureState(states, account).collaterals, vault);
	}
}

function getCheckedAccountFromEVaultCall(item: EVCBatchItem): Address | null {
	const decoded = decodeEVaultFunction(item);
	if (!decoded) return null;
	const args = (decoded.args ?? []) as readonly unknown[];

	if (
		decoded.functionName === "borrow" ||
		decoded.functionName === "pullDebt" ||
		decoded.functionName === "liquidate" ||
		decoded.functionName === "repayWithShares" ||
		decoded.functionName === "transfer"
	) {
		return getAddress(item.onBehalfOfAccount);
	}

	if (
		decoded.functionName === "withdraw" ||
		decoded.functionName === "redeem"
	) {
		return getAddress(args[2] as Address);
	}

	if (
		decoded.functionName === "transferFrom" ||
		decoded.functionName === "transferFromMax"
	) {
		const from = getAddress(args[0] as Address);
		return from === zeroAddress ? getAddress(item.onBehalfOfAccount) : from;
	}

	return null;
}

function applyEVaultStateMutation(
	item: EVCBatchItem,
	states: Map<Address, HealthCheckState>,
): void {
	const decoded = decodeEVaultFunction(item);
	if (!decoded) return;

	if (decoded.functionName === "disableController") {
		deleteAddress(
			ensureState(states, item.onBehalfOfAccount).controllers,
			item.targetContract,
		);
	}
}

function snapshotCheckedAccounts(
	checkedAccounts: Set<Address>,
	states: Map<Address, HealthCheckState>,
): HealthCheckAccountSet[] {
	return [...checkedAccounts].flatMap((account) => {
		const state = states.get(getAddress(account));
		if (!state) return [];
		return [
			{
				account: getAddress(account),
				controllers: [...state.controllers],
				collaterals: [...state.collaterals],
			},
		];
	});
}

export function calculateHealthCheckSets(
	plan: TransactionPlan,
	account: Account<IHasVaultAddress>,
): PlanHealthCheckSet[] {
	ensurePopulatedAccount(account);

	const states = buildInitialStates(account);
	const healthCheckSets: PlanHealthCheckSet[] = [];

	for (const [planIndex, entry] of plan.entries()) {
		if (entry.type !== "evcBatch") continue;

		const checkedAccounts = new Set<Address>();
		for (const item of flattenBatchEntries(entry.items)) {
			applyEvcStateMutation(item, states);
			applyEVaultStateMutation(item, states);

			const checkedAccount = getCheckedAccountFromEVaultCall(item);
			if (checkedAccount) {
				checkedAccounts.add(checkedAccount);
				ensureState(states, checkedAccount);
			}
		}

		if (checkedAccounts.size) {
			healthCheckSets.push({
				planIndex,
				accounts: snapshotCheckedAccounts(checkedAccounts, states),
			});
		}
	}

	return healthCheckSets;
}
