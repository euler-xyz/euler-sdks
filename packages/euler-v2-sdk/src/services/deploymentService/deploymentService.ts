import { Address } from "viem";
import { config } from "../../config.js";

export interface Deployment {
  chainId: number;
  name: string;
  viemName?: string;
  safeBaseUrl?: string;
  safeAddressPrefix?: string;
  status: string;
  addresses: {
    bridgeAddrs?: {
      eulOFTAdapter?: Address;
      eusdOFTAdapter?: Address;
      seusdOFTAdapter?: Address;
    };
    coreAddrs: {
      balanceTracker: Address;
      eVaultFactory: Address;
      eVaultImplementation: Address;
      eulerEarnFactory: Address;
      evc: Address;
      permit2: Address;
      protocolConfig: Address;
      sequenceRegistry: Address;
    };
    eulerSwapAddrs?: {
      eulerSwapV1Factory?: Address;
      eulerSwapV1Implementation?: Address;
      eulerSwapV1Periphery?: Address;
      eulerSwapV2Factory?: Address;
      eulerSwapV2Implementation?: Address;
      eulerSwapV2Periphery?: Address;
      eulerSwapV2ProtocolFeeConfig?: Address;
      eulerSwapV2Registry?: Address;
    };
    governorAddrs?: {
      accessControlEmergencyGovernor?: Address;
      accessControlEmergencyGovernorAdminTimelockController?: Address;
      accessControlEmergencyGovernorWildcardTimelockController?: Address;
      capRiskSteward?: Address;
      eUSDAdminTimelockController?: Address;
      eVaultFactoryGovernor?: Address;
      eVaultFactoryTimelockController?: Address;
    };
    lensAddrs: {
      accountLens: Address;
      eulerEarnVaultLens: Address;
      irmLens: Address;
      oracleLens: Address;
      utilsLens: Address;
      vaultLens: Address;
    };
    multisigAddrs?: {
      DAO?: Address;
      labs?: Address;
      securityCouncil?: Address;
      securityPartnerA?: Address;
      securityPartnerB?: Address;
      gauntlet?: Address;
      riskSteward?: Address;
    };
    peripheryAddrs?: {
      adaptiveCurveIRMFactory?: Address;
      capRiskStewardFactory?: Address;
      edgeFactory?: Address;
      edgeFactoryPerspective?: Address;
      escrowedCollateralPerspective?: Address;
      eulerEarnFactoryPerspective?: Address;
      eulerEarnGovernedPerspective?: Address;
      eulerEarnPublicAllocator?: Address;
      eulerUngoverned0xPerspective?: Address;
      eulerUngovernedNzxPerspective?: Address;
      evkFactoryPerspective?: Address;
      externalVaultRegistry?: Address;
      feeCollector?: Address;
      feeFlowController?: Address;
      feeFlowControllerUtil?: Address;
      fixedCyclicalBinaryIRMFactory?: Address;
      governedPerspective?: Address;
      governorAccessControlEmergencyFactory?: Address;
      irmRegistry?: Address;
      kinkIRMFactory?: Address;
      kinkyIRMFactory?: Address;
      oracleAdapterRegistry?: Address;
      oracleRouterFactory?: Address;
      swapVerifier?: Address;
      swapper?: Address;
      termsOfUseSigner?: Address;
    };
    tokenAddrs?: {
      EUL?: Address;
      eUSD?: Address;
      rEUL?: Address;
      seUSD?: Address;
    };
  };
}

export type Deployments = Record<number, Deployment>;

export interface IDeploymentService {
  getDeploymentChainIds(): number[];
  getDeployment(chainId: number): Deployment;
  addDeployment(deployment: Deployment): void;
}

export class DeploymentService implements IDeploymentService {
  private deployments: Deployments;

  static async build(): Promise<DeploymentService> {
    const deployments = await fetchDeployments();
    return new DeploymentService(deployments);
  }

  constructor(deployments: Deployments) {
    this.deployments = deployments;
  }

  getDeploymentChainIds(): number[] {
    return Object.keys(this.deployments).map(Number);
  }

  getDeployment(chainId: number): Deployment {
    if (!this.deployments[chainId]) {
      throw new Error(`Deployment not found for chainId: ${chainId}`);
    }
    return this.deployments[chainId];
  }

  addDeployment(deployment: Deployment): void {
    this.deployments[deployment.chainId] = deployment;
  }
}

async function fetchDeployments(url: string = config.DEPLOYMENTS_URL): Promise<Deployments> {
  if (!url) {
    throw new Error('Deployments URL is required');
  }
  const response = await fetch(url);
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Invalid deployment data format');
  }
  return data.reduce((acc: Record<number, Deployment>, deployment: Deployment) => {
    acc[deployment.chainId] = deployment;
        return acc;
      }, {});
}
