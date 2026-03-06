import { decodeOracleInfo, OracleInfo, OraclePrice } from "../../../../utils/oracle.js";
import { IEVault, EVaultFees, EVaultHooks, EVaultCaps, EVaultLiquidation, InterestRates, InterestRateModel, EVaultCollateral, EVaultCollateralRamping, EVaultHookedOperations } from "../../../../entities/EVault.js";
import { Token, VaultType } from "../../../../utils/types.js";
import { VaultInfoFull, AssetPriceInfo, InterestRateModelType, InterestRateModelDetailedInfo } from "./eVaultLensTypes.js";
import { formatUnits, type Hex, zeroAddress } from "viem";
import { decodeIRMParams } from "../../../../utils/irm.js";
import {
  type DataIssue,
} from "../../../../utils/entityDiagnostics.js";
import {
  bigintToSafeNumber,
  bigintToScaledNumber,
} from "../../../../utils/normalization.js";

/**
 * Converts VaultLens's VaultInfoFull object to an IEVault object
 * @param vaultInfo - The VaultInfoFull object to convert
 * @param chainId - The chain ID
 * @returns The IEVault object
 */
export function convertVaultInfoFullToIEVault(
  vaultInfo: VaultInfoFull,
  chainId: number,
  errors: DataIssue[]
): IEVault {
  const vaultEntityId = vaultInfo.vault;
  const oracle: OracleInfo = {
    oracle: vaultInfo.oracleInfo.oracle,
    name: vaultInfo.oracleInfo.name,
    adapters: decodeOracleInfo(vaultInfo.oracleInfo),
  };

  const shares: Token = {
    address: vaultInfo.vault,
    name: vaultInfo.vaultName,
    symbol: vaultInfo.vaultSymbol,
    decimals: bigintToSafeNumber(vaultInfo.vaultDecimals, {
      path: "$.shares.decimals",
      errors,
      source: "vaultLens",
      entityId: vaultEntityId,
    }),
  };

  const asset: Token = {
    address: vaultInfo.asset,
    name: vaultInfo.assetName,
    symbol: vaultInfo.assetSymbol,
    decimals: bigintToSafeNumber(vaultInfo.assetDecimals, {
      path: "$.asset.decimals",
      errors,
      source: "vaultLens",
      entityId: vaultEntityId,
    }),
  };

  const unitOfAccount: Token = {
    address: vaultInfo.unitOfAccount,
    name: vaultInfo.unitOfAccountName,
    symbol: vaultInfo.unitOfAccountSymbol,
    decimals: bigintToSafeNumber(vaultInfo.unitOfAccountDecimals, {
      path: "$.unitOfAccount.decimals",
      errors,
      source: "vaultLens",
      entityId: vaultEntityId,
    }),
  };

  const fees: EVaultFees = {
    interestFee: convertFrom1e4(vaultInfo.interestFee, "$.fees.interestFee", errors, vaultEntityId),
    accumulatedFeesShares: vaultInfo.accumulatedFeesShares,
    accumulatedFeesAssets: vaultInfo.accumulatedFeesAssets,
    governorFeeReceiver: vaultInfo.governorFeeReceiver,
    protocolFeeReceiver: vaultInfo.protocolFeeReceiver,
    protocolFeeShare: convertFrom1e4(vaultInfo.protocolFeeShare, "$.fees.protocolFeeShare", errors, vaultEntityId),
  };

  const hooks: EVaultHooks = {
    hookedOperations: convertHooks(vaultInfo.hookedOperations),
    hookTarget: vaultInfo.hookTarget,
  };

  const caps: EVaultCaps = {
    supplyCap: vaultInfo.supplyCap,
    borrowCap: vaultInfo.borrowCap,
  };

  const configFlags = convertConfigFlags(vaultInfo.configFlags);
  const liquidation: EVaultLiquidation = {
    maxLiquidationDiscount: convertFrom1e4(
      vaultInfo.maxLiquidationDiscount,
      "$.liquidation.maxLiquidationDiscount",
      errors,
      vaultEntityId
    ),
    liquidationCoolOffTime: bigintToSafeNumber(vaultInfo.liquidationCoolOffTime, {
      path: "$.liquidation.liquidationCoolOffTime",
      errors,
      source: "vaultLens",
      entityId: vaultEntityId,
    }),
    socializeDebt: configFlags.socializeDebt,
  };

  // Extract interest rates from irmInfo
  // Use the first interest rate info if available, or default values
  const interestRateInfo = vaultInfo.irmInfo.interestRateInfo[0];
  const interestRates: InterestRates = interestRateInfo
    ? {
        borrowSPY: formatUnits(interestRateInfo.borrowSPY, 27),
        borrowAPY: formatUnits(interestRateInfo.borrowAPY, 27),
        supplyAPY: formatUnits(interestRateInfo.supplyAPY, 27),
      }
    : {
        borrowSPY: "0",
        borrowAPY: "0",
        supplyAPY: "0",
      };

  const interestRateModel = convertInterestRateModel(
    vaultInfo.irmInfo.interestRateModelInfo,
    errors,
    vaultEntityId
  );

  const vaultTimestamp = bigintToSafeNumber(vaultInfo.timestamp, {
    path: "$.timestamp",
    errors,
    source: "vaultLens",
    entityId: vaultEntityId,
  });

  // Convert collaterals
  const collaterals: EVaultCollateral[] = [];
  for (let idx = 0; idx < vaultInfo.collateralLTVInfo.length; idx += 1) {
    const ltvInfo = vaultInfo.collateralLTVInfo[idx]!;
    const isRemovedCollateral = ltvInfo.borrowLTV === 0n
      && ltvInfo.liquidationLTV === 0n
      && ltvInfo.targetTimestamp < vaultInfo.timestamp;

    if (isRemovedCollateral) continue;

    const outputIndex = collaterals.length;
    const priceInfo = vaultInfo.collateralPriceInfo[idx];
    const oraclePriceRaw = priceInfo
      ? convertAssetPriceInfoToOraclePrice(
          priceInfo,
          `$.collaterals[${outputIndex}].oraclePriceRaw`,
          errors,
          ltvInfo.collateral
        )
      : {
          queryFailure: true,
          queryFailureReason: "0x" as Hex,
          amountIn: 0n,
          amountOutMid: 0n,
          amountOutBid: 0n,
          amountOutAsk: 0n,
          timestamp: 0,
        };
    if (!priceInfo) {
      errors.push({
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral price info; default zero-price placeholder applied.",
        path: `$.collaterals[${outputIndex}].oraclePriceRaw`,
        entityId: ltvInfo.collateral,
        source: "vaultLens",
        normalizedValue: "queryFailure:true",
      });
    }

    const targetTimestamp = bigintToSafeNumber(ltvInfo.targetTimestamp, {
      path: `$.collaterals[${outputIndex}].ramping.targetTimestamp`,
      errors,
      source: "vaultLens",
      entityId: ltvInfo.collateral,
    });
    const isRamping = targetTimestamp > vaultTimestamp;

    const collateral: EVaultCollateral = {
      address: ltvInfo.collateral,
      borrowLTV: convertFrom1e4(
        ltvInfo.borrowLTV,
        `$.collaterals[${outputIndex}].borrowLTV`,
        errors,
        ltvInfo.collateral
      ),
      liquidationLTV: convertFrom1e4(
        ltvInfo.liquidationLTV,
        `$.collaterals[${outputIndex}].liquidationLTV`,
        errors,
        ltvInfo.collateral
      ),
      oraclePriceRaw,
    };

    if (isRamping) {
      collateral.ramping = {
        initialLiquidationLTV: convertFrom1e4(
          ltvInfo.initialLiquidationLTV,
          `$.collaterals[${outputIndex}].ramping.initialLiquidationLTV`,
          errors,
          ltvInfo.collateral
        ),
        targetTimestamp,
        rampDuration: ltvInfo.rampDuration,
      };
    }

    collaterals.push(collateral);
  }

  // Convert liability price
  const hasDisabledOracle =
    vaultInfo.oracleInfo.oracle.toLowerCase() === zeroAddress.toLowerCase();
  const oraclePriceRaw = convertAssetPriceInfoToOraclePrice(
    vaultInfo.liabilityPriceInfo,
    "$.oraclePriceRaw",
    errors,
    vaultInfo.asset,
    {
      suppressQueryFailureIssue: hasDisabledOracle,
    }
  );

  const result: IEVault = {
    type: VaultType.EVault,
    chainId,
    address: vaultInfo.vault,
    shares,
    asset,
    unitOfAccount,
    totalShares: vaultInfo.totalShares,
    totalCash: vaultInfo.totalCash,
    totalBorrowed: vaultInfo.totalBorrowed,
    totalAssets: vaultInfo.totalAssets,
    creator: vaultInfo.creator,
    governorAdmin: vaultInfo.governorAdmin,
    dToken: vaultInfo.dToken,
    balanceTracker: vaultInfo.balanceTracker,
    fees,
    hooks,
    caps,
    liquidation,
    evcCompatibleAsset: configFlags.evcCompatibleAsset,
    oracle,
    interestRates,
    interestRateModel,
    collaterals,
    oraclePriceRaw,
    timestamp: vaultTimestamp,
  };
  return result;
}


