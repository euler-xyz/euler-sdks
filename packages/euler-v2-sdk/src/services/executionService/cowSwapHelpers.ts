import {
	type Address,
	BaseError,
	compactSignatureToSignature,
	concat,
	encodeAbiParameters,
	getAddress,
	type Hex,
	keccak256,
	parseCompactSignature,
	parseSignature,
	serializeSignature,
	toHex,
} from "viem";
import {
	CLOSE_POSITION_PARAMS_COMPONENTS,
	COLLATERAL_SWAP_PARAMS_COMPONENTS,
	OPEN_POSITION_PARAMS_COMPONENTS,
} from "./abis/cowSwapWrapperAbi.js";
import type {
	CowSwapClosePositionPlanParams,
	CowSwapCollateralSwapPlanParams,
	CowSwapOpenPositionPlanParams,
} from "./executionServiceTypes.js";

export const COWSWAP_APPDATA_VERSION = "0.9.0";
export const COWSWAP_ORDER_POLL_INTERVAL_MS = 3_000;
export const COWSWAP_ORDER_POLL_MAX_DURATION_MS = 16 * 60 * 1_000;
export const INBOX_DOMAIN_NAME = "Inbox";
export const INBOX_DOMAIN_VERSION = "1";
const OMITTED_PERMIT_SIGNATURE = "0x" as Hex;

export type CowSwapOrderKind = "sell" | "buy";
export type CowSwapOrderSigningScheme =
	| "eip712"
	| "eip1271"
	| "ethsign"
	| "presign";
export type CowSwapTokenBalance = "erc20" | "internal" | "external";
export type CowSwapOrderUid = string;

export type CowSwapTypedDataRequest = {
	domain: Record<string, unknown>;
	types: Record<string, unknown>;
	primaryType: string;
	message: Record<string, unknown>;
};

export type CowSwapCompetitionOrderStatusType =
	| "open"
	| "scheduled"
	| "active"
	| "solved"
	| "executing"
	| "traded"
	| "cancelled";

export type CowSwapLifecycleOrderStatusType =
	| "presignaturePending"
	| "open"
	| "fulfilled"
	| "cancelled"
	| "expired";

export type CowSwapOrderStatusType =
	| CowSwapCompetitionOrderStatusType
	| CowSwapLifecycleOrderStatusType
	| "unknown";

export type CowSwapTerminalOrderStatus =
	| "traded"
	| "fulfilled"
	| "cancelled"
	| "expired";

export type CowSwapOrderStatus = {
	type: CowSwapOrderStatusType;
	competitionType?: CowSwapCompetitionOrderStatusType;
	orderType?: CowSwapLifecycleOrderStatusType;
	terminal: boolean;
};

export type CowSwapOrderPayload = {
	sellToken: Address;
	buyToken: Address;
	from: Address;
	receiver: Address;
	sellAmount: string;
	buyAmount: string;
	feeAmount: string;
	kind: CowSwapOrderKind;
	partiallyFillable: boolean;
	validTo: number;
	sellTokenBalance: CowSwapTokenBalance;
	buyTokenBalance: CowSwapTokenBalance;
	signature: string;
	signingScheme: CowSwapOrderSigningScheme;
	onchainOrder: boolean;
	appData: string;
	appDataHash: Hex;
	quoteId?: number;
};

export type CowSwapChainConfig = {
	orderbookUrl: string;
	settlementContract: Address;
	vaultRelayer: Address;
	openPositionWrapper: Address;
	closePositionWrapper: Address;
	collateralSwapWrapper: Address;
};

export const COWSWAP_CHAIN_CONFIG: Record<number, CowSwapChainConfig> = {
	1: {
		orderbookUrl: "https://api.cow.fi/mainnet",
		settlementContract: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
		vaultRelayer: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
		openPositionWrapper: "0x59684A689D4a1CAc0f0632F54ec8cDd42612D728",
		closePositionWrapper: "0xa18c87849eF90190117FF1E1e8b4acE6Dac7A54b",
		collateralSwapWrapper: "0x175FBD01874e92C9b081F493371fEFE009760a42",
	},
};

export function getCowSwapChainConfig(
	chainId: number,
): CowSwapChainConfig | undefined {
	return COWSWAP_CHAIN_CONFIG[chainId];
}

export function getCowSwapOrderExplorerUrl(orderUid: CowSwapOrderUid): string {
	return `https://explorer.cow.fi/orders/${orderUid}`;
}

