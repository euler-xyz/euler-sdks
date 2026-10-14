import type { Address } from "viem";
import type { BuildQueryFn } from "../../utils/buildQuery.js";

/**
 * `staging`: being launched. `production`: live and public. `unlisted`: live
 * contracts and indexing for partners, not offered in Euler apps.
 * `deprecated`: winding down, exits only.
 */
export type EulerChainStatus =
	| "staging"
	| "production"
	| "unlisted"
	| "deprecated";

const EULER_CHAIN_STATUSES: ReadonlySet<string> = new Set<EulerChainStatus>([
	"staging",
	"production",
	"unlisted",
	"deprecated",
]);

export interface Deployment {
	chainId: number;
	name: string;
	viemName?: string;
	safeBaseUrl?: string;
	safeAddressPrefix?: string;
	status: EulerChainStatus;
	/** Block explorer web origin without a trailing slash, e.g. `https://etherscan.io`. */
	explorerUrl?: string;
	addresses: {
		bridgeAddrs?: {
			eulOFTAdapter?: Address;
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
			escrowedCollateralPerspective?: Address;
			eulerEarnFactoryPerspective?: Address;
			eulerEarnPublicAllocator?: Address;
			evkFactoryPerspective?: Address;
			feeFlowController?: Address;
			feeFlowControllerUtil?: Address;
			fixedCyclicalBinaryIRMFactory?: Address;
			governorAccessControlEmergencyFactory?: Address;
			kinkIRMFactory?: Address;
			kinkyIRMFactory?: Address;
			oracleRouterFactory?: Address;
			securitizeFactory?: Address;
			swapVerifier?: Address;
			swapper?: Address;
			termsOfUseSigner?: Address;
		};
		tokenAddrs?: {
			EUL?: Address;
			rEUL?: Address;
		};
	};
}

export type Deployments = Record<number, Deployment>;

/** An `EulerChains.json` row as published, before status and explorer normalization. */
export type DeploymentInput = Omit<Deployment, "status" | "explorerUrl"> & {
	status?: string;
	explorerUrl?: string;
};

export function normalizeChainStatus(status: unknown): EulerChainStatus {
	if (status === "testing") return "staging";
	if (typeof status === "string" && EULER_CHAIN_STATUSES.has(status)) {
		return status as EulerChainStatus;
	}
	return "unlisted";
}

export function normalizeExplorerUrl(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim().replace(/\/+$/, "");
	if (!trimmed.startsWith("https://")) return undefined;
	try {
		return new URL(trimmed).hostname ? trimmed : undefined;
	} catch {
		return undefined;
	}
}

export function normalizeDeployment(input: DeploymentInput): Deployment {
	const { status, explorerUrl, ...rest } = input;
	const normalizedExplorerUrl = normalizeExplorerUrl(explorerUrl);
	return {
		...rest,
		status: normalizeChainStatus(status),
		...(normalizedExplorerUrl ? { explorerUrl: normalizedExplorerUrl } : {}),
	};
}

export interface IDeploymentService {
	getDeploymentChainIds(): number[];
	getDeployment(chainId: number): Deployment;
	addDeployment(deployment: DeploymentInput): void;
}

export interface DeploymentServiceConfig {
	deploymentsUrl: string;
}

export class DeploymentService implements IDeploymentService {
	private deployments: Deployments;

	static queryDeployments = async (url: string): Promise<DeploymentInput[]> => {
		if (!url) {
			throw new Error("Deployments URL is required");
		}
		const response = await fetch(url);
		const data = await response.json();
		if (!Array.isArray(data)) {
			throw new Error("Invalid deployment data format");
		}
		return data as DeploymentInput[];
	};

	static setQueryDeployments(
		fn: typeof DeploymentService.queryDeployments,
	): void {
		DeploymentService.queryDeployments = fn;
	}

	static async build(
		deploymentServiceConfig: DeploymentServiceConfig,
		buildQuery?: BuildQueryFn,
	): Promise<DeploymentService> {
		const queryFn = buildQuery
			? buildQuery("queryDeployments", DeploymentService.queryDeployments, {})
			: DeploymentService.queryDeployments;
		const data = await queryFn(deploymentServiceConfig.deploymentsUrl);
		return new DeploymentService(
			Object.fromEntries(
				data.map((deployment) => [deployment.chainId, deployment]),
			),
		);
	}

	constructor(deployments: Record<number, DeploymentInput>) {
		this.deployments = Object.fromEntries(
			Object.entries(deployments).map(([chainId, deployment]) => [
				chainId,
				normalizeDeployment(deployment),
			]),
		);
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

	addDeployment(deployment: DeploymentInput): void {
		this.deployments = {
			...this.deployments,
			[deployment.chainId]: normalizeDeployment(deployment),
		};
	}
}
