import {
	type Address,
	encodeFunctionData,
	erc20Abi,
	getAddress,
	type Hash,
	type Hex,
} from "viem";
import type { IDeploymentService } from "../deploymentService/index.js";
import type { ProviderService } from "../providerService/index.js";
import {
	CLOSE_POSITION_WRAPPER_ABI,
	COLLATERAL_SWAP_WRAPPER_ABI,
	OPEN_POSITION_WRAPPER_ABI,
} from "./abis/cowSwapWrapperAbi.js";
import { ethereumVaultConnectorAbi } from "./abis/ethereumVaultConnectorAbi.js";
import {
	buildClosePositionWrapperData,
	buildCollateralSwapWrapperData,
	buildCowSwapAppData,
	buildCowSwapOrderPayload,
	buildCowSwapOrderTypedData,
	buildEvcPermitTypedData,
	buildInboxSignature,
	buildOpenPositionWrapperData,
	type CowSwapOrderUid,
	type CowSwapTypedDataRequest,
	computeNonceNamespace,
	encodeOrderDataForInbox,
	getCowSwapChainConfig,
	INBOX_DOMAIN_NAME,
	INBOX_DOMAIN_VERSION,
	normalizeCowSignature,
	submitCowSwapOrder,
	verifyInboxDomainSeparator,
} from "./cowSwapHelpers.js";
import type { TransactionPlanTransactionRequest } from "./execute.js";
import type {
	CowSwapCancelClosePositionPlanParams,
	CowSwapClosePositionPlanParams,
	CowSwapCollateralSwapPlanParams,
	CowSwapOpenPositionPlanParams,
	CowSwapPlanItem,
	TransactionPlan,
	TransactionPlanItem,
} from "./executionServiceTypes.js";
import { isCowSwapPlanItem } from "./executionServiceTypes.js";

export type CowSwapPermitCancellation = {
	type: "evcPermitNonce";
	chainId: number;
	owner: Address;
	evcAddress: Address;
	addressPrefix: Hex;
	nonceNamespace: bigint;
	nonce: bigint;
	nextNonce: bigint;
	wrapperAddress: Address;
};

export type CowSwapPlanItemExecutionResult = {
	item: CowSwapPlanItem;
	orderUid?: CowSwapOrderUid;
	hashes?: Hash[];
	permitCancellation?: CowSwapPermitCancellation;
};

export type CowSwapTransactionPlanExecutionStatus =
	| "approval"
	| "prepareInbox"
	| "signPermit"
	| "signOrder"
	| "submitOrder"
	| "cancelPermit"
	| "completed";

export type CowSwapTransactionPlanExecutionProgress = {
	completed: number;
	total: number;
	item?: TransactionPlanItem;
	status?: CowSwapTransactionPlanExecutionStatus;
	orderUid?: CowSwapOrderUid;
	hash?: Hash;
};

export type ExecuteCowSwapTransactionPlanArgs = {
	plan: TransactionPlan;
	chainId: number;
	account: Address;
	sendTransaction: (
		parameters: TransactionPlanTransactionRequest,
	) => Promise<Hash>;
	signTypedData: (parameters: CowSwapTypedDataRequest) => Promise<Hex>;
	onProgress?: (progress: CowSwapTransactionPlanExecutionProgress) => void;
};

type ExecuteCowSwapTransactionPlanInternalArgs =
	ExecuteCowSwapTransactionPlanArgs & {
		deploymentService: IDeploymentService;
		providerService: ProviderService;
	};

export type CowSwapTransactionPlanExecutionResult = {
	plan: TransactionPlan;
	orderUids: CowSwapOrderUid[];
	hashes: Hash[];
	results: CowSwapPlanItemExecutionResult[];
};

type CowSwapPublicClient = {
	waitForTransactionReceipt: (parameters: { hash: Hash }) => Promise<{
		status?: "success" | "reverted";
		transactionHash?: Hash;
	}>;
	readContract: (parameters: object) => Promise<unknown>;
	getCode?: (parameters: { address: Address }) => Promise<Hex | undefined>;
	getBlockNumber?: () => Promise<bigint>;
};

const ZERO_CODE = "0x";

function getEvcAddressPrefix(owner: Address): Hex {
	return `0x${getAddress(owner).slice(2, 40)}` as Hex;
}

function toCowSwapTypedData(typedData: {
	domain: Record<string, unknown>;
	types: Record<string, unknown>;
	primaryType: string;
	message: Record<string, unknown>;
}): CowSwapTypedDataRequest {
	return typedData;
}

