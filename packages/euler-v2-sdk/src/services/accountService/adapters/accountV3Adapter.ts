import { type Address, getAddress } from "viem";
import type { IAccount, IAccountLiquidity, IAccountPosition, ISubAccount, DaysToLiquidation } from "../../../entities/Account.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../utils/buildQuery.js";
import { compressDataIssues, type DataIssue, type ServiceResult } from "../../../utils/entityDiagnostics.js";
import type { AccountV3AdapterConfig } from "../accountServiceConfig.js";
import type { IAccountAdapter } from "../accountService.js";

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

const parseBigIntField = (
  value: string,
  path: string,
  entityId: Address,
  errors: DataIssue[],
): bigint => {
  try {
    return BigInt(value);
  } catch {
    errors.push({
      code: "DEFAULT_APPLIED",
      severity: "warning",
      message: `Failed to parse bigint at ${path}; defaulted to 0.`,
      paths: [path],
      entityId,
      source: "accountV3",
      originalValue: value,
      normalizedValue: "0",
    });
    return 0n;
  }
};

const parseDaysToLiquidation = (
  value: number | string,
  path: string,
  entityId: Address,
  errors: DataIssue[],
): DaysToLiquidation => {
  if (value === "Infinity" || value === "MoreThanAYear") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  errors.push({
    code: "DEFAULT_APPLIED",
    severity: "warning",
    message: `Failed to parse daysToLiquidation at ${path}; defaulted to Infinity.`,
    paths: [path],
    entityId,
    source: "accountV3",
    originalValue: String(value),
    normalizedValue: "Infinity",
  });
  return "Infinity";
};

function convertAssetValue(
  value: V3AssetValue,
  path: string,
  entityId: Address,
  errors: DataIssue[],
) {
  return {
    borrowing: parseBigIntField(value.borrowing, `${path}.borrowing`, entityId, errors),
    liquidation: parseBigIntField(value.liquidation, `${path}.liquidation`, entityId, errors),
    oracleMid: parseBigIntField(value.oracleMid, `${path}.oracleMid`, entityId, errors),
  };
}

function convertLiquidity(
  liquidity: V3AccountLiquidity,
  path: string,
  entityId: Address,
  errors: DataIssue[],
): IAccountLiquidity {
  return {
    vaultAddress: getAddress(liquidity.vaultAddress),
    unitOfAccount: getAddress(liquidity.unitOfAccount),
    daysToLiquidation: parseDaysToLiquidation(liquidity.daysToLiquidation, `${path}.daysToLiquidation`, entityId, errors),
    liabilityValue: convertAssetValue(liquidity.liabilityValue, `${path}.liabilityValue`, entityId, errors),
    totalCollateralValue: convertAssetValue(
      liquidity.totalCollateralValue,
      `${path}.totalCollateralValue`,
      entityId,
      errors,
    ),
    collaterals: liquidity.collaterals.map((collateral, collateralIndex) => ({
      address: getAddress(collateral.address),
      value: convertAssetValue(
        collateral.value,
        `${path}.collaterals[${collateralIndex}].value`,
        getAddress(collateral.address),
        errors,
      ),
    })),
  };
}

