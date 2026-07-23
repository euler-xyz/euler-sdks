import { type Address, getAddress, type Hex, isAddress } from "viem";
import {
	getSubAccountId,
	SUB_ACCOUNT_MAX_ID,
} from "../../utils/subAccounts.js";
import type {
	ActivityAssetAmount,
	ActivityAssetKind,
	ActivityCategory,
	ActivityCategoryOption,
	ActivityChainCoverage,
	ActivityChangeValue,
	ActivityCoverage,
	ActivityCoverageStatus,
	ActivityEvent,
	ActivityEventsMeta,
	ActivityEventsPage,
	ActivityEventType,
	ActivityValuation,
	ActivityValueChange,
	ActivityVaultType,
	FetchAccountActivityEventsArgs,
	FetchVaultActivityEventsArgs,
	FetchLiquidationsArgs,
	LiquidationRecord,
	LiquidationsMeta,
	LiquidationsPage,
} from "./activityServiceTypes.js";
import { ACTIVITY_EVENT_TYPES } from "./activityServiceTypes.js";

export const ACTIVITY_CATEGORY_VALUES = [
	"lending",
	"borrowing",
	"swaps",
	"liquidations",
	"account",
	"rewards",
	"governance",
] as const satisfies readonly ActivityCategory[];

const ACTIVITY_COVERAGE_STATUSES = [
	"complete",
	"partial",
	"unsupported",
	"syncing",
] as const satisfies readonly ActivityCoverageStatus[];

export const ACTIVITY_VAULT_TYPES = [
	"evk",
	"earn",
	"securitize",
] as const satisfies readonly ActivityVaultType[];

const VALUATION_STATUSES = [
	"available",
	"unavailable",
	"partial",
] as const satisfies readonly ActivityValuation["status"][];

const ASSET_KINDS = [
	"assets",
	"shares",
	"value",
	"collateral",
	"yield",
] as const satisfies readonly ActivityAssetKind[];

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_INTEGER_PATTERN = /^\d+$/;
const RFC3339_TIMESTAMP_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

export const ACTIVITY_CATEGORIES = [
	{ value: "lending", label: "Lending" },
	{ value: "borrowing", label: "Borrowing" },
	{ value: "swaps", label: "Swaps" },
	{ value: "liquidations", label: "Liquidations" },
	{ value: "account", label: "Account" },
	{ value: "rewards", label: "Rewards" },
	{ value: "governance", label: "Governance" },
] as const satisfies readonly ActivityCategoryOption[];

export class ActivityResponseValidationError extends Error {
	readonly code = "INVALID_ACTIVITY_RESPONSE";

	constructor(
		message: string,
		readonly path: string,
	) {
		super(`Invalid activity response at ${path}: ${message}`);
		this.name = "ActivityResponseValidationError";
	}
}

const fail = (path: string, message: string): never => {
	throw new ActivityResponseValidationError(message, path);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (value: unknown, path: string): Record<string, unknown> => {
	if (!isRecord(value)) fail(path, "expected an object");
	return value as Record<string, unknown>;
};

const readString = (value: unknown, path: string): string => {
	if (typeof value !== "string" || value.trim().length === 0) {
		fail(path, "expected a non-empty string");
	}
	return value as string;
};

const readOptionalString = (
	value: unknown,
	path: string,
): string | undefined =>
	value === undefined ? undefined : readString(value, path);

const readTimestamp = (value: unknown, path: string): string => {
	const timestamp = readString(value, path);
	const match =
		RFC3339_TIMESTAMP_PATTERN.exec(timestamp) ??
		fail(path, "expected an RFC 3339 timestamp");

	const [
		,
		yearText,
		monthText,
		dayText,
		hourText,
		minuteText,
		secondText,
		offsetHourText,
		offsetMinuteText,
	] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const second = Number(secondText);
	const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
	const offsetMinute =
		offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const daysInMonth = [
		31,
		leapYear ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31,
	][month - 1];
	if (
		daysInMonth === undefined ||
		day < 1 ||
		day > daysInMonth ||
		hour > 23 ||
		minute > 59 ||
		second > 59 ||
		offsetHour > 23 ||
		offsetMinute > 59 ||
		!Number.isFinite(Date.parse(timestamp))
	) {
		fail(path, "expected an RFC 3339 timestamp");
	}
	return timestamp;
};

const readDecimalString = (value: unknown, path: string): string => {
	const decimal = readString(value, path);
	if (!DECIMAL_INTEGER_PATTERN.test(decimal)) {
		fail(path, "expected a non-negative decimal integer string");
	}
	return decimal;
};

const readPositiveInteger = (value: unknown, path: string): number => {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		fail(path, "expected a positive safe integer");
	}
	return value as number;
};