async function waitForSuccessfulReceipt(
	publicClient: CowSwapPublicClient,
	hash: Hash,
): Promise<void> {
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status && receipt.status !== "success") {
		throw new Error(`Transaction ${hash} reverted`);
	}
}

async function sendAndWait(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	request: TransactionPlanTransactionRequest,
): Promise<Hash> {
	const hash = await args.sendTransaction(request);
	await waitForSuccessfulReceipt(
		args.providerService.getProvider(args.chainId) as CowSwapPublicClient,
		hash,
	);
	return hash;
}

async function safeApprove(args: {
	executionArgs: ExecuteCowSwapTransactionPlanInternalArgs;
	token: Address;
	spender: Address;
	amount: bigint;
	owner: Address;
}): Promise<Hash[]> {
	if (args.amount <= 0n) return [];
	const provider = args.executionArgs.providerService.getProvider(
		args.executionArgs.chainId,
	) as CowSwapPublicClient;
	const allowance = (await provider.readContract({
		address: args.token,
		abi: erc20Abi,
		functionName: "allowance",
		args: [args.owner, args.spender],
	})) as bigint;
	if (allowance >= args.amount) return [];

	const hashes: Hash[] = [];
	if (allowance > 0n) {
		hashes.push(
			await sendAndWait(args.executionArgs, {
				to: args.token,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: "approve",
					args: [args.spender, 0n],
				}),
			}),
		);
	}
	hashes.push(
		await sendAndWait(args.executionArgs, {
			to: args.token,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [args.spender, args.amount],
			}),
		}),
	);
	return hashes;
}

async function fetchNonceAndPermitData(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	wrapperAddress: Address,
	wrapperAbi: readonly unknown[],
	wrapperParams: unknown,
): Promise<{
	nonce: bigint;
	nonceNamespace: bigint;
	permitCalldata: Hex;
	evcAddress: Address;
}> {
	const provider = args.providerService.getProvider(args.chainId);
	const evcAddress = args.deploymentService.getDeployment(args.chainId)
		.addresses.coreAddrs.evc;
	const nonceNamespace = computeNonceNamespace(wrapperAddress);
	const addressPrefix = getEvcAddressPrefix(args.account);
	const nonce = (await provider.readContract({
		address: evcAddress,
		abi: ethereumVaultConnectorAbi,
		functionName: "getNonce",
		args: [addressPrefix, nonceNamespace],
	})) as bigint;
	const permitCalldata = (await provider.readContract({
		address: wrapperAddress,
		abi: wrapperAbi,
		functionName: "encodePermitData",
		args: [wrapperParams],
	})) as Hex;
	return { nonce, nonceNamespace, permitCalldata, evcAddress };
}

async function signEvcPermit(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	params: {
		permitCalldata: Hex;
		evcAddress: Address;
		wrapperAddress: Address;
		nonceNamespace: bigint;
		nonce: bigint;
		deadline: number;
	},
): Promise<Hex> {
	const typedData = buildEvcPermitTypedData({
		chainId: args.chainId,
		evcAddress: params.evcAddress,
		signer: args.account,
		sender: params.wrapperAddress,
		nonceNamespace: params.nonceNamespace,
		nonce: params.nonce,
		deadline: params.deadline,
		data: params.permitCalldata,
	});
	return args.signTypedData(toCowSwapTypedData(typedData));
}

async function waitForNextBlock(
	provider: CowSwapPublicClient,
	timeoutMs = 30_000,
): Promise<void> {
	if (!provider.getBlockNumber) return;
	const startBlock = await provider.getBlockNumber();
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		if ((await provider.getBlockNumber()) > startBlock) return;
	}
}

