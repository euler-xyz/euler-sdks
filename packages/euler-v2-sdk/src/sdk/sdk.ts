import { AccountService } from "../services/accountService.js";
import { DeploymentService } from "../services/deploymentService.js";
import { EVaultService } from "../services/eVaultService/eVaultService.js";
import { EulerEarnService } from "../services/eulerEarnService/eulerEarnService.js";
import { ProviderService } from "../services/providerService.js";
import { IABIService } from "../services/abiService.js";
import { EulerLabelsService } from "../services/eulerLabelsService.js";

export class EulerSDK {
  constructor(
    public readonly accountService: AccountService,
    public readonly eVaultService: EVaultService,
    public readonly eulerEarnService: EulerEarnService,
    public readonly deploymentService: DeploymentService,
    public readonly providerService: ProviderService,
    public readonly abiService: IABIService,
    public readonly eulerLabelsService: EulerLabelsService,
  ) {}
}