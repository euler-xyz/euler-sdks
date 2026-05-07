import { type Address, getAddress } from "viem";
import type {
	IAccount,
	IAccountLiquidity,
	IAccountPosition,
	ISubAccount,
} from "../../../../entities/Account.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import {
	accountDiagnosticOwner,
	accountPositionCollateralDiagnosticOwner,
	accountPositionDiagnosticOwner,
	compressDataIssues,
	dataIssueLocation,
	type DataIssue,
	type DataIssueOwnerRef,
	type ServiceResult,
	serviceDiagnosticOwner,
	subAccountDiagnosticOwner,
} from "../../../../utils/entityDiagnostics.js";
import {
	parseAddressArrayField,
	parseAddressField,
	parseBigIntField,
	parseBooleanField,
	parseDaysToLiquidation,
	parseNumberField,
} from "../../../../utils/parsing.js";
import type { AccountV3AdapterConfig } from "../../accountServiceConfig.js";
import type { IAccountAdapter } from "../../accountService.js";
import { normalizeAccountOutput } from "../accountOutputNormalization.js";

type V3PositionsResponse = {
	data?: V3AccountPositionRow[];
	meta?: {
		total?: number;
		hasMore?: boolean;
		offset?: number;
		limit?: number;
	};
};

const POSITIONS_PAGE_SIZE = 100;

type V3AccountPositionRow = {
	chainId: number;
	account: string;
	vault: string;
	asset: string;
	shares: string;
	assets: string;
	borrowed: string;
	isController: boolean;
	isCollateral: boolean;
	balanceForwarderEnabled: boolean;
	liquidity?: V3AccountLiquidity | null;
	subAccount?: V3SubAccount | null;
};

type V3AccountLiquidity = {
	vaultAddress: string;
	unitOfAccount: string;
	daysToLiquidation: number | string;
	liabilityValue: V3AssetValue;
	totalCollateralValue: V3AssetValue;
	collaterals: V3LiquidityCollateral[];
};

type V3AssetValue = {
	borrowing: string;
	liquidation: string;
	oracleMid: string;
};

type V3LiquidityCollateral = {
	address: string;
	value: V3AssetValue;
};

type V3SubAccount = {
	owner: string;
	timestamp: number;
	lastAccountStatusCheckTimestamp: number;
	enabledControllers: string[];
	enabledCollaterals: string[];
	isLockdownMode: boolean;
	isPermitDisabledMode: boolean;
};

function convertAssetValue(
	value: V3AssetValue,
	path: string,
	owner: DataIssueOwnerRef,
	errors: DataIssue[],
) {
	return {
		borrowing: parseBigIntField(value.borrowing, {
			path: `${path}.borrowing`,
			owner,
			errors,
			source: "accountV3",
		}),
		liquidation: parseBigIntField(value.liquidation, {
			path: `${path}.liquidation`,
			owner,
			errors,
			source: "accountV3",
		}),
		oracleMid: parseBigIntField(value.oracleMid, {
			path: `${path}.oracleMid`,
			owner,
			errors,
			source: "accountV3",
		}),
	};
}