async function executeOpenPosition(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	item: CowSwapPlanItem<CowSwapOpenPositionPlanParams>,
	emit: (
		status: CowSwapTransactionPlanExecutionStatus,
		hash?: Hash,
		orderUid?: CowSwapOrderUid,
	) => void,
): Promise<CowSwapPlanItemExecutionResult> {
	const params = item.params;
	const config = getCowSwapChainConfig(args.chainId);
	if (!config)
		throw new Error(`CoW Swap not supported on chain ${args.chainId}`);
	const hashes: Hash[] = [];

	emit("approval");
	hashes.push(
		...(await safeApprove({
			executionArgs: args,
			token: params.collateralToken,
			spender: params.wrapper.collateralVault,
			amount: params.wrapper.collateralAmount,
			owner: args.account,
		})),
		...(await safeApprove({
			executionArgs: args,
			token: params.sellToken,
			spender: config.vaultRelayer,
			amount: params.sellAmount,
			owner: args.account,
		})),
	);

	const wrapperAddress = config.openPositionWrapper;
	const wrapperParams = {
		...params.wrapper,
		deadline: BigInt(params.wrapper.deadline),
	};
	emit("signPermit");
	const nonceData = await fetchNonceAndPermitData(
		args,
		wrapperAddress,
		OPEN_POSITION_WRAPPER_ABI,
		wrapperParams,
	);
	const permitSignature = await signEvcPermit(args, {
		...nonceData,
		wrapperAddress,
		deadline: params.wrapper.deadline,
	});

	emit("signOrder");
	const wrapperData = buildOpenPositionWrapperData(
		params.wrapper,
		permitSignature,
	);
	const { appDataString, appDataHash } = buildCowSwapAppData(
		wrapperData,
		wrapperAddress,
		params.slippageBips,
	);
	const orderTypedData = buildCowSwapOrderTypedData({
		chainId: args.chainId,
		settlementContract: config.settlementContract,
		sellToken: params.sellToken,
		buyToken: params.buyToken,
		receiver: params.wrapper.account,
		sellAmount: params.sellAmount,
		buyAmount: params.buyAmount,
		validTo: params.validTo,
		appDataHash,
	});
	const orderSignature = normalizeCowSignature(
		await args.signTypedData(toCowSwapTypedData(orderTypedData)),
	);
	const payload = buildCowSwapOrderPayload(
		orderTypedData,
		orderSignature,
		args.account,
		appDataString,
		appDataHash,
		{ quoteId: params.quoteId },
	);
	emit("submitOrder");
	const orderUid = await submitCowSwapOrder(payload, config.orderbookUrl);
	return { item, orderUid, hashes };
}

async function executeCancelClosePosition(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	item: CowSwapPlanItem<CowSwapCancelClosePositionPlanParams>,
	emit: (
		status: CowSwapTransactionPlanExecutionStatus,
		hash?: Hash,
		orderUid?: CowSwapOrderUid,
	) => void,
): Promise<CowSwapPlanItemExecutionResult> {
	const config = getCowSwapChainConfig(args.chainId);
	if (!config)
		throw new Error(`CoW Swap not supported on chain ${args.chainId}`);

	const params = item.params;
	const evcAddress = args.deploymentService.getDeployment(args.chainId)
		.addresses.coreAddrs.evc;
	const wrapperAddress = params.wrapperAddress ?? config.closePositionWrapper;
	const nonceNamespace =
		params.nonceNamespace ?? computeNonceNamespace(wrapperAddress);
	const addressPrefix = getEvcAddressPrefix(params.owner);
	const provider = args.providerService.getProvider(args.chainId);
	const currentNonce = (await provider.readContract({
		address: evcAddress,
		abi: ethereumVaultConnectorAbi,
		functionName: "getNonce",
		args: [addressPrefix, nonceNamespace],
	})) as bigint;

	const permitCancellation: CowSwapPermitCancellation = {
		type: "evcPermitNonce",
		chainId: args.chainId,
		owner: params.owner,
		evcAddress,
		addressPrefix,
		nonceNamespace,
		nonce: params.nonce,
		nextNonce: params.nonce + 1n,
		wrapperAddress,
	};

	if (currentNonce > params.nonce) {
		return { item, hashes: [], permitCancellation };
	}

	emit("cancelPermit");
	const hash = await sendAndWait(args, {
		to: evcAddress,
		data: encodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			functionName: "setNonce",
			args: [addressPrefix, nonceNamespace, params.nonce + 1n],
		}),
	});
	emit("cancelPermit", hash);

	return { item, hashes: [hash], permitCancellation };
}

