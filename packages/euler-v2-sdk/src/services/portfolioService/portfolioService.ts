import type { Address } from "viem";
import { Portfolio } from "../../entities/Portfolio.js";
import type { PortfolioOptions } from "../../entities/Portfolio.js";
import type {
	Account,
	IHasVaultAddress,
	IVaultEntity,
} from "../../entities/Account.js";
import type { IAccountService } from "../accountService/index.js";
import type { ServiceResult } from "../../utils/entityDiagnostics.js";

export interface IPortfolioService<
	TVaultEntity extends IHasVaultAddress = IVaultEntity,
> {
	fetchPortfolio(
		chainId: number,
		address: Address,
		options?: PortfolioOptions<TVaultEntity>,
	): Promise<ServiceResult<Portfolio<TVaultEntity>>>;
	buildPortfolio(
		account: Account<TVaultEntity>,
		options?: PortfolioOptions<TVaultEntity>,
	): Portfolio<TVaultEntity>;
}

export class PortfolioService<
	TVaultEntity extends IHasVaultAddress = IVaultEntity,
> implements IPortfolioService<TVaultEntity>
{
	constructor(private accountService: IAccountService<TVaultEntity>) {}

	setAccountService(accountService: IAccountService<TVaultEntity>): void {
		this.accountService = accountService;
	}

	async fetchPortfolio(
		chainId: number,
		address: Address,
		options?: PortfolioOptions<TVaultEntity>,
	): Promise<ServiceResult<Portfolio<TVaultEntity>>> {
		const fetched = await this.accountService.fetchAccount(
			chainId,
			address,
			{ populateAll: true },
		);

		return {
			result: new Portfolio(fetched.result, options),
			errors: fetched.errors,
		};
	}

	buildPortfolio(
		account: Account<TVaultEntity>,
		options?: PortfolioOptions<TVaultEntity>,
	): Portfolio<TVaultEntity> {
		return new Portfolio(account, options);
	}
}