const readNonNegativeInteger = (value: unknown, path: string): number => {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail(path, "expected a non-negative safe integer");
	}
	return value as number;
};

const readAddress = (value: unknown, path: string): Address => {
	const address = readString(value, path);
	if (!isAddress(address)) fail(path, "expected an EVM address");
	return getAddress(address) as Address;
};

const readOptionalAddress = (
	value: unknown,
	path: string,
): Address | undefined =>
	value === undefined ? undefined : readAddress(value, path);

const readOptionalNullableDecimalString = (
	value: unknown,
	path: string,
): string | null | undefined =>
	value === undefined || value === null
		? value
		: readDecimalString(value, path);

/**
 * Expands exponent notation textually — shifting the decimal point through
 * the serialized mantissa digits — so USD amounts become plain decimal
 * strings without re-rounding the underlying number.
 */
const usdNumberToDecimalString = (value: number, path: string): string => {
	const text = String(value);
	const match = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
	if (!match) {
		if (!/^\d+(?:\.\d+)?$/.test(text)) {
			return fail(path, "expected a USD value expressible as a decimal string");
		}
		return text;
	}
	const [, integerPart = "", fractionPart = "", exponentPart = "0"] = match;
	const digits = `${integerPart}${fractionPart}`;
	const pointIndex = integerPart.length + Number(exponentPart);
	if (pointIndex <= 0) {
		return `0.${"0".repeat(-pointIndex)}${digits}`;
	}
	if (pointIndex >= digits.length) {
		return `${digits}${"0".repeat(pointIndex - digits.length)}`;
	}
	return `${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
};

const readOptionalUsdValue = (
	value: unknown,
	path: string,
): string | undefined => {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") {
		if (!/^\d+(?:\.\d+)?$/.test(value)) {
			return fail(path, "expected a non-negative decimal USD string");
		}
		return value;
	}
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return fail(path, "expected a non-negative finite number, string, or null");
	}
	return usdNumberToDecimalString(value, path);
};

const readOptionalFiniteNumber = (
	value: unknown,
	path: string,
	options: { allowNegative?: boolean } = {},
): number | undefined => {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fail(path, "expected a finite number or null");
	}
	if (!options.allowNegative && value < 0) {
		return fail(path, "expected a non-negative finite number or null");
	}
	return value;
};

const readTxHash = (value: unknown, path: string): Hex => {
	const txHash = readString(value, path);
	if (!TX_HASH_PATTERN.test(txHash)) {
		fail(path, "expected a 32-byte transaction hash");
	}
	return txHash.toLowerCase() as Hex;
};

const readEnum = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	path: string,
): T => {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		fail(path, `expected one of: ${allowed.join(", ")}`);
	}
	return value as T;
};

const readCategoryList = (value: unknown, path: string): ActivityCategory[] => {
	if (!Array.isArray(value)) fail(path, "expected an array");
	const categories = (value as unknown[]).map((entry, index) =>
		readEnum(entry, ACTIVITY_CATEGORY_VALUES, `${path}[${index}]`),
	);
	const seen = new Set<ActivityCategory>();
	for (const [index, category] of categories.entries()) {
		if (seen.has(category)) {
			fail(`${path}[${index}]`, `contains duplicate category ${category}`);
		}
		seen.add(category);
	}
	return categories;
};

const readAsset = (value: unknown, path: string): ActivityAssetAmount => {
	const record = readRecord(value, path);
	const address = readOptionalAddress(record.address, `${path}.address`);
	const symbol = readOptionalString(record.symbol, `${path}.symbol`);
	const decimals =
		record.decimals === undefined
			? undefined
			: readNonNegativeInteger(record.decimals, `${path}.decimals`);
	if (decimals !== undefined && decimals > 255) {
		fail(`${path}.decimals`, "expected an integer no greater than 255");
	}
	const amountRaw = readString(record.amountRaw, `${path}.amountRaw`);
	if (!DECIMAL_INTEGER_PATTERN.test(amountRaw)) {
		fail(`${path}.amountRaw`, "expected a non-negative decimal integer string");
	}
	const amount = readOptionalString(record.amount, `${path}.amount`);
	const amountUnderlyingRaw = readOptionalNullableDecimalString(
		record.amountUnderlyingRaw,
		`${path}.amountUnderlyingRaw`,
	);
	const underlyingAddress = readOptionalAddress(
		record.underlyingAddress,
		`${path}.underlyingAddress`,
	);
	const underlyingDecimals =
		record.underlyingDecimals === undefined
			? undefined
			: readNonNegativeInteger(
					record.underlyingDecimals,
					`${path}.underlyingDecimals`,
				);
	if (underlyingDecimals !== undefined && underlyingDecimals > 255) {
		fail(
			`${path}.underlyingDecimals`,
			"expected an integer no greater than 255",
		);
	}
	const amountUsd = readOptionalUsdValue(record.amountUsd, `${path}.amountUsd`);

	return {
		kind: readEnum(record.kind, ASSET_KINDS, `${path}.kind`),
		amountRaw,
		...(address !== undefined ? { address } : {}),
		...(symbol !== undefined ? { symbol } : {}),
		...(decimals !== undefined ? { decimals } : {}),
		...(amount !== undefined ? { amount } : {}),
		...(amountUnderlyingRaw !== undefined ? { amountUnderlyingRaw } : {}),
		...(underlyingAddress !== undefined ? { underlyingAddress } : {}),
		...(underlyingDecimals !== undefined ? { underlyingDecimals } : {}),
		...(amountUsd !== undefined ? { amountUsd } : {}),
	};
};

const readChangeValue = (value: unknown, path: string): ActivityChangeValue => {
	if (value === null) return value;
	if (Array.isArray(value)) {
		if (!value.every((entry) => typeof entry === "string")) {
			fail(path, "expected an array of strings");
		}
		return [...value] as string[];
	}
	if (
		typeof value !== "string" &&
		typeof value !== "number" &&
		typeof value !== "boolean"
	) {
		fail(path, "expected a scalar, string array, or null");
	}
	if (typeof value === "number" && !Number.isFinite(value)) {
		fail(path, "expected a finite number");
	}
	return value as string | number | boolean;
};

const readChange = (value: unknown, path: string): ActivityValueChange => {
	const record = readRecord(value, path);
	const fieldsRecord = readRecord(record.fields, `${path}.fields`);
	const fields = Object.fromEntries(
		Object.entries(fieldsRecord).map(([field, entry]) => [
			field,
			readChangeValue(entry, `${path}.fields.${field}`),
		]),
	);
	return { fields };
};

const readValuation = (value: unknown, path: string): ActivityValuation => {
	const record = readRecord(value, path);
	const amountUsd = readOptionalString(record.amountUsd, `${path}.amountUsd`);
	const priceTimestamp =
		record.priceTimestamp === undefined
			? undefined
			: readTimestamp(record.priceTimestamp, `${path}.priceTimestamp`);
	const source = readOptionalString(record.source, `${path}.source`);
	const reason = readOptionalString(record.reason, `${path}.reason`);
	return {
		status: readEnum(record.status, VALUATION_STATUSES, `${path}.status`),
		...(amountUsd !== undefined ? { amountUsd } : {}),
		...(priceTimestamp !== undefined ? { priceTimestamp } : {}),
		...(source !== undefined ? { source } : {}),
		...(reason !== undefined ? { reason } : {}),
	};
};

const readChainCoverage = (
	value: unknown,
	path: string,
): ActivityChainCoverage => {
	const record = readRecord(value, path);
	const indexedFromBlock =
		record.indexedFromBlock === undefined
			? undefined
			: readDecimalString(record.indexedFromBlock, `${path}.indexedFromBlock`);
	const indexedToBlock =
		record.indexedToBlock === undefined
			? undefined
			: readDecimalString(record.indexedToBlock, `${path}.indexedToBlock`);
	const missingCategories = readCategoryList(
		record.missingCategories,
		`${path}.missingCategories`,
	);
	const reason = readOptionalString(record.reason, `${path}.reason`);
	const status = readEnum(
		record.status,
		ACTIVITY_COVERAGE_STATUSES,
		`${path}.status`,
	);
	if (
		indexedFromBlock !== undefined &&
		indexedToBlock !== undefined &&
		BigInt(indexedFromBlock) > BigInt(indexedToBlock)
	) {
		fail(
			`${path}.indexedToBlock`,
			"expected indexedToBlock to be at or after indexedFromBlock",
		);
	}
	if (status === "complete" && missingCategories.length > 0) {
		fail(
			`${path}.missingCategories`,
			"expected no missing categories when chain coverage is complete",
		);
	}

	return {
		chainId: readPositiveInteger(record.chainId, `${path}.chainId`),
		status,
		...(indexedFromBlock !== undefined ? { indexedFromBlock } : {}),
		...(indexedToBlock !== undefined ? { indexedToBlock } : {}),
		missingCategories,
		...(reason !== undefined ? { reason } : {}),
	};
};

const readCoverage = (value: unknown, path: string): ActivityCoverage => {
	const record = readRecord(value, path);
	if (!Array.isArray(record.chains))
		fail(`${path}.chains`, "expected an array");
	const chains = (record.chains as unknown[]).map((entry, index) =>
		readChainCoverage(entry, `${path}.chains[${index}]`),
	);
	const seenChainIds = new Set<number>();
	for (const chain of chains) {
		if (seenChainIds.has(chain.chainId)) {
			fail(`${path}.chains`, `contains duplicate chain ${chain.chainId}`);
		}
		seenChainIds.add(chain.chainId);
	}
	const missingCategories = readCategoryList(
		record.missingCategories,
		`${path}.missingCategories`,
	);
	const reason = readOptionalString(record.reason, `${path}.reason`);
	const status = readEnum(
		record.status,
		ACTIVITY_COVERAGE_STATUSES,
		`${path}.status`,
	);
	const expectedStatus: ActivityCoverageStatus =
		chains.length === 0 ||
		chains.every((chain) => chain.status === "unsupported")
			? "unsupported"
			: chains.some(
						(chain) =>
							chain.status === "partial" || chain.status === "unsupported",
					)
				? "partial"
				: chains.some((chain) => chain.status === "syncing")
					? "syncing"
					: "complete";
	if (status !== expectedStatus) {
		fail(
			`${path}.status`,
			`expected ${expectedStatus} for the reported chain coverage`,
		);
	}
	if (status === "complete" && missingCategories.length > 0) {
		fail(
			`${path}.missingCategories`,
			"expected no missing categories when aggregate coverage is complete",
		);
	}

	return {
		status,
		chains,
		missingCategories,
		...(reason !== undefined ? { reason } : {}),
	};
};

export const normalizeActivityEvent = (
	raw: unknown,
	path = "$.data[]",
): ActivityEvent => {
	const record = readRecord(raw, path);
	const type = readEnum(record.type, ACTIVITY_EVENT_TYPES, `${path}.type`);
	const rawType =
		record.rawType === undefined
			? type
			: readString(record.rawType, `${path}.rawType`);
	const label = readOptionalString(record.label, `${path}.label`);
	const owner = readOptionalAddress(record.owner, `${path}.owner`);
	const account = readOptionalAddress(record.account, `${path}.account`);
	const subAccountIndex =
		record.subAccountIndex === undefined
			? undefined
			: readNonNegativeInteger(
					record.subAccountIndex,
					`${path}.subAccountIndex`,
				);
	if (subAccountIndex !== undefined && subAccountIndex > SUB_ACCOUNT_MAX_ID) {
		fail(
			`${path}.subAccountIndex`,
			`expected an integer no greater than ${SUB_ACCOUNT_MAX_ID}`,
		);
	}
	const vault = readOptionalAddress(record.vault, `${path}.vault`);
	const vaultType =
		record.vaultType === undefined
			? undefined
			: readEnum(record.vaultType, ACTIVITY_VAULT_TYPES, `${path}.vaultType`);
	const actor = readOptionalAddress(record.actor, `${path}.actor`);
	const counterparty = readOptionalAddress(
		record.counterparty,
		`${path}.counterparty`,
	);
	const assets =
		record.assets === undefined
			? undefined
			: Array.isArray(record.assets)
				? record.assets.map((entry, index) =>
						readAsset(entry, `${path}.assets[${index}]`),
					)
				: fail(`${path}.assets`, "expected an array");
	const change =
		record.change === undefined
			? undefined
			: readChange(record.change, `${path}.change`);
	const valuation =
		record.valuation === undefined
			? undefined
			: readValuation(record.valuation, `${path}.valuation`);
	const groupId = readOptionalString(record.groupId, `${path}.groupId`);
	const payload =
		record.payload === undefined
			? {}
			: readRecord(record.payload, `${path}.payload`);

	return {
		id: readString(record.id, `${path}.id`),
		chainId: readPositiveInteger(record.chainId, `${path}.chainId`),
		type,
		rawType,
		category: readEnum(
			record.category,
			ACTIVITY_CATEGORY_VALUES,
			`${path}.category`,
		),
		timestamp: readTimestamp(record.timestamp, `${path}.timestamp`),
		blockNumber: readDecimalString(record.blockNumber, `${path}.blockNumber`),
		logIndex: readNonNegativeInteger(record.logIndex, `${path}.logIndex`),
		txHash: readTxHash(record.txHash, `${path}.txHash`),
		source: readString(record.source, `${path}.source`),
		payload,
		...(label !== undefined ? { label } : {}),
		...(owner !== undefined ? { owner } : {}),
		...(account !== undefined ? { account } : {}),
		...(subAccountIndex !== undefined ? { subAccountIndex } : {}),
		...(vault !== undefined ? { vault } : {}),
		...(vaultType !== undefined ? { vaultType } : {}),
		...(actor !== undefined ? { actor } : {}),
		...(counterparty !== undefined ? { counterparty } : {}),
		...(assets !== undefined ? { assets } : {}),
		...(change !== undefined ? { change } : {}),
		...(valuation !== undefined ? { valuation } : {}),
		...(groupId !== undefined ? { groupId } : {}),
	};
};

const readMeta = (value: unknown, path: string): ActivityEventsMeta => {
	const record = readRecord(value, path);
	if (typeof record.hasMore !== "boolean") {
		fail(`${path}.hasMore`, "expected a boolean");
	}
	const hasMore = record.hasMore as boolean;
	if (!("nextCursor" in record)) {
		fail(`${path}.nextCursor`, "expected a string or null");
	}
	const nextCursor =
		record.nextCursor === null
			? null
			: readString(record.nextCursor, `${path}.nextCursor`);
	if (nextCursor !== null && nextCursor.length > 2_048) {
		fail(`${path}.nextCursor`, "expected at most 2048 characters");
	}
	if (hasMore && nextCursor === null) {
		fail(`${path}.nextCursor`, "expected a cursor when hasMore is true");
	}
	if (!hasMore && nextCursor !== null) {
		fail(`${path}.nextCursor`, "expected null when hasMore is false");
	}
	const limit =
		record.limit === undefined
			? undefined
			: readPositiveInteger(record.limit, `${path}.limit`);
	const timestamp = readTimestamp(record.timestamp, `${path}.timestamp`);

	return {
		hasMore,
		nextCursor,
		source: readString(record.source, `${path}.source`),
		coverage: readCoverage(record.coverage, `${path}.coverage`),
		...(limit !== undefined ? { limit } : {}),
		timestamp,
	};
};

export const normalizeActivityEventsResponse = (
	raw: unknown,
): ActivityEventsPage => {
	let parsed = raw;
	if (typeof raw === "string") {
		try {
			parsed = JSON.parse(raw) as unknown;
		} catch {
			fail("$", "expected valid JSON");
		}
	}
	const response = readRecord(parsed, "$");
	if (!Array.isArray(response.data)) fail("$.data", "expected an array");
	const data = (response.data as unknown[]).map((event, index) =>
		normalizeActivityEvent(event, `$.data[${index}]`),
	);
	const seenIds = new Set<string>();
	for (const [index, event] of data.entries()) {
		if (seenIds.has(event.id)) {
			fail(`$.data[${index}].id`, `contains duplicate event id ${event.id}`);
		}
		seenIds.add(event.id);
	}
	const meta = readMeta(response.meta, "$.meta");
	for (const [index, event] of data.entries()) {
		if (event.source !== meta.source) {
			fail(
				`$.data[${index}].source`,
				`expected the response source ${meta.source}`,
			);
		}
	}
	if (meta.coverage.status === "unsupported" && data.length > 0) {
		fail("$.data", "expected no events when coverage is unsupported");
	}
	return { data, meta };
};

type ActivityResponseBounds = {
	from?: number;
	to?: number;
	limit?: number;
};

type ActivityResponseRequest = ActivityResponseBounds &
	(
		| {
				kind: "account";
				chainIds: readonly number[];
				owner: Address;
				categories?: readonly ActivityCategory[];
				eventTypes?: readonly ActivityEventType[];
		  }
		| {
				kind: "vault";
				chainIds: readonly [number];
				vault: Address;
				vaultType: ActivityVaultType;
				categories?: readonly ActivityCategory[];
				eventTypes?: readonly ActivityEventType[];
		  }
	);

const sortedUniqueNumbers = (values: readonly number[]): number[] =>
	[...new Set(values)].sort((left, right) => left - right);

const sameNumberList = (left: readonly number[], right: readonly number[]) =>
	left.length === right.length &&
	left.every((value, index) => value === right[index]);

const readActivitySubAccountIndex = (
	owner: Address,
	account: Address,
	path: string,
): number => {
	try {
		return getSubAccountId(owner, account);
	} catch {
		return fail(path, "expected an account in the owner's family");
	}
};

const validateMissingCategoriesForRequest = (
	categories: readonly ActivityCategory[] | undefined,
	path: string,
	requestedCategories: ReadonlySet<ActivityCategory> | undefined,
): void => {
	if (!categories || !requestedCategories) return;
	for (const [index, category] of categories.entries()) {
		if (!requestedCategories.has(category)) {
			fail(
				`${path}[${index}]`,
				`category ${category} was not included in the request filter`,
			);
		}
	}
};

const validateActivityEventsPageForRequest = (
	page: ActivityEventsPage,
	request: ActivityResponseRequest,
): ActivityEventsPage => {
	if (request.limit !== undefined && page.data.length > request.limit) {
		fail(
			"$.data",
			`expected at most the requested limit of ${request.limit} rows`,
		);
	}

	const requestedChainIds = sortedUniqueNumbers(request.chainIds);
	const coveredChainIds = sortedUniqueNumbers(
		page.meta.coverage.chains.map((chain) => chain.chainId),
	);
	if (!sameNumberList(requestedChainIds, coveredChainIds)) {
		fail(
			"$.meta.coverage.chains",
			`expected exactly the requested chain ids: ${requestedChainIds.join(", ")}`,
		);
	}

	const requestedCategories = request.categories
		? new Set(request.categories)
		: undefined;
	const requestedEventTypes = request.eventTypes
		? new Set(
				request.eventTypes.map((eventType) => eventType.trim().toLowerCase()),
			)
		: undefined;
	validateMissingCategoriesForRequest(
		page.meta.coverage.missingCategories,
		"$.meta.coverage.missingCategories",
		requestedCategories,
	);
	const coverageByChain = new Map(
		page.meta.coverage.chains.map((chain, index) => {
			validateMissingCategoriesForRequest(
				chain.missingCategories,
				`$.meta.coverage.chains[${index}].missingCategories`,
				requestedCategories,
			);
			return [chain.chainId, chain] as const;
		}),
	);

	for (const [index, event] of page.data.entries()) {
		const path = `$.data[${index}]`;
		const eventTimestamp = Math.floor(Date.parse(event.timestamp) / 1_000);
		if (request.from !== undefined && eventTimestamp < request.from) {
			fail(
				`${path}.timestamp`,
				`timestamp is before the requested from value ${request.from}`,
			);
		}
		if (request.to !== undefined && eventTimestamp > request.to) {
			fail(
				`${path}.timestamp`,
				`timestamp is after the requested to value ${request.to}`,
			);
		}
		if (!requestedChainIds.includes(event.chainId)) {
			fail(`${path}.chainId`, `chain ${event.chainId} was not requested`);
		}
		if (coverageByChain.get(event.chainId)?.status === "unsupported") {
			fail(
				`${path}.chainId`,
				`chain ${event.chainId} is reported as unsupported`,
			);
		}
		if (requestedCategories && !requestedCategories.has(event.category)) {
			fail(
				`${path}.category`,
				`category ${event.category} was not included in the request filter`,
			);
		}
		if (requestedEventTypes && !requestedEventTypes.has(event.type)) {
			fail(
				`${path}.type`,
				`event type ${event.type} was not included in the request filter`,
			);
		}

		if (request.kind === "account") {
			if (event.owner !== request.owner) {
				fail(`${path}.owner`, "expected the requested owner");
			}
			if (event.account !== undefined) {
				const derivedSubAccountIndex = readActivitySubAccountIndex(
					request.owner,
					event.account,
					`${path}.account`,
				);
				if (event.subAccountIndex !== derivedSubAccountIndex) {
					fail(
						`${path}.subAccountIndex`,
						`expected ${derivedSubAccountIndex} for the reported account`,
					);
				}
			}
			continue;
		}

		if (event.vault !== request.vault) {
			fail(`${path}.vault`, "expected the requested vault");
		}
		if (event.vaultType !== request.vaultType) {
			fail(`${path}.vaultType`, "expected the requested vault type");
		}
	}

	return page;
};

export const validateAccountActivityEventsPage = (
	page: ActivityEventsPage,
	args: FetchAccountActivityEventsArgs,
): ActivityEventsPage =>
	validateActivityEventsPageForRequest(page, {
		kind: "account",
		chainIds: Array.isArray(args.chainId) ? args.chainId : [args.chainId],
		owner: getAddress(args.owner) as Address,
		...(args.from !== undefined ? { from: args.from } : {}),
		...(args.to !== undefined ? { to: args.to } : {}),
		...(args.limit !== undefined ? { limit: args.limit } : {}),
		...(args.categories !== undefined ? { categories: args.categories } : {}),
		...(args.eventTypes !== undefined ? { eventTypes: args.eventTypes } : {}),
	});

export const validateVaultActivityEventsPage = (
	page: ActivityEventsPage,
	args: FetchVaultActivityEventsArgs,
): ActivityEventsPage =>
	validateActivityEventsPageForRequest(page, {
		kind: "vault",
		chainIds: [args.chainId],
		vault: getAddress(args.vault) as Address,
		vaultType: args.vaultType,
		...(args.from !== undefined ? { from: args.from } : {}),
		...(args.to !== undefined ? { to: args.to } : {}),
		...(args.limit !== undefined ? { limit: args.limit } : {}),
		...(args.categories !== undefined ? { categories: args.categories } : {}),
		...(args.eventTypes !== undefined ? { eventTypes: args.eventTypes } : {}),
	});

const readPayloadAddress = (
	event: Pick<ActivityEvent, "payload">,
	keys: string[],
): Address | undefined => {
	for (const key of keys) {
		const value = event.payload[key];
		if (typeof value === "string" && isAddress(value)) {
			return getAddress(value) as Address;
		}
	}
	return undefined;
};

export const getActivityPayloadString = (
	event: Pick<ActivityEvent, "payload">,
	keys: string[],
): string | undefined => {
	for (const key of keys) {
		const value = event.payload[key];
		if (typeof value === "string" && value.trim().length > 0) return value;
	}
	return undefined;
};

export const getActivityTargetContract = (
	event: Pick<ActivityEvent, "payload" | "vault">,
): Address | undefined =>
	event.vault ??
	readPayloadAddress(event, [
		"target_contract",
		"targetContract",
		"vault",
		"vault_address",
		"vaultAddress",
	]);

export const getActivityAccount = (
	event: Pick<ActivityEvent, "payload" | "account">,
): Address | undefined =>
	event.account ??
	readPayloadAddress(event, [
		"on_behalf_of_account",
		"onBehalfOfAccount",
		"account",
		"sub_account",
		"subAccount",
	]);

export const getActivityCaller = (
	event: Pick<ActivityEvent, "payload" | "actor">,
): Address | undefined =>
	event.actor ?? readPayloadAddress(event, ["caller", "sender", "owner"]);

/** Historical token metadata can be null when unavailable at the event. */
const readNullableMetadataAddress = (
	value: unknown,
	path: string,
): Address | undefined =>
	value === undefined || value === null ? undefined : readAddress(value, path);

const readNullableMetadataDecimals = (
	value: unknown,
	path: string,
): number | undefined =>
	value === undefined || value === null
		? undefined
		: readNonNegativeInteger(value, path);

const readLiquidationRecord = (
	value: unknown,
	path: string,
): LiquidationRecord => {
	const record = readRecord(value, path);
	const debtAsset = readNullableMetadataAddress(
		record.debtAsset,
		`${path}.debtAsset`,
	);
	const debtAssetDecimals = readNullableMetadataDecimals(
		record.debtAssetDecimals,
		`${path}.debtAssetDecimals`,
	);
	const collateralAsset = readNullableMetadataAddress(
		record.collateralAsset,
		`${path}.collateralAsset`,
	);
	const collateralAssetDecimals = readNullableMetadataDecimals(
		record.collateralAssetDecimals,
		`${path}.collateralAssetDecimals`,
	);
	const debtAssetPriceUsd = readOptionalFiniteNumber(
		record.debtAssetPriceUsd,
		`${path}.debtAssetPriceUsd`,
	);
	const repayAssetsUsd = readOptionalFiniteNumber(
		record.repayAssetsUsd,
		`${path}.repayAssetsUsd`,
	);
	const collateralAssetPriceUsd = readOptionalFiniteNumber(
		record.collateralAssetPriceUsd,
		`${path}.collateralAssetPriceUsd`,
	);
	const collateralAssets = readOptionalNullableDecimalString(
		record.collateralAssets,
		`${path}.collateralAssets`,
	);
	const collateralAssetsUsd = readOptionalFiniteNumber(
		record.collateralAssetsUsd,
		`${path}.collateralAssetsUsd`,
	);
	// A liquidation can be unprofitable, so the bonus may be negative.
	const bonusUsd = readOptionalFiniteNumber(
		record.bonusUsd,
		`${path}.bonusUsd`,
		{
			allowNegative: true,
		},
	);

	return {
		chainId: readPositiveInteger(record.chainId, `${path}.chainId`),
		vault: readAddress(record.vault, `${path}.vault`),
		violator: readAddress(record.violator, `${path}.violator`),
		liquidator: readAddress(record.liquidator, `${path}.liquidator`),
		collateral: readAddress(record.collateral, `${path}.collateral`),
		repayAssets: readDecimalString(record.repayAssets, `${path}.repayAssets`),
		yieldBalance: readDecimalString(
			record.yieldBalance,
			`${path}.yieldBalance`,
		),
		...(debtAsset !== undefined ? { debtAsset } : {}),
		...(debtAssetDecimals !== undefined ? { debtAssetDecimals } : {}),
		...(debtAssetPriceUsd !== undefined ? { debtAssetPriceUsd } : {}),
		...(repayAssetsUsd !== undefined ? { repayAssetsUsd } : {}),
		...(collateralAsset !== undefined ? { collateralAsset } : {}),
		...(collateralAssetDecimals !== undefined
			? { collateralAssetDecimals }
			: {}),
		...(collateralAssetPriceUsd !== undefined
			? { collateralAssetPriceUsd }
			: {}),
		...(collateralAssets != null ? { collateralAssets } : {}),
		...(collateralAssetsUsd !== undefined ? { collateralAssetsUsd } : {}),
		...(bonusUsd !== undefined ? { bonusUsd } : {}),
		valuation: readValuation(record.valuation, `${path}.valuation`),
		blockNumber: readDecimalString(record.blockNumber, `${path}.blockNumber`),
		txHash: readTxHash(record.txHash, `${path}.txHash`),
		timestamp: readTimestamp(record.timestamp, `${path}.timestamp`),
	};
};

const readLiquidationsMeta = (
	value: unknown,
	path: string,
): LiquidationsMeta => {
	const record = readRecord(value, path);
	return {
		total: readNonNegativeInteger(record.total, `${path}.total`),
		offset: readNonNegativeInteger(record.offset, `${path}.offset`),
		limit: readNonNegativeInteger(record.limit, `${path}.limit`),
		timestamp: readTimestamp(record.timestamp, `${path}.timestamp`),
	};
};

export const normalizeLiquidationsResponse = (
	raw: unknown,
): LiquidationsPage => {
	let parsed = raw;
	if (typeof raw === "string") {
		try {
			parsed = JSON.parse(raw) as unknown;
		} catch {
			fail("$", "expected valid JSON");
		}
	}
	const response = readRecord(parsed, "$");
	if (!Array.isArray(response.data)) fail("$.data", "expected an array");
	const data = (response.data as unknown[]).map((row, index) =>
		readLiquidationRecord(row, `$.data[${index}]`),
	);
	return { data, meta: readLiquidationsMeta(response.meta, "$.meta") };
};

/**
 * Rejects structurally valid pages that do not answer the request, mirroring
 * the request-aware validation on the account/vault activity routes.
 */
export const validateLiquidationsPage = (
	page: LiquidationsPage,
	args: FetchLiquidationsArgs,
): LiquidationsPage => {
	const requestedVault =
		args.vault === undefined ? undefined : getAddress(args.vault);
	const requestedViolator =
		args.violator === undefined ? undefined : getAddress(args.violator);
	const requestedLiquidator =
		args.liquidator === undefined ? undefined : getAddress(args.liquidator);
	const requestedOffset = args.offset ?? 0;

	if (page.meta.offset !== requestedOffset) {
		fail("$.meta.offset", `expected the requested offset ${requestedOffset}`);
	}
	// The endpoint clamps oversized page sizes; it never grows them.
	if (args.limit !== undefined && page.meta.limit > args.limit) {
		fail(
			"$.meta.limit",
			`expected at most the requested limit of ${args.limit}`,
		);
	}
	if (page.data.length > page.meta.limit) {
		fail("$.data", `expected at most ${page.meta.limit} rows`);
	}
	// An offset beyond the total is a valid request that returns an empty
	// page; only positive rows past the remaining count are inconsistent.
	if (page.data.length > Math.max(0, page.meta.total - page.meta.offset)) {
		fail("$.data", "expected row count consistent with the reported total");
	}

	for (const [index, row] of page.data.entries()) {
		const path = `$.data[${index}]`;
		if (row.chainId !== args.chainId) {
			fail(`${path}.chainId`, `chain ${row.chainId} was not requested`);
		}
		if (requestedVault !== undefined && row.vault !== requestedVault) {
			fail(`${path}.vault`, "expected the requested vault");
		}
		if (requestedViolator !== undefined && row.violator !== requestedViolator) {
			fail(`${path}.violator`, "expected the requested violator");
		}
		if (
			requestedLiquidator !== undefined &&
			row.liquidator !== requestedLiquidator
		) {
			fail(`${path}.liquidator`, "expected the requested liquidator");
		}
		const rowTimestamp = Math.floor(Date.parse(row.timestamp) / 1_000);
		if (args.from !== undefined && rowTimestamp < args.from) {
			fail(
				`${path}.timestamp`,
				`timestamp is before the requested from value ${args.from}`,
			);
		}
		if (args.to !== undefined && rowTimestamp > args.to) {
			fail(
				`${path}.timestamp`,
				`timestamp is after the requested to value ${args.to}`,
			);
		}
	}

	return page;
};