async function executeCollateralSwap(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	item: CowSwapPlanItem<CowSwapCollateralSwapPlanParams>,
	emit: (
		status: CowSwapTransactionPlanExecutionStatus,
		hash?: Hash,
		orderUid?: CowSwapOrderUid,
	) => void,
): Promise<CowSwapPlanItemExecutionResult> {
	const params = item.params;
	const config = getCowSwapChainConfig(args.chainId);
	if (!config)
		throw new Error(`CoW Swap not supported on chain ${args.chainId}`);
	const hashes: Hash[] = [];

	emit("approval");
	hashes.push(
		...(await safeApprove({
			executionArgs: args,
			token: params.sellToken,
			spender: config.vaultRelayer,
			amount: params.sellAmount,
			owner: args.account,
		})),
	);

	const wrapperAddress = config.collateralSwapWrapper;
	const wrapperParams = {
		...params.wrapper,
		deadline: BigInt(params.wrapper.deadline),
	};
	emit("signPermit");
	const nonceData = await fetchNonceAndPermitData(
		args,
		wrapperAddress,
		COLLATERAL_SWAP_WRAPPER_ABI,
		wrapperParams,
	);
	const permitSignature = await signEvcPermit(args, {
		...nonceData,
		wrapperAddress,
		deadline: params.wrapper.deadline,
	});

	emit("signOrder");
	const wrapperData = buildCollateralSwapWrapperData(
		params.wrapper,
		permitSignature,
	);
	const { appDataString, appDataHash } = buildCowSwapAppData(
		wrapperData,
		wrapperAddress,
		params.slippageBips,
		"euler_position_collateral_swap",
	);
	const orderTypedData = buildCowSwapOrderTypedData({
		chainId: args.chainId,
		settlementContract: config.settlementContract,
		sellToken: params.sellToken,
		buyToken: params.buyToken,
		receiver: params.wrapper.account,
		sellAmount: params.sellAmount,
		buyAmount: params.buyAmount,
		validTo: params.validTo,
		appDataHash,
		kind: "sell",
	});
	const orderSignature = normalizeCowSignature(
		await args.signTypedData(toCowSwapTypedData(orderTypedData)),
	);
	const payload = buildCowSwapOrderPayload(
		orderTypedData,
		orderSignature,
		args.account,
		appDataString,
		appDataHash,
		{ quoteId: params.quoteId },
	);
	emit("submitOrder");
	const orderUid = await submitCowSwapOrder(payload, config.orderbookUrl);
	return { item, orderUid, hashes };
}

async function executeClosePosition(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	item: CowSwapPlanItem<CowSwapClosePositionPlanParams>,
	emit: (
		status: CowSwapTransactionPlanExecutionStatus,
		hash?: Hash,
		orderUid?: CowSwapOrderUid,
	) => void,
): Promise<CowSwapPlanItemExecutionResult> {
	const params = item.params;
	const config = getCowSwapChainConfig(args.chainId);
	if (!config)
		throw new Error(`CoW Swap not supported on chain ${args.chainId}`);
	const provider = args.providerService.getProvider(
		args.chainId,
	) as CowSwapPublicClient;
	const hashes: Hash[] = [];
	const wrapperAddress = config.closePositionWrapper;

	emit("prepareInbox");
	const [inboxAddress, inboxDomainSeparator] = (await provider.readContract({
		address: wrapperAddress,
		abi: CLOSE_POSITION_WRAPPER_ABI,
		functionName: "getInboxAddressAndDomainSeparator",
		args: [params.wrapper.owner, params.wrapper.account],
	})) as [Address, Hex];
	verifyInboxDomainSeparator(inboxAddress, args.chainId, inboxDomainSeparator);

	const inboxCode = provider.getCode
		? await provider.getCode({ address: inboxAddress })
		: undefined;
	if (!inboxCode || inboxCode === ZERO_CODE) {
		const hash = await sendAndWait(args, {
			to: wrapperAddress,
			data: encodeFunctionData({
				abi: CLOSE_POSITION_WRAPPER_ABI,
				functionName: "getInbox",
				args: [params.wrapper.owner, params.wrapper.account],
			}),
		});
		hashes.push(hash);
		emit("prepareInbox", hash);
		await waitForNextBlock(provider);
	}

	const wrapperParams = {
		...params.wrapper,
		deadline: BigInt(params.wrapper.deadline),
	};
	emit("signPermit");
	const nonceData = await fetchNonceAndPermitData(
		args,
		wrapperAddress,
		CLOSE_POSITION_WRAPPER_ABI,
		wrapperParams,
	);
	const permitSignature = await signEvcPermit(args, {
		...nonceData,
		wrapperAddress,
		deadline: params.wrapper.deadline,
	});

	emit("signOrder");
	const wrapperData = buildClosePositionWrapperData(
		params.wrapper,
		permitSignature,
	);
	const { appDataString, appDataHash } = buildCowSwapAppData(
		wrapperData,
		wrapperAddress,
		params.slippageBips,
		"euler_position_close",
	);
	const orderTypedData = buildCowSwapOrderTypedData({
		chainId: args.chainId,
		settlementContract: config.settlementContract,
		sellToken: params.sellToken,
		buyToken: params.buyToken,
		receiver: inboxAddress,
		sellAmount: params.sellAmount,
		buyAmount: params.buyAmount,
		validTo: params.validTo,
		appDataHash,
		kind: params.orderKind,
		domainName: INBOX_DOMAIN_NAME,
		domainVersion: INBOX_DOMAIN_VERSION,
		verifyingContract: inboxAddress,
	});
	const ecdsaSignature = normalizeCowSignature(
		await args.signTypedData(toCowSwapTypedData(orderTypedData)),
	);
	const orderEncodeData = encodeOrderDataForInbox({
		sellToken: params.sellToken,
		buyToken: params.buyToken,
		receiver: inboxAddress,
		sellAmount: params.sellAmount,
		buyAmount: params.buyAmount,
		validTo: params.validTo,
		appData: appDataHash,
		feeAmount: 0n,
		kind: params.orderKind,
		partiallyFillable: false,
		sellTokenBalance: "erc20",
		buyTokenBalance: "erc20",
	});
	const inboxSignature = buildInboxSignature(ecdsaSignature, orderEncodeData);
	const payload = buildCowSwapOrderPayload(
		orderTypedData,
		inboxSignature,
		inboxAddress,
		appDataString,
		appDataHash,
		{ signingScheme: "eip1271", quoteId: params.quoteId },
	);
	emit("submitOrder");
	const orderUid = await submitCowSwapOrder(payload, config.orderbookUrl);
	return {
		item,
		orderUid,
		hashes,
		permitCancellation: {
			type: "evcPermitNonce",
			chainId: args.chainId,
			owner: args.account,
			evcAddress: nonceData.evcAddress,
			addressPrefix: getEvcAddressPrefix(args.account),
			nonceNamespace: nonceData.nonceNamespace,
			nonce: nonceData.nonce,
			nextNonce: nonceData.nonce + 1n,
			wrapperAddress,
		},
	};
}

