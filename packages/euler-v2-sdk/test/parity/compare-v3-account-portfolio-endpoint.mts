/**
 * Compare the V3 account portfolio endpoint against SDK portfolioService.fetchPortfolio().
 *
 * The account set defaults to test/fixtures/generated/fetch-accounts-mainnet.json.
 *
 * Usage:
 *   pnpm exec tsx test/parity/compare-v3-account-portfolio-endpoint.mts
 *
 * Environment variables:
 *   V3_HOST                  - V3 API host. Defaults to https://v3staging.eul.dev.
 *   CHAIN_ID                 - Chain ID. Defaults to 1.
 *   ACCOUNT_LIMIT            - Optional cap for a smaller run.
 *   ACCOUNT_LIST_FILE        - Optional newline-delimited account list.
 *   REPORT_PREFIX            - Output file prefix.
 *   BIGINT_RELATIVE_TOLERANCE - Relative tolerance for integer strings. Defaults to 0.000001.
 *   NUMBER_TOLERANCE         - Absolute tolerance for floating point fields. Defaults to 1e-9.
 *   NORMALIZE_KNOWN_UNITS    - Set true to normalize SDK v3 rate and LTV representation differences.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress, isAddress, type Address } from "viem";

import { buildEulerSDK } from "../../src/sdk/buildSDK.js";

const ROOT = resolve(import.meta.dirname, "../..");
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 1);
const V3_HOST = process.env.V3_HOST ?? "https://v3staging.eul.dev";
const REPORT_PREFIX =
	process.env.REPORT_PREFIX ?? "v3-account-portfolio-endpoint-parity";
const ACCOUNT_LIMIT = process.env.ACCOUNT_LIMIT
	? Number(process.env.ACCOUNT_LIMIT)
	: undefined;
const ACCOUNT_LIST_FILE = process.env.ACCOUNT_LIST_FILE;
const BIGINT_RELATIVE_TOLERANCE = Number(
	process.env.BIGINT_RELATIVE_TOLERANCE ?? 0.000001,
);
const NUMBER_TOLERANCE = Number(process.env.NUMBER_TOLERANCE ?? 1e-9);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);
const NORMALIZE_KNOWN_UNITS =
	process.env.NORMALIZE_KNOWN_UNITS?.toLowerCase() === "true";
const RPC_URL =
	process.env.RPC_URL_1 ??
	process.env.MAINNET_RPC_URL ??
	"https://ethereum-rpc.publicnode.com";

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

type Issue = {
	account: Address;
	path: string;
	reason: string;
	endpoint: JsonValue | undefined;
	sdk: JsonValue | undefined;
};

type AccountResult = {
	account: Address;
	endpointErrors: number;
	sdkErrors: number;
	issues: Issue[];
};

const PORTFOLIO_FIELD_MAP = {
	account: "account",
	populated: "account.populated",
	positions: "portfolio.positions",
	savings: "portfolio.savings",
	borrows: "portfolio.borrows",
	totalSuppliedValueUsd: "portfolio.totals.suppliedValueUsd",
	totalBorrowedValueUsd: "portfolio.totals.borrowedValueUsd",
	netAssetValueUsd: "portfolio.totals.netAssetValueUsd",
	netApy: "portfolio.totals.netApy",
	roe: "portfolio.totals.roe",
	apyBreakdown: "portfolio.totals.apyBreakdown",
	roeBreakdown: "portfolio.totals.roeBreakdown",
	totalRewardsValueUsd: "portfolio.totals.rewardsValueUsd",
} as const;

const SAVINGS_FIELDS = [
	"position",
	"vault",
	"subAccount",
	"shares",
	"assets",
	"suppliedValueUsd",
	"apy",
	"apyBreakdown",
] as const;

const BORROW_FIELDS = [
	"borrow",
	"collaterals",
	"collateral",
	"borrowVault",
	"collateralVault",
	"collateralVaults",
	"subAccount",
	"health",
	"healthFactor",
	"userLTV",
	"currentLTV",
	"borrowed",
	"supplied",
	"price",
	"primaryCollateralLiquidationPrice",
	"borrowLiquidationPriceUsd",
	"collateralLiquidationPricesUsd",
	"liquidatable",
	"borrowLTV",
	"liquidationLTV",
	"accountLiquidationLTV",
	"liabilityValueBorrowing",
	"liabilityValueLiquidation",
	"liabilityValueUsd",
	"totalCollateralValueUsd",
	"collateralValueLiquidation",
	"timeToLiquidation",
	"multiplier",
	"netApy",
	"roe",
	"apyBreakdown",
	"roeBreakdown",
] as const;

function asAddress(value: unknown): Address | undefined {
	if (typeof value !== "string") return undefined;
	try {
		return getAddress(value);
	} catch {
		return undefined;
	}
}

function bigintString(value: unknown): string | undefined {
	return typeof value === "bigint" ? value.toString() : undefined;
}

function maybeNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function clean<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(clean) as T;
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.map(([key, entry]) => [key, clean(entry)]),
	) as T;
}

function serializeVault(vault: any): JsonValue | undefined {
	if (!vault) return undefined;
	return clean({
		address: asAddress(vault.address) ?? vault.address,
		type: vault.type,
		asset: vault.asset
			? {
					address: asAddress(vault.asset.address) ?? vault.asset.address,
					symbol: vault.asset.symbol,
					decimals: vault.asset.decimals,
					name: vault.asset.name,
				}
			: undefined,
		shares: vault.shares
			? {
					address: asAddress(vault.shares.address) ?? vault.shares.address,
					symbol: vault.shares.symbol,
					decimals: vault.shares.decimals,
					name: vault.shares.name,
				}
			: undefined,
		supplyApy:
			vault.interestRates?.supplyAPY !== undefined
				? Number(vault.interestRates.supplyAPY)
				: undefined,
		borrowApy:
			vault.interestRates?.borrowAPY !== undefined
				? Number(vault.interestRates.borrowAPY)
				: undefined,
		supplyApy1h: vault.supplyApy1h,
		strategyCount: Array.isArray(vault.strategies)
			? vault.strategies.length
			: undefined,
	}) as JsonValue;
}

function serializeAssetValue(value: any): JsonValue | undefined {
	if (!value) return undefined;
	return clean({
		borrowing: bigintString(value.borrowing) ?? value.borrowing,
		liquidation: bigintString(value.liquidation) ?? value.liquidation,
		oracleMid: bigintString(value.oracleMid) ?? value.oracleMid,
	}) as JsonValue;
}

function serializePosition(position: any): JsonValue {
	return clean({
		account: asAddress(position.account) ?? position.account,
		vaultAddress: asAddress(position.vaultAddress) ?? position.vaultAddress,
		vault: serializeVault(position.vault),
		asset: asAddress(position.asset) ?? position.asset,
		shares: bigintString(position.shares) ?? position.shares,
		assets: bigintString(position.assets) ?? position.assets,
		borrowed: bigintString(position.borrowed) ?? position.borrowed,
		isController: position.isController,
		isCollateral: position.isCollateral,
		balanceForwarderEnabled: position.balanceForwarderEnabled,
		marketPriceUsd:
			bigintString(position.marketPriceUsd) ?? position.marketPriceUsd,
		suppliedValueUsd:
			bigintString(position.suppliedValueUsd) ?? position.suppliedValueUsd,
		borrowedValueUsd:
			bigintString(position.borrowedValueUsd) ?? position.borrowedValueUsd,
		liquidity: position.liquidity
			? {
					vaultAddress:
						asAddress(position.liquidity.vaultAddress) ??
						position.liquidity.vaultAddress,
					unitOfAccount:
						asAddress(position.liquidity.unitOfAccount) ??
						position.liquidity.unitOfAccount,
					daysToLiquidation: position.liquidity.daysToLiquidation,
					liabilityValue: serializeAssetValue(
						position.liquidity.liabilityValue,
					),
					totalCollateralValue: serializeAssetValue(
						position.liquidity.totalCollateralValue,
					),
					collaterals: sortByAddress(
						(position.liquidity.collaterals ?? []).map((collateral: any) =>
							clean({
								address: asAddress(collateral.address) ?? collateral.address,
								value: serializeAssetValue(collateral.value),
								marketPriceUsd:
									bigintString(collateral.marketPriceUsd) ??
									collateral.marketPriceUsd,
								valueUsd: bigintString(collateral.valueUsd) ?? collateral.valueUsd,
							}),
						),
						"address",
					),
					liabilityValueUsd:
						bigintString(position.liquidity.liabilityValueUsd) ??
						position.liquidity.liabilityValueUsd,
					totalCollateralValueUsd:
						bigintString(position.liquidity.totalCollateralValueUsd) ??
						position.liquidity.totalCollateralValueUsd,
				}
			: undefined,
		borrowLiquidationPriceUsd:
			bigintString(position.borrowLiquidationPriceUsd) ??
			position.borrowLiquidationPriceUsd,
		collateralLiquidationPricesUsd: normalizeBigintRecord(
			position.collateralLiquidationPricesUsd,
		),
	}) as JsonValue;
}

function serializeSavings(saving: any): JsonValue {
	return clean({
		position: serializePosition(saving.position),
		vault: serializeVault(saving.vault),
		subAccount: asAddress(saving.subAccount) ?? saving.subAccount,
		shares: bigintString(saving.shares) ?? saving.shares,
		assets: bigintString(saving.assets) ?? saving.assets,
		suppliedValueUsd:
			bigintString(saving.suppliedValueUsd) ?? saving.suppliedValueUsd,
		apy: saving.apy,
		apyBreakdown: saving.apyBreakdown,
	}) as JsonValue;
}

function serializeBorrow(borrow: any): JsonValue {
	return clean({
		borrow: serializePosition(borrow.borrow),
		collaterals: sortPositions(
			(borrow.collaterals ?? []).map((position: any) =>
				serializePosition(position),
			),
		),
		collateral: borrow.collateral
			? serializePosition(borrow.collateral)
			: undefined,
		borrowVault: serializeVault(borrow.borrowVault),
		collateralVault: serializeVault(borrow.collateralVault),
		collateralVaults: [...(borrow.collateralVaults ?? [])]
			.map((address) => asAddress(address) ?? address)
			.sort((left, right) => String(left).localeCompare(String(right))),
		subAccount: asAddress(borrow.subAccount) ?? borrow.subAccount,
		healthFactor: bigintString(borrow.healthFactor) ?? borrow.healthFactor,
		userLTV: bigintString(borrow.userLTV) ?? borrow.userLTV,
		currentLTV: bigintString(borrow.currentLTV) ?? borrow.currentLTV,
		borrowed: bigintString(borrow.borrowed) ?? borrow.borrowed,
		supplied: bigintString(borrow.supplied) ?? borrow.supplied,
		price: bigintString(borrow.price) ?? borrow.price,
		primaryCollateralLiquidationPrice:
			bigintString(borrow.primaryCollateralLiquidationPrice) ??
			borrow.primaryCollateralLiquidationPrice,
		borrowLiquidationPriceUsd:
			bigintString(borrow.borrowLiquidationPriceUsd) ??
			borrow.borrowLiquidationPriceUsd,
		collateralLiquidationPricesUsd: normalizeBigintRecord(
			borrow.collateralLiquidationPricesUsd,
		),
		liquidatable: borrow.liquidatable,
		borrowLTV: borrow.borrowLTV,
		liquidationLTV: borrow.liquidationLTV,
		accountLiquidationLTV: NORMALIZE_KNOWN_UNITS
			? normalizeAccountLiquidationLtv(borrow.accountLiquidationLTV)
			: bigintString(borrow.accountLiquidationLTV) ??
				borrow.accountLiquidationLTV,
		liabilityValueBorrowing:
			bigintString(borrow.liabilityValueBorrowing) ??
			borrow.liabilityValueBorrowing,
		liabilityValueLiquidation:
			bigintString(borrow.liabilityValueLiquidation) ??
			borrow.liabilityValueLiquidation,
		liabilityValueUsd:
			bigintString(borrow.liabilityValueUsd) ?? borrow.liabilityValueUsd,
		totalCollateralValueUsd:
			bigintString(borrow.totalCollateralValueUsd) ??
			borrow.totalCollateralValueUsd,
		collateralValueLiquidation:
			bigintString(borrow.collateralValueLiquidation) ??
			borrow.collateralValueLiquidation,
		timeToLiquidation: borrow.timeToLiquidation,
		multiplier: borrow.multiplier,
		netApy: borrow.netApy,
		roe: borrow.roe,
		apyBreakdown: borrow.apyBreakdown,
		roeBreakdown: borrow.roeBreakdown,
	}) as JsonValue;
}

function normalizeAccountLiquidationLtv(value: unknown): unknown {
	if (typeof value === "bigint") return Number(value) / 1e18;
	return value;
}

function serializePortfolio(portfolio: any) {
	if (NORMALIZE_KNOWN_UNITS) {
		normalizeSdkPortfolioKnownUnits(portfolio);
	}
	const savings = sortSavings(portfolio.savings.map(serializeSavings));
	return clean({
		savings,
		borrows: sortBorrows(portfolio.borrows.map(serializeBorrow)),
		positions: sortPositions(portfolio.positions.map(serializePosition)),
		totals: {
			suppliedValueUsd: bigintString(portfolio.totalSuppliedValueUsd),
			borrowedValueUsd: bigintString(portfolio.totalBorrowedValueUsd),
			netAssetValueUsd: bigintString(portfolio.netAssetValueUsd),
			rewardsValueUsd: bigintString(portfolio.totalRewardsValueUsd),
			netApy: portfolio.netApy,
			roe: portfolio.roe,
			apyBreakdown: portfolio.apyBreakdown,
			roeBreakdown: portfolio.roeBreakdown,
		},
	}) as Record<string, JsonValue>;
}

function normalizeSdkPortfolioKnownUnits(portfolio: any): void {
	const seen = new Set<object>();
	for (const position of allPortfolioAccountPositions(portfolio)) {
		const vault = position?.vault;
		if (!vault || typeof vault !== "object" || seen.has(vault)) continue;
		seen.add(vault);

		if (vault.interestRates) {
			for (const field of ["supplyAPY", "borrowAPY", "borrowSPY"]) {
				if (typeof vault.interestRates[field] === "number") {
					vault.interestRates[field] /= 100;
				}
			}
		}
		if (typeof vault.supplyApy1h === "number") {
			vault.supplyApy1h /= 100;
		}
	}
}

function allPortfolioAccountPositions(portfolio: any): any[] {
	return [
		...(portfolio.positions ?? []),
		...(portfolio.savings ?? []).map((saving: any) => saving.position),
		...(portfolio.borrows ?? []).flatMap((borrow: any) => [
			borrow.borrow,
			borrow.collateral,
			...(borrow.collaterals ?? []),
		]),
	].filter(Boolean);
}

function normalizeEndpointPortfolio(data: any) {
	const portfolio = data.portfolio ?? {};
	return clean({
		savings: sortSavings(portfolio.savings ?? []),
		borrows: sortBorrows(
			(portfolio.borrows ?? []).map((borrow: any) => ({
				...borrow,
				accountLiquidationLTV: NORMALIZE_KNOWN_UNITS
					? normalizeEndpointWadRatio(borrow.accountLiquidationLTV)
					: borrow.accountLiquidationLTV,
				collaterals: sortPositions(borrow.collaterals ?? []),
				collateralVaults: [...(borrow.collateralVaults ?? [])].sort(
					(left, right) => String(left).localeCompare(String(right)),
				),
			})),
		),
		positions: sortPositions(portfolio.positions ?? []),
		totals: portfolio.totals ?? {},
	}) as Record<string, JsonValue>;
}

function normalizeEndpointWadRatio(value: unknown): unknown {
	if (typeof value !== "string" || !/^-?\d+$/.test(value)) return value;
	return Number(BigInt(value)) / 1e18;
}

function normalizeBigintRecord(
	record: Record<string, bigint | string> | undefined,
): Record<string, string> | undefined {
	if (!record) return undefined;
	return Object.fromEntries(
		Object.entries(record)
			.map(([key, value]) => [
				asAddress(key) ?? key,
				typeof value === "bigint" ? value.toString() : String(value),
			])
			.sort(([left], [right]) => left.localeCompare(right)),
	);
}

function positionKey(item: any): string {
	return `${String(item?.account ?? "").toLowerCase()}:${String(
		item?.vaultAddress ?? "",
	).toLowerCase()}`;
}

function savingKey(item: any): string {
	return positionKey(item?.position ?? {});
}

function borrowKey(item: any): string {
	return positionKey(item?.borrow ?? {});
}

function sortPositions<T extends JsonValue>(items: T[]): T[] {
	return [...items].sort((left: any, right: any) =>
		positionKey(left).localeCompare(positionKey(right)),
	);
}

function sortSavings<T extends JsonValue>(items: T[]): T[] {
	return [...items].sort((left: any, right: any) =>
		savingKey(left).localeCompare(savingKey(right)),
	);
}

function sortBorrows<T extends JsonValue>(items: T[]): T[] {
	return [...items].sort((left: any, right: any) =>
		borrowKey(left).localeCompare(borrowKey(right)),
	);
}

function sortByAddress<T extends Record<string, unknown>>(
	items: T[],
	field: string,
): T[] {
	return [...items].sort((left, right) =>
		String(left[field] ?? "")
			.toLowerCase()
			.localeCompare(String(right[field] ?? "").toLowerCase()),
	);
}

function compareValues(
	account: Address,
	path: string,
	endpoint: JsonValue | undefined,
	sdk: JsonValue | undefined,
	issues: Issue[],
): void {
	if (endpoint === undefined || sdk === undefined) return;

	if (Array.isArray(endpoint) && Array.isArray(sdk)) {
		if (endpoint.length !== sdk.length) {
			issues.push({
				account,
				path: `${path}.length`,
				reason: "array length mismatch",
				endpoint: endpoint.length,
				sdk: sdk.length,
			});
		}
		for (let index = 0; index < Math.min(endpoint.length, sdk.length); index += 1) {
			compareValues(account, `${path}[${index}]`, endpoint[index], sdk[index], issues);
		}
		return;
	}

	if (isPlainObject(endpoint) && isPlainObject(sdk)) {
		for (const key of Object.keys(endpoint).filter((key) => key in sdk).sort()) {
			compareValues(
				account,
				`${path}.${key}`,
				endpoint[key] as JsonValue,
				sdk[key] as JsonValue,
				issues,
			);
		}
		return;
	}

	if (!valuesMatch(endpoint, sdk)) {
		issues.push({
			account,
			path,
			reason: "value mismatch",
			endpoint,
			sdk,
		});
	}
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valuesMatch(left: JsonValue, right: JsonValue): boolean {
	if (left === right) return true;

	if (typeof left === "string" && typeof right === "string") {
		const leftAddress = asAddress(left);
		const rightAddress = asAddress(right);
		if (leftAddress && rightAddress) {
			return leftAddress.toLowerCase() === rightAddress.toLowerCase();
		}

		if (/^-?\d+$/.test(left) && /^-?\d+$/.test(right)) {
			return bigintStringsMatch(left, right);
		}
	}

	const leftNumber = maybeNumber(left);
	const rightNumber = maybeNumber(right);
	if (leftNumber !== undefined && rightNumber !== undefined) {
		return Math.abs(leftNumber - rightNumber) <= NUMBER_TOLERANCE;
	}

	return false;
}

function bigintStringsMatch(left: string, right: string): boolean {
	if (left === right) return true;
	const a = BigInt(left);
	const b = BigInt(right);
	const diff = a > b ? a - b : b - a;
	const base = a < 0n ? -a : a;
	if (base === 0n) return diff === 0n;
	return Number(diff) / Number(base) <= BIGINT_RELATIVE_TOLERANCE;
}

async function fetchJsonWithRetry(url: string, retries = 4): Promise<any> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} for ${url}`);
			}
			return response.json();
		} catch (error) {
			lastError = error;
			if (attempt === retries) break;
			await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
		}
	}
	throw lastError;
}

async function loadAccounts(): Promise<Address[]> {
	if (ACCOUNT_LIST_FILE) {
		const text = await readFile(ACCOUNT_LIST_FILE, "utf8");
		return text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((address) => getAddress(address));
	}

	const report = JSON.parse(
		await readFile(
			resolve(ROOT, "test/fixtures/generated/fetch-accounts-mainnet.json"),
			"utf8",
		),
	) as { comparedAccounts?: string[] };
	return (report.comparedAccounts ?? []).map((address) => getAddress(address));
}

async function mapConcurrent<T, U>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
	const output = new Array<U>(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			for (;;) {
				const current = next;
				next += 1;
				if (current >= items.length) break;
				output[current] = await fn(items[current]!, current);
			}
		}),
	);
	return output;
}

function responsePathExists(sample: any, path: string): boolean {
	let cursor = sample;
	for (const part of path.split(".")) {
		if (cursor == null || !(part in cursor)) return false;
		cursor = cursor[part];
	}
	return true;
}

function collectShape(samples: any[]) {
	const responseHasPath = (path: string) =>
		samples.some((sample) => responsePathExists(sample, path));
	const sampleSavingsKeys = new Set<string>();
	const sampleBorrowKeys = new Set<string>();

	for (const sample of samples) {
		for (const saving of sample.portfolio?.savings ?? []) {
			Object.keys(saving).forEach((key) => sampleSavingsKeys.add(key));
		}
		for (const borrow of sample.portfolio?.borrows ?? []) {
			Object.keys(borrow).forEach((key) => sampleBorrowKeys.add(key));
		}
	}

	return {
		portfolioMappings: Object.fromEntries(
			Object.entries(PORTFOLIO_FIELD_MAP).map(([field, path]) => [
				field,
				{ path, presentInSamples: responseHasPath(path) },
			]),
		),
		savingsMissingInSamples: SAVINGS_FIELDS.filter(
			(field) => !sampleSavingsKeys.has(field),
		),
		borrowsMissingInSamples: BORROW_FIELDS.filter(
			(field) => !sampleBorrowKeys.has(field),
		),
		savingsEndpointKeys: Array.from(sampleSavingsKeys).sort(),
		borrowsEndpointKeys: Array.from(sampleBorrowKeys).sort(),
	};
}

async function main() {
	const accounts = (await loadAccounts()).slice(0, ACCOUNT_LIMIT);
	const endpoint = V3_HOST.replace(/\/+$/, "");
	const sdk = await buildEulerSDK({
		rpcUrls: { [CHAIN_ID]: RPC_URL },
		accountServiceConfig: {
			adapter: "v3",
			v3AdapterConfig: { endpoint },
		},
		eVaultServiceConfig: {
			adapter: "v3",
			v3AdapterConfig: { endpoint },
		},
		eulerEarnServiceConfig: {
			adapter: "v3",
			v3AdapterConfig: { endpoint },
		},
		vaultTypeAdapterConfig: { endpoint },
		backendConfig: { endpoint },
		rewardsServiceConfig: {
			adapter: "v3",
			v3AdapterConfig: { endpoint },
		},
		intrinsicApyServiceConfig: {
			v3AdapterConfig: { endpoint },
		},
	});

	const endpointSamples: any[] = [];
	const results = await mapConcurrent(accounts, CONCURRENCY, async (account, index) => {
		const url = `${endpoint}/v3/accounts/${account}/portfolio?chainId=${CHAIN_ID}&includeAccount=true`;
		const endpointResponse = await fetchJsonWithRetry(url);
		const endpointData = endpointResponse.data;
		endpointSamples[index] = endpointData;

		const sdkFetched = await sdk.portfolioService.fetchPortfolio(CHAIN_ID, account);
		const endpointPortfolio = normalizeEndpointPortfolio(endpointData);
		const sdkPortfolio = serializePortfolio(sdkFetched.result);
		const issues: Issue[] = [];
		compareValues(account, "portfolio", endpointPortfolio, sdkPortfolio, issues);

		return {
			account,
			endpointErrors: endpointData.errors?.length ?? 0,
			sdkErrors: sdkFetched.errors.length,
			issues,
		} satisfies AccountResult;
	});

	const accountsWithDiffs = results.filter((result) => result.issues.length > 0);
	const report = {
		generatedAt: new Date().toISOString(),
		chainId: CHAIN_ID,
		v3Host: endpoint,
		accountCount: accounts.length,
		tolerances: {
			bigintRelative: BIGINT_RELATIVE_TOLERANCE,
			numberAbsolute: NUMBER_TOLERANCE,
		},
		normalizeKnownUnits: NORMALIZE_KNOWN_UNITS,
		shape: collectShape(endpointSamples),
		summary: {
			accountsCompared: results.length,
			accountsWithDiffs: accountsWithDiffs.length,
			totalDiffs: results.reduce((sum, result) => sum + result.issues.length, 0),
			endpointErrorAccounts: results.filter((result) => result.endpointErrors > 0)
				.length,
			sdkErrorAccounts: results.filter((result) => result.sdkErrors > 0).length,
		},
		results,
	};

	const jsonPath = resolve(ROOT, "test/parity", `${REPORT_PREFIX}.json`);
	const mdPath = resolve(ROOT, "test/parity", `${REPORT_PREFIX}.md`);
	await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
	await writeFile(mdPath, renderMarkdown(report), "utf8");

	console.log(
		JSON.stringify(
			{
				report: jsonPath,
				markdown: mdPath,
				summary: report.summary,
				shape: report.shape,
			},
			null,
			2,
		),
	);
}

function renderMarkdown(report: any): string {
	const lines = [
		"# V3 Account Portfolio Endpoint Parity",
		"",
		`Generated: ${report.generatedAt}`,
		`V3 host: ${report.v3Host}`,
		`Chain ID: ${report.chainId}`,
		`Accounts compared: ${report.summary.accountsCompared}`,
		`Accounts with diffs: ${report.summary.accountsWithDiffs}`,
		`Total diffs: ${report.summary.totalDiffs}`,
		`Endpoint error accounts: ${report.summary.endpointErrorAccounts}`,
		`SDK error accounts: ${report.summary.sdkErrorAccounts}`,
		"",
		"## Missing Portfolio Entity Fields In Endpoint Samples",
		"",
		"| Entity | Missing fields |",
		"| --- | --- |",
		`| PortfolioBorrowPosition | ${
			report.shape.borrowsMissingInSamples.join(", ") || "none"
		} |`,
		`| PortfolioSavingsPosition | ${
			report.shape.savingsMissingInSamples.join(", ") || "none"
		} |`,
		"",
		"## Portfolio Field Mapping",
		"",
		"| Portfolio field | Endpoint path | Present in samples |",
		"| --- | --- | --- |",
		...Object.entries(report.shape.portfolioMappings).map(
			([field, value]: [string, any]) =>
				`| ${field} | ${value.path} | ${value.presentInSamples ? "yes" : "no"} |`,
		),
		"",
		"## Diff Preview",
		"",
	];

	const diffRows = report.results.flatMap((result: AccountResult) =>
		result.issues.slice(0, 5).map((issue) => ({
			account: result.account,
			...issue,
		})),
	);

	if (diffRows.length === 0) {
		lines.push("No overlapping-field diffs found.");
	} else {
		lines.push("| Account | Path | Reason | Endpoint | SDK |");
		lines.push("| --- | --- | --- | --- | --- |");
		for (const issue of diffRows.slice(0, 50)) {
			lines.push(
				`| ${issue.account} | ${issue.path} | ${issue.reason} | ${inlineJson(
					issue.endpoint,
				)} | ${inlineJson(issue.sdk)} |`,
			);
		}
	}

	lines.push("");
	return `${lines.join("\n")}\n`;
}

function inlineJson(value: unknown): string {
	return JSON.stringify(value)
		?.replaceAll("|", "\\|")
		.slice(0, 240) ?? "";
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