function requireCowSwapChainConfig(chainId: number): CowSwapChainConfig {
	const config = getCowSwapChainConfig(chainId);
	if (!config)
		throw new Error(`CoW swap is not configured for chain ${chainId}`);
	return config;
}

const EVC_PERMIT_TYPES = {
	Permit: [
		{ name: "signer", type: "address" },
		{ name: "sender", type: "address" },
		{ name: "nonceNamespace", type: "uint256" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
		{ name: "value", type: "uint256" },
		{ name: "data", type: "bytes" },
	],
} as const;

const COW_ORDER_TYPES = {
	Order: [
		{ name: "sellToken", type: "address" },
		{ name: "buyToken", type: "address" },
		{ name: "receiver", type: "address" },
		{ name: "sellAmount", type: "uint256" },
		{ name: "buyAmount", type: "uint256" },
		{ name: "validTo", type: "uint32" },
		{ name: "appData", type: "bytes32" },
		{ name: "feeAmount", type: "uint256" },
		{ name: "kind", type: "string" },
		{ name: "partiallyFillable", type: "bool" },
		{ name: "sellTokenBalance", type: "string" },
		{ name: "buyTokenBalance", type: "string" },
	],
} as const;

const OPEN_POSITION_WRAPPER_DATA_ABI = [
	{ type: "tuple", components: OPEN_POSITION_PARAMS_COMPONENTS },
	{ type: "bytes" },
] as const;

const COLLATERAL_SWAP_WRAPPER_DATA_ABI = [
	{ type: "tuple", components: COLLATERAL_SWAP_PARAMS_COMPONENTS },
	{ type: "bytes" },
] as const;

const CLOSE_POSITION_WRAPPER_DATA_ABI = [
	{ type: "tuple", components: CLOSE_POSITION_PARAMS_COMPONENTS },
	{ type: "bytes" },
] as const;

export function computeNonceNamespace(sender: Address): bigint {
	return BigInt(sender);
}

export function buildEvcPermitTypedData(params: {
	chainId: number;
	evcAddress: Address;
	signer: Address;
	sender: Address;
	nonceNamespace: bigint;
	nonce: bigint;
	deadline: number;
	value?: bigint;
	data: Hex;
}) {
	return {
		domain: {
			name: "Ethereum Vault Connector",
			chainId: BigInt(params.chainId),
			verifyingContract: params.evcAddress,
		},
		types: EVC_PERMIT_TYPES,
		primaryType: "Permit" as const,
		message: {
			signer: params.signer,
			sender: params.sender,
			nonceNamespace: params.nonceNamespace,
			nonce: params.nonce,
			deadline: BigInt(params.deadline),
			value: params.value ?? 0n,
			data: params.data,
		},
	};
}

export function buildOpenPositionWrapperData(
	params: CowSwapOpenPositionPlanParams["wrapper"],
	permitSignature: Hex,
): Hex {
	return encodeAbiParameters(OPEN_POSITION_WRAPPER_DATA_ABI, [
		{
			owner: params.owner,
			account: params.account,
			deadline: BigInt(params.deadline),
			collateralVault: params.collateralVault,
			borrowVault: params.borrowVault,
			collateralAmount: params.collateralAmount,
			borrowAmount: params.borrowAmount,
		},
		permitSignature,
	]);
}

export function buildCollateralSwapWrapperData(
	params: CowSwapCollateralSwapPlanParams["wrapper"],
	permitSignature: Hex,
): Hex {
	return encodeAbiParameters(COLLATERAL_SWAP_WRAPPER_DATA_ABI, [
		{
			owner: params.owner,
			account: params.account,
			deadline: BigInt(params.deadline),
			fromVault: params.fromVault,
			toVault: params.toVault,
			fromAmount: params.fromAmount,
			disableSourceCollateral: params.disableSourceCollateral,
		},
		permitSignature,
	]);
}

export function buildClosePositionWrapperData(
	params: CowSwapClosePositionPlanParams["wrapper"],
	permitSignature: Hex,
): Hex {
	return encodeAbiParameters(CLOSE_POSITION_WRAPPER_DATA_ABI, [
		{
			owner: params.owner,
			account: params.account,
			deadline: BigInt(params.deadline),
			borrowVault: params.borrowVault,
			collateralVault: params.collateralVault,
			collateralAmount: params.collateralAmount,
		},
		permitSignature,
	]);
}

export function buildCowSwapAppData(
	wrapperData: Hex,
	wrapperAddress: Address,
	slippageBips: number,
	appCode = "euler_position_open",
): { appDataString: string; appDataHash: Hex } {
	const appData = {
		appCode,
		version: COWSWAP_APPDATA_VERSION,
		metadata: {
			orderClass: { orderClass: "market" },
			quote: { slippageBips, smartSlippage: false },
			wrappers: [
				{
					address: wrapperAddress,
					data: wrapperData,
					isOmittable: false,
				},
			],
		},
	};
	const appDataString = JSON.stringify(appData);
	return { appDataString, appDataHash: keccak256(toHex(appDataString)) };
}

export function buildOpenPositionQuoteAppData(
	params: CowSwapOpenPositionPlanParams["wrapper"],
	wrapperAddress: Address,
	slippageBips: number,
): string {
	return buildCowSwapAppData(
		buildOpenPositionWrapperData(params, OMITTED_PERMIT_SIGNATURE),
		wrapperAddress,
		slippageBips,
	).appDataString;
}

export function buildCollateralSwapQuoteAppData(
	params: CowSwapCollateralSwapPlanParams["wrapper"],
	wrapperAddress: Address,
	slippageBips: number,
): string {
	return buildCowSwapAppData(
		buildCollateralSwapWrapperData(params, OMITTED_PERMIT_SIGNATURE),
		wrapperAddress,
		slippageBips,
		"euler_position_collateral_swap",
	).appDataString;
}

export function buildClosePositionQuoteAppData(
	params: CowSwapClosePositionPlanParams["wrapper"],
	wrapperAddress: Address,
	slippageBips: number,
): string {
	return buildCowSwapAppData(
		buildClosePositionWrapperData(params, OMITTED_PERMIT_SIGNATURE),
		wrapperAddress,
		slippageBips,
		"euler_position_close",
	).appDataString;
}

export function buildCowSwapOrderTypedData(params: {
	chainId: number;
	settlementContract: Address;
	sellToken: Address;
	buyToken: Address;
	receiver: Address;
	sellAmount: bigint;
	buyAmount: bigint;
	validTo: number;
	appDataHash: Hex;
	kind?: CowSwapOrderKind;
	domainName?: string;
	domainVersion?: string;
	verifyingContract?: Address;
}) {
	const domain = {
		name: params.domainName ?? "Gnosis Protocol",
		version: params.domainVersion ?? "v2",
		chainId: BigInt(params.chainId),
		verifyingContract: getAddress(
			params.verifyingContract ?? params.settlementContract,
		),
	};
	const message = {
		sellToken: params.sellToken,
		buyToken: params.buyToken,
		receiver: params.receiver,
		sellAmount: params.sellAmount,
		buyAmount: params.buyAmount,
		validTo: params.validTo,
		appData: params.appDataHash,
		feeAmount: 0n,
		kind: params.kind ?? "sell",
		partiallyFillable: false,
		sellTokenBalance: "erc20",
		buyTokenBalance: "erc20",
	} as const;

	return {
		domain,
		types: COW_ORDER_TYPES,
		primaryType: "Order" as const,
		message,
	};
}

export function buildCowSwapOrderPayload(
	typedData: ReturnType<typeof buildCowSwapOrderTypedData>,
	signature: string,
	from: Address,
	appDataString: string,
	appDataHash: Hex,
	options?: { signingScheme?: CowSwapOrderSigningScheme; quoteId?: number },
): CowSwapOrderPayload {
	const { message } = typedData;
	return {
		sellToken: message.sellToken,
		buyToken: message.buyToken,
		from,
		receiver: message.receiver,
		sellAmount: message.sellAmount.toString(),
		buyAmount: message.buyAmount.toString(),
		feeAmount: message.feeAmount.toString(),
		kind: message.kind,
		partiallyFillable: message.partiallyFillable,
		validTo: message.validTo,
		sellTokenBalance: message.sellTokenBalance,
		buyTokenBalance: message.buyTokenBalance,
		signature,
		signingScheme: options?.signingScheme ?? "eip712",
		onchainOrder: false,
		appData: appDataString,
		appDataHash,
		quoteId: options?.quoteId,
	};
}

const COW_CANCEL_TYPES = {
	OrderCancellations: [{ name: "orderUids", type: "bytes[]" }],
} as const;

export function buildCowSwapCancelOrderTypedData(params: {
	orderUid: CowSwapOrderUid;
	chainId: number;
	settlementContract?: Address;
}): CowSwapTypedDataRequest {
	const settlementContract =
		params.settlementContract ??
		requireCowSwapChainConfig(params.chainId).settlementContract;

	return {
		domain: {
			name: "Gnosis Protocol",
			version: "v2",
			chainId: BigInt(params.chainId),
			verifyingContract: settlementContract,
		},
		types: COW_CANCEL_TYPES,
		primaryType: "OrderCancellations",
		message: {
			orderUids: [params.orderUid],
		},
	};
}

const STANDARD_SIGNATURE_HEX_LENGTH = 132;
const COMPACT_SIGNATURE_HEX_LENGTH = 130;

export function normalizeCowSignature(signature: Hex): Hex {
	if (signature.length === STANDARD_SIGNATURE_HEX_LENGTH) {
		return serializeSignature(parseSignature(signature));
	}
	if (signature.length === COMPACT_SIGNATURE_HEX_LENGTH) {
		return serializeSignature(
			compactSignatureToSignature(parseCompactSignature(signature)),
		);
	}
	throw new Error(`Unsupported signature length: ${signature.length}`);
}

const KIND_SELL = keccak256(toHex("sell"));
const KIND_BUY = keccak256(toHex("buy"));
const BALANCE_ERC20 = keccak256(toHex("erc20"));
const ORDER_ENCODE_DATA_ABI = [
	{ type: "address" },
	{ type: "address" },
	{ type: "address" },
	{ type: "uint256" },
	{ type: "uint256" },
	{ type: "uint32" },
	{ type: "bytes32" },
	{ type: "uint256" },
	{ type: "bytes32" },
	{ type: "bool" },
	{ type: "bytes32" },
	{ type: "bytes32" },
] as const;

export function encodeOrderDataForInbox(order: {
	sellToken: Address;
	buyToken: Address;
	receiver: Address;
	sellAmount: bigint;
	buyAmount: bigint;
	validTo: number;
	appData: Hex;
	feeAmount: bigint;
	kind: CowSwapOrderKind;
	partiallyFillable: boolean;
	sellTokenBalance: string;
	buyTokenBalance: string;
}): Hex {
	return encodeAbiParameters(ORDER_ENCODE_DATA_ABI, [
		order.sellToken,
		order.buyToken,
		order.receiver,
		order.sellAmount,
		order.buyAmount,
		order.validTo,
		order.appData,
		order.feeAmount,
		order.kind === "sell" ? KIND_SELL : KIND_BUY,
		order.partiallyFillable,
		BALANCE_ERC20,
		BALANCE_ERC20,
	]);
}

export function buildInboxSignature(
	ecdsaSignature: Hex,
	orderEncodeData: Hex,
): Hex {
	return concat([ecdsaSignature, orderEncodeData]);
}

export function verifyInboxDomainSeparator(
	inboxAddress: Address,
	chainId: number,
	expectedDomainSep: Hex,
): void {
	const domainTypeHash = keccak256(
		toHex(
			"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
		),
	);
	const nameHash = keccak256(toHex(INBOX_DOMAIN_NAME));
	const versionHash = keccak256(toHex(INBOX_DOMAIN_VERSION));
	const computed = keccak256(
		encodeAbiParameters(
			[
				{ type: "bytes32" },
				{ type: "bytes32" },
				{ type: "bytes32" },
				{ type: "uint256" },
				{ type: "address" },
			],
			[
				domainTypeHash,
				nameHash,
				versionHash,
				BigInt(chainId),
				getAddress(inboxAddress),
			],
		),
	);
	if (computed !== expectedDomainSep) {
		throw new Error(
			`Inbox domain separator mismatch: computed ${computed}, expected ${expectedDomainSep}`,
		);
	}
}

export async function submitCowSwapOrder(
	payload: CowSwapOrderPayload,
	orderbookUrl: string,
): Promise<CowSwapOrderUid> {
	const res = await fetch(`${orderbookUrl}/api/v1/orders`, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`CoW API ${res.status}: ${text.slice(0, 500)}`);
	}
	const data: unknown = await res.json();
	if (typeof data === "string") return data;
	if (data && typeof data === "object" && "uid" in data) {
		const uid = (data as { uid?: unknown }).uid;
		if (typeof uid === "string") return uid;
	}
	throw new Error("Unexpected CoW order response format");
}