function convertPosition(
  row: V3AccountPositionRow,
  positionIndex: number,
  errors: DataIssue[],
): IAccountPosition {
  const account = getAddress(row.account);
  const vaultAddress = getAddress(row.vault);
  const asset = getAddress(row.asset);
  const path = `$.positions[${positionIndex}]`;

  return {
    account,
    vaultAddress,
    asset,
    shares: parseBigIntField(row.shares, `${path}.shares`, vaultAddress, errors),
    assets: parseBigIntField(row.assets, `${path}.assets`, vaultAddress, errors),
    borrowed: parseBigIntField(row.borrowed, `${path}.borrowed`, vaultAddress, errors),
    isController: row.isController,
    isCollateral: row.isCollateral,
    balanceForwarderEnabled: row.balanceForwarderEnabled,
    liquidity: row.liquidity
      ? convertLiquidity(row.liquidity, `${path}.liquidity`, vaultAddress, errors)
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

  const positions = rows.map((row, positionIndex) => convertPosition(row, positionIndex, errors));

  return {
    timestamp: meta.timestamp,
    account,
    owner: getAddress(meta.owner),
    lastAccountStatusCheckTimestamp: meta.lastAccountStatusCheckTimestamp,
    enabledControllers: meta.enabledControllers.map((value) => getAddress(value)),
    enabledCollaterals: meta.enabledCollaterals.map((value) => getAddress(value)),
    positions,
    isLockdownMode: meta.isLockdownMode,
    isPermitDisabledMode: meta.isPermitDisabledMode,
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

  queryAccountPositions = async (
    endpoint: string,
    chainId: number,
    address: Address,
    forceFresh?: boolean,
  ): Promise<V3PositionsResponse> => {
    const url = this.buildPositionsUrl(endpoint, chainId, address, forceFresh);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    console.log('response: ', response);
    if (!response.ok) {
      throw new Error(`accountV3 ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<V3PositionsResponse>;
  };

  setQueryAccountPositions(fn: typeof this.queryAccountPositions): void {
    this.queryAccountPositions = fn;
  }

  async fetchAccount(chainId: number, address: Address): Promise<ServiceResult<IAccount | undefined>> {
    console.log('fetchAccount 111: ', chainId, address);
    const errors: DataIssue[] = [];
    const rows = await this.fetchPositions(chainId, address, errors);
    if (rows.length === 0) return { result: undefined, errors };

    const rowsByAccount = new Map<Address, V3AccountPositionRow[]>();
    for (const row of rows) {
      const account = getAddress(row.account);
      const list = rowsByAccount.get(account) ?? [];
      list.push(row);
      rowsByAccount.set(account, list);
    }

    const subAccountsArray = [...rowsByAccount.entries()].map(([account, accountRows]) =>
      buildSubAccount(chainId, account, accountRows, errors),
    );

    const subAccounts = subAccountsArray.reduce<Record<Address, ISubAccount>>((acc, subAccount) => {
      const { isLockdownMode: _lockdown, isPermitDisabledMode: _permitDisabled, ...rest } = subAccount;
      acc[getAddress(subAccount.account)] = rest;
      return acc;
    }, {});

    const primarySubAccount =
      subAccountsArray.find((subAccount) => subAccount.account === subAccount.owner) ?? subAccountsArray[0];

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
    if (rows.length === 0) return { result: undefined, errors: compressDataIssues(errors) };

    const normalizedSubAccount = getAddress(subAccount);
    const subAccountRows = rows.filter((row) => getAddress(row.account) === normalizedSubAccount);
    if (subAccountRows.length === 0) return { result: undefined, errors: compressDataIssues(errors) };

    const filteredRows = vaults.length
      ? subAccountRows.filter((row) => vaults.some((vault) => getAddress(vault) === getAddress(row.vault)))
      : subAccountRows;

    const built = buildSubAccount(chainId, normalizedSubAccount, filteredRows, errors);
    const { isLockdownMode: _lockdown, isPermitDisabledMode: _permitDisabled, ...result } = built;

    return {
      result,
      errors: compressDataIssues(errors),
    };
  }

  private async fetchPositions(chainId: number, address: Address, errors: DataIssue[]): Promise<V3AccountPositionRow[]> {
    try {
      const response = await this.queryAccountPositions(
        this.config.endpoint,
        chainId,
        getAddress(address),
        this.config.forceFresh,
      );
      console.log('response: ', response);
      return response.data ?? [];
    } catch (error) {
      console.log('error: ', error);
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
    const joined = normalizedEndpoint.startsWith("http://") || normalizedEndpoint.startsWith("https://")
      ? new URL(path, `${normalizedEndpoint}/`).toString()
      : `${normalizedEndpoint}${path}`;

    return `${joined}?${params.toString()}`;
  }
}
