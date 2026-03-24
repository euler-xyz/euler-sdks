import { type Address, getAddress } from "viem";
import type {
	IAccount,
	IAccountLiquidity,
	IAccountPosition,
	ISubAccount,
	DaysToLiquidation,
} from "../../../../entities/Account.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import {
	compressDataIssues,
	type DataIssue,
	type ServiceResult,
} from "../../../../utils/entityDiagnostics.js";
import {
	parseAddressArrayField,
	parseAddressField,
	parseBigIntField,
	parseBooleanField,
	parseDaysToLiquidation,
	parseNumberField,
	ZERO_ADDRESS,
} from "../../../../utils/parsing.js";
import type { AccountV3AdapterConfig } from "../../accountServiceConfig.js";
import type { IAccountAdapter } from "../../accountService.js";

type V3PositionsResponse = {
	data?: V3AccountPositionRow[];
};

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
	entityId: Address,
	errors: DataIssue[],
) {
	return {
		borrowing: parseBigIntField(
			value.borrowing,
			{ path: `${path}.borrowing`, entityId, errors, source: "accountV3" },
		),
		liquidation: parseBigIntField(
			value.liquidation,
			{ path: `${path}.liquidation`, entityId, errors, source: "accountV3" },
		),
		oracleMid: parseBigIntField(
			value.oracleMid,
			{ path: `${path}.oracleMid`, entityId, errors, source: "accountV3" },
		),
	};
}

function convertLiquidity(
	liquidity: V3AccountLiquidity,
	path: string,
	entityId: Address,
	errors: DataIssue[],
): IAccountLiquidity {
	const collaterals = liquidity.collaterals.map((collateral, collateralIndex) => {
		const collateralAddress = parseAddressField(
			collateral.address,
			{
				path: `${path}.collaterals[${collateralIndex}].address`,
				entityId,
				errors,
				source: "accountV3",
			},
		);

		return {
			address: collateralAddress,
			value: convertAssetValue(
				collateral.value,
				`${path}.collaterals[${collateralIndex}].value`,
				collateralAddress,
				errors,
			),
		};
	});

	return {
		vaultAddress: parseAddressField(
			liquidity.vaultAddress,
			{ path: `${path}.vaultAddress`, entityId, errors, source: "accountV3" },
		),
		unitOfAccount: parseAddressField(
			liquidity.unitOfAccount,
			{ path: `${path}.unitOfAccount`, entityId, errors, source: "accountV3" },
		),
		daysToLiquidation: parseDaysToLiquidation(
			liquidity.daysToLiquidation,
			{ path: `${path}.daysToLiquidation`, entityId, errors, source: "accountV3" },
		),
		liabilityValue: convertAssetValue(
			liquidity.liabilityValue,
			`${path}.liabilityValue`,
			entityId,
			errors,
		),
		totalCollateralValue: convertAssetValue(
			liquidity.totalCollateralValue,
			`${path}.totalCollateralValue`,
			entityId,
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
		entityId: ZERO_ADDRESS,
		errors,
		source: "accountV3",
	});
	const vaultAddress = parseAddressField(
		row.vault,
		{ path: `${path}.vault`, entityId: account, errors, source: "accountV3" },
	);
	const asset = parseAddressField(row.asset, {
		path: `${path}.asset`,
		entityId: vaultAddress,
		errors,
		source: "accountV3",
	});

	return {
		account,
		vaultAddress,
		asset,
		shares: parseBigIntField(
			row.shares,
			{ path: `${path}.shares`, entityId: vaultAddress, errors, source: "accountV3" },
		),
		assets: parseBigIntField(
			row.assets,
			{ path: `${path}.assets`, entityId: vaultAddress, errors, source: "accountV3" },
		),
		borrowed: parseBigIntField(
			row.borrowed,
			{ path: `${path}.borrowed`, entityId: vaultAddress, errors, source: "accountV3" },
		),
		isController: parseBooleanField(
			row.isController,
			{ path: `${path}.isController`, entityId: vaultAddress, errors, source: "accountV3" },
		),
		isCollateral: parseBooleanField(
			row.isCollateral,
			{ path: `${path}.isCollateral`, entityId: vaultAddress, errors, source: "accountV3" },
		),
		balanceForwarderEnabled: parseBooleanField(
			row.balanceForwarderEnabled,
			{
				path: `${path}.balanceForwarderEnabled`,
				entityId: vaultAddress,
				errors,
				source: "accountV3",
			},
		),
		liquidity: row.liquidity
			? convertLiquidity(
					row.liquidity,
					`${path}.liquidity`,
					vaultAddress,
					errors,
				)
			: undefined,
	};
}

