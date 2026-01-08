import { decodeAbiParameters, type Hex } from "viem";

export enum InterestRateModelType {
  UNKNOWN = 0,
  KINK = 1,
  ADAPTIVE_CURVE = 2,
  KINKY = 3,
  FIXED_CYCLICAL_BINARY = 4,
}

export interface KinkIRMInfo {
  baseRate: bigint;
  slope1: bigint;
  slope2: bigint;
  kink: bigint;
}

export interface AdaptiveCurveIRMInfo {
  targetUtilization: bigint;
  initialRateAtTarget: bigint;
  minRateAtTarget: bigint;
  maxRateAtTarget: bigint;
  curveSteepness: bigint;
  adjustmentSpeed: bigint;
}

export interface KinkyIRMInfo {
  baseRate: bigint;
  slope: bigint;
  shape: bigint;
  kink: bigint;
  cutoff: bigint;
}

export interface FixedCyclicalBinaryIRMInfo {
  primaryRate: bigint;
  secondaryRate: bigint;
  primaryDuration: bigint;
  secondaryDuration: bigint;
  startTimestamp: bigint;
}

export type IRMParams =
  | KinkIRMInfo
  | AdaptiveCurveIRMInfo
  | KinkyIRMInfo
  | FixedCyclicalBinaryIRMInfo;

/**
 * Decodes IRM parameters from the encoded bytes returned by IRMLens.getInterestRateModelInfo
 * @param type The interest rate model type
 * @param params The encoded parameters as a hex string
 * @returns The decoded IRM parameters matching the specified type
 * @throws Error if the type is UNKNOWN or invalid
 */
export function decodeIRMParams(
  type: InterestRateModelType,
  params: Hex
): IRMParams {
  switch (type) {
    case InterestRateModelType.KINK: {
      const [baseRate, slope1, slope2, kink] = decodeAbiParameters(
        [
          { name: "baseRate", type: "uint256" },
          { name: "slope1", type: "uint256" },
          { name: "slope2", type: "uint256" },
          { name: "kink", type: "uint256" },
        ],
        params
      );
      return { baseRate, slope1, slope2, kink };
    }

    case InterestRateModelType.ADAPTIVE_CURVE: {
      const [
        targetUtilization,
        initialRateAtTarget,
        minRateAtTarget,
        maxRateAtTarget,
        curveSteepness,
        adjustmentSpeed,
      ] = decodeAbiParameters(
        [
          { name: "targetUtilization", type: "int256" },
          { name: "initialRateAtTarget", type: "int256" },
          { name: "minRateAtTarget", type: "int256" },
          { name: "maxRateAtTarget", type: "int256" },
          { name: "curveSteepness", type: "int256" },
          { name: "adjustmentSpeed", type: "int256" },
        ],
        params
      );
      return {
        targetUtilization,
        initialRateAtTarget,
        minRateAtTarget,
        maxRateAtTarget,
        curveSteepness,
        adjustmentSpeed,
      };
    }

    case InterestRateModelType.KINKY: {
      const [baseRate, slope, shape, kink, cutoff] = decodeAbiParameters(
        [
          { name: "baseRate", type: "uint256" },
          { name: "slope", type: "uint256" },
          { name: "shape", type: "uint256" },
          { name: "kink", type: "uint256" },
          { name: "cutoff", type: "uint256" },
        ],
        params
      );
      return { baseRate, slope, shape, kink, cutoff };
    }

    case InterestRateModelType.FIXED_CYCLICAL_BINARY: {
      const [
        primaryRate,
        secondaryRate,
        primaryDuration,
        secondaryDuration,
        startTimestamp,
      ] = decodeAbiParameters(
        [
          { name: "primaryRate", type: "uint256" },
          { name: "secondaryRate", type: "uint256" },
          { name: "primaryDuration", type: "uint256" },
          { name: "secondaryDuration", type: "uint256" },
          { name: "startTimestamp", type: "uint256" },
        ],
        params
      );
      return {
        primaryRate,
        secondaryRate,
        primaryDuration,
        secondaryDuration,
        startTimestamp,
      };
    }

    case InterestRateModelType.UNKNOWN:
    default:
      throw new Error(
        `Cannot decode IRM params for type: ${InterestRateModelType[type]}`
      );
  }
}
