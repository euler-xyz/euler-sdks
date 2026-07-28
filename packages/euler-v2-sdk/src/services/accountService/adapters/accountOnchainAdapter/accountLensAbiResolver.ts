import type { Abi, Address } from "viem";
import type { IABIService } from "../../../abiService/index.js";
import type { Deployment } from "../../../deploymentService/index.js";
import { accountLensAbi } from "./abis/accountLensAbi.js";

export async function resolveAccountLensAbi(
	abiService: IABIService | undefined,
	deployment: Deployment,
	accountLensAddress: Address,
	accountLensAbiRef?: string,
): Promise<Abi> {
	if (abiService && accountLensAbiRef) {
		return abiService.fetchABI(deployment.chainId, accountLensAbiRef);
	}

	if (
		!abiService ||
		!deployment.abiRefs?.accountLens ||
		deployment.addresses.lensAddrs.accountLens.toLowerCase() !==
			accountLensAddress.toLowerCase()
	) {
		return accountLensAbi as unknown as Abi;
	}

	return abiService.fetchABI(
		deployment.chainId,
		deployment.abiRefs.accountLens,
	);
}