/**
 * Converts InterestRateModelDetailedInfo to InterestRateModel
 * @param irmInfo - The InterestRateModelDetailedInfo from the lens
 * @returns The decoded InterestRateModel
 */
function convertInterestRateModel(
  irmInfo: InterestRateModelDetailedInfo,
  errors: DataIssue[],
  entityId?: string
): InterestRateModel {
  const { interestRateModel: address, interestRateModelType: type, interestRateModelParams: params } = irmInfo;
  let decodedParams: InterestRateModel["data"] = null;

  if (type !== InterestRateModelType.UNKNOWN && params) {
    try {
      decodedParams = decodeIRMParams(type, params);
    } catch (error) {
      // If decoding fails, keep params as null
      errors.push({
        code: "DECODE_FAILED",
        severity: "warning",
        message: `Failed to decode IRM params for type ${type}; data set to null.`,
        path: "$.interestRateModel.data",
        source: "vaultLens",
        entityId,
        originalValue: error instanceof Error ? error.message : String(error),
        normalizedValue: null,
      });
    }
  }

  return {
    address,
    type,
    data: decodedParams,
  };
}

function convertAssetPriceInfoToOraclePrice(
  priceInfo: AssetPriceInfo,
  path: string,
  errors: DataIssue[],
  entityId?: string,
  options?: {
    suppressQueryFailureIssue?: boolean;
  }
): OraclePrice {
  if (priceInfo.queryFailure && !options?.suppressQueryFailureIssue) {
    errors.push({
      code: "SOURCE_UNAVAILABLE",
      severity: "warning",
      message: "Oracle price query reported failure.",
      path,
      source: "vaultLens",
      entityId,
      originalValue: priceInfo.queryFailureReason,
      normalizedValue: "queryFailure:true",
    });
  }
  return {
    queryFailure: priceInfo.queryFailure,
    queryFailureReason: priceInfo.queryFailureReason,
    amountIn: priceInfo.amountIn,
    amountOutMid: priceInfo.amountOutMid,
    amountOutBid: priceInfo.amountOutBid,
    amountOutAsk: priceInfo.amountOutAsk,
    timestamp: bigintToSafeNumber(priceInfo.timestamp, {
      path: `${path}.timestamp`,
      errors,
      source: "vaultLens",
      entityId,
    }),
  };
}