const COMPETITION_STATUS_TYPES = new Set<CowSwapCompetitionOrderStatusType>([
	"open",
	"scheduled",
	"active",
	"solved",
	"executing",
	"traded",
	"cancelled",
]);

const ORDER_STATUS_TYPES = new Set<CowSwapLifecycleOrderStatusType>([
	"presignaturePending",
	"open",
	"fulfilled",
	"cancelled",
	"expired",
]);

const TERMINAL_STATUS_TYPES = new Set<CowSwapTerminalOrderStatus>([
	"traded",
	"fulfilled",
	"cancelled",
	"expired",
]);

function normalizeCowSwapCompetitionStatus(
	type: unknown,
): CowSwapCompetitionOrderStatusType | undefined {
	if (typeof type !== "string") return undefined;
	return COMPETITION_STATUS_TYPES.has(type as CowSwapCompetitionOrderStatusType)
		? (type as CowSwapCompetitionOrderStatusType)
		: undefined;
}

function normalizeCowSwapLifecycleStatus(
	status: unknown,
): CowSwapLifecycleOrderStatusType | undefined {
	if (typeof status !== "string") return undefined;
	return ORDER_STATUS_TYPES.has(status as CowSwapLifecycleOrderStatusType)
		? (status as CowSwapLifecycleOrderStatusType)
		: undefined;
}