async function executeCowSwapPlanItem(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
	item: CowSwapPlanItem,
	emit: (
		status: CowSwapTransactionPlanExecutionStatus,
		hash?: Hash,
		orderUid?: CowSwapOrderUid,
	) => void,
): Promise<CowSwapPlanItemExecutionResult> {
	if (item.kind === "openPosition") {
		return executeOpenPosition(
			args,
			item as CowSwapPlanItem<CowSwapOpenPositionPlanParams>,
			emit,
		);
	}
	if (item.kind === "swapCollateral") {
		return executeCollateralSwap(
			args,
			item as CowSwapPlanItem<CowSwapCollateralSwapPlanParams>,
			emit,
		);
	}
	if (item.kind === "closePosition") {
		return executeClosePosition(
			args,
			item as CowSwapPlanItem<CowSwapClosePositionPlanParams>,
			emit,
		);
	}
	if (item.kind === "cancelClosePosition") {
		return executeCancelClosePosition(
			args,
			item as CowSwapPlanItem<CowSwapCancelClosePositionPlanParams>,
			emit,
		);
	}
	throw new Error(`Unsupported CoW swap plan kind: ${item.kind}`);
}

export async function executeCowSwapTransactionPlan(
	args: ExecuteCowSwapTransactionPlanInternalArgs,
): Promise<CowSwapTransactionPlanExecutionResult> {
	const unsupportedItem = args.plan.find((item) => !isCowSwapPlanItem(item));
	if (unsupportedItem) {
		throw new Error(
			`executeCowSwapTransactionPlan only supports CoW swap plan items. Received ${unsupportedItem.type}.`,
		);
	}
	const cowSwapItems = args.plan.filter(isCowSwapPlanItem);
	const orderUids: CowSwapOrderUid[] = [];
	const hashes: Hash[] = [];
	const results: CowSwapPlanItemExecutionResult[] = [];
	let completed = 0;

	const emitProgress = (
		item?: TransactionPlanItem,
		status?: CowSwapTransactionPlanExecutionStatus,
		hash?: Hash,
		orderUid?: CowSwapOrderUid,
	) => {
		args.onProgress?.({
			completed,
			total: args.plan.length,
			item,
			status,
			hash,
			orderUid,
		});
	};

	for (const item of cowSwapItems) {
		if (item.chainId !== args.chainId) {
			throw new Error(
				`CoW swap plan item targets chain ${item.chainId}, but executor is configured for chain ${args.chainId}`,
			);
		}
		const result = await executeCowSwapPlanItem(
			args,
			item,
			(status, hash, orderUid) => emitProgress(item, status, hash, orderUid),
		);
		results.push(result);
		if (result.orderUid) orderUids.push(result.orderUid);
		if (result.hashes) hashes.push(...result.hashes);
		completed += 1;
		emitProgress(item, "completed", undefined, result.orderUid);
	}

	return { plan: args.plan, orderUids, hashes, results };
}