function convertLiquidity(
	liquidity: V3AccountLiquidity,
	path: string,
	chainId: number,
	account: Address,
	vaultAddress: Address,
	errors: DataIssue[],
): IAccountLiquidity {
	const positionOwner = accountPositionDiagnosticOwner(
		chainId,
		account,
		vaultAddress,
	);
	const convertedCollaterals = liquidity.collaterals.map(
		(collateral, collateralIndex) => {
			const collateralAddress = parseAddressField(collateral.address, {
				path: `${path}.collaterals[${collateralIndex}].address`,
				owner: positionOwner,
				errors,
				source: "accountV3",
			});
			const collateralOwner = accountPositionCollateralDiagnosticOwner(
				chainId,
				account,
				vaultAddress,
				collateralAddress,
			);
			return {
				address: collateralAddress,
				value: convertAssetValue(
					collateral.value,
					"$.value",
					collateralOwner,
					errors,
				),
			};
		},
	);
	const hasCollateralValue = convertedCollaterals.some(
		({ value }) =>
			value.borrowing !== 0n ||
			value.liquidation !== 0n ||
			value.oracleMid !== 0n,
	);
	const collaterals = hasCollateralValue
		? convertedCollaterals.filter(
				({ value }) =>
					value.borrowing !== 0n ||
					value.liquidation !== 0n ||
					value.oracleMid !== 0n,
			)
		: convertedCollaterals;

	return {
		vaultAddress: parseAddressField(liquidity.vaultAddress, {
			path: `${path}.vaultAddress`,
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		unitOfAccount: parseAddressField(liquidity.unitOfAccount, {
			path: `${path}.unitOfAccount`,
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		daysToLiquidation: parseDaysToLiquidation(liquidity.daysToLiquidation, {
			path: `${path}.daysToLiquidation`,
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		liabilityValue: convertAssetValue(
			liquidity.liabilityValue,
			`${path}.liabilityValue`,
			positionOwner,
			errors,
		),
		totalCollateralValue: convertAssetValue(
			liquidity.totalCollateralValue,
			`${path}.totalCollateralValue`,
			positionOwner,
			errors,
		),
		collaterals,
	};
}

function convertPosition(
	row: V3AccountPositionRow,
	positionIndex: number,
	errors: DataIssue[],
): IAccountPosition {
	const path = `$.positions[${positionIndex}]`;
	const account = parseAddressField(row.account, {
		path: `${path}.account`,
		owner: serviceDiagnosticOwner("accountV3", row.chainId, "positions"),
		errors,
		source: "accountV3",
	});
	const vaultAddress = parseAddressField(row.vault, {
		path: `${path}.vault`,
		owner: subAccountDiagnosticOwner(row.chainId, account),
		errors,
		source: "accountV3",
	});
	const positionOwner = accountPositionDiagnosticOwner(
		row.chainId,
		account,
		vaultAddress,
	);
	const asset = parseAddressField(row.asset, {
		path: "$.asset",
		owner: positionOwner,
		errors,
		source: "accountV3",
	});

	return {
		account,
		vaultAddress,
		asset,
		shares: parseBigIntField(row.shares, {
			path: "$.shares",
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		assets: parseBigIntField(row.assets, {
			path: "$.assets",
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		borrowed: parseBigIntField(row.borrowed, {
			path: "$.borrowed",
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		isController: parseBooleanField(row.isController, {
			path: "$.isController",
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		isCollateral: parseBooleanField(row.isCollateral, {
			path: "$.isCollateral",
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		balanceForwarderEnabled: parseBooleanField(row.balanceForwarderEnabled, {
			path: "$.balanceForwarderEnabled",
			owner: positionOwner,
			errors,
			source: "accountV3",
		}),
		liquidity: row.liquidity
			? convertLiquidity(
					row.liquidity,
					"$.liquidity",
					row.chainId,
					account,
					vaultAddress,
					errors,
				)
			: undefined,
	};
}

function buildSubAccount(
	chainId: number,
	account: Address,
	rows: V3AccountPositionRow[],
	errors: DataIssue[],
): ISubAccount & { isLockdownMode: boolean; isPermitDisabledMode: boolean } {
	const first = rows[0];
	const meta = first?.subAccount;

	if (!first || !meta) {
		if (first && !meta) {
			errors.push({
				code: "DEFAULT_APPLIED",
				severity: "warning",
				message: "Missing subAccount block; defaulted sub-account metadata.",
				locations: [
					dataIssueLocation(subAccountDiagnosticOwner(chainId, account), "$"),
				],
				source: "accountV3",
				normalizedValue: {
					timestamp: 0,
					owner: account,
					lastAccountStatusCheckTimestamp: 0,
					enabledControllers: [],
					enabledCollaterals: [],
					isLockdownMode: false,
					isPermitDisabledMode: false,
				},
			});
		}
		return {
			timestamp: 0,
			account,
			owner: account,
			lastAccountStatusCheckTimestamp: 0,
			enabledControllers: [],
			enabledCollaterals: [],
			positions: [],
			isLockdownMode: false,
			isPermitDisabledMode: false,
		};
	}

	const positions = rows.map((row, positionIndex) =>
		convertPosition(row, positionIndex, errors),
	);

	return {
		timestamp: parseNumberField(meta.timestamp, {
			path: "$.timestamp",
			owner: subAccountDiagnosticOwner(chainId, account),
			errors,
			source: "accountV3",
		}),
		account,
		owner: parseAddressField(meta.owner, {
			path: "$.owner",
			owner: subAccountDiagnosticOwner(chainId, account),
			errors,
			source: "accountV3",
			fallback: account,
			fallbackLabel: "account address",
		}),
		lastAccountStatusCheckTimestamp: parseNumberField(
			meta.lastAccountStatusCheckTimestamp,
			{
				path: "$.lastAccountStatusCheckTimestamp",
				owner: subAccountDiagnosticOwner(chainId, account),
				errors,
				source: "accountV3",
			},
		),
		enabledControllers: parseAddressArrayField(meta.enabledControllers, {
			path: "$.enabledControllers",
			owner: subAccountDiagnosticOwner(chainId, account),
			errors,
			source: "accountV3",
		}),
		enabledCollaterals: parseAddressArrayField(meta.enabledCollaterals, {
			path: "$.enabledCollaterals",
			owner: subAccountDiagnosticOwner(chainId, account),
			errors,
			source: "accountV3",
		}),
		positions,
		isLockdownMode: parseBooleanField(meta.isLockdownMode, {
			path: "$.isLockdownMode",
			owner: subAccountDiagnosticOwner(chainId, account),
			errors,
			source: "accountV3",
		}),
		isPermitDisabledMode: parseBooleanField(meta.isPermitDisabledMode, {
			path: "$.isPermitDisabledMode",
			owner: subAccountDiagnosticOwner(chainId, account),
			errors,
			source: "accountV3",
		}),
	};
}

export class AccountV3Adapter implements IAccountAdapter {
	constructor(
		private config: AccountV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: AccountV3AdapterConfig): void {
		this.config = config;
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	queryV3AccountPositions = async (
		endpoint: string,
		chainId: number,
		address: Address,
		offset = 0,
		limit = POSITIONS_PAGE_SIZE,
		forceFresh?: boolean,
	): Promise<V3PositionsResponse> => {
		const url = this.buildPositionsUrl(
			endpoint,
			chainId,
			address,
			offset,
			limit,
			forceFresh,
		);

		const response = await fetch(url.toString(), {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok) {
			throw new Error(`accountV3 ${response.status} ${response.statusText}`);
		}

		return response.json() as Promise<V3PositionsResponse>;
	};

	setQueryV3AccountPositions(fn: typeof this.queryV3AccountPositions): void {
		this.queryV3AccountPositions = fn;
	}

	async fetchAccount(
		chainId: number,
		address: Address,
	): Promise<ServiceResult<IAccount | undefined>> {
		const errors: DataIssue[] = [];
		const rows = await this.fetchPositions(chainId, address, errors);
		if (rows.length === 0) return { result: undefined, errors };

		const rowsByAccount = new Map<Address, V3AccountPositionRow[]>();
		for (const [index, row] of rows.entries()) {
			const account = parseAddressField(row.account, {
				path: `$.positions[${index}].account`,
				owner: accountDiagnosticOwner(chainId, getAddress(address)),
				errors,
				source: "accountV3",
				fallback: getAddress(address),
				fallbackLabel: "requested account address",
			});
			const list = rowsByAccount.get(account) ?? [];
			list.push(row);
			rowsByAccount.set(account, list);
		}

		const subAccountsArray = [...rowsByAccount.entries()].map(
			([account, accountRows]) =>
				buildSubAccount(chainId, account, accountRows, errors),
		);

		const subAccounts = subAccountsArray.reduce<Record<Address, ISubAccount>>(
			(acc, subAccount) => {
				const {
					isLockdownMode: _lockdown,
					isPermitDisabledMode: _permitDisabled,
					...rest
				} = subAccount;
				acc[getAddress(subAccount.account)] = rest;
				return acc;
			},
			{},
		);

		const primarySubAccount =
			subAccountsArray.find(
				(subAccount) => subAccount.account === subAccount.owner,
			) ?? subAccountsArray[0];
		const result = normalizeAccountOutput({
			chainId,
			owner: getAddress(address),
			isLockdownMode: primarySubAccount?.isLockdownMode ?? false,
			isPermitDisabledMode: primarySubAccount?.isPermitDisabledMode ?? false,
			subAccounts,
		});

		return {
			result,
			errors: compressDataIssues(errors),
		};
	}

	async fetchSubAccount(
		chainId: number,
		subAccount: Address,
		vaults: Address[] = [],
	): Promise<ServiceResult<ISubAccount | undefined>> {
		const errors: DataIssue[] = [];
		const rows = await this.fetchPositions(chainId, subAccount, errors);
		if (rows.length === 0)
			return { result: undefined, errors: compressDataIssues(errors) };

		const normalizedSubAccount = getAddress(subAccount);
		const subAccountRows = rows.filter(
			(row, index) =>
				parseAddressField(row.account, {
					path: `$.positions[${index}].account`,
					owner: subAccountDiagnosticOwner(chainId, normalizedSubAccount),
					errors,
					source: "accountV3",
					fallback: normalizedSubAccount,
					fallbackLabel: "requested sub-account address",
				}) === normalizedSubAccount,
		);
		if (subAccountRows.length === 0)
			return { result: undefined, errors: compressDataIssues(errors) };

		const filteredRows = vaults.length
			? subAccountRows.filter((row, index) =>
					vaults.some(
						(vault) =>
							getAddress(vault) ===
							parseAddressField(row.vault, {
								path: `$.positions[${index}].vault`,
								owner: subAccountDiagnosticOwner(chainId, normalizedSubAccount),
								errors,
								source: "accountV3",
							}),
					),
				)
			: subAccountRows;

		const built = buildSubAccount(
			chainId,
			normalizedSubAccount,
			filteredRows,
			errors,
		);
		const {
			isLockdownMode: _lockdown,
			isPermitDisabledMode: _permitDisabled,
			...result
		} = built;

		return {
			result,
			errors: compressDataIssues(errors),
		};
	}

	private async fetchPositions(
		chainId: number,
		address: Address,
		errors: DataIssue[],
	): Promise<V3AccountPositionRow[]> {
		try {
			const rows: V3AccountPositionRow[] = [];
			let offset = 0;

			for (;;) {
				const response = await this.queryV3AccountPositions(
					this.config.endpoint,
					chainId,
					getAddress(address),
					offset,
					POSITIONS_PAGE_SIZE,
					this.config.forceFresh,
				);
				const pageRows = response.data ?? [];
				rows.push(...pageRows);

				offset += pageRows.length;
				if (pageRows.length === 0) break;
				if (response.meta?.hasMore === false) break;
				if (
					typeof response.meta?.total === "number" &&
					offset >= response.meta.total
				)
					break;
				if (
					response.meta?.hasMore !== true &&
					pageRows.length < (response.meta?.limit ?? POSITIONS_PAGE_SIZE)
				)
					break;
			}

			return rows;
		} catch (error) {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "error",
				message: `Failed to fetch account positions for ${getAddress(address)}.`,
				locations: [
					dataIssueLocation(
						accountDiagnosticOwner(chainId, getAddress(address)),
					),
				],
				source: "accountV3",
				originalValue: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	private buildPositionsUrl(
		endpoint: string,
		chainId: number,
		address: Address,
		offset: number,
		limit: number,
		forceFresh?: boolean,
	): string {
		const path = `/v3/accounts/${address}/positions`;
		const params = new URLSearchParams({
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
		});
		if (forceFresh !== undefined) {
			params.set("forceFresh", String(forceFresh));
		}

		const normalizedEndpoint = endpoint.replace(/\/+$/, "");
		const joined =
			normalizedEndpoint.startsWith("http://") ||
			normalizedEndpoint.startsWith("https://")
				? new URL(path, `${normalizedEndpoint}/`).toString()
				: `${normalizedEndpoint}${path}`;

		return `${joined}?${params.toString()}`;
	}
}