export function resolveCowSwapOrderStatusType(params: {
	competitionType?: CowSwapCompetitionOrderStatusType;
	orderType?: CowSwapLifecycleOrderStatusType;
}): CowSwapOrderStatusType {
	if (params.competitionType === "traded") return "traded";
	if (params.orderType === "fulfilled") return "fulfilled";
	if (params.orderType === "cancelled") return "cancelled";
	if (params.orderType === "expired") return "expired";
	if (params.competitionType === "cancelled") return "cancelled";
	if (params.orderType) return params.orderType;
	if (params.competitionType) return params.competitionType;
	return "unknown";
}

export function isCowSwapTerminalOrderStatus(
	type?: CowSwapOrderStatusType,
): type is CowSwapTerminalOrderStatus {
	if (!type) return false;
	return TERMINAL_STATUS_TYPES.has(type as CowSwapTerminalOrderStatus);
}

type CowSwapOrderbookArgs = {
	chainId?: number;
	orderbookUrl?: string;
};

function getCowSwapOrderbookUrl(args: CowSwapOrderbookArgs): string {
	if (args.orderbookUrl) return args.orderbookUrl;
	if (args.chainId == null) {
		throw new Error("CoW orderbook URL requires orderbookUrl or chainId");
	}
	return requireCowSwapChainConfig(args.chainId).orderbookUrl;
}