const MAX_1E4 = 10n**4n;
/**
 * Converts a value from 1e4 scale (where 1e4 = 100%) to a number
 * @param value - The bigint value in 1e4 scale
 * @returns The number value (value / 1e4)
 */
function convertFrom1e4(
  value: bigint,
  path: string,
  errors: DataIssue[],
  entityId?: string
): number {
  return bigintToScaledNumber(value, {
    path,
    errors,
    source: "vaultLens",
    entityId,
    scale: 1e4,
    maxUnscaled: MAX_1E4,
    overflowMessage: "Value exceeded 1e4 scale and was clamped.",
  });
}

/**
 * EVault operations enum matching Constants.sol
 * Each operation is represented as a bit flag (1 << bit_position)
 */
enum EVaultOperationBitFlags {
  deposit = 1 << 0,
  mint = 1 << 1,
  withdraw = 1 << 2,
  redeem = 1 << 3,
  transfer = 1 << 4,
  skim = 1 << 5,
  borrow = 1 << 6,
  repay = 1 << 7,
  repayWithShares = 1 << 8,
  pullDebt = 1 << 9,
  convertFees = 1 << 10,
  liquidate = 1 << 11,
  flashloan = 1 << 12,
  touch = 1 << 13,
  vaultStatusCheck = 1 << 14,
}

/**
 * EVault config flags enum matching Constants.sol
 * Each flag is represented as a bit flag (1 << bit_position)
 */
enum EVaultConfigFlagBitFlags {
  dontSocializeDebt = 1 << 0, //
  evcCompatibleAsset = 1 << 1,
}

/**
 * Converts a hookedOperations bigint to an object with boolean members for each operation
 * @param hookedOperations - The bigint value representing hooked operations (bit flags)
 * @returns An object with boolean flags indicating which operations are hooked
 */
function convertHooks(hookedOperations: bigint): EVaultHookedOperations {
  const operations: EVaultHookedOperations = {
    deposit: false,
    mint: false,
    withdraw: false,
    redeem: false,
    transfer: false,
    skim: false,
    borrow: false,
    repay: false,
    repayWithShares: false,
    pullDebt: false,
    convertFees: false,
    liquidate: false,
    flashloan: false,
    touch: false,
    vaultStatusCheck: false,
  };
  
  // Check each operation bit and set the corresponding boolean
  for (const key in EVaultOperationBitFlags) {
    const value = EVaultOperationBitFlags[key as keyof typeof EVaultOperationBitFlags];
    // Only process numeric values (skip string keys)
    if (typeof value === 'number') {
      const opValue = BigInt(value);
      if ((hookedOperations & opValue) !== 0n) {
        operations[key as keyof EVaultHookedOperations] = true;
      }
    }
  }

  return operations;
}


/**
 * Converts a configFlags bigint to an object with boolean members for each config flag
 * @param configFlags - The bigint value representing config flags (bit flags)
 * @returns An object with boolean flags indicating which config flags are set
 */
function convertConfigFlags(configFlags: bigint) {
  const DONT_SOCIALIZE_DEBT = BigInt(EVaultConfigFlagBitFlags.dontSocializeDebt);
  const EVC_COMPATIBLE_ASSET = BigInt(EVaultConfigFlagBitFlags.evcCompatibleAsset);

  return {
    // Invert logic: CFG_DONT_SOCIALIZE_DEBT means don't socialize, so we flip it
    socializeDebt: (configFlags & DONT_SOCIALIZE_DEBT) === 0n,
    evcCompatibleAsset: (configFlags & EVC_COMPATIBLE_ASSET) !== 0n,
  };
}