function buildSubAccount(
	_chainId: number,
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
				paths: ["$.positions[0].subAccount"],
				entityId: account,
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
		timestamp: parseNumberField(
			meta.timestamp,
			{
				path: "$.positions[0].subAccount.timestamp",
				entityId: account,
				errors,
				source: "accountV3",
			},
		),
		account,
		owner: parseAddressField(
			meta.owner,
			{
				path: "$.positions[0].subAccount.owner",
				entityId: account,
				errors,
				source: "accountV3",
				fallback: account,
				fallbackLabel: "account address",
			},
		),
		lastAccountStatusCheckTimestamp: parseNumberField(
			meta.lastAccountStatusCheckTimestamp,
			{
				path: "$.positions[0].subAccount.lastAccountStatusCheckTimestamp",
				entityId: account,
				errors,
				source: "accountV3",
			},
		),
		enabledControllers: parseAddressArrayField(
			meta.enabledControllers,
			{
				path: "$.positions[0].subAccount.enabledControllers",
				entityId: account,
				errors,
				source: "accountV3",
			},
		),
		enabledCollaterals: parseAddressArrayField(
			meta.enabledCollaterals,
			{
				path: "$.positions[0].subAccount.enabledCollaterals",
				entityId: account,
				errors,
				source: "accountV3",
			},
		),
		positions,
		isLockdownMode: parseBooleanField(
			meta.isLockdownMode,
			{
				path: "$.positions[0].subAccount.isLockdownMode",
				entityId: account,
				errors,
				source: "accountV3",
			},
		),
		isPermitDisabledMode: parseBooleanField(
			meta.isPermitDisabledMode,
			{
				path: "$.positions[0].subAccount.isPermitDisabledMode",
				entityId: account,
				errors,
				source: "accountV3",
			},
		),
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
		forceFresh?: boolean,
	): Promise<V3PositionsResponse> => {
		const url = this.buildPositionsUrl(endpoint, chainId, address, forceFresh);

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
			const account = parseAddressField(
				row.account,
				{
					path: `$.positions[${index}].account`,
					entityId: getAddress(address),
					errors,
					source: "accountV3",
					fallback: getAddress(address),
					fallbackLabel: "requested account address",
				},
			);
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

		return {
			result: {
				chainId,
				owner: getAddress(address),
				isLockdownMode: primarySubAccount?.isLockdownMode ?? false,
				isPermitDisabledMode: primarySubAccount?.isPermitDisabledMode ?? false,
				subAccounts,
			},
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
				parseAddressField(
					row.account,
					{
						path: `$.positions[${index}].account`,
						entityId: normalizedSubAccount,
						errors,
						source: "accountV3",
						fallback: normalizedSubAccount,
						fallbackLabel: "requested sub-account address",
					},
				) === normalizedSubAccount,
		);
		if (subAccountRows.length === 0)
			return { result: undefined, errors: compressDataIssues(errors) };

		const filteredRows = vaults.length
			? subAccountRows.filter((row, index) =>
					vaults.some(
						(vault) =>
							getAddress(vault) ===
								parseAddressField(
									row.vault,
									{
										path: `$.positions[${index}].vault`,
										entityId: normalizedSubAccount,
										errors,
										source: "accountV3",
									},
								),
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
			const response = await this.queryV3AccountPositions(
				this.config.endpoint,
				chainId,
				getAddress(address),
				this.config.forceFresh,
			);
			return response.data ?? [];
		} catch (error) {
			errors.push({
				code: "SOURCE_UNAVAILABLE",
				severity: "error",
				message: `Failed to fetch account positions for ${getAddress(address)}.`,
				paths: ["$"],
				entityId: getAddress(address),
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
		forceFresh?: boolean,
	): string {
		const path = `/v3/accounts/${address}/positions`;
		const params = new URLSearchParams({ chainId: String(chainId) });
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