async function fetchCowSwapJson<T>(
	url: string,
	signal?: AbortSignal,
): Promise<T> {
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
		signal,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`CoW API ${res.status}: ${text.slice(0, 300)}`);
	}
	return (await res.json()) as T;
}

export type FetchCowSwapOrderStatusArgs = CowSwapOrderbookArgs & {
	orderUid: CowSwapOrderUid;
	signal?: AbortSignal;
};

export async function fetchCowSwapOrderStatus(
	args: FetchCowSwapOrderStatusArgs,
): Promise<CowSwapOrderStatus> {
	const orderbookUrl = getCowSwapOrderbookUrl(args);
	const [competitionResult, orderResult] = await Promise.allSettled([
		fetchCowSwapJson<{ type?: unknown }>(
			`${orderbookUrl}/api/v1/orders/${args.orderUid}/status`,
			args.signal,
		),
		fetchCowSwapJson<{ status?: unknown }>(
			`${orderbookUrl}/api/v1/orders/${args.orderUid}`,
			args.signal,
		),
	]);

	if (
		competitionResult.status === "rejected" &&
		orderResult.status === "rejected"
	) {
		throw new Error(`Failed to fetch CoW order status for ${args.orderUid}`);
	}

	const competitionType =
		competitionResult.status === "fulfilled"
			? normalizeCowSwapCompetitionStatus(competitionResult.value.type)
			: undefined;
	const orderType =
		orderResult.status === "fulfilled"
			? normalizeCowSwapLifecycleStatus(orderResult.value.status)
			: undefined;
	const type = resolveCowSwapOrderStatusType({ competitionType, orderType });

	return {
		type,
		competitionType,
		orderType,
		terminal: isCowSwapTerminalOrderStatus(type),
	};
}

function throwIfAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	const error = new Error("CoW order status polling aborted");
	error.name = "AbortError";
	throw error;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
	throwIfAborted(signal);
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timeout);
				const error = new Error("CoW order status polling aborted");
				error.name = "AbortError";
				reject(error);
			},
			{ once: true },
		);
	});
}

export type PollCowSwapOrderStatusArgs = FetchCowSwapOrderStatusArgs & {
	intervalMs?: number;
	timeoutMs?: number;
	onStatus?: (status: CowSwapOrderStatus) => void;
};

export async function pollCowSwapOrderStatus(
	args: PollCowSwapOrderStatusArgs,
): Promise<CowSwapOrderStatus> {
	const intervalMs = args.intervalMs ?? COWSWAP_ORDER_POLL_INTERVAL_MS;
	const timeoutMs = args.timeoutMs ?? COWSWAP_ORDER_POLL_MAX_DURATION_MS;
	const startedAt = Date.now();

	for (;;) {
		throwIfAborted(args.signal);
		const status = await fetchCowSwapOrderStatus(args);
		args.onStatus?.(status);
		if (status.terminal) return status;
		if (Date.now() - startedAt >= timeoutMs) {
			throw new Error(
				`Timed out polling CoW order ${args.orderUid} after ${timeoutMs}ms`,
			);
		}
		await delay(intervalMs, args.signal);
	}
}

const MAX_CANCEL_ERROR_MESSAGE_LENGTH = 180;
const MAX_COW_SWAP_ERROR_MESSAGE_LENGTH = 180;

function trimCowSwapDiagnosticDetails(message: string): string {
	const diagnosticIndex = [
		"Request Arguments:",
		"Contract Call:",
		"Details:",
		"Version:",
	]
		.map((marker) => message.indexOf(marker))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];

	return (
		diagnosticIndex === undefined ? message : message.slice(0, diagnosticIndex)
	).trim();
}

function truncateCowSwapMessage(message: string): string {
	if (message.length <= MAX_COW_SWAP_ERROR_MESSAGE_LENGTH) return message;
	return `${message.slice(0, MAX_COW_SWAP_ERROR_MESSAGE_LENGTH).trimEnd()}...`;
}

export function formatCowSwapExecutionErrorMessage(error: Error): string {
	const shortMessage =
		error instanceof BaseError ? error.shortMessage : error.message;
	const cleaned = trimCowSwapDiagnosticDetails(shortMessage || error.message);
	return truncateCowSwapMessage(cleaned || "Something went wrong");
}

function truncateCowSwapErrorMessage(message: string): string {
	if (message.length <= MAX_CANCEL_ERROR_MESSAGE_LENGTH) return message;
	return `${message.slice(0, MAX_CANCEL_ERROR_MESSAGE_LENGTH).trimEnd()}...`;
}

function extractCowSwapErrorMessage(text: string): string {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed && typeof parsed === "object") {
			const record = parsed as Record<string, unknown>;
			const type =
				typeof record.errorType === "string" ? record.errorType : undefined;
			const detail = [record.description, record.message, record.error].find(
				(value) => typeof value === "string",
			) as string | undefined;
			return [type, detail].filter(Boolean).join(": ") || text;
		}
	} catch {
		return text;
	}

	return text;
}

export type CancelCowSwapOrderArgs = CowSwapOrderbookArgs & {
	orderUid: CowSwapOrderUid;
	chainId: number;
	settlementContract?: Address;
	signTypedData: (parameters: CowSwapTypedDataRequest) => Promise<Hex>;
	signal?: AbortSignal;
};

export async function cancelCowSwapOrder(
	args: CancelCowSwapOrderArgs,
): Promise<void> {
	const orderbookUrl = getCowSwapOrderbookUrl(args);
	const typedData = buildCowSwapCancelOrderTypedData({
		orderUid: args.orderUid,
		chainId: args.chainId,
		settlementContract: args.settlementContract,
	});
	const signature = await args.signTypedData(typedData);

	const res = await fetch(`${orderbookUrl}/api/v1/orders`, {
		method: "DELETE",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({
			orderUids: [args.orderUid],
			signature,
			signingScheme: "eip712",
		}),
		signal: args.signal,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(
			`CoW cancel API ${res.status}: ${truncateCowSwapErrorMessage(
				extractCowSwapErrorMessage(text),
			)}`,
		);
	}
}
